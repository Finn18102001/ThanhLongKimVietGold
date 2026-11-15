-- Nhẫn Tròn Kim Việt was linked to BST Vàng Chúc Phúc (wrong family).
-- Board row: r-1775875341548 "Nhẫn Tròn Thăng Long Kim Việt" (giá/chỉ, board_unit=1).
-- Repair products + pos_skus; harden sync family lock (do not keep wrong price_row_id).
-- No new tables → §32.1 N/A.

create or replace function public.tlkv_sync_pos_sku_from_product(p public.products)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sku_id uuid;
  v_price_row_id text;
  v_board_unit numeric;
  v_sku_code text;
  v_weight numeric;
  v_lookup text;
  v_name_l text;
  v_source_l text;
  v_is_bong_lua_hat_gao boolean;
  v_is_nhan_tron boolean;
  v_row_product text;
begin
  if p.id is null or nullif(trim(p.name), '') is null then
    return;
  end if;

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = p.id
  limit 1;

  if v_sku_id is not null and exists (
    select 1 from public.pos_skus s
    where s.id = v_sku_id and s.is_order_jewelry
  ) then
    update public.pos_skus s
    set
      name = p.name,
      brand_id = coalesce(p.brand_id, s.brand_id),
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi)
    where s.id = v_sku_id;
    return;
  end if;

  v_name_l := lower(replace(replace(trim(p.name), E'\n', ' '), '  ', ' '));
  v_source_l := lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '));
  v_is_bong_lua_hat_gao :=
    v_name_l ~ 'bông[[:space:]]*lúa'
    or v_name_l ~ 'hạt[[:space:]]*gạo'
    or v_source_l ~ 'bông[[:space:]]*lúa'
    or v_source_l ~ 'hạt[[:space:]]*gạo';
  v_is_nhan_tron :=
    v_name_l ~ 'nhẫn[[:space:]]*tròn'
    or v_source_l ~ 'nhẫn[[:space:]]*tròn';

  -- Prefer explicit products.price_row_id when it still exists — but only if family matches.
  if nullif(trim(coalesce(p.price_row_id, '')), '') is not null then
    select g.id, public.tlkv_board_unit_chi(g.product), g.product
    into v_price_row_id, v_board_unit, v_row_product
    from public.gold_price_rows g
    where g.id = trim(p.price_row_id)
      and g.sell > 0
    limit 1;

    if v_price_row_id is not null then
      if v_is_bong_lua_hat_gao and lower(coalesce(v_row_product, '')) !~ 'bông[[:space:]]*lúa|hạt[[:space:]]*gạo' then
        v_price_row_id := null;
        v_board_unit := null;
      elsif v_is_nhan_tron and lower(coalesce(v_row_product, '')) !~ 'nhẫn[[:space:]]*tròn' then
        v_price_row_id := null;
        v_board_unit := null;
      end if;
    end if;
  end if;

  if v_price_row_id is null and v_is_bong_lua_hat_gao then
    select g.id, public.tlkv_board_unit_chi(g.product)
    into v_price_row_id, v_board_unit
    from public.gold_price_rows g
    where g.sell > 0
      and length(trim(g.product)) > 0
      and lower(g.product) ~ 'bông[[:space:]]*lúa|hạt[[:space:]]*gạo'
      and lower(g.product) ~ '0[,.]1[[:space:]]*ch[ỉi]'
    order by
      case when g.id = 'r-1776045679073' then 0 else 1 end,
      length(trim(g.product)) desc
    limit 1;
  end if;

  if v_price_row_id is null and v_is_nhan_tron then
    select g.id, public.tlkv_board_unit_chi(g.product)
    into v_price_row_id, v_board_unit
    from public.gold_price_rows g
    where g.sell > 0
      and length(trim(g.product)) > 0
      and lower(g.product) ~ 'nhẫn[[:space:]]*tròn'
    order by
      case when g.id = 'r-1775875341548' then 0 else 1 end,
      case when lower(g.product) ~ 'thăng[[:space:]]*long' then 0 else 1 end,
      length(trim(g.product)) desc
    limit 1;
  end if;

  if v_price_row_id is null then
    v_lookup := nullif(trim(coalesce(p.price_source_product, '')), '');
    if v_lookup is null then
      if v_name_l ~ 'đồng[[:space:]]*xu' and (v_name_l ~ 'vrtl' or v_name_l ~ 'vàng[[:space:]]*rồng') then
        v_lookup := 'Đồng Xu Vàng Rồng Thăng Long';
      elsif v_name_l ~ 'nhẫn[[:space:]]*vàng[[:space:]]*rồng' then
        v_lookup := 'Nhẫn Vàng Rồng Thăng Long';
      end if;
    end if;

    select
      g.id,
      public.tlkv_board_unit_chi(g.product)
    into v_price_row_id, v_board_unit
    from public.gold_price_rows g
    where g.sell > 0
      and length(trim(g.product)) > 0
      and (
        (
          v_lookup is not null
          and (
            lower(trim(g.product)) = lower(trim(v_lookup))
            or lower(trim(v_lookup)) like '%' || lower(trim(g.product)) || '%'
            or lower(trim(g.product)) like '%' || lower(trim(v_lookup)) || '%'
          )
        )
        or (
          v_lookup is null
          and (
            v_source_l like '%' || lower(trim(g.product)) || '%'
            or v_name_l like '%' || lower(trim(g.product)) || '%'
          )
        )
      )
    order by
      case when lower(trim(g.product)) = lower(trim(coalesce(v_lookup, ''))) then 0 else 1 end,
      length(trim(g.product)) desc
    limit 1;
  end if;

  v_weight := coalesce(nullif(p.weight, 0), 1);
  v_sku_code := public.tlkv_build_pos_sku_code(p.name, p.brand_id, v_weight, v_sku_id);

  if v_sku_id is null then
    insert into public.pos_skus (
      sku, name, catalog_product_id, price_row_id, weight_chi, board_unit_chi,
      labor_fee_dong, brand_id, is_active
    ) values (
      v_sku_code,
      p.name,
      p.id,
      v_price_row_id,
      v_weight,
      coalesce(v_board_unit, 1),
      0,
      p.brand_id,
      coalesce(p.is_active, true)
    )
    returning id into v_sku_id;
  else
    update public.pos_skus s
    set
      sku = v_sku_code,
      name = p.name,
      price_row_id = case when v_price_row_id is not null then v_price_row_id else s.price_row_id end,
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi),
      board_unit_chi = case when v_board_unit is not null then v_board_unit else s.board_unit_chi end,
      brand_id = coalesce(p.brand_id, s.brand_id),
      is_active = coalesce(p.is_active, true)
    where s.id = v_sku_id
      and coalesce(s.is_market_gold, false) is not true;
  end if;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict (sku_id) do nothing;
