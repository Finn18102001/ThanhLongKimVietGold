-- P10 Module 6: hủy HĐ bán / phiếu mua → đảo đúng Quỹ tiền (YC) + Quỹ vàng custody đã xác nhận.
-- Rule: P10-01 D7 · P10-03 §5.2 (2026-11-22). Snapshot → tlkv_backup_20261110.
-- §32.1: không tạo bảng mới; ALTER cột + RPC private only.

-- ---------------------------------------------------------------------------
-- 0) Snapshot function defs trước replace
-- ---------------------------------------------------------------------------
do $$
begin
  create schema if not exists tlkv_backup_20261110;

  create table if not exists tlkv_backup_20261110._routines_p10_m6_void_fund (
    saved_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    primary key (schema_name, proname, identity_args, saved_at)
  );

  insert into tlkv_backup_20261110._routines_p10_m6_void_fund (schema_name, proname, identity_args, definition)
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('pos_private', 'void_sale_invoice'),
    ('pos_private', 'void_buy')
  );
end $$;

-- ---------------------------------------------------------------------------
-- 1) Expand: status REVERSED + cột đảo YC
-- ---------------------------------------------------------------------------
-- Cho phép âm tạm khi VOID_REVERSAL reclaim YC-THU (cùng pattern CASH-001 invoice void)
alter table public.pos_employee_cash_accounts
  drop constraint if exists pos_employee_cash_accounts_balance_dong_check;
alter table public.pos_employee_cash_ledger
  drop constraint if exists pos_employee_cash_ledger_balance_before_dong_check;
alter table public.pos_employee_cash_ledger
  drop constraint if exists pos_employee_cash_ledger_balance_after_dong_check;

alter table public.pos_employee_cash_requests
  drop constraint if exists pos_employee_cash_requests_status_chk;

alter table public.pos_employee_cash_requests
  add constraint pos_employee_cash_requests_status_chk
  check (status in ('PENDING', 'CONFIRMED', 'REJECTED', 'REVERSED'));

alter table public.pos_employee_cash_requests
  add column if not exists reverse_ledger_id uuid references public.pos_employee_cash_ledger (id) on delete set null;

alter table public.pos_employee_cash_requests
  add column if not exists reversed_at timestamptz;

alter table public.pos_employee_cash_requests
  add column if not exists reversed_by_email text;

comment on column public.pos_employee_cash_requests.reverse_ledger_id is
  'P10 M6: ledger VOID_REVERSAL khi hủy HĐ/phiếu; giữ YC gốc + ledger confirm.';

