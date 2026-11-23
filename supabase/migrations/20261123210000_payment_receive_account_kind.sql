-- Phase C (SRS FR-04): receive_account_kind / receive_account_note on payments.
-- Sale: extend payment_splits JSON; collect_sale_payment gains optional params.
-- Buy: stage kind on pos_buys → copy into pos_buy_payments at melt/collect.
-- No backfill from historic note text. §32.1: ALTER only (tables already granted).

-- ---------------------------------------------------------------------------
-- 0) Snapshot
-- ---------------------------------------------------------------------------
do $$
begin
  create schema if not exists tlkv_backup_20261110;

  create table if not exists tlkv_backup_20261110._routines_receive_account_kind (
    saved_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    primary key (schema_name, proname, identity_args, saved_at)
  );

  insert into tlkv_backup_20261110._routines_receive_account_kind (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('pos_private', 'complete_sale'),
    ('pos_private', 'collect_sale_payment'),
    ('pos_private', 'collect_buy_payment'),
    ('public', 'pos_collect_sale_payment'),
    ('public', 'pos_collect_buy_payment'),
    ('public', 'pos_complete_buy_melt'),
    ('public', 'pos_create_buy_intake'),
    ('pos_private', 'create_buy_intake')
  );
end $$;

-- ---------------------------------------------------------------------------
-- 1) Expand columns
-- ---------------------------------------------------------------------------
alter table public.pos_sale_payments
  add column if not exists receive_account_kind text,
  add column if not exists receive_account_note text;

alter table public.pos_buy_payments
  add column if not exists receive_account_kind text,
  add column if not exists receive_account_note text;

