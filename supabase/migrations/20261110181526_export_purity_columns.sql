-- Phase 1 · Section 4: thêm cột Hàm lượng (purity) vào RPC xuất. Chỉ thêm khóa JSON + nới giới hạn xuất; không đổi logic khác.

CREATE OR REPLACE FUNCTION public.pos_export_documents(p_document_type text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_q_doc boolean := v_q is not null and v_q ~ '^[0-9a-z\-]+$' and v_q ~ '[0-9]';
  v_doc_limit int := case
    when p_limit is null or p_limit <= 0 then 5000
    else least(greatest(p_limit, 1), 2000)
  end;
  v_result jsonb;
begin
  perform pos_private.require_pos_user();
  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loai chung tu khong hop le' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trang thai thanh toan khong hop le' using errcode = '22023';
  end if;

  with docs as (
    select
      i.id,
      i.invoice_no as document_no,
      'SALE_TO_CUSTOMER'::text as document_type,
      i.issued_at,
      c.name as party_name,
      c.phone as party_phone,
      s.total_dong,
      s.paid_dong,
      s.remaining_dong,
      s.payment_status,
      s.payment_method,
      s.sale_no as ref_no,
      s.id as sale_id,
      null::uuid as buy_id,
      null::uuid as receipt_id,
      s.note,
      s.pickup_due_at,
      (
        select min(t.created_at)
        from public.pos_inventory_transactions t
        where t.reference_id = s.id
          and t.type in ('PREORDER_FULFILL', 'SALE')
      ) as gold_delivered_at,
      (
        select p.amount_dong
        from public.pos_sale_payments p
        where p.sale_id = s.id
        order by p.paid_at asc, p.id asc
        limit 1
      ) as first_paid_dong,
      (
        select coalesce(sum(p.amount_dong), 0)::bigint
        from public.pos_sale_payments p
        where p.sale_id = s.id
          and p.id <> (
            select p0.id
            from public.pos_sale_payments p0
            where p0.sale_id = s.id
            order by p0.paid_at asc, p0.id asc
            limit 1
          )
      ) as second_paid_dong
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and i.status is distinct from 'VOIDED'
      and i.voided_at is null
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or i.invoice_no ilike '%' || v_q || '%'
        or s.sale_no ilike '%' || v_q || '%'
        or c.phone ilike '%' || v_q || '%'
        or (not v_q_doc and c.name ilike '%' || v_q || '%')
      )

    union all

    select
      b.id,
      b.buy_no,
      'PURCHASE_FROM_CUSTOMER',
      coalesce(b.completed_at, b.created_at),
      coalesce(b.customer_name_snapshot, c.name),
      coalesce(b.customer_phone_snapshot, c.phone),
      b.total_dong,
      b.paid_dong,
      b.remaining_dong,
      b.payment_status,
      b.payment_method,
      b.buy_no,
      null::uuid,
      b.id,
      null::uuid,
      b.note,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::bigint
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        b.status = 'COMPLETED'
        or (
          b.status = 'PROCESSING'
          and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
        )
      )
      and b.status is distinct from 'VOIDED'
      and b.status is distinct from 'CANCELLED'
      and b.voided_at is null
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or b.buy_no ilike '%' || v_q || '%'
        or coalesce(b.customer_phone_snapshot, c.phone) ilike '%' || v_q || '%'
        or (
          not v_q_doc
          and coalesce(b.customer_name_snapshot, c.name) ilike '%' || v_q || '%'
        )
      )

    union all

    select
      r.id,
      r.receipt_no,
      'STOCK_RECEIPT',
      coalesce(r.completed_at, r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      r.payment_method,
      r.receipt_no,
      null::uuid,
      null::uuid,
      r.id,
      r.note,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::bigint
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and coalesce(r.status, '') is distinct from 'CANCELLED'
      and r.voided_at is null
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or r.receipt_no ilike '%' || v_q || '%'
        or (not v_q_doc and r.supplier_name ilike '%' || v_q || '%')
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  limited_docs as (
    select d.*
    from docs d
    order by d.issued_at desc, d.document_no
    limit v_doc_limit
  ),
  lines as (
    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as product_name,
      si.quantity::numeric as quantity,
      si.weight_chi as weight_chi,
      coalesce(nullif(trim(br.name), ''), '') as brand_name,
      coalesce(d.note, '') as note,
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      si.unit_price_dong as unit_price_dong,
      coalesce(pos_private.price_row_purity(si.price_row_id), pos_private.sku_purity(si.sku_id)) as purity,
      1 as line_ord
    from limited_docs d
    join public.pos_sale_items si on si.sale_id = d.sale_id
    left join public.pos_skus sk on sk.id = si.sku_id
    left join public.brands br on br.id = sk.brand_id
    where d.document_type = 'SALE_TO_CUSTOMER'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, '') as product_name,
      bi.quantity::numeric,
      bi.weight_chi,
      coalesce(nullif(trim(bi.brand_name), ''), br.name, ''),
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      bi.unit_price_dong,
      coalesce(nullif(trim(bi.gold_age), ''), pos_private.price_row_purity(bi.price_row_id), pos_private.sku_purity(bi.sku_id)),
      1
    from limited_docs d
    join public.pos_buy_items bi on bi.buy_id = d.buy_id
    left join public.pos_skus sk on sk.id = bi.sku_id
    left join public.brands br on br.id = coalesce(bi.brand_id, sk.brand_id)
    where d.document_type = 'PURCHASE_FROM_CUSTOMER'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(sk.name, '') as product_name,
      pi.received_qty::numeric,
      sk.weight_chi,
      coalesce(nullif(trim(br.name), ''), ''),
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      coalesce(pi.cost_price_dong, 0)::bigint,
      pos_private.sku_purity(pi.sku_id),
      1
    from limited_docs d
    join public.pos_purchase_items pi on pi.receipt_id = d.receipt_id
    left join public.pos_skus sk on sk.id = pi.sku_id
    left join public.brands br on br.id = sk.brand_id
    where d.document_type = 'STOCK_RECEIPT'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      ''::text,
      null::numeric,
      null::numeric,
      ''::text,
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      null::bigint,
      null::text,
      0
    from limited_docs d
    where (
      d.document_type = 'SALE_TO_CUSTOMER'
      and not exists (select 1 from public.pos_sale_items si where si.sale_id = d.sale_id)
    ) or (
      d.document_type = 'PURCHASE_FROM_CUSTOMER'
      and not exists (select 1 from public.pos_buy_items bi where bi.buy_id = d.buy_id)
    ) or (
      d.document_type = 'STOCK_RECEIPT'
      and not exists (select 1 from public.pos_purchase_items pi where pi.receipt_id = d.receipt_id)
    )
  ),
  paged as (
    select
      l.id,
      l.document_no as "documentNo",
      l.document_type as "documentType",
      l.issued_at as "issuedAt",
      l.party_name as "partyName",
      l.party_phone as "partyPhone",
      l.total_dong as "totalDong",
      l.paid_dong as "paidDong",
      l.remaining_dong as "remainingDong",
      l.payment_status as "paymentStatus",
      l.payment_method as "paymentMethod",
      l.ref_no as "refNo",
      l.product_name as "productName",
      l.quantity as "quantity",
      l.weight_chi as "weightChi",
      l.brand_name as "brandName",
      l.note as "note",
      l.pickup_due_at as "pickupDueAt",
      l.gold_delivered_at as "goldDeliveredAt",
      l.first_paid_dong as "firstPaidDong",
      l.second_paid_dong as "secondPaidDong",
      l.unit_price_dong as "unitPriceDong",
      l.purity as "purity"
    from lines l
    order by l.issued_at desc, l.document_no, l.line_ord, l.product_name
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    'total', (select total from counted),
    'exportedDocuments', (select count(*)::int from limited_docs),
    'limit', v_doc_limit,
    'offset', 0
  )
  into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_export_transactions(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pos_private.require_admin();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t."completedAt" desc, t."code", t."productName")
    from (
      select
        'SELL'::text as "type",
        s.sale_no as "code",
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        c.phone as "customerPhone",
        coalesce(nullif(trim(c.citizen_id), ''), '') as "customerCccd",
        si.total_price_dong as "totalDong",
        s.paid_dong as "paidDong",
        s.remaining_dong as "remainingDong",
        s.payment_status as "paymentStatus",
        s.payment_method as "paymentMethod",
        s.due_date as "dueDate",
        coalesce(
          (select nullif(trim(st.full_name), '') from public.pos_staff st where st.id = s.operator_staff_id),
          s.actor_email
        ) as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(pos_private.price_row_purity(si.price_row_id), pos_private.sku_purity(si.sku_id)) as "purity",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note",
        case
          when coalesce(si.weight_chi, 0) > 0 then round(si.unit_price_dong::numeric / si.weight_chi)::bigint
          else si.unit_price_dong
        end as "unitPriceDong",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'FULFILLED' then 'Đã trả vàng'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'CANCELLED' then 'Đã hủy'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'READY' then 'Sẵn sàng giao'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') then 'Chưa trả vàng'
          else 'Đã giao'
        end as "goldReturnStatus",
        s.pickup_due_at as "goldReturnDueAt",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT') then (
            select max(t.created_at) from public.pos_inventory_transactions t
            where t.reference_id = s.id and t.type = 'PREORDER_FULFILL'
          )
          else (
            select min(t.created_at) from public.pos_inventory_transactions t
            where t.reference_id = s.id and t.type = 'SALE'
          )
        end as "goldReturnedAt"
      from public.pos_sales s
      join public.pos_customers c on c.id = s.customer_id
      join public.pos_sale_items si on si.sale_id = s.id
      left join public.pos_invoices i on i.sale_id = s.id
      left join public.pos_skus sk on sk.id = si.sku_id
      left join public.brands br on br.id = sk.brand_id
      where s.status = 'COMPLETED'
        and s.completed_at::date >= p_from
        and s.completed_at::date <= p_to
      union all
      select
        'BUY'::text, b.buy_no, null::text, c.name, c.phone,
        coalesce(nullif(trim(c.citizen_id), ''), ''),
        bi.total_price_dong, b.paid_dong, b.remaining_dong, b.payment_status, b.payment_method, b.due_date,
        b.actor_email, b.completed_at, bi.quantity::bigint, (bi.quantity * bi.weight_chi)::numeric,
        coalesce(sk.sku, ''), coalesce(nullif(trim(bi.brand_name), ''), br.name, ''),
        coalesce(nullif(trim(bi.gold_age), ''), pos_private.price_row_purity(bi.price_row_id), pos_private.sku_purity(bi.sku_id)),
        coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, ''), coalesce(b.note, ''),
        bi.unit_price_dong, ''::text, null::timestamptz, null::timestamptz
      from public.pos_buys b
      join public.pos_customers c on c.id = b.customer_id
      join public.pos_buy_items bi on bi.buy_id = b.id
      left join public.pos_skus sk on sk.id = bi.sku_id
      left join public.brands br on br.id = coalesce(bi.brand_id, sk.brand_id)
      where b.status = 'COMPLETED'
        and b.completed_at::date >= p_from
        and b.completed_at::date <= p_to
    ) t
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_list_ledger(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_brand_id uuid DEFAULT NULL::uuid, p_type text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_total int;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();

  with filtered as (
    select
      t.id,
      t.created_at,
      t.type,
      t.quantity,
      t.before_quantity,
      t.after_quantity,
      t.reason,
      t.actor_email,
      t.reference_type,
      t.reference_id,
      t.cost_price_dong,
      t.brand_name,
      s.sku,
      s.name as product_name,
      s.brand_id,
      s.id as sku_id,
      b.name as sku_brand_name,
      case
        when t.reference_type = 'SALE' then nullif(trim(coalesce(c_sale.name, '')), '')
        when t.reference_type = 'CUSTOMER_BUY' then nullif(trim(coalesce(buy.customer_name_snapshot, '')), '')
        when t.reference_type = 'PURCHASE' then nullif(trim(coalesce(recv.supplier_name, '')), '')
        else null
      end as customer_name,
      case
        when t.reference_type = 'SALE' then nullif(trim(coalesce(c_sale.phone, '')), '')
        when t.reference_type = 'CUSTOMER_BUY' then nullif(trim(coalesce(buy.customer_phone_snapshot, '')), '')
        else null
      end as customer_phone,
      case
        when t.reference_type = 'SALE' then nullif(trim(coalesce(c_sale.citizen_id, '')), '')
        when t.reference_type = 'CUSTOMER_BUY' then nullif(trim(coalesce(buy.customer_citizen_id_snapshot, '')), '')
        else null
      end as customer_citizen_id
    from public.pos_inventory_transactions t
    join public.pos_skus s on s.id = t.sku_id
    left join public.brands b on b.id = s.brand_id
    left join public.pos_sales sale
      on t.reference_type = 'SALE' and sale.id = t.reference_id
    left join public.pos_customers c_sale
      on c_sale.id = sale.customer_id
    left join public.pos_buys buy
      on t.reference_type = 'CUSTOMER_BUY' and buy.id = t.reference_id
    left join public.pos_purchase_receipts recv
      on t.reference_type = 'PURCHASE' and recv.id = t.reference_id
    where (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at <= p_to)
      and (p_type is null or t.type = p_type)
      and (
        p_brand_id is null
        or s.brand_id = p_brand_id
        or (p_brand_id = '00000000-0000-0000-0000-000000000000'::uuid and s.brand_id is null)
      )
      and (
        v_q is null
        or s.sku ilike '%' || v_q || '%'
        or s.name ilike '%' || v_q || '%'
        or t.reason ilike '%' || v_q || '%'
        or t.actor_email ilike '%' || v_q || '%'
        or coalesce(c_sale.name, buy.customer_name_snapshot, recv.supplier_name, '') ilike '%' || v_q || '%'
        or coalesce(c_sale.phone, buy.customer_phone_snapshot, '') ilike '%' || v_q || '%'
        or coalesce(c_sale.citizen_id, buy.customer_citizen_id_snapshot, '') ilike '%' || v_q || '%'
      )
  ),
  counted as (
    select count(*)::int as total from filtered
  ),
  paged as (
    select
      f.id,
      f.created_at as "createdAt",
      f.type,
      f.quantity,
      f.before_quantity as "beforeQuantity",
      f.after_quantity as "afterQuantity",
      f.reason,
      f.actor_email as "actorEmail",
      f.reference_type as "referenceType",
      f.reference_id as "referenceId",
      f.cost_price_dong as "costPriceDong",
      coalesce(f.brand_name, f.sku_brand_name) as "brandName",
      f.sku,
      f.product_name as name,
      pos_private.sku_purity(f.sku_id) as purity,
      f.customer_name as "customerName",
      f.customer_phone as "customerPhone",
      f.customer_citizen_id as "customerCitizenId"
    from filtered f
    order by f.created_at desc
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_list_form02(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_doc_no text DEFAULT NULL::text, p_seller text DEFAULT NULL::text, p_actor text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 5000);
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
      coalesce(nullif(trim(i.gold_age), ''), pos_private.price_row_purity(i.price_row_id), pos_private.sku_purity(i.sku_id)) as purity,
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
            'purity', p.purity,
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
$function$
;