end;
$function$;

-- Snapshot before repair
create table if not exists tlkv_backup_20261110.fix_nhan_tron_price_link_20261115 as
select 'products'::text as src, p.id::text as id, p.name, p.price_row_id, p.price_source_product,
       null::numeric as weight_chi, null::numeric as board_unit_chi, now() as snapped_at
from public.products p
where p.name ~* 'nhẫn[[:space:]]*tròn'
union all
select 'pos_skus', s.id::text, s.name, s.price_row_id, null, s.weight_chi, s.board_unit_chi, now()
from public.pos_skus s
where s.name ~* 'nhẫn[[:space:]]*tròn'
   or s.sku like 'tlkv-nt-%';

update public.products p
set
  price_row_id = 'r-1775875341548',
  price_source_product = 'Nhẫn Tròn Thăng Long Kim Việt'
where p.name ~* 'nhẫn[[:space:]]*tròn'
  and (
    p.price_row_id is distinct from 'r-1775875341548'
    or coalesce(p.price_source_product, '') is distinct from 'Nhẫn Tròn Thăng Long Kim Việt'
  );

update public.pos_skus s
set
  price_row_id = 'r-1775875341548',
  board_unit_chi = 1
where coalesce(s.is_market_gold, false) is not true
  and s.is_active = true
  and (
    s.sku like 'tlkv-nt-%'
    or s.name ~* 'nhẫn[[:space:]]*tròn[[:space:]]*kim[[:space:]]*việt'
  )
  and (
    s.price_row_id is distinct from 'r-1775875341548'
    or s.board_unit_chi is distinct from 1
  );
