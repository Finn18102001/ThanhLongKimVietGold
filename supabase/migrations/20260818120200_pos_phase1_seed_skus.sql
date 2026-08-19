insert into public.pos_skus (
  sku, name, catalog_product_id, price_row_id, weight_chi, board_unit_chi, labor_fee_dong
)
select
  'TK-' || upper(substr(replace(p.id, '-', ''), 1, 10)),
  p.name,
  p.id,
  r.price_row_id,
  coalesce(p.weight, 1),
  coalesce(r.board_unit_chi, 1),
  0
from public.products p
left join lateral (
  select
    g.id as price_row_id,
    case
      when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1
      else 1.0
    end as board_unit_chi
  from public.gold_price_rows g
  where g.sell > 0
    and length(trim(g.product)) > 0
    and (
      lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '))
        like '%' || lower(trim(g.product)) || '%'
      or lower(p.name) like '%' || lower(trim(g.product)) || '%'
    )
  order by length(trim(g.product)) desc
  limit 1
) r on true
where p.is_active
  and not exists (
    select 1 from public.pos_skus s where s.catalog_product_id = p.id
  );

insert into public.pos_inventory_stock (sku_id, quantity)
select s.id, 0
from public.pos_skus s
where not exists (
  select 1 from public.pos_inventory_stock st where st.sku_id = s.id
);
