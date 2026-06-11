-- products: weight + price_source_product (derived pricing map)
-- Run after products-catalog-schema.sql and products-catalog-step8-12.sql

alter table public.products add column if not exists weight numeric(5, 1);
alter table public.products add column if not exists price_source_product text;

comment on column public.products.weight is
  'Khối lượng vàng (chỉ) của từng sản phẩm. Giá hiển thị = gold_price_rows.sell/buy × weight (tính trên client).';

comment on column public.products.price_source_product is
  'Khớp nguyên văn gold_price_rows.product — dòng giá nguồn. Không lưu giá tính toán vào DB.';

create index if not exists idx_products_price_source_product
  on public.products (price_source_product)
  where price_source_product is not null and trim(price_source_product) <> '';

create unique index if not exists idx_products_price_source_weight_unique
  on public.products (price_source_product, weight)
  where price_source_product is not null and weight is not null;
