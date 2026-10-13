-- Định lượng sản phẩm: tối đa 5 chữ số thập phân (0.234, 0.54321).
-- numeric(5,1) chỉ giữ 1 số lẻ và làm giá liên kết ×/÷ lệch.
-- Trigger đồng bộ POS phụ thuộc cột weight nên phải gỡ trước khi đổi kiểu.

drop trigger if exists trg_products_sync_pos_sku on public.products;

alter table public.products
  alter column weight type numeric(9, 5);

comment on column public.products.weight is
  'Khối lượng vàng (chỉ), tối đa 5 chữ số thập phân. Giá hiển thị = giá dòng × (weight / mệnh giá dòng), tính trên client.';

create trigger trg_products_sync_pos_sku
  after insert or update of name, weight, price_source_product, brand_id, is_active
  on public.products
  for each row
  execute function public.tlkv_products_sync_pos_sku();

-- SKU POS nhận weight từ sản phẩm. numeric(12,4) sẽ cắt chữ số thứ 5.
alter table public.pos_skus
  alter column weight_chi type numeric(13, 5),
  alter column board_unit_chi type numeric(13, 5);

-- Mệnh giá dòng: đúng một mức "N chỉ" thì giá dòng là giá của mức đó; còn lại giá/chỉ.
create or replace function public.tlkv_board_unit_chi(p_product text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(p_product, ''));
  n int;
  m text[];
  parsed numeric;
begin
  if v = '' or position(',' in v) > 0 then
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
$$;

create or replace function public.tlkv_sync_pos_sku_from_product(p products)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sku_id uuid;
  v_price_row_id text;
  v_board_unit numeric;
  v_sku_code text;
  v_weight numeric;
  v_lookup text;
  v_name_l text;
  v_source_l text;
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
$$;
