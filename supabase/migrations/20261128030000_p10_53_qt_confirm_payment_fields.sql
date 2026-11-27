-- P10 §5.3: QT chọn hình thức TT + trạng thái thu lúc confirm YC;
-- sau In phiếu Flag ON → chứng từ UNPAID («Chờ thanh toán»);
-- Reject YC → void HĐ/phiếu mua gắn (A2).
-- Không tạo bảng mới. §32.1: chỉ GRANT EXECUTE trên RPC public.

-- ---------------------------------------------------------------------------
-- 1) Đánh dấu chứng từ chờ thanh toán sau khi đã có YC PENDING
-- ---------------------------------------------------------------------------
create or replace function public.pos_employee_fund_mark_awaiting_payment(
  p_source_type text,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_pending int;
  v_total bigint;
  v_yc_amount bigint;
begin
  v_actor := pos_private.require_pos_user();
  if not pos_private.employee_fund_flag_on() then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'flag_off');
  end if;
  if p_source_type not in ('sale', 'buy') or p_source_id is null then
    raise exception 'EMP_FUND_AWAITING_SOURCE_INVALID' using errcode = '22023';
  end if;

  select count(*)::int into v_pending
  from public.pos_employee_cash_requests
  where source_type = p_source_type
    and source_id = p_source_id
    and status = 'PENDING';
  if coalesce(v_pending, 0) = 0 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_pending_yc');
  end if;

  if p_source_type = 'sale' then
    select total_dong into v_total from public.pos_sales where id = p_source_id for update;
    if not found then raise exception 'EMP_FUND_SALE_NOT_FOUND'; end if;
    update public.pos_sales
    set paid_dong = 0,
        remaining_dong = total_dong,
        payment_status = 'UNPAID'
    where id = p_source_id;
  else
    select total_dong, coalesce(intended_paid_dong, total_dong)
      into v_total, v_yc_amount
    from public.pos_buys where id = p_source_id for update;
    if not found then raise exception 'EMP_FUND_BUY_NOT_FOUND'; end if;
    update public.pos_buys
    set paid_dong = 0,
        remaining_dong = total_dong,
        payment_status = 'UNPAID'
    where id = p_source_id;
  end if;

  -- Giữ amount YC = số dự kiến (đã tạo lúc In phiếu); không đổi nếu đã > 0.
  return jsonb_build_object(
    'ok', true,
    'sourceType', p_source_type,
    'sourceId', p_source_id,
    'paymentStatus', 'UNPAID',
    'actor', v_actor
  );
end;
$$;

