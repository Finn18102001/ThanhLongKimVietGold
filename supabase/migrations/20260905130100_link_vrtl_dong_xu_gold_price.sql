-- Link VRTL Đồng xu * phân → gold row "Đồng Xu Vàng Rồng Thăng Long" (per-chỉ, board_unit=1).
-- Also harden tlkv_sync_pos_sku_from_product with family aliases so wrong matches (e.g. Hạt Gạo) are overwritten.

create or replace function public.tlkv_sync_pos_sku_from_product(p public.products)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku_id uuid;
  v_price_row_id text;
  v_board_unit numeric(12, 4);
  v_sku_code text;
  v_weight numeric;
  v_lookup text;
  v_name_l text;
  v_source_l text;
begin
  if p.id is null or nullif(trim(p.name), '') is null then
    return;
  end if;

  v_name_l := lower(replace(replace(trim(p.name), E'\n', ' '), '  ', ' '));
  v_source_l := lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '));

  -- Family aliases when price_source_product is empty or incomplete.
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
    case
      when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1
      else 1.0
    end
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

  v_weight := coalesce(nullif(p.weight, 0), 1);

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = p.id
  limit 1;

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
      -- Overwrite stale/wrong links when a gold row is resolved (do not keep Hạt Gạo, etc.).
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
$$;

-- Point catalog products at the Đồng Xu board row, then re-sync SKUs.
update public.products
set price_source_product = 'Đồng Xu Vàng Rồng Thăng Long'
where id in (
  'b2093a08-0bc2-4a9d-b95e-42d6c29efe5e', -- VRTL Đồng xu 1 phân
  '0f44e9a9-21da-4c53-8998-3512805ab0e2', -- VRTL Đồng xu 2 phân
  '5e7cec63-b3fc-40b8-8c39-cc6beeba5d1b', -- VRTL Đồng xu 3 phân
  '934ec0fa-ddba-4813-af2b-d05f9f19a09f'  -- VRTL Đồng xu 5 phân
)
or (
  name ~* 'đồng[[:space:]]*xu'
  and name ~* 'vrtl'
  and coalesce(nullif(trim(price_source_product), ''), '') = ''
);

do $$
declare
  r public.products%rowtype;
begin
  for r in
    select p.*
    from public.products p
    where p.id in (
      'b2093a08-0bc2-4a9d-b95e-42d6c29efe5e',
      '0f44e9a9-21da-4c53-8998-3512805ab0e2',
      '5e7cec63-b3fc-40b8-8c39-cc6beeba5d1b',
      '934ec0fa-ddba-4813-af2b-d05f9f19a09f'
    )
       or (
         p.name ~* 'đồng[[:space:]]*xu'
         and p.name ~* 'vrtl'
       )
  loop
    perform public.tlkv_sync_pos_sku_from_product(r);
  end loop;
end;
$$;
