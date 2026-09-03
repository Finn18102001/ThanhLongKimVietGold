-- Ledger + document list/export. Filters applied in SQL (not FE-only).

create or replace function public.pos_list_brands()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform pos_private.require_pos_user();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'slug', b.slug,
      'isActive', b.is_active
    ) order by b.sort_order, b.name)
    from public.brands b
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_list_brands() from public, anon;
grant execute on function public.pos_list_brands() to authenticated;

create or replace function public.pos_list_ledger(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_brand_id uuid default null,
  p_type text default null,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
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
      b.name as sku_brand_name
    from public.pos_inventory_transactions t
    join public.pos_skus s on s.id = t.sku_id
    left join public.brands b on b.id = s.brand_id
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
      )
  )
  select count(*)::int into v_total from filtered;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into v_items
  from (
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
      f.product_name as name
    from filtered f
    order by f.created_at desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.pos_list_ledger(timestamptz, timestamptz, uuid, text, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_ledger(timestamptz, timestamptz, uuid, text, text, integer, integer)
  to authenticated;

create or replace function public.pos_export_ledger(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_brand_id uuid default null,
  p_type text default null,
  p_q text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.pos_list_ledger(p_from, p_to, p_brand_id, p_type, p_q, 10000, 0);
$$;

revoke all on function public.pos_export_ledger(timestamptz, timestamptz, uuid, text, text)
  from public, anon;
grant execute on function public.pos_export_ledger(timestamptz, timestamptz, uuid, text, text)
  to authenticated;

create or replace function public.pos_list_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
  v_total int;
  v_items jsonb;
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
      s.sale_no as ref_no
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
      b.buy_no
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where b.status = 'COMPLETED'
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
      coalesce(r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      null::text,
      r.receipt_no
    from public.pos_purchase_receipts r
    where r.status = 'RECEIVED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
      )
  )
  select count(*)::int into v_total from docs;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      d.id,
      d.document_no as "documentNo",
      d.document_type as "documentType",
      d.issued_at as "issuedAt",
      d.party_name as "partyName",
      d.party_phone as "partyPhone",
      d.total_dong as "totalDong",
      d.paid_dong as "paidDong",
      d.remaining_dong as "remainingDong",
      d.payment_status as "paymentStatus",
      d.payment_method as "paymentMethod",
      d.ref_no as "refNo"
    from docs d
    order by d.issued_at desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  to authenticated;

create or replace function public.pos_export_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.pos_list_documents(p_document_type, p_payment_status, p_from, p_to, p_q, 10000, 0);
$$;

revoke all on function public.pos_export_documents(text, text, date, date, text)
  from public, anon;
grant execute on function public.pos_export_documents(text, text, date, date, text)
  to authenticated;