revoke all on function public.pos_employee_fund_mark_awaiting_payment(text, uuid) from public, anon;
grant execute on function public.pos_employee_fund_mark_awaiting_payment(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Confirm YC: nhận method / amount / pay_mode; ghi ngược sale/buy
-- ---------------------------------------------------------------------------
drop function if exists public.pos_employee_cash_request_confirm(uuid);

create or replace function public.pos_employee_cash_request_confirm(
  p_request_id uuid,
  p_payment_method text default null,
  p_amount_dong bigint default null,
  p_pay_mode text default null
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
  v_cash_id uuid;
  v_cash public.pos_employee_cash_accounts%rowtype;
  v_ledger uuid;
  v_txn text;
  v_dir text;
  v_content text;
  v_kind text;
  v_method text;
  v_amount bigint;
  v_pay_mode text;
  v_sale public.pos_sales%rowtype;
  v_buy public.pos_buys%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_status text;
  v_due date;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  select * into v_req from public.pos_employee_cash_requests where id = p_request_id for update;
  if not found then raise exception 'EMP_CASH_YC_NOT_FOUND'; end if;
  if v_req.status = 'CONFIRMED' then
    return jsonb_build_object(
      'ok', true, 'code', v_req.code, 'alreadyConfirmed', true, 'ledgerId', v_req.ledger_id,
      'moneyKind', pos_private.employee_cash_money_kind_from_method(v_req.payment_method),
      'paymentMethod', v_req.payment_method
    );
  end if;
  if v_req.status <> 'PENDING' then raise exception 'EMP_CASH_YC_NOT_PENDING'; end if;

  v_method := upper(nullif(trim(coalesce(p_payment_method, v_req.payment_method)), ''));
  if v_method is null or v_method not in ('CASH', 'TRANSFER', 'CARD') then
    raise exception 'EMP_CASH_YC_METHOD_REQUIRED' using errcode = '22023';
  end if;

  v_pay_mode := upper(nullif(trim(coalesce(p_pay_mode, '')), ''));
  if v_pay_mode is not null and v_pay_mode not in ('FULL', 'PARTIAL') then
    raise exception 'EMP_CASH_YC_PAY_MODE_INVALID' using errcode = '22023';
  end if;

  v_amount := coalesce(p_amount_dong, v_req.amount_dong);
  if v_amount is null or v_amount <= 0 then
    raise exception 'EMP_CASH_YC_AMOUNT_INVALID' using errcode = '22023';
  end if;

  -- Resolve amount vs chứng từ (FULL = phần còn lại)
  if v_req.source_type = 'sale' then
    select * into v_sale from public.pos_sales where id = v_req.source_id for update;
    if found then
      if v_pay_mode = 'FULL' then
        v_amount := greatest(coalesce(v_sale.remaining_dong, v_sale.total_dong - coalesce(v_sale.paid_dong, 0)), 0);
        if v_amount <= 0 then v_amount := coalesce(v_sale.total_dong, v_req.amount_dong); end if;
      elsif v_pay_mode = 'PARTIAL' then
        if p_amount_dong is null then
          raise exception 'EMP_CASH_YC_PARTIAL_AMOUNT_REQUIRED' using errcode = '22023';
        end if;
        v_amount := p_amount_dong;
      end if;
      if v_amount > coalesce(v_sale.remaining_dong, v_sale.total_dong) then
        raise exception 'EMP_CASH_YC_AMOUNT_EXCEEDS_REMAINING' using errcode = '22023';
      end if;
    end if;
  elsif v_req.source_type = 'buy' then
    select * into v_buy from public.pos_buys where id = v_req.source_id for update;
    if found then
      if v_pay_mode = 'FULL' then
        v_amount := greatest(coalesce(v_buy.remaining_dong, v_buy.total_dong - coalesce(v_buy.paid_dong, 0)), 0);
        if v_amount <= 0 then v_amount := coalesce(v_buy.total_dong, v_req.amount_dong); end if;
      elsif v_pay_mode = 'PARTIAL' then
        if p_amount_dong is null then
          raise exception 'EMP_CASH_YC_PARTIAL_AMOUNT_REQUIRED' using errcode = '22023';
        end if;
        v_amount := p_amount_dong;
      end if;
      if v_amount > coalesce(v_buy.remaining_dong, v_buy.total_dong) then
        raise exception 'EMP_CASH_YC_AMOUNT_EXCEEDS_REMAINING' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.pos_employee_cash_requests
  set payment_method = v_method,
      amount_dong = v_amount,
      updated_at = now()
  where id = v_req.id;

  v_cash_id := pos_private.employee_cash_my_staff_account_id();
  if v_cash_id is null and v_is_admin then v_cash_id := pos_private.employee_cash_admin_pool_id(); end if;
  if v_cash_id is null then raise exception 'EMP_CASH_YC_CONFIRM_NO_ACCOUNT'; end if;
  select * into v_cash from public.pos_employee_cash_accounts where id = v_cash_id for update;
  if not found or not v_cash.is_active then raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND'; end if;

  v_kind := pos_private.employee_cash_money_kind_from_method(v_method);
  if v_req.kind = 'THU' then
    v_txn := 'SALE_RECEIPT'; v_dir := 'IN';
    v_content := 'Xac nhan thu ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  else
    v_txn := 'PURCHASE_PAY'; v_dir := 'OUT';
    v_content := 'Xac nhan chi ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  end if;

  v_ledger := pos_private.employee_cash_post(
    v_cash_id, v_txn, v_dir, v_amount, v_content, v_email, now(),
    null, 'employee_cash_request', v_req.id, v_req.code, 'emp_cash_yc', v_req.id, null, v_kind
  );

  update public.pos_employee_cash_requests
  set status = 'CONFIRMED',
      cash_account_id = v_cash_id,
      confirmed_by_email = v_email,
      confirmed_at = now(),
      ledger_id = v_ledger,
      updated_at = now()
  where id = v_req.id;

  -- Ghi ngược chứng từ: payment_status chỉ đổi khi QT/Admin confirm (§5.3 / §5.4 #11)
  if v_req.source_type = 'sale' and v_sale.id is not null then
    v_paid := coalesce(v_sale.paid_dong, 0) + v_amount;
    if v_paid > v_sale.total_dong then v_paid := v_sale.total_dong; end if;
    v_remaining := v_sale.total_dong - v_paid;
    v_due := v_sale.due_date;
    if v_remaining = 0 then v_due := null; end if;
    v_status := pos_private.derive_sale_payment_status(v_paid, v_sale.total_dong, v_due);
    update public.pos_sales
    set paid_dong = v_paid,
        remaining_dong = v_remaining,
        payment_status = v_status,
        payment_method = v_method,
        due_date = v_due
    where id = v_sale.id;
  elsif v_req.source_type = 'buy' and v_buy.id is not null then
    v_paid := coalesce(v_buy.paid_dong, 0) + v_amount;
    if v_paid > v_buy.total_dong then v_paid := v_buy.total_dong; end if;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := v_buy.due_date;
    if v_remaining = 0 then v_due := null; end if;
    v_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_due);
    update public.pos_buys
    set paid_dong = v_paid,
        remaining_dong = v_remaining,
        payment_status = v_status,
        payment_method = v_method,
        due_date = v_due,
        intended_paid_dong = v_paid
    where id = v_buy.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', v_req.code,
    'alreadyConfirmed', false,
    'ledgerId', v_ledger,
    'cashAccountId', v_cash_id,
    'cashAccountCode', v_cash.code,
    'moneyKind', v_kind,
    'paymentMethod', v_method,
    'amountDong', v_amount,
    'payMode', v_pay_mode,
    'sourcePaymentStatus', v_status
  );
end;
$$;

revoke all on function public.pos_employee_cash_request_confirm(uuid, text, bigint, text) from public, anon;
grant execute on function public.pos_employee_cash_request_confirm(uuid, text, bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Reject YC → void chứng từ gắn (A2)
-- ---------------------------------------------------------------------------
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
  v_reason text;
  v_invoice_id uuid;
  v_voided jsonb;
  v_key text;
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

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := 'QT từ chối YC ' || v_req.code;
  end if;

  update public.pos_employee_cash_requests
  set status = 'REJECTED',
      rejected_by_email = v_email,
      rejected_at = now(),
      reject_reason = v_reason,
      updated_at = now()
  where id = v_req.id;

  v_key := 'yc-reject-void:' || v_req.id::text;
  begin
    if v_req.source_type = 'sale' then
      select i.id into v_invoice_id
      from public.pos_invoices i
      where i.sale_id = v_req.source_id
      order by i.issued_at desc nulls last
      limit 1;
      if v_invoice_id is not null then
        v_voided := pos_private.void_sale_invoice(v_invoice_id, v_reason, v_key);
      end if;
    elsif v_req.source_type = 'buy' then
      v_voided := pos_private.void_buy(v_req.source_id, v_reason, v_key);
    end if;
  exception when others then
    -- YC đã REJECTED; ghi notice nếu void thất bại (vd. đã void trước).
    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_email, 'EMP_CASH_YC_REJECT_VOID_SOFT', 'employee_cash_request', v_req.id,
      'Reject YC ok nhưng void chứng từ lỗi: ' || sqlerrm,
      jsonb_build_object('sourceType', v_req.source_type, 'sourceId', v_req.source_id, 'code', v_req.code)
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'code', v_req.code,
    'alreadyRejected', false,
    'voided', coalesce(v_voided, 'null'::jsonb),
    'sourceType', v_req.source_type,
    'sourceId', v_req.source_id
  );
end;
$$;

revoke all on function public.pos_employee_cash_request_reject(uuid, text) from public, anon;
grant execute on function public.pos_employee_cash_request_reject(uuid, text) to authenticated, service_role;
