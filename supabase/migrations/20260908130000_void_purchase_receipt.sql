-- Reverse (void) warehouse purchase receipts via compensating entries.
-- No physical delete. Actor: same allow-list as invoice void
-- (thanglongkimviet@gmail.com, tuananh18101@gmail.com).

alter table public.pos_purchase_receipts
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by text null,
  add column if not exists void_reason text null;

create or replace function pos_private.void_purchase_receipt(
  p_receipt_id uuid,
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

    -- 1) Reverse stock if previously applied
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

        select b.name into v_brand
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
            coalesce((select name from public.pos_skus where id = v_item.sku_id), 'SP'),
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

    -- 2) Unwind supplier debt net for this receipt + its payments
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

    -- 3) Refund cash for every purchase payment (IN = hoàn tiền vào quỹ)
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
        'debt_net_before', v_net_debt
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
$$;

create or replace function public.pos_void_purchase_receipt(
  p_receipt_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return pos_private.void_purchase_receipt(
    p_receipt_id,
    p_reason,
    coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text)
  );
end;
$$;

revoke all on function public.pos_void_purchase_receipt(uuid, text, text) from public, anon;
grant execute on function public.pos_void_purchase_receipt(uuid, text, text) to authenticated;
