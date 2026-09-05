-- Invoice VOID (compensating) + force real customer on sales.
-- Void actor: only thanglongkimviet@gmail.com (not all admins).

-- ---------------------------------------------------------------------------
-- 1. Schema: statuses, inventory type, cash txn type, void columns
-- ---------------------------------------------------------------------------
alter table public.pos_invoices drop constraint if exists pos_invoices_status_check;
alter table public.pos_invoices
  add constraint pos_invoices_status_check
  check (status in ('ISSUED', 'VOIDED'));

alter table public.pos_invoices
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by text null,
  add column if not exists void_reason text null;

alter table public.pos_sales drop constraint if exists pos_sales_status_check;
alter table public.pos_sales
  add constraint pos_sales_status_check
  check (status in ('COMPLETED', 'FAILED', 'VOIDED'));

alter table public.pos_sales
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by text null,
  add column if not exists void_reason text null;

alter table public.pos_inventory_transactions drop constraint if exists pos_inventory_tx_type_check;
alter table public.pos_inventory_transactions
  add constraint pos_inventory_tx_type_check
  check (type in (
    'PURCHASE_RECEIVED',
    'SALE',
    'CUSTOMER_RETURN',
    'SUPPLIER_RETURN',
    'STOCK_ADJUSTMENT_IN',
    'STOCK_ADJUSTMENT_OUT',
    'PREORDER_FULFILL',
    'SALE_VOID'
  ));

alter table public.pos_cash_ledger drop constraint if exists pos_cash_ledger_txn_type_check;
alter table public.pos_cash_ledger
  add constraint pos_cash_ledger_txn_type_check
  check (txn_type in (
    'SALE_PAYMENT',
    'PURCHASE_PAYMENT',
    'RECEIVABLE_COLLECTION',
    'PAYABLE_PAYMENT',
    'OTHER_INCOME',
    'OTHER_EXPENSE',
    'TRANSFER',
    'SALE_VOID_REFUND'
  ));

-- Allow temporary negative cash balance when voiding (fund may already be withdrawn).
alter table public.pos_cash_accounts drop constraint if exists pos_cash_accounts_balance_dong_check;
alter table public.pos_cash_ledger drop constraint if exists pos_cash_ledger_balance_before_dong_check;
alter table public.pos_cash_ledger drop constraint if exists pos_cash_ledger_balance_after_dong_check;

-- ---------------------------------------------------------------------------
-- 2. Require real customer (no walk-in) on sales
-- ---------------------------------------------------------------------------
create or replace function pos_private.require_real_customer_id(p_customer_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.pos_customers%rowtype;
begin
  if p_customer_id is null then
    raise exception 'Vui lòng chọn khách hàng trước khi xác nhận hóa đơn.'
      using errcode = '22023';
  end if;
  select * into v_row from public.pos_customers c where c.id = p_customer_id;
  if not found then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if coalesce(v_row.is_walk_in, false) then
    raise exception 'Vui lòng chọn khách hàng trước khi xác nhận hóa đơn.'
      using errcode = '22023';
  end if;
  return v_row.id;
end;
$$;

create or replace function pos_private.enforce_sale_real_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.require_real_customer_id(NEW.customer_id);
  return NEW;
end;
$$;

drop trigger if exists trg_pos_sales_require_real_customer on public.pos_sales;
create trigger trg_pos_sales_require_real_customer
  before insert or update of customer_id on public.pos_sales
  for each row
  execute function pos_private.enforce_sale_real_customer();

-- Public sale wrappers: reject walk-in / missing customer before private complete.
create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_charges jsonb default '[]'::jsonb,
  p_operator_staff_id uuid default null,
  p_pickup_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.require_real_customer_id(p_customer_id);
  return pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date,
    p_charges, p_operator_staff_id, p_pickup_due_at
  );
end;
$$;

revoke all on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) from public, anon;
grant execute on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) to authenticated;

-- Held order save: require real customer (no walk-in fallback).
create or replace function public.pos_save_held_order(
  p_items jsonb,
  p_customer_id uuid default null,
  p_payment_method text default 'CASH',
  p_note text default null,
  p_held_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_totals record;
  v_customer public.pos_customers%rowtype;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'CASH');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_hold_no text;
  v_items jsonb;
  v_customer_id uuid;
