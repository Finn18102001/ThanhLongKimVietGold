-- Enrich void/reverse audit payloads with business snapshot (customer, lines, payments).
-- Displayed by audit module as Label–Value. Void/reverse business logic unchanged.

create or replace function pos_private.audit_payment_method_vi(p_method text)
returns text
language sql
immutable
as $$
  select case upper(trim(coalesce(p_method, '')))
    when 'CASH' then 'Tiền mặt'
    when 'TRANSFER' then 'Chuyển khoản'
    when 'CARD' then 'Thẻ'
    when 'MIXED' then 'Tiền mặt + Chuyển khoản'
    when '' then '—'
    else coalesce(nullif(trim(p_method), ''), '—')
  end;
$$;

-- ---------------------------------------------------------------------------
-- SALE / INVOICE VOID — snapshot before mark VOIDED
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
  v_ledger_id uuid;
  v_snapshot jsonb;
  v_items_snap jsonb;
  v_cust_name text;
  v_cust_phone text;
  v_cust_cccd text;
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
        'cash_refunded', v_cash_lines,
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
        'cash_refunded', v_cash_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- BUY VOID — snapshot before mark VOIDED
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
  v_stock_lines jsonb := '[]'::jsonb;
  v_cash_lines jsonb := '[]'::jsonb;
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

      perform pos_private.apply_stock_change(
        v_item.sku_id,
        -v_item.quantity,
        'PURCHASE_VOID',
        format(
          'Hủy phiếu mua %s — trừ kho %s × %s. Lý do: %s',
          v_buy.buy_no,
          v_item.quantity,
          coalesce(v_item.product_name_snapshot, 'SP'),
          v_reason
        ),
        'BUY_VOID',
        v_buy.id,
        v_actor,
        v_cost,
        v_brand
      );

      v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
        'skuId', v_item.sku_id,
        'qty', -v_item.quantity
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
        'cashReclaimed', v_cash_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- PURCHASE RECEIPT VOID — snapshot before mark CANCELLED