-- ---------------------------------------------------------------------------
-- 2) Helper: đảo / đóng YC theo source (sale|buy)
-- ---------------------------------------------------------------------------
-- VOID_REVERSAL OUT (thu hồi YC-THU) được phép âm tạm — cùng tinh thần cash_post_allow_negative
create or replace function pos_private.employee_cash_post_allow_negative(
  p_account_id uuid,
  p_txn_type text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_actor_email text,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_code text default null,
  p_source_table text default null,
  p_source_row_id uuid default null,
  p_transfer_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_bal bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'EMP_CASH_CONTENT_REQUIRED';
  end if;

  if p_source_table is not null and p_source_row_id is not null then
    select id into v_id
    from public.pos_employee_cash_ledger
    where source_table = p_source_table and source_row_id = p_source_row_id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select balance_dong into v_bal
  from public.pos_employee_cash_accounts
  where id = p_account_id and is_active
  for update;

  if v_bal is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;

  if p_direction = 'IN' then
    v_after := v_bal + p_amount_dong;
  elsif p_direction = 'OUT' then
    v_after := v_bal - p_amount_dong; -- allow negative on void reclaim
  else
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;

  insert into public.pos_employee_cash_ledger (
    account_id, txn_type, direction, amount_dong,
    balance_before_dong, balance_after_dong, content, reason,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong,
    v_bal, v_after, trim(p_content), nullif(trim(coalesce(p_reason, '')), ''),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  update public.pos_employee_cash_accounts
  set balance_dong = v_after, updated_at = now()
  where id = p_account_id;

  return v_id;
end;
$$;

revoke all on function pos_private.employee_cash_post_allow_negative(uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid) from public;
grant execute on function pos_private.employee_cash_post_allow_negative(uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------

create or replace function pos_private.employee_cash_reverse_requests_for_source(
  p_source_type text,
  p_source_id uuid,
  p_actor_email text,
  p_reason text,
  p_void_ref_type text,
  p_void_ref_id uuid,
  p_void_ref_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_src text := lower(trim(coalesce(p_source_type, '')));
  v_actor text := lower(trim(coalesce(p_actor_email, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_req public.pos_employee_cash_requests%rowtype;
  v_dir text;
  v_ledger uuid;
  v_lines jsonb := '[]'::jsonb;
  v_pending_closed int := 0;
  v_reversed int := 0;
begin
  if v_src not in ('sale', 'buy') then
    raise exception 'EMP_CASH_YC_SOURCE_INVALID' using errcode = '22023';
  end if;
  if p_source_id is null then
    raise exception 'EMP_CASH_YC_SOURCE_REQUIRED' using errcode = '22023';
  end if;
  if v_actor = '' then
    v_actor := 'system';
  end if;
  if v_reason is null then
    v_reason := 'Hủy chứng từ — đảo Quỹ tiền YC';
  end if;

  for v_req in
    select *
    from public.pos_employee_cash_requests
    where source_type = v_src
      and source_id = p_source_id
    order by created_at asc, id asc
    for update
  loop
    if v_req.status = 'REVERSED' then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'requestId', v_req.id,
        'code', v_req.code,
        'status', 'REVERSED',
        'alreadyReversed', true,
        'reverseLedgerId', v_req.reverse_ledger_id
      ));
      continue;
    end if;

    if v_req.status = 'REJECTED' then
      continue;
    end if;

    if v_req.status = 'PENDING' then
      update public.pos_employee_cash_requests
      set status = 'REJECTED',
          rejected_by_email = v_actor,
          rejected_at = now(),
          reject_reason = left('Hủy chứng từ — đóng YC PENDING. ' || v_reason, 500),
          updated_at = now()
      where id = v_req.id;
      v_pending_closed := v_pending_closed + 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'requestId', v_req.id,
        'code', v_req.code,
        'status', 'REJECTED',
        'closedPending', true
      ));
      continue;
    end if;

    if v_req.status <> 'CONFIRMED' then
      continue;
    end if;

    if v_req.cash_account_id is null then
      raise exception 'EMP_CASH_YC_REVERSE_NO_ACCOUNT: %', v_req.code using errcode = 'P0001';
    end if;

    -- THU đã IN → đảo OUT; CHI đã OUT → đảo IN (đúng tài khoản confirm gốc)
    if v_req.kind = 'THU' then
      v_dir := 'OUT';
    elsif v_req.kind = 'CHI' then
      v_dir := 'IN';
    else
      raise exception 'EMP_CASH_YC_KIND_INVALID: %', v_req.code using errcode = '22023';
    end if;

    -- THU đảo OUT: cho phép âm tạm (giống cash_post_allow_negative khi hủy HĐ CASH-001)
    if v_dir = 'OUT' then
      v_ledger := pos_private.employee_cash_post_allow_negative(
        v_req.cash_account_id,
        'VOID_REVERSAL',
        v_dir,
        v_req.amount_dong,
        format(
          'Hủy %s — đảo %s %s (%s). %s',
          coalesce(p_void_ref_code, p_void_ref_type, 'chung-tu'),
          v_req.kind,
          v_req.code,
          to_char(v_req.amount_dong, 'FM999,999,999,999'),
          v_reason
        ),
        v_actor,
        now(),
        v_reason,
        coalesce(p_void_ref_type, 'EMP_CASH_YC_VOID'),
        coalesce(p_void_ref_id, v_req.id),
        coalesce(p_void_ref_code, v_req.source_code, v_req.code),
        'emp_cash_yc_void',
        v_req.id,
        null
      );
    else
      v_ledger := pos_private.employee_cash_post(
        v_req.cash_account_id,
        'VOID_REVERSAL',
        v_dir,
        v_req.amount_dong,
        format(
          'Hủy %s — đảo %s %s (%s). %s',
          coalesce(p_void_ref_code, p_void_ref_type, 'chung-tu'),
          v_req.kind,
          v_req.code,
          to_char(v_req.amount_dong, 'FM999,999,999,999'),
          v_reason
        ),
        v_actor,
        now(),
        v_reason,
        coalesce(p_void_ref_type, 'EMP_CASH_YC_VOID'),
        coalesce(p_void_ref_id, v_req.id),
        coalesce(p_void_ref_code, v_req.source_code, v_req.code),
        'emp_cash_yc_void',
        v_req.id,
        null
      );
    end if;

    update public.pos_employee_cash_requests
    set status = 'REVERSED',
        reverse_ledger_id = v_ledger,
        reversed_at = now(),
        reversed_by_email = v_actor,
        updated_at = now()
    where id = v_req.id;

    v_reversed := v_reversed + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'requestId', v_req.id,
      'code', v_req.code,
      'kind', v_req.kind,
      'amountDong', v_req.amount_dong,
      'cashAccountId', v_req.cash_account_id,
      'status', 'REVERSED',
      'reverseLedgerId', v_ledger,
      'direction', v_dir
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sourceType', v_src,
    'sourceId', p_source_id,
    'reversedCount', v_reversed,
    'pendingClosedCount', v_pending_closed,
    'lines', v_lines
  );
end;
$$;

revoke all on function pos_private.employee_cash_reverse_requests_for_source(text, uuid, text, text, text, uuid, text) from public;
grant execute on function pos_private.employee_cash_reverse_requests_for_source(text, uuid, text, text, text, uuid, text) to service_role;

-- 3) Helper: đảo custody Quỹ vàng đã SALE_CUSTODY OUT khi hủy HĐ bán
-- ---------------------------------------------------------------------------
create or replace function pos_private.employee_gold_reverse_sale_custody(
  p_sale_id uuid,
  p_actor_email text,
  p_reason text,
  p_void_ref_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text := lower(trim(coalesce(p_actor_email, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row record;
  v_ledger uuid;
  v_lines jsonb := '[]'::jsonb;
  v_n int := 0;
begin
  if p_sale_id is null then
    return jsonb_build_object('ok', true, 'reversedCount', 0, 'lines', '[]'::jsonb);
  end if;
  if v_actor = '' then
    v_actor := 'system';
  end if;
  if v_reason is null then
    v_reason := 'Hủy HĐ — đảo custody Quỹ vàng';
  end if;

  for v_row in
    select l.*
    from public.pos_employee_gold_ledger l
    where l.reference_type = 'sale'
      and l.reference_id = p_sale_id
      and l.txn_type = 'SALE_CUSTODY'
      and l.direction = 'OUT'
    order by l.occurred_at asc, l.id asc
  loop
    v_ledger := pos_private.employee_gold_post(
      v_row.account_id,
      v_row.sku_id,
      'VOID_REVERSAL',
      'IN',
      v_row.quantity,
      format(
        'Hủy %s — hoàn custody × %s. %s',
        coalesce(p_void_ref_code, v_row.reference_code, p_sale_id::text),
        v_row.quantity,
        v_reason
      ),
      v_actor,
      now(),
      v_reason,
      'INVOICE_VOID',
      p_sale_id,
      coalesce(p_void_ref_code, v_row.reference_code),
      'emp_gold_void',
      v_row.id,
      null
    );
    v_n := v_n + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'originalLedgerId', v_row.id,
      'reverseLedgerId', v_ledger,
      'accountId', v_row.account_id,
      'skuId', v_row.sku_id,
      'quantity', v_row.quantity
    ));
  end loop;

  return jsonb_build_object('ok', true, 'reversedCount', v_n, 'lines', v_lines);
end;
$$;

revoke all on function pos_private.employee_gold_reverse_sale_custody(uuid, text, text, text) from public;
grant execute on function pos_private.employee_gold_reverse_sale_custody(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) void_sale_invoice — hoàn kho có điều kiện + đảo YC/QT + custody QV
-- ---------------------------------------------------------------------------
create or replace function pos_private.void_sale_invoice(p_invoice_id uuid, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_invoice public.pos_invoices%rowtype;
  v_sale public.pos_sales%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_item record;
  v_pay record;
  v_returned integer;
  v_restore integer;
  v_account uuid;
  v_stock_lines jsonb := '[]'::jsonb;
  v_cash_lines jsonb := '[]'::jsonb;
  v_fund_lines jsonb := '[]'::jsonb;
  v_gold_lines jsonb := '[]'::jsonb;
  v_fund_result jsonb;
  v_gold_result jsonb;
  v_ledger_id uuid;
  v_snapshot jsonb;
  v_items_snap jsonb;
  v_cust_name text;
  v_cust_phone text;
  v_cust_cccd text;
  v_stock_was_taken boolean := false;
begin
  v_actor := pos_private.require_invoice_void_actor();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'void_sale_invoice');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'Phải nhập lý do hủy hóa đơn (tối thiểu 3 ký tự).'
        using errcode = '22023';
    end if;

    select * into v_invoice
    from public.pos_invoices
    where id = p_invoice_id
    for update;
    if not found then
      raise exception 'Không tìm thấy hóa đơn' using errcode = 'P0002';
    end if;
    if v_invoice.status = 'VOIDED' then
      raise exception 'Hóa đơn đã được hủy trước đó.' using errcode = '22023';
    end if;
    if v_invoice.status <> 'ISSUED' then
      raise exception 'Chỉ hủy được hóa đơn đang phát hành.' using errcode = '22023';
    end if;

    select * into v_sale
    from public.pos_sales
    where id = v_invoice.sale_id
    for update;
    if not found then
      raise exception 'Không tìm thấy giao dịch bán gắn hóa đơn' using errcode = 'P0002';
    end if;
    if v_sale.status = 'VOIDED' then
      raise exception 'Giao dịch bán đã hủy.' using errcode = '22023';
    end if;
    if v_sale.status <> 'COMPLETED' then
      raise exception 'Chỉ hủy được giao dịch đã hoàn tất.' using errcode = '22023';
    end if;

    select c.name, c.phone, c.citizen_id
    into v_cust_name, v_cust_phone, v_cust_cccd
    from public.pos_customers c
    where c.id = v_sale.customer_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', si.product_name_snapshot,
      'sku', si.sku_snapshot,
      'quantity', si.quantity,
      'weight_chi', si.weight_chi,
      'unit_price_dong', si.unit_price_dong,
      'total_dong', si.total_price_dong
    ) order by si.id), '[]'::jsonb)
    into v_items_snap
    from public.pos_sale_items si
    where si.sale_id = v_sale.id;

    v_snapshot := jsonb_build_object(
      'kind', 'sale_void',
      'invoice_no', v_invoice.invoice_no,
      'customer_name', v_cust_name,
      'customer_citizen_id', v_cust_cccd,
      'customer_phone', v_cust_phone,
      'payment_method', v_sale.payment_method,
      'paid_dong', v_sale.paid_dong,
      'remaining_dong', v_sale.remaining_dong,
      'total_dong', v_sale.total_dong,
      'items', v_items_snap
    );

    -- Flag ON: kho chỉ trừ khi QV confirm gold → chỉ hoàn kho nếu đã có giao dịch SALE âm
    select exists (
      select 1
      from public.pos_inventory_transactions t
      where t.reference_id = v_sale.id
        and t.type = 'SALE'
        and t.quantity < 0
    ) into v_stock_was_taken;

    -- SALE Flag ON: chỉ hoàn khi đã trừ kho (confirm gold). PREORDER/DEPOSIT FULFILLED giữ AS-IS.
    if (v_sale.transaction_type = 'SALE' and v_stock_was_taken)
       or (v_sale.transaction_type in ('PREORDER', 'DEPOSIT')
           and v_sale.fulfillment_status = 'FULFILLED') then
      for v_item in
        select
          si.sku_id,
          sum(si.quantity)::integer as quantity,
          max(si.sku_snapshot) as sku_snapshot,
          max(si.product_name_snapshot) as product_name_snapshot
        from public.pos_sale_items si
        where si.sale_id = v_sale.id
        group by si.sku_id
      loop
        select coalesce(sum(ri.quantity), 0)::integer into v_returned
        from public.pos_return_items ri
        join public.pos_returns r on r.id = ri.return_id
        where r.sale_id = v_sale.id
          and ri.sku_id = v_item.sku_id
          and r.status = 'COMPLETED';

        v_restore := greatest(v_item.quantity - coalesce(v_returned, 0), 0);
        if v_restore > 0 then
          perform pos_private.apply_stock_change(
            v_item.sku_id,
            v_restore,
            'SALE_VOID',
            format(
              'Hủy HĐ %s — hoàn kho %s × %s. Lý do: %s',
              v_invoice.invoice_no,
              v_restore,
              coalesce(v_item.product_name_snapshot, v_item.sku_snapshot, 'SP'),
              v_reason
            ),
            'INVOICE_VOID',
            v_invoice.id,
            v_actor,
            null,
            null
          );
          v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
            'sku_id', v_item.sku_id,
            'qty', v_restore,
            'name', v_item.product_name_snapshot
          ));
        end if;
      end loop;
    end if;

    -- AS-IS: hoàn CASH-001/BANK từ pos_sale_payments (Flag OFF / legacy)
    for v_pay in
      select p.*
      from public.pos_sale_payments p
      where p.sale_id = v_sale.id
      order by p.paid_at, p.id
    loop
      if coalesce(v_pay.amount_dong, 0) <= 0 then
        continue;
      end if;
      v_account := pos_private.cash_account_for_method(v_pay.payment_method);
      v_ledger_id := pos_private.cash_post_allow_negative(
        v_account,
        'SALE_VOID_REFUND',
        'OUT',
        v_pay.amount_dong,
        format(
          'Hủy HĐ %s — hoàn tiền thu %s (%s). Lý do: %s',
          v_invoice.invoice_no,
          to_char(v_pay.amount_dong, 'FM999,999,999,999'),
          v_pay.payment_method,
          v_reason
        ),
        v_actor,
        now(),
        'INVOICE_VOID',
        v_invoice.id,
        v_invoice.invoice_no,
        'pos_invoice_void_payment',
        v_pay.id
      );
      v_cash_lines := v_cash_lines || jsonb_build_array(jsonb_build_object(
        'payment_id', v_pay.id,
        'amount_dong', v_pay.amount_dong,
        'ledger_id', v_ledger_id,
        'method', v_pay.payment_method
      ));
    end loop;

    -- P10: đảo Quỹ tiền đã confirm YC-THU (+ đóng PENDING)
    v_fund_result := pos_private.employee_cash_reverse_requests_for_source(
      'sale',
      v_sale.id,
      v_actor,
      v_reason,
      'INVOICE_VOID',
      v_invoice.id,
      v_invoice.invoice_no
    );
    v_fund_lines := coalesce(v_fund_result->'lines', '[]'::jsonb);

    -- P10: đảo custody Quỹ vàng nếu đã SALE_CUSTODY
    v_gold_result := pos_private.employee_gold_reverse_sale_custody(
      v_sale.id,
      v_actor,
      v_reason,
      v_invoice.invoice_no
    );
    v_gold_lines := coalesce(v_gold_result->'lines', '[]'::jsonb);

    update public.pos_invoices
    set
      status = 'VOIDED',
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason
    where id = v_invoice.id;

    update public.pos_sales
    set
      status = 'VOIDED',
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason,
      paid_dong = paid_dong,
      remaining_dong = 0,
      payment_status = 'PAID'
    where id = v_sale.id;

    update public.pos_receivables
    set
      paid_dong = total_dong,
      remaining_dong = 0,
      status = 'CLOSED',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where sale_id = v_sale.id;

    if v_sale.transaction_type = 'PREORDER'
       and v_sale.fulfillment_status in ('UNFULFILLED', 'READY') then
      update public.pos_sales
      set fulfillment_status = 'CANCELLED'
      where id = v_sale.id;
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      'INVOICE_VOID',
      'invoice',
      v_invoice.id,
      v_reason,
      jsonb_build_object(
        'invoice_no', v_invoice.invoice_no,
        'sale_id', v_sale.id,
        'sale_no', v_sale.sale_no,
        'total_dong', v_invoice.total_dong,
        'paid_dong', v_sale.paid_dong,
        'transaction_type', v_sale.transaction_type,
        'fulfillment_status', v_sale.fulfillment_status,
        'stock_restored', v_stock_lines,
        'cash_refunded', v_cash_lines,
        'employee_fund_reversed', v_fund_lines,
        'employee_gold_reversed', v_gold_lines,
        'snapshot', v_snapshot
      )
    );

    return pos_private.finish_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'ok', true,
        'invoice_id', v_invoice.id,
        'invoice_no', v_invoice.invoice_no,
        'sale_id', v_sale.id,
        'status', 'VOIDED',
        'stock_restored', v_stock_lines,
        'cash_refunded', v_cash_lines,
        'employee_fund_reversed', v_fund_lines,
        'employee_gold_reversed', v_gold_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5) void_buy — giữ AS-IS kho/CASH + đảo YC-CHI Quỹ tiền
