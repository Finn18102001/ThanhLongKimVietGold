-- Homepage featured products: brand + is_featured + newest first
-- Run after products-catalog-schema.sql and products-catalog-step8-12.sql

create index if not exists idx_products_home_featured
  on public.products (brand_id, created_at desc nulls last)
  where is_active = true and is_featured = true;

create index if not exists idx_products_brand_featured_sort
  on public.products (brand_id, is_featured, sort_order asc nulls last)
  where is_active = true;