-- ---------------------------------------------------------------------------
create or replace function pos_private.void_purchase_receipt(p_receipt_id uuid, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_cached jsonb;
  v_r public.pos_purchase_receipts%rowtype;
  v_item record;
  v_pay record;
  v_brand text;
  v_existing uuid;
  v_account uuid;
  v_ledger_id uuid;
  v_net_debt bigint := 0;
  v_stock_lines jsonb := '[]'::jsonb;
  v_cash_lines jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_items_snap jsonb;
  v_pays_snap jsonb;
  v_sku_name text;
  v_sku_code text;
begin
  v_actor := pos_private.require_invoice_void_actor();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'void_purchase_receipt');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'Phải nhập lý do đảo phiếu nhập (tối thiểu 3 ký tự).'
        using errcode = '22023';
    end if;

    select * into v_r
    from public.pos_purchase_receipts
    where id = p_receipt_id
    for update;
    if not found then
      raise exception 'Phiếu nhập không tồn tại' using errcode = 'P0001';
    end if;
    if v_r.document_status = 'CANCELLED' or v_r.status = 'CANCELLED' then
      raise exception 'Phiếu nhập đã được đảo trước đó.' using errcode = '22023';
    end if;
    if v_r.document_status <> 'COMPLETED' then
      raise exception 'Chỉ đảo được phiếu nhập đã hoàn thành.' using errcode = '22023';
    end if;
    if v_r.goods_status in ('SOLD', 'RETURNED') then
      raise exception 'Không đảo phiếu đã bán / đã trả hàng NCC. Xử lý qua nghiệp vụ tương ứng.'
        using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', coalesce(s.name, 'SP'),
      'sku', s.sku,
      'brand_name', b.name,
      'quantity', i.received_qty,
      'cost_price_dong', i.cost_price_dong,
      'total_dong', i.cost_amount_dong
    ) order by i.id), '[]'::jsonb)
    into v_items_snap
    from public.pos_purchase_items i
    left join public.pos_skus s on s.id = i.sku_id
    left join public.brands b on b.id = s.brand_id
    where i.receipt_id = v_r.id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'amount_dong', p.amount_dong,
      'payment_method', p.payment_method,
      'paid_at', p.paid_at
    ) order by p.paid_at, p.id), '[]'::jsonb)
    into v_pays_snap
    from public.pos_purchase_payments p
    where p.receipt_id = v_r.id;

    v_snapshot := jsonb_build_object(
      'kind', 'purchase_void',
      'receipt_no', v_r.receipt_no,
      'supplier_name', v_r.supplier_name,
      'reason', v_r.reason,
      'payment_method', v_r.payment_method,
      'total_dong', v_r.total_dong,
      'paid_dong', v_r.paid_dong,
      'remaining_dong', v_r.remaining_dong,
      'items', v_items_snap,
      'payments', v_pays_snap
    );

    if v_r.stock_applied_at is not null then
      for v_item in
        select * from public.pos_purchase_items where receipt_id = v_r.id
      loop
        select t.id into v_existing
        from public.pos_inventory_transactions t
        where t.reference_type = 'PURCHASE_VOID'
          and t.reference_id = v_r.id
          and t.sku_id = v_item.sku_id
          and t.type = 'PURCHASE_VOID'
        limit 1;
        if v_existing is not null then
          continue;
        end if;

        select b.name, s.name, s.sku into v_brand, v_sku_name, v_sku_code
        from public.pos_skus s
        left join public.brands b on b.id = s.brand_id
        where s.id = v_item.sku_id;

        perform pos_private.apply_stock_change(
          v_item.sku_id,
          -v_item.received_qty,
          'PURCHASE_VOID',
          format(
            'Đảo phiếu nhập %s — hoàn kho %s × %s. Lý do: %s',
            v_r.receipt_no,
            v_item.received_qty,
            coalesce(v_sku_name, 'SP'),
            v_reason
          ),
          'PURCHASE_VOID',
          v_r.id,
          v_actor,
          v_item.cost_price_dong,
          v_brand
        );

        v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
          'sku_id', v_item.sku_id,
          'qty', -v_item.received_qty
        ));
      end loop;
    end if;

    select coalesce(sum(d.amount_change_dong), 0) into v_net_debt
    from public.pos_supplier_debt_ledger d
    where (
        d.reference_type = 'purchase_receipt'
        and d.reference_id = v_r.id
      )
      or (
        d.reference_type = 'purchase_payment'
        and d.reference_id in (
          select p.id from public.pos_purchase_payments p where p.receipt_id = v_r.id
        )
      );

    if v_net_debt <> 0 then
      perform pos_private.apply_supplier_debt_change(
        v_r.supplier_id,
        v_r.supplier_name,
        'ADJUSTMENT',
        -v_net_debt,
        'purchase_void',
        v_r.id,
        format('Đảo công nợ nguồn hàng %s. Lý do: %s', v_r.receipt_no, v_reason),
        v_actor
      );
    end if;

    for v_pay in
      select * from public.pos_purchase_payments
      where receipt_id = v_r.id
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
          'Đảo phiếu nhập %s — hoàn tiền TT nguồn hàng %s (%s). Lý do: %s',
          v_r.receipt_no,
          to_char(v_pay.amount_dong, 'FM999,999,999,999'),
          v_pay.payment_method,
          v_reason
        ),
        v_actor,
        now(),
        'PURCHASE_VOID',
        v_r.id,
        v_r.receipt_no,
        'pos_purchase_void_payment',
        v_pay.id,
        null
      );
      v_cash_lines := v_cash_lines || jsonb_build_array(jsonb_build_object(
        'payment_id', v_pay.id,
        'amount_dong', v_pay.amount_dong,
        'ledger_id', v_ledger_id,
        'method', v_pay.payment_method
      ));
    end loop;

    update public.pos_purchase_receipts
    set
      document_status = 'CANCELLED',
      goods_status = 'CANCELLED',
      status = 'CANCELLED',
      remaining_dong = 0,
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason
    where id = v_r.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      'PURCHASE_VOID',
      'purchase_receipt',
      v_r.id,
      v_reason,
      jsonb_build_object(
        'receipt_no', v_r.receipt_no,
        'total_dong', v_r.total_dong,
        'paid_dong', v_r.paid_dong,
        'goods_status_before', v_r.goods_status,
        'stock_reversed', v_stock_lines,
        'cash_refunded', v_cash_lines,
        'debt_net_before', v_net_debt,
        'snapshot', v_snapshot
      )
    );

    return pos_private.finish_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'ok', true,
        'receiptId', v_r.id,
        'receiptNo', v_r.receipt_no,
        'documentStatus', 'CANCELLED',
        'goodsStatus', 'CANCELLED',
        'status', 'CANCELLED',
        'stockReversed', v_stock_lines,
        'cashRefunded', v_cash_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;