-- ---------------------------------------------------------------------------
create or replace function pos_private.void_buy(p_buy_id uuid, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_item record;
  v_pay record;
  v_brand text;
  v_cost bigint;
  v_existing uuid;
  v_account uuid;
  v_ledger_id uuid;
  v_on_hand integer;
  v_reverse integer;
  v_stock_lines jsonb := '[]'::jsonb;
  v_cash_lines jsonb := '[]'::jsonb;
  v_fund_lines jsonb := '[]'::jsonb;
  v_fund_result jsonb;
  v_snapshot jsonb;
  v_items_snap jsonb;
begin
  v_actor := pos_private.require_invoice_void_actor();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'void_buy');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'Phải nhập lý do hủy phiếu mua (tối thiểu 3 ký tự).'
        using errcode = '22023';
    end if;

    select * into v_buy
    from public.pos_buys
    where id = p_buy_id
    for update;
    if not found then
      raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
    end if;

    if v_buy.status = 'VOIDED' then
      raise exception 'Phiếu mua đã được hủy trước đó.' using errcode = '22023';
    end if;

    if v_buy.status = 'CANCELLED' then
      raise exception 'Phiếu mua đã hủy (không đồng ý sau nấu) — không có kho/tiền để đảo.'
        using errcode = '22023';
    end if;

    if v_buy.status <> 'COMPLETED' then
      raise exception 'Chỉ hủy được phiếu mua đã hoàn tất (COMPLETED).'
        using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', i.product_name_snapshot,
      'quantity', i.quantity,
      'weight_before_chi', coalesce(i.weight_before_chi, i.weight_chi),
      'weight_after_chi', coalesce(i.weight_after_chi, i.weight_chi),
      'total_dong', i.total_price_dong
    ) order by i.id), '[]'::jsonb)
    into v_items_snap
    from public.pos_buy_items i
    where i.buy_id = v_buy.id;

    v_snapshot := jsonb_build_object(
      'kind', 'buy_void',
      'buy_no', v_buy.buy_no,
      'customer_name', v_buy.customer_name_snapshot,
      'customer_citizen_id', v_buy.customer_citizen_id_snapshot,
      'customer_phone', v_buy.customer_phone_snapshot,
      'payment_method', v_buy.payment_method,
      'paid_dong', v_buy.paid_dong,
      'remaining_dong', v_buy.remaining_dong,
      'total_dong', v_buy.total_dong,
      'items', v_items_snap
    );

    for v_item in
      select * from public.pos_buy_items where buy_id = v_buy.id
    loop
      if v_item.sku_id is null or coalesce(v_item.quantity, 0) <= 0 then
        continue;
      end if;

      select t.id into v_existing
      from public.pos_inventory_transactions t
      where t.reference_type = 'BUY_VOID'
        and t.reference_id = v_buy.id
        and t.sku_id = v_item.sku_id
        and t.type = 'PURCHASE_VOID'
      limit 1;
      if v_existing is not null then
        continue;
      end if;

      if not exists (
        select 1
        from public.pos_inventory_transactions t
        where t.reference_id = v_buy.id
          and t.sku_id = v_item.sku_id
          and t.type in ('PURCHASE_RECEIVED', 'CUSTOMER_BUY')
          and t.quantity > 0
      ) then
        continue;
      end if;

      v_cost := (v_item.total_price_dong::numeric / greatest(v_item.quantity, 1))::bigint;
      v_brand := v_item.brand_name;

      select s.quantity into v_on_hand
      from public.pos_inventory_stock s
      where s.sku_id = v_item.sku_id
      for update;

      v_reverse := least(v_item.quantity, greatest(coalesce(v_on_hand, 0), 0));

      if v_reverse > 0 then
        perform pos_private.apply_stock_change(
          v_item.sku_id,
          -v_reverse,
          'PURCHASE_VOID',
          format(
            'Hủy phiếu mua %s — trừ kho %s × %s. Lý do: %s',
            v_buy.buy_no,
            v_reverse,
            coalesce(v_item.product_name_snapshot, 'SP'),
            v_reason
          ),
          'BUY_VOID',
          v_buy.id,
          v_actor,
          v_cost,
          v_brand
        );
      end if;

      v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
        'skuId', v_item.sku_id,
        'qty', -v_reverse,
        'requestedQty', v_item.quantity,
        'shortfallQty', v_item.quantity - v_reverse
      ));
    end loop;

    for v_pay in
      select * from public.pos_buy_payments
      where buy_id = v_buy.id
      order by paid_at, id
    loop
      if coalesce(v_pay.amount_dong, 0) <= 0 then
        continue;
      end if;

      v_account := pos_private.cash_account_for_method(v_pay.payment_method);
      v_ledger_id := pos_private.cash_post(
        v_account,
        'PURCHASE_VOID_RECLAIM',
        'IN',
        v_pay.amount_dong,
        format(
          'Hủy phiếu mua %s — hoàn tiền đã chi %s (%s). Lý do: %s',
          v_buy.buy_no,
          to_char(v_pay.amount_dong, 'FM999,999,999,999'),
          v_pay.payment_method,
          v_reason
        ),
        v_actor,
        now(),
        'BUY_VOID',
        v_buy.id,
        v_buy.buy_no,
        'pos_buy_void_payment',
        v_pay.id,
        null
      );

      v_cash_lines := v_cash_lines || jsonb_build_array(jsonb_build_object(
        'paymentId', v_pay.id,
        'amountDong', v_pay.amount_dong,
        'ledgerId', v_ledger_id,
        'method', v_pay.payment_method
      ));
    end loop;

    -- P10: đảo Quỹ tiền đã confirm YC-CHI (+ đóng PENDING)
    v_fund_result := pos_private.employee_cash_reverse_requests_for_source(
      'buy',
      v_buy.id,
      v_actor,
      v_reason,
      'BUY_VOID',
      v_buy.id,
      v_buy.buy_no
    );
    v_fund_lines := coalesce(v_fund_result->'lines', '[]'::jsonb);

    update public.pos_payables
    set
      paid_dong = total_dong,
      remaining_dong = 0,
      status = 'CLOSED',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where buy_id = v_buy.id;

    update public.pos_buys
    set
      status = 'VOIDED',
      workflow_status = 'CANCELLED',
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      'BUY_VOID',
      'buy',
      v_buy.id,
      v_reason,
      jsonb_build_object(
        'buyNo', v_buy.buy_no,
        'totalDong', v_buy.total_dong,
        'paidDong', v_buy.paid_dong,
        'stockReversed', v_stock_lines,
        'cashReclaimed', v_cash_lines,
        'employeeFundReversed', v_fund_lines,
        'snapshot', v_snapshot
      )
    );

    return pos_private.finish_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'ok', true,
        'buyId', v_buy.id,
        'buyNo', v_buy.buy_no,
        'status', 'VOIDED',
        'workflowStatus', 'CANCELLED',
        'stockReversed', v_stock_lines,
        'cashReclaimed', v_cash_lines,
        'employeeFundReversed', v_fund_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Backfill: YC còn CONFIRMED trong khi sale/buy đã VOIDED
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_res jsonb;
begin
  for r in
    select req.id, req.code, req.source_type, req.source_id,
           coalesce(
             case when req.source_type = 'buy' then b.buy_no end,
             case when req.source_type = 'sale' then i.invoice_no end,
             req.source_code
           ) as ref_code
    from public.pos_employee_cash_requests req
    left join public.pos_buys b
      on req.source_type = 'buy' and b.id = req.source_id
    left join public.pos_sales s
      on req.source_type = 'sale' and s.id = req.source_id
    left join lateral (
      select inv.invoice_no
      from public.pos_invoices inv
      where inv.sale_id = s.id
      order by inv.issued_at desc nulls last
      limit 1
    ) i on true
    where req.status = 'CONFIRMED'
      and (
        (req.source_type = 'buy' and b.status = 'VOIDED')
        or (req.source_type = 'sale' and s.status = 'VOIDED')
      )
    -- CHI (IN) trước để nạp lại QT, rồi THU (OUT) reclaim
    order by case when req.kind = 'CHI' then 0 else 1 end, req.created_at
  loop
    v_res := pos_private.employee_cash_reverse_requests_for_source(
      r.source_type,
      r.source_id,
      'system@backfill-p10-m6',
      'Backfill P10 M6: đảo YC sau khi chứng từ đã VOIDED',
      case when r.source_type = 'buy' then 'BUY_VOID' else 'INVOICE_VOID' end,
      r.source_id,
      r.ref_code
    );
    raise notice 'backfill YC % → %', r.code, v_res;
  end loop;
end $$;