begin
  v_actor := pos_private.require_pos_user();
  v_customer_id := pos_private.require_real_customer_id(p_customer_id);

  if v_method not in ('CASH', 'TRANSFER', 'CARD') then
    raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
  end if;

  select * into v_customer from public.pos_customers c where c.id = v_customer_id;

  if p_held_order_id is not null then
    select * into v_hold
    from public.pos_held_orders h
    where h.id = p_held_order_id
    for update;

    if not found then
      raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
    end if;
    if v_hold.status <> 'HELD' then
      raise exception 'Đơn đã lưu không còn mở' using errcode = 'P0001';
    end if;
    if not pos_private.can_access_held_order(v_hold.saved_by_email) then
      raise exception 'Không mở được đơn đã lưu của tài khoản khác' using errcode = '42501';
    end if;
  else
    v_hold_no := 'LD' || lpad(nextval('public.pos_held_order_seq')::text, 6, '0');
    insert into public.pos_held_orders (
      hold_no, status, customer_id, customer_name, customer_phone, customer_no, is_walk_in,
      payment_method, note, estimated_total_dong, item_count,
      saved_by_user_id, saved_by_email
    ) values (
      v_hold_no, 'HELD', v_customer.id, v_customer.name, v_customer.phone, v_customer.customer_no,
      false,
      v_method, v_note, 0, 1,
      auth.uid(), v_actor
    )
    returning * into v_hold;
  end if;

  select * into v_totals from pos_private.replace_held_order_items(v_hold.id, p_items);

  update public.pos_held_orders
  set
    customer_id = v_customer.id,
    customer_name = v_customer.name,
    customer_phone = v_customer.phone,
    customer_no = v_customer.customer_no,
    is_walk_in = false,
    payment_method = v_method,
    note = v_note,
    estimated_total_dong = v_totals.estimated_total_dong,
    item_count = v_totals.item_count,
    updated_at = now()
  where id = v_hold.id
  returning * into v_hold;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_id', i.sku_id,
        'sku', i.sku,
        'name', i.name,
        'quantity', i.quantity,
        'unit_price_dong', i.unit_price_dong,
        'line_total_dong', i.line_total_dong
      )
      order by i.sort_index
    ),
    '[]'::jsonb
  )
  into v_items
  from public.pos_held_order_items i
  where i.held_order_id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    case when p_held_order_id is null then 'HELD_ORDER_SAVE' else 'HELD_ORDER_UPDATE' end,
    'HELD_ORDER',
    v_hold.id,
    case when p_held_order_id is null then 'Lưu đơn tạm' else 'Cập nhật đơn tạm' end,
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'item_count', v_hold.item_count,
      'estimated_total_dong', v_hold.estimated_total_dong,
      'customer_id', v_customer.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'held_order_id', v_hold.id,
    'hold_no', v_hold.hold_no,
    'customer_id', v_customer.id,
    'customer_name', v_customer.name,
    'customer_phone', v_customer.phone,
    'is_walk_in', false,
    'estimated_total_dong', v_hold.estimated_total_dong,
    'item_count', v_hold.item_count,
    'items', v_items
  );
end;
$$;

revoke all on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) from public, anon;
grant execute on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cash post that allows negative balance (void refunds)
-- ---------------------------------------------------------------------------
create or replace function pos_private.cash_post_allow_negative(
  p_account_id uuid,
  p_txn_type text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_actor_email text,
  p_occurred_at timestamptz default now(),
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_code text default null,
  p_source_table text default null,
  p_source_row_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'CASHFLOW_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'CASHFLOW_CONTENT_REQUIRED';
  end if;

  if p_source_table is not null and p_source_row_id is not null then
    select id into v_id
    from public.pos_cash_ledger
    where source_table = p_source_table and source_row_id = p_source_row_id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select balance_dong into v_bal
  from public.pos_cash_accounts
  where id = p_account_id
  for update;

  if v_bal is null then
    raise exception 'CASHFLOW_ACCOUNT_NOT_FOUND';
  end if;

  if p_direction = 'IN' then
    v_after := v_bal + p_amount_dong;
  elsif p_direction = 'OUT' then
    v_after := v_bal - p_amount_dong;
  else
    raise exception 'CASHFLOW_DIRECTION_INVALID';
  end if;

  insert into public.pos_cash_ledger (
    account_id, txn_type, direction, amount_dong,
    balance_before_dong, balance_after_dong, content,
    reference_type, reference_id, reference_code,
    source_table, source_row_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong,
    v_bal, v_after, trim(p_content),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  update public.pos_cash_accounts
  set balance_dong = v_after, updated_at = now()
  where id = p_account_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Void invoice RPC (thanglongkimviet only)
-- ---------------------------------------------------------------------------
create or replace function pos_private.require_invoice_void_actor()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(public.tlkv_current_email(), '')));
begin
  if v_email <> 'thanglongkimviet@gmail.com' then
    raise exception 'Chỉ tài khoản thanglongkimviet@gmail.com được hủy hóa đơn.'
      using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function pos_private.void_sale_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_ledger_id uuid;
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

    -- Stock restore: SALE or fulfilled PREORDER only.
    if v_sale.transaction_type = 'SALE'
       or (v_sale.transaction_type = 'PREORDER' and v_sale.fulfillment_status = 'FULFILLED') then
      for v_item in
        select si.sku_id, si.quantity, si.sku_snapshot, si.product_name_snapshot, si.unit_price_dong
        from public.pos_sale_items si
        where si.sale_id = v_sale.id
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
            v_item.unit_price_dong,
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

    -- Cash reverse for every sale payment (append-only compensating OUT).
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
        'cash_refunded', v_cash_lines
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
        'cash_refunded', v_cash_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function public.pos_void_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return pos_private.void_sale_invoice(
    p_invoice_id,
    p_reason,
    coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text)
  );
end;
$$;

revoke all on function public.pos_void_invoice(uuid, text, text) from public, anon;
grant execute on function public.pos_void_invoice(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Also gate older sale overload + buy RPC with the same customer rule
-- ---------------------------------------------------------------------------
create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.require_real_customer_id(p_customer_id);
  return pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date,
    '[]'::jsonb, null, null
  );
end;
$$;

revoke all on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date
) from public, anon;
grant execute on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date
) to authenticated;

create or replace function public.pos_complete_buy(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.require_real_customer_id(p_customer_id);
  return pos_private.complete_buy(
    p_idempotency_key, p_customer_id, p_payment_method, p_items,
    p_note, p_paid_dong, p_due_date, p_approve_price_exception, p_price_exception_reason
  );
end;
$$;

revoke all on function public.pos_complete_buy(
  text, uuid, text, jsonb, text, bigint, date, boolean, text
) from public, anon;
grant execute on function public.pos_complete_buy(
  text, uuid, text, jsonb, text, bigint, date, boolean, text
) to authenticated;
