-- Display-only: daily opening/in/out for stock count, plus invoice/report Excel
-- brand + order note. Does not change stock, sale, or revenue math.

create or replace function public.pos_stock_day_movements(
  p_sku_ids uuid[],
  p_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform pos_private.require_pos_user();
  if p_on is null then
    raise exception 'Ngày kiểm kê không hợp lệ' using errcode = '22023';
  end if;
  if p_sku_ids is null or coalesce(cardinality(p_sku_ids), 0) = 0 then
    return '[]'::jsonb;
  end if;

  v_start := p_on::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_end := (p_on + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'skuId', x.sku_id,
        'openingQty', x.opening_qty,
        'qtyIn', x.qty_in,
        'qtyOut', x.qty_out
      )
      order by x.sku_id
    )
    from (
      select
        s.sku_id,
        coalesce(o.after_quantity, 0)::int as opening_qty,
        coalesce(m.qty_in, 0)::int as qty_in,
        coalesce(m.qty_out, 0)::int as qty_out
      from (select distinct unnest(p_sku_ids) as sku_id) s
      left join (
        select distinct on (t.sku_id) t.sku_id, t.after_quantity
        from public.pos_inventory_transactions t
        where t.sku_id = any(p_sku_ids)
          and t.created_at < v_start
        order by t.sku_id, t.created_at desc, t.id desc
      ) o on o.sku_id = s.sku_id
      left join (
        select
          t.sku_id,
          coalesce(sum(t.quantity) filter (where t.quantity > 0), 0) as qty_in,
          coalesce(sum(-t.quantity) filter (where t.quantity < 0), 0) as qty_out
        from public.pos_inventory_transactions t
        where t.sku_id = any(p_sku_ids)
          and t.created_at >= v_start
          and t.created_at < v_end
        group by t.sku_id
      ) m on m.sku_id = s.sku_id
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_stock_day_movements(uuid[], date) from public, anon;
grant execute on function public.pos_stock_day_movements(uuid[], date) to authenticated;

-- Invoice Excel: add product brand + voucher note. Existing columns unchanged.
create or replace function public.pos_export_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
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
    raise exception 'Loại chứng từ không hợp lệ' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trạng thái thanh toán không hợp lệ' using errcode = '22023';
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
      s.note
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(i.invoice_no) like '%' || v_q || '%'
        or lower(s.sale_no) like '%' || v_q || '%'
        or lower(c.name) like '%' || v_q || '%'
        or lower(c.phone) like '%' || v_q || '%'
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
      b.note
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        b.status = 'COMPLETED'
        or (
          b.status = 'PROCESSING'
          and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
        )
      )
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(b.buy_no) like '%' || v_q || '%'
        or lower(coalesce(b.customer_name_snapshot, c.name)) like '%' || v_q || '%'
        or lower(coalesce(b.customer_phone_snapshot, c.phone)) like '%' || v_q || '%'
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
      r.note
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
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
      l.note as "note"
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
$$;

revoke all on function public.pos_export_documents(text, text, date, date, text, integer)
  from public, anon;
grant execute on function public.pos_export_documents(text, text, date, date, text, integer)
  to authenticated;

-- Report Excel: add voucher note per sale/buy row. Revenue math unchanged.
create or replace function public.pos_export_transactions(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        si.total_price_dong as "totalDong",
        s.paid_dong as "paidDong",
        s.remaining_dong as "remainingDong",
        s.payment_status as "paymentStatus",
        s.payment_method as "paymentMethod",
        s.due_date as "dueDate",
        s.actor_email as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note"
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
        'BUY'::text,
        b.buy_no,
        null::text,
        c.name,
        c.phone,
        bi.total_price_dong,
        b.paid_dong,
        b.remaining_dong,
        b.payment_status,
        b.payment_method,
        b.due_date,
        b.actor_email,
        b.completed_at,
        bi.quantity::bigint,
        (bi.quantity * bi.weight_chi)::numeric,
        coalesce(sk.sku, '') as "sku",
        coalesce(nullif(trim(bi.brand_name), ''), br.name, '') as "brandName",
        coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(b.note, '') as "note"
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
$$;

revoke all on function public.pos_export_transactions(date, date) from public, anon;
grant execute on function public.pos_export_transactions(date, date) to authenticated;
