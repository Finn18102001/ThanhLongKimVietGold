-- Void a completed customer buy even when a later movement already removed
-- the received units. Reverse only the quantity still on hand so stock cannot
-- go negative, and still close the payable, reclaim cash, and mark VOIDED.

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
