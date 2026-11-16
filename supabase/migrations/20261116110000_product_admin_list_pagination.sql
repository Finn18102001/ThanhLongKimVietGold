-- Product admin list: created_at + server-side pagination (newest first).
-- §32.1: ALTER products ADD COLUMN — bảng products đã có GRANT authenticated/service_role;
-- không đổi Data API exposure. RPC mới: GRANT EXECUTE tường minh, không grant anon.

-- Snapshot trước ALTER: tlkv_backup_20261110.products__gd_product_created_at

alter table public.products
  add column if not exists created_at timestamptz;

update public.products
set created_at = coalesce(updated_at, timezone('utc', now()))
where created_at is null;

alter table public.products
  alter column created_at set default timezone('utc', now());

alter table public.products
  alter column created_at set not null;

create index if not exists products_created_at_idx
  on public.products (created_at desc);

create or replace function public.pos_list_product_admin(
  p_q text default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_product_type_id uuid default null,
  p_source text default null,
  p_product_state text default null,
  p_pos_state text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_product_id text default null,
  p_sku_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_source text := nullif(upper(trim(coalesce(p_source, ''))), '');
  v_product_state text := nullif(lower(trim(coalesce(p_product_state, ''))), '');
  v_pos_state text := nullif(lower(trim(coalesce(p_pos_state, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total integer := 0;
  v_summary jsonb;
begin
  if not public.tlkv_can_admin_read() then
    raise exception 'Không đủ quyền xem danh sách sản phẩm.' using errcode = '42501';
  end if;

  if v_source is not null and v_source not in ('CATALOG', 'ORDER', 'ORPHAN_SKU') then
    raise exception 'Nguồn lọc không hợp lệ.' using errcode = '22023';
  end if;
  if v_product_state is not null and v_product_state not in ('active', 'hidden') then
    raise exception 'Trạng thái sản phẩm không hợp lệ.' using errcode = '22023';
  end if;
  if v_pos_state is not null and v_pos_state not in ('visible', 'hidden', 'none') then
    raise exception 'Trạng thái POS không hợp lệ.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'total',
      (select count(*)::int from public.products)
      + (
        select count(*)::int
        from public.pos_skus s
        where s.catalog_product_id is null
          and coalesce(s.is_market_gold, false) = false
      ),
    'hiddenProduct',
      (select count(*)::int from public.products p where coalesce(p.is_active, true) = false),
    'hiddenPos',
      (
        select count(*)::int
        from public.pos_skus s
        where coalesce(s.is_market_gold, false) = false
          and coalesce(s.is_active, true) = false
      ),
    'orphan',
      (
        select count(*)::int
        from public.pos_skus s
        where s.catalog_product_id is null
          and coalesce(s.is_market_gold, false) = false
      )
  )
  into v_summary;

  with linked_sku as (
    select distinct on (s.catalog_product_id)
      s.id,
      s.sku,
      s.catalog_product_id,
      s.brand_id,
      s.weight_chi,
      s.price_row_id,
      s.is_active,
      s.is_order_jewelry,
      s.created_at
    from public.pos_skus s
    where s.catalog_product_id is not null
      and coalesce(s.is_market_gold, false) = false
    order by s.catalog_product_id, s.created_at desc nulls last, s.id
  ),
  stock as (
    select sku_id, quantity, last_cost_dong
    from public.pos_inventory_stock
  ),
  united as (
    select
      ('product:' || p.id) as row_id,
      'PRODUCT'::text as kind,
      case
        when coalesce(ls.is_order_jewelry, false) then 'ORDER'
        else 'CATALOG'
      end as source,
      p.id as product_id,
      ls.id as sku_id,
      ls.sku as sku,
      coalesce(p.name, '') as name,
      p.slug,
      p.brand_id,
      b.name as brand_name,
      p.category_id,
      coalesce(c.name, nullif(p.category, ''), '') as category_name,
      p.product_type_id,
      pt.name as product_type_name,
      p.price_row_id,
      coalesce(p.price_text, '') as price_text,
      p.price_numeric,
      coalesce(p.weight, ls.weight_chi) as weight_chi,
      p.gold_age,
      nullif(p.image, '') as image_url,
      p.sort_order,
      coalesce(p.is_featured, false) as is_featured,
      coalesce(p.is_best_seller, false) as is_best_seller,
      coalesce(p.is_hot, false) as is_hot,
      (coalesce(p.is_active, true)) as product_active,
      case when ls.id is null then null else coalesce(ls.is_active, true) end as sku_active,
      coalesce(st.quantity, 0)::numeric as quantity,
      st.last_cost_dong,
      p.updated_at,
      coalesce(p.created_at, p.updated_at) as created_at,
      coalesce(p.created_at, p.updated_at, timezone('utc', now())) as sort_at
    from public.products p
    left join linked_sku ls on ls.catalog_product_id = p.id
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
    left join public.product_types pt on pt.id = p.product_type_id
    left join stock st on st.sku_id = ls.id

    union all

    select
      ('orphan:' || s.id::text) as row_id,
      'ORPHAN_SKU'::text as kind,
      'ORPHAN_SKU'::text as source,
      null::text as product_id,
      s.id as sku_id,
      s.sku,
      coalesce(s.name, '') as name,
      null::text as slug,
      s.brand_id,
      b.name as brand_name,
      null::uuid as category_id,
      'Khác'::text as category_name,
      null::uuid as product_type_id,
      null::text as product_type_name,
      s.price_row_id,
      ''::text as price_text,
      null::numeric as price_numeric,
      s.weight_chi,
      null::numeric as gold_age,
      null::text as image_url,
      null::integer as sort_order,
      false as is_featured,
      false as is_best_seller,
      false as is_hot,
      null::boolean as product_active,
      coalesce(s.is_active, true) as sku_active,
      coalesce(st.quantity, 0)::numeric as quantity,
      st.last_cost_dong,
      null::timestamptz as updated_at,
      s.created_at,
      coalesce(s.created_at, timezone('utc', now())) as sort_at
    from public.pos_skus s
    left join public.brands b on b.id = s.brand_id
    left join stock st on st.sku_id = s.id
    where s.catalog_product_id is null
      and coalesce(s.is_market_gold, false) = false
  ),
  filtered as (
    select u.*
    from united u
    where
      (p_product_id is null or u.product_id = p_product_id)
      and (p_sku_id is null or u.sku_id = p_sku_id)
      and (
        v_q is null
        or lower(u.name) like '%' || v_q || '%'
        or lower(coalesce(u.sku, '')) like '%' || v_q || '%'
        or lower(coalesce(u.slug, '')) like '%' || v_q || '%'
      )
      and (p_brand_id is null or u.brand_id = p_brand_id)
      and (p_category_id is null or u.category_id = p_category_id)
      and (p_product_type_id is null or u.product_type_id = p_product_type_id)
      and (
        v_source is null
        or u.source = v_source
        or (v_source = 'ORPHAN_SKU' and u.kind = 'ORPHAN_SKU')
      )
      and (
        v_product_state is null
        or (v_product_state = 'active' and coalesce(u.product_active, true) = true)
        or (v_product_state = 'hidden' and u.product_active = false)
      )
      and (
        v_pos_state is null
        or (v_pos_state = 'visible' and u.sku_active = true)
        or (v_pos_state = 'hidden' and u.sku_active = false)
        or (v_pos_state = 'none' and u.sku_active is null)
      )
  ),
  counted as (
    select count(*)::int as total_count from filtered
  ),
  page as (
    select
      f.*,
      c.total_count
    from filtered f
    cross join counted c
    order by f.sort_at desc nulls last, f.row_id desc
    limit v_limit
    offset v_offset
  )
  select
    coalesce((select total_count from counted), 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rowId', p.row_id,
            'kind', p.kind,
            'source', p.source,
            'productId', p.product_id,
            'skuId', p.sku_id,
            'sku', p.sku,
            'name', p.name,
            'slug', p.slug,
            'brandId', p.brand_id,
            'brandName', p.brand_name,
            'categoryId', p.category_id,
            'categoryName', p.category_name,
            'productTypeId', p.product_type_id,
            'productTypeName', p.product_type_name,
            'priceRowId', p.price_row_id,
            'priceText', p.price_text,
            'priceNumeric', p.price_numeric,
            'weightChi', p.weight_chi,
            'goldAge', p.gold_age,
            'imageUrl', p.image_url,
            'sortOrder', p.sort_order,
            'isFeatured', p.is_featured,
            'isBestSeller', p.is_best_seller,
            'isHot', p.is_hot,
            'productActive', p.product_active,
            'skuActive', p.sku_active,
            'quantity', p.quantity,
            'lastCostDong', p.last_cost_dong,
            'updatedAt', p.updated_at,
            'createdAt', p.created_at
          )
          order by p.sort_at desc nulls last, p.row_id desc
        )
        from page p
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object(
    'totalCount', v_total,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'summary', v_summary
  );
end;
$$;

revoke all on function public.pos_list_product_admin(
  text, uuid, uuid, uuid, text, text, text, integer, integer, text, uuid
) from public, anon;

grant execute on function public.pos_list_product_admin(
  text, uuid, uuid, uuid, text, text, text, integer, integer, text, uuid
) to authenticated;

grant execute on function public.pos_list_product_admin(
  text, uuid, uuid, uuid, text, text, text, integer, integer, text, uuid
) to service_role;
