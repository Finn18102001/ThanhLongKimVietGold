-- Step 8–12: price_numeric + timestamps (run after products-catalog-schema.sql)
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();
alter table public.products add column if not exists price_numeric numeric(14, 0);

create index if not exists idx_products_price_numeric
  on public.products (price_numeric asc nulls last)
  where is_active = true and price_numeric is not null;

-- Backfill from price_text (digits only)
update public.products
set price_numeric = nullif(regexp_replace(coalesce(price_text, ''), '[^0-9]', '', 'g'), '')::numeric
where price_numeric is null
  and trim(coalesce(price_text, '')) <> ''
  and regexp_replace(price_text, '[^0-9]', '', 'g') ~ '^[0-9]+$';
