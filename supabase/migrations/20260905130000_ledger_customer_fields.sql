-- Enrich inventory ledger list/export with customer identity for audit.
-- SALE → pos_sales → pos_customers; CUSTOMER_BUY → buy snapshots; PURCHASE → supplier_name.

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
