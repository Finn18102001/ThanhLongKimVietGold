-- Fix board_unit parse when gold_price_rows.product has commas in the name
-- but only ONE weight token (e.g. "Bông Lúa Vàng, Hạt Gạo Vàng 0.1 chỉ").
-- Old rule: any comma ⇒ board_unit=1 → Hạt Gạo/Bông Lúa priced as if row is giá/chỉ.
-- New rule: count weight tokens ("X chỉ"); exactly 1 ⇒ that weight; 0 or >1 ⇒ 1 (giá/chỉ).
-- Also: prefer products.price_row_id when valid; re-link Bông Lúa / Hạt Gạo SKUs to
-- r-1776045679073 and board_unit_chi=0.1.
-- No new tables → no Data API GRANT (§32.1 N/A).

create or replace function public.tlkv_board_unit_chi(p_product text)
returns numeric
language plpgsql
immutable
as $function$
declare
  v text := btrim(coalesce(p_product, ''));
  n int;
  m text[];
  parsed numeric;
begin
  if v = '' then
    return 1;
  end if;

  -- Weight-list boards ("0.5, 1, 2, 3 chỉ"): digit then comma → giá/chỉ (=1).
  -- Name commas without a preceding weight digit stay denominations:
  -- "Bông Lúa Vàng, Hạt Gạo Vàng 0.1 chỉ".
  if v ~* '\d+(?:[.,]\d+)?\s*,' then
    return 1;
  end if;

  select count(*) into n
  from regexp_matches(v, '(\d+(?:[.,]\d+)?)\s*ch[ỉi]', 'gi');
  if n <> 1 then
    return 1;
  end if;

  m := regexp_match(v, '(\d+(?:[.,]\d+)?)\s*ch[ỉi]', 'i');
  if m is null or m[1] is null then
    return 1;
  end if;

  parsed := round(replace(m[1], ',', '.')::numeric, 5);
  if parsed is null or parsed <= 0 then
    return 1;
  end if;
  return parsed;
end;
$function$;

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

  -- Prefer explicit products.price_row_id when it still exists on the board.
  if nullif(trim(coalesce(p.price_row_id, '')), '') is not null then
    select g.id, public.tlkv_board_unit_chi(g.product)
    into v_price_row_id, v_board_unit
    from public.gold_price_rows g
    where g.id = trim(p.price_row_id)
      and g.sell > 0
    limit 1;
  end if;

  if v_price_row_id is null and v_is_bong_lua_hat_gao then
    -- Family lock: never fall through to Nhẫn Tròn / giá-chỉ rows.
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

-- Data repair: Bông Lúa + Hạt Gạo → denomination row + board_unit 0.1
update public.products p
set
  price_row_id = 'r-1776045679073',
  price_source_product = 'Bông Lúa Vàng, Hạt Gạo Vàng 0.1 chỉ'
where (
    p.name ~* 'bông[[:space:]]*lúa[[:space:]]*vàng'
    or p.name ~* 'hạt[[:space:]]*gạo'
  )
  and (
    p.price_row_id is distinct from 'r-1776045679073'
    or coalesce(p.price_source_product, '') is distinct from 'Bông Lúa Vàng, Hạt Gạo Vàng 0.1 chỉ'
  );

update public.pos_skus s
set
  price_row_id = 'r-1776045679073',
  board_unit_chi = 0.1
where coalesce(s.is_market_gold, false) is not true
  and (
    s.sku in ('tlkv-blv-0.1', 'tlkv-blv-0.2', 'tlkv-hgv-0.1', 'tlkv-hgv-0.2')
    or s.name ~* 'bông[[:space:]]*lúa[[:space:]]*vàng'
    or s.name ~* 'hạt[[:space:]]*gạo'
  )
  and (
    s.price_row_id is distinct from 'r-1776045679073'
    or s.board_unit_chi is distinct from 0.1
  );