alter table public.pos_buys
  add column if not exists receive_account_kind text,
  add column if not exists receive_account_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_sale_payments_receive_account_kind_check'
  ) then
    alter table public.pos_sale_payments
      add constraint pos_sale_payments_receive_account_kind_check
      check (
        receive_account_kind is null
        or receive_account_kind in ('COMPANY', 'PERSONAL')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_buy_payments_receive_account_kind_check'
  ) then
    alter table public.pos_buy_payments
      add constraint pos_buy_payments_receive_account_kind_check
      check (
        receive_account_kind is null
        or receive_account_kind in ('COMPANY', 'PERSONAL')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_buys_receive_account_kind_check'
  ) then
    alter table public.pos_buys
      add constraint pos_buys_receive_account_kind_check
      check (
        receive_account_kind is null
        or receive_account_kind in ('COMPANY', 'PERSONAL')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Helper: normalize + validate account meta for one payment leg
-- ---------------------------------------------------------------------------
create or replace function pos_private.normalize_receive_account(
  p_method text,
  p_kind text,
  p_note text,
  p_require_personal_note boolean default true
)
returns table(kind text, note text)
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_kind text := nullif(upper(trim(coalesce(p_kind, ''))), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_method is distinct from 'TRANSFER' then
    if v_kind is not null or v_note is not null then
      raise exception 'Chỉ thanh toán chuyển khoản mới có loại tài khoản' using errcode = '22023';
    end if;
    return query select null::text, null::text;
    return;
  end if;

  if v_kind is null then
    raise exception 'Chuyển khoản phải chọn tài khoản công ty hoặc cá nhân' using errcode = '22023';
  end if;
  if v_kind not in ('COMPANY', 'PERSONAL') then
    raise exception 'Loại tài khoản không hợp lệ' using errcode = '22023';
  end if;
  if v_kind = 'PERSONAL' and p_require_personal_note and v_note is null then
    raise exception 'Tài khoản cá nhân cần thông tin nhận diện' using errcode = '22023';
  end if;
  if v_kind = 'COMPANY' then
    v_note := null;
  end if;
  return query select v_kind, v_note;
end;
$function$;

revoke all on function pos_private.normalize_receive_account(text, text, text, boolean) from public;
grant execute on function pos_private.normalize_receive_account(text, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Patch complete_sale: widen payment_splits + persist kind on inserts
-- ---------------------------------------------------------------------------
do $$
declare
  def text;
  oid_reg regprocedure;
begin
  oid_reg := 'pos_private.complete_sale(text,text,text,text,jsonb,uuid,text,bigint,date,jsonb,uuid,timestamptz,jsonb)'::regprocedure;
  def := pg_get_functiondef(oid_reg);

  -- Widen every payment_splits recordset (fund + classic paths).
  def := replace(
    def,
    'jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)',
    'jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint, receive_account_kind text, receive_account_note text)'
  );

  -- Classic (Flag OFF) split insert → include account columns.
  def := replace(
    def,
    $old$
            insert into public.pos_sale_payments (
              sale_id, amount_dong, payment_method, paid_at, actor_email, note,
              idempotency_key, received_by_staff_id
            ) values (
              v_sale_id, v_split.amount_dong, v_split.method, now(), v_actor,
              case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
              'sale-open:' || trim(p_idempotency_key) || ':' || v_split.method,
              v_operator
            );
    $old$,
    $new$
            insert into public.pos_sale_payments (
              sale_id, amount_dong, payment_method, paid_at, actor_email, note,
              idempotency_key, received_by_staff_id,
              receive_account_kind, receive_account_note
            )
            select
              v_sale_id, v_split.amount_dong, v_split.method, now(), v_actor,
              case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
              'sale-open:' || trim(p_idempotency_key) || ':' || v_split.method,
              v_operator,
              m.kind, m.note
            from pos_private.normalize_receive_account(
              v_split.method, v_split.receive_account_kind, v_split.receive_account_note, true
            ) as m;
    $new$
  );

  if position('receive_account_kind, receive_account_note' in def) = 0 then
    raise exception 'complete_sale patch failed: split insert not updated';
  end if;

  execute def;
end $$;

-- ---------------------------------------------------------------------------
-- 4) collect_sale_payment — new optional account params (drop+recreate)
-- ---------------------------------------------------------------------------
drop function if exists public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid);
drop function if exists public.pos_collect_sale_payment(uuid, bigint, text, text, text, date);
drop function if exists pos_private.collect_sale_payment(uuid, bigint, text, text, text, date, uuid);

create or replace function pos_private.collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_operator_staff_id uuid default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_key text;
  v_sale public.pos_sales%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_payment_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_receiver uuid;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_inv_no text;
  v_cust_name text;
  v_cust_cccd text;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
  v_acc_kind text;
  v_acc_note text;
begin
  v_actor := pos_private.require_pos_user();
  v_receiver := pos_private.resolve_operator_staff_id(p_operator_staff_id);
  v_fund_on := pos_private.employee_fund_flag_on();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then v_key := 'collect:' || p_sale_id::text || ':' || gen_random_uuid()::text; end if;
  v_cached := pos_private.begin_idempotency(v_key, 'collect_sale_payment');
  if v_cached is not null then return v_cached; end if;
  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền thu phải > 0' using errcode = '22023';
    end if;
    select m.kind, m.note into v_acc_kind, v_acc_note
    from pos_private.normalize_receive_account(
      p_payment_method, p_receive_account_kind, p_receive_account_note, true
    ) as m;

    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then raise exception 'Không tìm thấy đơn bán' using errcode = 'P0002'; end if;
    if v_sale.status <> 'COMPLETED' then raise exception 'Chỉ thu tiền trên đơn đã hoàn tất' using errcode = '22023'; end if;
    if v_sale.fulfillment_status = 'CANCELLED' then raise exception 'Đơn đã hủy, không thu thêm' using errcode = '22023'; end if;
    if coalesce(v_sale.remaining_dong, 0) <= 0 then raise exception 'Đơn đã thanh toán đủ' using errcode = '22023'; end if;
    if p_amount_dong > v_sale.remaining_dong then
      raise exception 'Số tiền thu vượt số còn lại (% đ)', v_sale.remaining_dong using errcode = '22023';
    end if;
    v_paid := v_sale.paid_dong + p_amount_dong;
    v_remaining := v_sale.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_sale.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_sale.total_dong, v_due);

    if v_fund_on then
      select invoice_no into v_inv_no from public.pos_invoices where sale_id = p_sale_id order by issued_at desc limit 1;
      if v_sale.customer_id is not null then
        select c.name, c.citizen_id into v_cust_name, v_cust_cccd from public.pos_customers c where c.id = v_sale.customer_id;
      end if;
      if v_receiver is not null then
        select s.full_name into v_staff_name from public.pos_staff s where s.id = v_receiver;
        select a.id into v_related_gold from public.pos_employee_gold_accounts a
        where a.kind = 'STAFF' and a.staff_id = v_receiver and a.is_active limit 1;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(si.product_name_snapshot, si.sku_snapshot, 'Hàng'),
        'purity', null,
        'unit', 'chiếc',
        'weight', si.weight_chi,
        'unitPriceDong', si.unit_price_dong,
        'amountDong', si.total_price_dong
      ) order by si.id), '[]'::jsonb)
      into v_yc_lines from public.pos_sale_items si where si.sale_id = p_sale_id;
      v_yc := pos_private.employee_cash_request_create(
        'THU', p_amount_dong, p_payment_method,
        'Thu tiền hóa đơn ' || coalesce(v_inv_no, v_sale.sale_no),
        'sale', p_sale_id, coalesce(v_inv_no, v_sale.sale_no),
        v_sale.customer_id, v_cust_name, v_cust_cccd,
        v_receiver, v_staff_name, v_related_gold,
        v_note, v_yc_lines, v_actor
      );
      if v_yc->>'code' is not null then
        v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
      end if;
      -- Flag ON: keep AS-IS (no pos_sale_payments row); account meta stays in audit only.
    else
      insert into public.pos_sale_payments (
        sale_id, amount_dong, payment_method, paid_at, actor_email, note,
        idempotency_key, received_by_staff_id, receive_account_kind, receive_account_note
      ) values (
        v_sale.id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key, v_receiver,
        v_acc_kind, v_acc_note
      )
      returning id into v_payment_id;
    end if;

    update public.pos_sales
    set paid_dong = v_paid, remaining_dong = v_remaining, payment_status = v_pay_status, due_date = v_due
    where id = v_sale.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PAYMENT_COLLECT', 'sale', v_sale.id, 'Thu tiền còn lại',
      jsonb_build_object(
        'sale_no', v_sale.sale_no, 'payment_id', v_payment_id, 'amount_dong', p_amount_dong,
        'paid_dong', v_paid, 'remaining_dong', v_remaining, 'payment_status', v_pay_status,
        'due_date', v_due, 'received_by_staff_id', v_receiver,
        'receive_account_kind', v_acc_kind, 'receive_account_note', v_acc_note,
        'fund_request_codes', to_jsonb(v_fund_codes)
      )
    );

    v_result := jsonb_build_object(
      'ok', true, 'sale_id', v_sale.id, 'sale_no', v_sale.sale_no, 'payment_id', v_payment_id,
      'amount_dong', p_amount_dong, 'paid_dong', v_paid, 'remaining_dong', v_remaining,
      'payment_status', v_pay_status, 'due_date', v_due, 'received_by_staff_id', v_receiver,
      'receive_account_kind', v_acc_kind, 'receive_account_note', v_acc_note,
      'fund_request_codes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(v_key);
    raise;
  end;
end;
$function$;

create or replace function public.pos_collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_operator_staff_id uuid default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return pos_private.collect_sale_payment(
    p_sale_id, p_amount_dong, p_payment_method, p_note, p_idempotency_key,
    p_due_date, p_operator_staff_id, p_receive_account_kind, p_receive_account_note
  );
end;
$function$;

revoke all on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid, text, text)
  from public, anon;
