-- P10 Module 4 — RPC list / get / confirm / reject / create-from-sale|buy (admin seed)

create or replace function public.pos_employee_cash_request_list(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_cash uuid;
  v_status text := nullif(upper(trim(coalesce(p_status, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    v_staff_cash := pos_private.employee_cash_my_staff_account_id();
    if v_staff_cash is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;
  if v_status is not null and v_status not in ('PENDING', 'CONFIRMED', 'REJECTED') then
    raise exception 'EMP_CASH_YC_STATUS_INVALID';
  end if;

  select count(*)::integer into v_total
  from public.pos_employee_cash_requests r
  where (v_status is null or r.status = v_status);

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      r.id, r.code, r.kind, r.status,
      r.amount_dong as "amountDong",
      r.payment_method as "paymentMethod",
      r.content, r.note,
      r.source_type as "sourceType",
      r.source_id as "sourceId",
      r.source_code as "sourceCode",
      r.customer_name as "customerName",
      r.customer_cccd as "customerCccd",
      r.related_staff_name as "relatedStaffName",
      ga.code as "relatedGoldAccountCode",
      r.requested_by_email as "requestedByEmail",
      r.created_at as "createdAt",
      ca.code as "cashAccountCode",
      r.confirmed_by_email as "confirmedByEmail",
      r.confirmed_at as "confirmedAt",
      r.rejected_by_email as "rejectedByEmail",
      r.rejected_at as "rejectedAt",
      r.reject_reason as "rejectReason",
      r.lines_json as "lines",
      (r.status = 'PENDING') as "canConfirm",
      (r.status = 'PENDING') as "canReject"
    from public.pos_employee_cash_requests r
    left join public.pos_employee_cash_accounts ca on ca.id = r.cash_account_id
    left join public.pos_employee_gold_accounts ga on ga.id = r.related_gold_account_id
    where (v_status is null or r.status = v_status)
    order by r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object(
    'items', v_items, 'total', v_total,
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0))
  );
end;
$$;

create or replace function public.pos_employee_cash_request_get(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_cash uuid;
  v_row jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    v_staff_cash := pos_private.employee_cash_my_staff_account_id();
    if v_staff_cash is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  select row_to_json(t)::jsonb into v_row
  from (
    select
      r.id, r.code, r.kind, r.status,
      r.amount_dong as "amountDong",
      r.payment_method as "paymentMethod",
      r.content, r.note,
      r.source_type as "sourceType",
      r.source_id as "sourceId",
      r.source_code as "sourceCode",
      r.customer_id as "customerId",
      r.customer_name as "customerName",
      r.customer_cccd as "customerCccd",
      r.related_staff_name as "relatedStaffName",
      ga.code as "relatedGoldAccountCode",
      r.requested_by_email as "requestedByEmail",
      r.created_at as "createdAt",
      ca.id as "cashAccountId",
      ca.code as "cashAccountCode",
      ca.name as "cashAccountName",
      r.confirmed_by_email as "confirmedByEmail",
      r.confirmed_at as "confirmedAt",
      r.rejected_by_email as "rejectedByEmail",
      r.rejected_at as "rejectedAt",
      r.reject_reason as "rejectReason",
      r.ledger_id as "ledgerId",
      r.lines_json as "lines",
      (r.status = 'PENDING') as "canConfirm",
      (r.status = 'PENDING') as "canReject"
    from public.pos_employee_cash_requests r
    left join public.pos_employee_cash_accounts ca on ca.id = r.cash_account_id
    left join public.pos_employee_gold_accounts ga on ga.id = r.related_gold_account_id
    where r.id = p_request_id
  ) t;

  if v_row is null then raise exception 'EMP_CASH_YC_NOT_FOUND'; end if;
  return v_row;
end;
$$;

create or replace function public.pos_employee_cash_request_confirm(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_is_admin boolean := public.tlkv_is_admin();
  v_req public.pos_employee_cash_requests%rowtype;
  v_cash_id uuid;
  v_cash public.pos_employee_cash_accounts%rowtype;
  v_ledger uuid;
  v_txn text;
  v_dir text;
  v_content text;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  select * into v_req from public.pos_employee_cash_requests where id = p_request_id for update;
  if not found then raise exception 'EMP_CASH_YC_NOT_FOUND'; end if;
  if v_req.status = 'CONFIRMED' then
    return jsonb_build_object('ok', true, 'code', v_req.code, 'alreadyConfirmed', true, 'ledgerId', v_req.ledger_id);
  end if;
  if v_req.status <> 'PENDING' then raise exception 'EMP_CASH_YC_NOT_PENDING'; end if;

  v_cash_id := pos_private.employee_cash_my_staff_account_id();
  if v_cash_id is null and v_is_admin then
    v_cash_id := pos_private.employee_cash_admin_pool_id();
  end if;
  if v_cash_id is null then
    raise exception 'EMP_CASH_YC_CONFIRM_NO_ACCOUNT';
  end if;

  select * into v_cash from public.pos_employee_cash_accounts where id = v_cash_id for update;
  if not found or not v_cash.is_active then raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND'; end if;

  if v_req.kind = 'THU' then
    v_txn := 'SALE_RECEIPT';
    v_dir := 'IN';
    v_content := 'Xác nhận thu ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  else
    v_txn := 'PURCHASE_PAY';
    v_dir := 'OUT';
    v_content := 'Xác nhận chi ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  end if;

  v_ledger := pos_private.employee_cash_post(
    v_cash_id, v_txn, v_dir, v_req.amount_dong, v_content, v_email, now(),
    null, 'employee_cash_request', v_req.id, v_req.code,
    'emp_cash_yc', v_req.id, null
  );

  update public.pos_employee_cash_requests
  set status = 'CONFIRMED',
      cash_account_id = v_cash_id,
      confirmed_by_email = v_email,
      confirmed_at = now(),
      ledger_id = v_ledger,
      updated_at = now()
  where id = v_req.id;

  return jsonb_build_object(
    'ok', true, 'code', v_req.code, 'alreadyConfirmed', false,
    'ledgerId', v_ledger, 'cashAccountId', v_cash_id, 'cashAccountCode', v_cash.code
  );
end;
$$;

create or replace function public.pos_employee_cash_request_reject(
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_is_admin boolean := public.tlkv_is_admin();
  v_req public.pos_employee_cash_requests%rowtype;
  v_staff_cash uuid;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();
  v_staff_cash := pos_private.employee_cash_my_staff_account_id();
  if not v_is_admin and v_staff_cash is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_req from public.pos_employee_cash_requests where id = p_request_id for update;
  if not found then raise exception 'EMP_CASH_YC_NOT_FOUND'; end if;
  if v_req.status = 'REJECTED' then
    return jsonb_build_object('ok', true, 'code', v_req.code, 'alreadyRejected', true);
  end if;
  if v_req.status <> 'PENDING' then raise exception 'EMP_CASH_YC_NOT_PENDING'; end if;

  update public.pos_employee_cash_requests
  set status = 'REJECTED',
      rejected_by_email = v_email,
      rejected_at = now(),
      reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where id = v_req.id;

  -- Q6: không đổi payment_status hóa đơn
  return jsonb_build_object('ok', true, 'code', v_req.code, 'alreadyRejected', false);
end;
$$;

-- Seed / hard-test: tạo YC-THU từ sale đã có (admin). Không đụng CASH-001.
create or replace function public.pos_employee_cash_request_create_from_sale(
  p_sale_id uuid,
  p_amount_dong bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_sale public.pos_sales%rowtype;
  v_inv text;
  v_cust public.pos_customers%rowtype;
  v_amount bigint;
  v_gold_id uuid;
  v_staff public.pos_staff%rowtype;
  v_lines jsonb;
begin
  v_actor := pos_private.require_admin();
  if not pos_private.employee_fund_flag_on() then
    raise exception 'EMP_FUND_FLAG_OFF';
  end if;
  select * into v_sale from public.pos_sales where id = p_sale_id;
  if not found then raise exception 'EMP_CASH_YC_SALE_NOT_FOUND'; end if;

  select invoice_no into v_inv from public.pos_invoices where sale_id = p_sale_id order by issued_at desc limit 1;
  if v_sale.customer_id is not null then
    select * into v_cust from public.pos_customers where id = v_sale.customer_id;
  end if;

  v_amount := coalesce(p_amount_dong, nullif(v_sale.paid_dong, 0), v_sale.total_dong);
  if v_amount is null or v_amount <= 0 then raise exception 'EMP_CASH_YC_AMOUNT_INVALID'; end if;

  if v_sale.operator_staff_id is not null then
    select * into v_staff from public.pos_staff where id = v_sale.operator_staff_id;
    select a.id into v_gold_id
    from public.pos_employee_gold_accounts a
    where a.kind = 'STAFF' and a.staff_id = v_sale.operator_staff_id and a.is_active
    limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(si.product_name_snapshot, si.sku_snapshot, 'Hàng'),
    'purity', null,
    'unit', 'chiếc',
    'weight', si.weight_chi,
    'unitPriceDong', si.unit_price_dong,
    'amountDong', si.total_price_dong
  ) order by si.id), '[]'::jsonb)
  into v_lines
  from public.pos_sale_items si
  where si.sale_id = p_sale_id;

  return pos_private.employee_cash_request_create(
    'THU', v_amount, coalesce(v_sale.payment_method, 'CASH'),
    'Thu tiền hóa đơn ' || coalesce(v_inv, v_sale.sale_no),
    'sale', p_sale_id, coalesce(v_inv, v_sale.sale_no),
    v_sale.customer_id, coalesce(v_cust.name, null), coalesce(v_cust.citizen_id, null),
    v_sale.operator_staff_id, coalesce(v_staff.full_name, null), v_gold_id,
    p_note, v_lines, v_actor
  );
end;
$$;

create or replace function public.pos_employee_cash_request_create_from_buy(
  p_buy_id uuid,
  p_amount_dong bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_buy record;
  v_amount bigint;
  v_gold_id uuid;
  v_staff public.pos_staff%rowtype;
  v_staff_id uuid;
  v_cust_name text;
  v_cust_cccd text;
begin
  v_actor := pos_private.require_admin();
  if not pos_private.employee_fund_flag_on() then
    raise exception 'EMP_FUND_FLAG_OFF';
  end if;

  select
    b.id, b.buy_no, b.total_dong, b.paid_dong, b.customer_id, b.payment_method,
    b.customer_name_snapshot, b.customer_citizen_id_snapshot, b.actor_email
  into v_buy
  from public.pos_buys b
  where b.id = p_buy_id;
  if v_buy.id is null then
    raise exception 'EMP_CASH_YC_BUY_NOT_FOUND';
  end if;

  v_amount := coalesce(p_amount_dong, nullif(v_buy.paid_dong, 0), v_buy.total_dong);
  if v_amount is null or v_amount <= 0 then raise exception 'EMP_CASH_YC_AMOUNT_INVALID'; end if;

  if v_buy.customer_id is not null then
    select c.name, c.citizen_id into v_cust_name, v_cust_cccd
    from public.pos_customers c where c.id = v_buy.customer_id;
  end if;
  v_cust_name := coalesce(v_cust_name, v_buy.customer_name_snapshot);
  v_cust_cccd := coalesce(v_cust_cccd, v_buy.customer_citizen_id_snapshot);

  if nullif(trim(coalesce(v_buy.actor_email, '')), '') is not null then
    select s.id into v_staff_id
    from public.pos_staff s
    where lower(s.email) = lower(v_buy.actor_email) and s.is_active
    limit 1;
    if v_staff_id is not null then
      select * into v_staff from public.pos_staff where id = v_staff_id;
      select a.id into v_gold_id from public.pos_employee_gold_accounts a
      where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active limit 1;
    end if;
  end if;

  return pos_private.employee_cash_request_create(
    'CHI', v_amount, coalesce(v_buy.payment_method, 'CASH'),
    'Chi tiền phiếu mua ' || coalesce(v_buy.buy_no, p_buy_id::text),
    'buy', p_buy_id, v_buy.buy_no,
    v_buy.customer_id, v_cust_name, v_cust_cccd,
    v_staff_id, coalesce(v_staff.full_name, null), v_gold_id,
    p_note, '[]'::jsonb, v_actor
  );
end;
$$;

revoke all on function public.pos_employee_cash_request_list(text, integer, integer) from public, anon;
revoke all on function public.pos_employee_cash_request_get(uuid) from public, anon;
revoke all on function public.pos_employee_cash_request_confirm(uuid) from public, anon;
revoke all on function public.pos_employee_cash_request_reject(uuid, text) from public, anon;
revoke all on function public.pos_employee_cash_request_create_from_sale(uuid, bigint, text) from public, anon;
revoke all on function public.pos_employee_cash_request_create_from_buy(uuid, bigint, text) from public, anon;

grant execute on function public.pos_employee_cash_request_list(text, integer, integer) to authenticated, service_role;
grant execute on function public.pos_employee_cash_request_get(uuid) to authenticated, service_role;
grant execute on function public.pos_employee_cash_request_confirm(uuid) to authenticated, service_role;
grant execute on function public.pos_employee_cash_request_reject(uuid, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_request_create_from_sale(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_request_create_from_buy(uuid, bigint, text) to authenticated, service_role;
