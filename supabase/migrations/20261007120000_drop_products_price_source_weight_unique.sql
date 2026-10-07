-- Nhiều sản phẩm được liên kết cùng một dòng bảng giá và cùng khối lượng.
-- Unique (price_source_product, weight) chặn thêm sản phẩm dạng link giá.

drop index if exists public.idx_products_price_source_weight_unique;

create index if not exists idx_products_price_source_weight
  on public.products (price_source_product, weight)
  where price_source_product is not null and weight is not null;