grant execute on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) collect_buy_payment — optional account params
-- ---------------------------------------------------------------------------
drop function if exists public.pos_collect_buy_payment(uuid, bigint, text, text, text, date);
drop function if exists pos_private.collect_buy_payment(uuid, bigint, text, text, text, date);

create or replace function pos_private.collect_buy_payment(
  p_buy_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_key text;
  v_buy public.pos_buys%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_cust_name text;
  v_cust_cccd text;
  v_staff_id uuid;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
  v_acc_kind text;
  v_acc_note text;
  v_require_note boolean;
begin
  v_actor := pos_private.require_pos_user();
  v_fund_on := pos_private.employee_fund_flag_on();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'buy-collect:' || p_buy_id::text || ':' || gen_random_uuid()::text;
  end if;

  v_cached := pos_private.begin_idempotency(v_key, 'collect_buy_payment');
  if v_cached is not null then return v_cached; end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền trả phải > 0' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'COMPLETED' then
      raise exception 'Chỉ trả tiền trên phiếu mua đã hoàn tất' using errcode = 'P0001';
    end if;
    if v_buy.remaining_dong <= 0 then raise exception 'Phiếu mua đã trả đủ' using errcode = 'P0001'; end if;
    if p_amount_dong > v_buy.remaining_dong then
      raise exception 'Số tiền trả vượt số còn nợ khách' using errcode = '22023';
    end if;

    -- Buy PERSONAL identity may come from bank snapshot already on the phiếu.
    v_require_note := nullif(trim(coalesce(v_buy.customer_bank_account_snapshot, '')), '') is null
      and nullif(trim(coalesce(v_buy.customer_bank_holder_snapshot, '')), '') is null;
    select m.kind, m.note into v_acc_kind, v_acc_note
    from pos_private.normalize_receive_account(
      p_payment_method,
      coalesce(p_receive_account_kind, v_buy.receive_account_kind),
      coalesce(p_receive_account_note, v_buy.receive_account_note),
      v_require_note
    ) as m;

    v_paid := v_buy.paid_dong + p_amount_dong;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_buy.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi còn nợ khách' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_due);

    if v_fund_on then
      v_cust_name := v_buy.customer_name_snapshot;
      v_cust_cccd := v_buy.customer_citizen_id_snapshot;
      if v_buy.customer_id is not null then
        select coalesce(c.name, v_cust_name), coalesce(c.citizen_id, v_cust_cccd)
          into v_cust_name, v_cust_cccd
        from public.pos_customers c where c.id = v_buy.customer_id;
      end if;
      if nullif(trim(coalesce(v_buy.actor_email, '')), '') is not null then
        select s.id, s.full_name into v_staff_id, v_staff_name
        from public.pos_staff s
        where lower(s.email) = lower(v_buy.actor_email) and s.is_active
        limit 1;
        if v_staff_id is not null then
          select a.id into v_related_gold
          from public.pos_employee_gold_accounts a
          where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
          limit 1;
        end if;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(bi.product_name_snapshot, 'Hàng mua'),
        'purity', bi.gold_age,
        'unit', 'chiếc',
        'weight', coalesce(bi.weight_after_chi, bi.weight_chi),
        'unitPriceDong', bi.unit_price_dong,
        'amountDong', bi.total_price_dong
      ) order by bi.id), '[]'::jsonb)
      into v_yc_lines
      from public.pos_buy_items bi
      where bi.buy_id = p_buy_id;

      v_yc := pos_private.employee_cash_request_create(
        'CHI', p_amount_dong, p_payment_method,
        'Chi tiền phiếu mua ' || coalesce(v_buy.buy_no, p_buy_id::text),
        'buy', p_buy_id, v_buy.buy_no,
        v_buy.customer_id, v_cust_name, v_cust_cccd,
        v_staff_id, v_staff_name, v_related_gold,
        coalesce(v_note, 'YC-CHI trả thêm (Flag ON) — không ghi CASH-001'),
        v_yc_lines, v_actor
      );
      if v_yc->>'code' is not null then
        v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
      end if;
    else
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key,
        receive_account_kind, receive_account_note
      ) values (
        p_buy_id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key,
        v_acc_kind, v_acc_note
      );
    end if;

    update public.pos_buys
    set
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = p_buy_id;

    perform pos_private.upsert_payable_for_buy(p_buy_id);

    v_result := jsonb_build_object(
      'ok', true,
      'buyId', p_buy_id,
      'buyNo', v_buy.buy_no,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'dueDate', v_due,
      'receiveAccountKind', v_acc_kind,
      'receiveAccountNote', v_acc_note,
      'fundRequestCodes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(v_key);
    raise;
  end;
end;
$function$;

create or replace function public.pos_collect_buy_payment(
  p_buy_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return pos_private.collect_buy_payment(
    p_buy_id, p_amount_dong, p_payment_method, p_note, p_idempotency_key, p_due_date,
    p_receive_account_kind, p_receive_account_note
  );
end;
$function$;

revoke all on function public.pos_collect_buy_payment(uuid, bigint, text, text, text, date, text, text)
  from public, anon;
grant execute on function public.pos_collect_buy_payment(uuid, bigint, text, text, text, date, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) create_buy_intake public wrapper: validate kind then stage on pos_buys
-- ---------------------------------------------------------------------------
drop function if exists public.pos_create_buy_intake(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text);

create or replace function public.pos_create_buy_intake(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null,
  p_bank_account text default null,
  p_bank_account_holder text default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_buy_id uuid;
  v_acc_kind text;
  v_acc_note text;
  v_require_note boolean;
begin
  v_require_note := nullif(trim(coalesce(p_bank_account, '')), '') is null
    and nullif(trim(coalesce(p_bank_account_holder, '')), '') is null;

  if p_payment_method = 'TRANSFER' then
    select m.kind, m.note into v_acc_kind, v_acc_note
    from pos_private.normalize_receive_account(
      p_payment_method, p_receive_account_kind, p_receive_account_note, v_require_note
    ) as m;
  else
    select m.kind, m.note into v_acc_kind, v_acc_note
    from pos_private.normalize_receive_account(
      p_payment_method, null, null, false
    ) as m;
  end if;

  v_result := pos_private.create_buy_intake(
    p_idempotency_key,
    p_customer_id,
    p_payment_method,
    p_items,
    p_note,
    p_paid_dong,
    p_due_date,
    p_approve_price_exception,
    p_price_exception_reason,
    p_bank_account,
    p_bank_account_holder
  );

  v_buy_id := nullif(v_result->>'buyId', '')::uuid;
  if v_buy_id is null then
    v_buy_id := nullif(v_result->>'buy_id', '')::uuid;
  end if;

  if v_buy_id is not null then
    update public.pos_buys
    set
      receive_account_kind = v_acc_kind,
      receive_account_note = v_acc_note
    where id = v_buy_id;
  end if;

  return v_result || jsonb_build_object(
    'receiveAccountKind', v_acc_kind,
    'receiveAccountNote', v_acc_note
  );
end;
$function$;

revoke all on function public.pos_create_buy_intake(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text, text, text)
  from public, anon;
grant execute on function public.pos_create_buy_intake(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) complete_buy_melt: copy staged kind onto payment row
-- ---------------------------------------------------------------------------
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.pos_complete_buy_melt(uuid,text)'::regprocedure);

  def := replace(
    def,
    $old$
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note
      ) values (
        v_buy.id, v_paid, v_buy.payment_method, now(), v_actor, 'Thanh toán khi hoàn tất mua sau nấu'
      );
    $old$,
    $new$
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note,
        receive_account_kind, receive_account_note
      ) values (
        v_buy.id, v_paid, v_buy.payment_method, now(), v_actor, 'Thanh toán khi hoàn tất mua sau nấu',
        case when v_buy.payment_method = 'TRANSFER' then v_buy.receive_account_kind else null end,
        case when v_buy.payment_method = 'TRANSFER' then v_buy.receive_account_note else null end
      );
    $new$
  );

  if position('receive_account_kind, receive_account_note' in def) = 0 then
    raise exception 'pos_complete_buy_melt patch failed';
  end if;

  execute def;
end $$;
