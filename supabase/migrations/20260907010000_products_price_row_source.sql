-- products: explicit gold_price_rows link + computed price_source
-- LINKED_PRICE wins whenever a row is linked (price_row_id or legacy price_source_product).
-- MANUAL only when there is no link and price_text is non-empty.

alter table public.products
  add column if not exists price_row_id text references public.gold_price_rows(id) on delete set null;

comment on column public.products.price_row_id is
  'FK gold_price_rows.id. When set, official selling price comes only from that row. Manual price_text is stored but not used.';

create index if not exists idx_products_price_row_id
  on public.products (price_row_id)
  where price_row_id is not null;

update public.products p
set price_row_id = s.gid
from (
  select distinct on (p2.id)
    p2.id as pid,
    g.id as gid
  from public.products p2
  join public.gold_price_rows g
    on lower(btrim(g.product)) = lower(btrim(p2.price_source_product))
   and nullif(btrim(g.product), '') is not null
  left join public.brands b on b.id = p2.brand_id
  where p2.price_row_id is null
    and nullif(btrim(coalesce(p2.price_source_product, '')), '') is not null
  order by p2.id,
    case when b.id is not null and lower(btrim(b.name)) = lower(btrim(g.brand)) then 0 else 1 end,
    g.sort_order
) s
where p.id = s.pid;

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Kim Gia Bảo'
  and (
    lower(btrim(coalesce(p.price_source_product, ''))) like 'kim gia bảo%'
    or lower(btrim(coalesce(p.price_source_product, ''))) like '%bông sen vàng%'
  );

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Nhẫn Tròn Kim Việt'
  and lower(btrim(coalesce(p.price_source_product, ''))) like 'nhẫn tròn kim việt%';

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Bông Lúa Vàng 0.1 chỉ'
  and lower(btrim(coalesce(p.price_source_product, ''))) like 'bông lúa vàng%';

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Hạt Gạo Vàng 0.1 chỉ'
  and lower(btrim(coalesce(p.price_source_product, ''))) like 'hạt gạo vàng%';

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Nhẫn Vàng Rồng Thăng Long'
  and lower(btrim(coalesce(p.price_source_product, ''))) like '%vàng rồng thăng long%'
  and lower(btrim(coalesce(p.price_source_product, ''))) not like '%đồng xu%';

update public.products p
set price_row_id = g.id
from public.gold_price_rows g
where p.price_row_id is null
  and g.product = 'Đồng Xu Vàng Rồng Thăng Long'
  and lower(btrim(coalesce(p.price_source_product, ''))) like '%đồng xu%';

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_source'
  ) then
    alter table public.products
      add column price_source text generated always as (
        case
          when price_row_id is not null then 'LINKED_PRICE'
          when nullif(btrim(coalesce(price_source_product, '')), '') is not null then 'LINKED_PRICE'
          when nullif(btrim(price_text), '') is not null then 'MANUAL'
          else null
        end
      ) stored;
  end if;
end $$;

comment on column public.products.price_source is
  'Computed official price origin: LINKED_PRICE (gold_price_rows) then MANUAL (price_text) then null. Never mix sources.';
