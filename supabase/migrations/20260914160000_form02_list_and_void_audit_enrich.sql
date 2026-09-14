-- 1) Enrich purchase-receipt void audit snapshot (receive date, actor, weight).
-- 2) Form 02 management list/export RPCs (admin reader). Does not change buy Form02 minting.

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
  v_total_qty numeric := 0;
  v_total_weight numeric := 0;
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
      'weight_chi', s.weight_chi,
      'cost_price_dong', i.cost_price_dong,
      'total_dong', i.cost_amount_dong
    ) order by i.id), '[]'::jsonb)
    into v_items_snap
    from public.pos_purchase_items i
    left join public.pos_skus s on s.id = i.sku_id
    left join public.brands b on b.id = s.brand_id
    where i.receipt_id = v_r.id;

    select
      coalesce(sum(i.received_qty), 0),
      coalesce(sum(i.received_qty * coalesce(s.weight_chi, 0)), 0)
    into v_total_qty, v_total_weight
    from public.pos_purchase_items i
    left join public.pos_skus s on s.id = i.sku_id
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
      'received_at', coalesce(v_r.completed_at, v_r.received_at, v_r.created_at),
      'received_by', v_r.actor_email,
      'total_quantity', v_total_qty,
      'total_weight_chi', v_total_weight,
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

-- NOTE: pos_audit_log is immutable (forbid_ledger_mutation). Historical PURCHASE_VOID
-- rows keep existing snapshots; UI derives missing fields when present. New voids get
-- received_at / received_by / totals from the enriched function above.

-- ---------------------------------------------------------------------------
-- Form 02 list (line-level)
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_form02(
  p_from date default null,
  p_to date default null,
  p_doc_no text default null,
  p_seller text default null,
  p_actor text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_doc text := nullif(lower(trim(coalesce(p_doc_no, ''))), '');
  v_seller text := nullif(lower(trim(coalesce(p_seller, ''))), '');
  v_actor text := nullif(lower(trim(coalesce(p_actor, ''))), '');
  v_total int;
  v_items jsonb;
begin
  perform pos_private.require_admin_reader();

  with base as (
    select
      b.id as buy_id,
      b.buy_no,
      b.form02_no,
      b.status,
      b.workflow_status,
      coalesce(b.completed_at, b.created_at) as purchased_at,
      b.customer_name_snapshot as seller_name,
      b.customer_address_snapshot as seller_address,
      b.customer_citizen_id_snapshot as seller_citizen_id,
      b.customer_phone_snapshot as seller_phone,
      b.actor_email,
      b.total_dong as buy_total_dong,
      i.id as item_id,
      coalesce(nullif(trim(i.product_name_snapshot), ''), sk.name, '') as product_name,
      i.quantity,
      coalesce(i.weight_after_chi, i.weight_chi, i.weight_before_chi, 0)::numeric as weight_chi,
      i.unit_price_dong,
      i.total_price_dong
    from public.pos_buys b
    join public.pos_buy_items i on i.buy_id = b.id
    left join public.pos_skus sk on sk.id = i.sku_id
    where nullif(trim(b.form02_no), '') is not null
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (
        v_doc is null
        or lower(b.form02_no) like '%' || v_doc || '%'
        or lower(b.buy_no) like '%' || v_doc || '%'
      )
      and (
        v_seller is null
        or lower(coalesce(b.customer_name_snapshot, '')) like '%' || v_seller || '%'
      )
      and (
        v_actor is null
        or lower(coalesce(b.actor_email, '')) like '%' || v_actor || '%'
      )
  ),
  counted as (
    select count(*)::int as total from base
  ),
  paged as (
    select
      row_number() over (order by purchased_at desc, buy_no, item_id) as stt_all,
      *
    from base
    order by purchased_at desc, buy_no, item_id
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'stt', p.stt_all,
            'buyId', p.buy_id,
            'itemId', p.item_id,
            'buyNo', p.buy_no,
            'form02No', p.form02_no,
            'status', p.status,
            'workflowStatus', p.workflow_status,
            'purchasedAt', p.purchased_at,
            'sellerName', p.seller_name,
            'sellerAddress', p.seller_address,
            'sellerCitizenId', p.seller_citizen_id,
            'sellerPhone', p.seller_phone,
            'productName', p.product_name,
            'quantity', p.quantity,
            'weightChi', p.weight_chi,
            'unitPriceDong', p.unit_price_dong,
            'lineTotalDong', p.total_price_dong,
            'buyTotalDong', p.buy_total_dong,
            'actorEmail', p.actor_email
          )
          order by p.stt_all
        )
        from paged p
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.pos_list_form02(date, date, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_form02(date, date, text, text, text, integer, integer)
  to authenticated;

create or replace function public.pos_export_form02(
  p_from date default null,
  p_to date default null,
  p_doc_no text default null,
  p_seller text default null,
  p_actor text default null,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit int := case
    when p_limit is null or p_limit <= 0 then 5000
    else least(greatest(p_limit, 1), 5000)
  end;
begin
  perform pos_private.require_admin_reader();
  return public.pos_list_form02(
    p_from,
    p_to,
    p_doc_no,
    p_seller,
    p_actor,
    v_limit,
    0
  );
end;
$function$;

revoke all on function public.pos_export_form02(date, date, text, text, text, integer)
  from public, anon;
grant execute on function public.pos_export_form02(date, date, text, text, text, integer)
  to authenticated;
