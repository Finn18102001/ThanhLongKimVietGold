-- Round-debug fixes:
-- 1) Allow tuananh18101@gmail.com to void invoices (same as thanglongkimviet).
-- 2) SALE_VOID stock restore: aggregate per SKU once; do not pollute last_cost with sell price.
-- 3) pos_save_held_order: restore list-shaped payload with `id` (client open/delete after save).

-- ---------------------------------------------------------------------------
-- 1. Void actor allow-list
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
  if v_email not in (
    'thanglongkimviet@gmail.com',
    'tuananh18101@gmail.com'
  ) then
    raise exception
      'Chỉ tài khoản thanglongkimviet@gmail.com hoặc tuananh18101@gmail.com được hủy hóa đơn.'
      using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Void sale invoice — stock restore correctness
-- ---------------------------------------------------------------------------
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
    -- Aggregate qty per SKU so prior returns are subtracted once (not per line).
    -- Pass null cost so SALE_VOID does not overwrite last_cost_dong with sell price.
    if v_sale.transaction_type = 'SALE'
       or (v_sale.transaction_type = 'PREORDER' and v_sale.fulfillment_status = 'FULFILLED') then
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

-- ---------------------------------------------------------------------------
-- 3. Held order save payload: restore `id` + list fields for client refresh
-- ---------------------------------------------------------------------------
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
    'Lưu đơn chưa thanh toán. Kho chưa trừ. Chưa phát hành hóa đơn.',
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'item_count', v_hold.item_count,
      'estimated_total_dong', v_hold.estimated_total_dong,
      'customer_id', v_customer.id,
      'visible_to_all', pos_private.held_orders_visible_to_all()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_hold.id,
    'held_order_id', v_hold.id,
    'hold_no', v_hold.hold_no,
    'status', v_hold.status,
    'customer_id', v_customer.id,
    'customer_name', v_customer.name,
    'customer_phone', v_customer.phone,
    'customer_no', v_customer.customer_no,
    'is_walk_in', false,
    'payment_method', v_hold.payment_method,
    'note', v_hold.note,
    'estimated_total_dong', v_hold.estimated_total_dong,
    'item_count', v_hold.item_count,
    'saved_by_email', v_hold.saved_by_email,
    'created_at', v_hold.created_at,
    'updated_at', v_hold.updated_at,
    'visible_to_all', pos_private.held_orders_visible_to_all(),
    'items', v_items
  );
end;
$$;

revoke all on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) from public, anon;
grant execute on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) to authenticated;
