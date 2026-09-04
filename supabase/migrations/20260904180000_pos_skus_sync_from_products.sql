-- Keep POS/inventory/purchase catalog in sync with website products.
-- Idempotent backfill + trigger: insert/update on products upserts pos_skus + stock row.

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
begin
  if p.id is null or nullif(trim(p.name), '') is null then
    return;
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
      lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '))
        like '%' || lower(trim(g.product)) || '%'
      or lower(p.name) like '%' || lower(trim(g.product)) || '%'
    )
  order by length(trim(g.product)) desc
  limit 1;

  v_sku_code := 'TK-' || upper(substr(replace(p.id, '-', ''), 1, 10));

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = p.id
  limit 1;

  if v_sku_id is null then
    insert into public.pos_skus (
      sku, name, catalog_product_id, price_row_id, weight_chi, board_unit_chi,
      labor_fee_dong, brand_id, is_active
    ) values (
      v_sku_code,
      p.name,
      p.id,
      v_price_row_id,
      coalesce(nullif(p.weight, 0), 1),
      coalesce(v_board_unit, 1),
      0,
      p.brand_id,
      coalesce(p.is_active, true)
    )
    returning id into v_sku_id;
  else
    update public.pos_skus s
    set
      name = p.name,
      price_row_id = coalesce(v_price_row_id, s.price_row_id),
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi),
      board_unit_chi = coalesce(v_board_unit, s.board_unit_chi),
      brand_id = coalesce(p.brand_id, s.brand_id),
      is_active = coalesce(p.is_active, true)
    where s.id = v_sku_id;
  end if;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict (sku_id) do nothing;
end;
$$;

create or replace function public.tlkv_products_sync_pos_sku()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tlkv_sync_pos_sku_from_product(new);
  return new;
end;
$$;

drop trigger if exists trg_products_sync_pos_sku on public.products;
create trigger trg_products_sync_pos_sku
  after insert or update of name, weight, price_source_product, brand_id, is_active
  on public.products
  for each row
  execute function public.tlkv_products_sync_pos_sku();

-- Backfill any products still missing a POS SKU (safe to re-run).
do $$
declare
  r public.products%rowtype;
begin
  for r in
    select p.*
    from public.products p
    where coalesce(p.is_active, true)
      and not exists (
        select 1 from public.pos_skus s where s.catalog_product_id = p.id
      )
  loop
    perform public.tlkv_sync_pos_sku_from_product(r);
  end loop;
end;
$$;
