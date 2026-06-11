-- ============================================================================
-- TLKV Product Catalog — Foundation schema (Steps 1–4)
-- Paste into Supabase → SQL Editor → RUN (idempotent).
--
-- Adds: brands, categories, product_images, product flags/FKs on products.
-- Does NOT touch tv-model / gold price tables.
--
-- Replace admin email below if different from rls-admin-email.sql.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "unaccent";

-- Reuse slugify from news-schema if present; create if missing.
create or replace function public.tlkv_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
           regexp_replace(
             lower(public.unaccent(coalesce(input, ''))),
             '[^a-z0-9]+', '-', 'g'
           )
         );
$$;

create or replace function public.tlkv_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 1 — brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text not null unique,
  description  text,
  logo_url     text,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
  before update on public.brands
  for each row execute function public.tlkv_set_updated_at();

create index if not exists idx_brands_active_sort
  on public.brands (is_active, sort_order asc, name asc);

-- ---------------------------------------------------------------------------
-- STEP 2 — categories (flat now; parent_id reserved for hierarchy)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text not null unique,
  parent_id    uuid references public.categories(id) on delete set null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is distinct from id)
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.tlkv_set_updated_at();

create index if not exists idx_categories_active_sort
  on public.categories (is_active, sort_order asc, name asc);

create index if not exists idx_categories_parent
  on public.categories (parent_id)
  where parent_id is not null;

-- ---------------------------------------------------------------------------
-- products — ensure base table exists, then extend (legacy columns kept)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id          text primary key,
  name        text not null default '',
  category    text not null default '',
  price_text  text not null default '',
  image       text not null default '',
  sort_order  int,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.products add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.products add column if not exists slug text;
alter table public.products add column if not exists is_featured boolean not null default false;
alter table public.products add column if not exists is_best_seller boolean not null default false;
alter table public.products add column if not exists is_hot boolean not null default false;
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_products_slug_unique
  on public.products (slug)
  where slug is not null and slug <> '';

create index if not exists idx_products_brand_active_sort
  on public.products (brand_id, is_active, sort_order asc nulls last, name asc);

create index if not exists idx_products_category_active
  on public.products (category_id, is_active);

create index if not exists idx_products_flags_homepage
  on public.products (is_active, is_featured desc, is_best_seller desc, is_hot desc, sort_order asc nulls last)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- STEP 4 — product_images (multi-role; replaces single image column long-term)
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id            uuid primary key default uuid_generate_v4(),
  product_id    text not null references public.products(id) on delete cascade,
  role          text not null default 'gallery'
                  check (role in ('thumbnail', 'main', 'gallery')),
  storage_path  text,
  public_url    text not null,
  alt_text      text,
  sort_order    int not null default 0,
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);

create index if not exists idx_product_images_product_role_sort
  on public.product_images (product_id, role, sort_order asc);

create unique index if not exists idx_product_images_one_thumbnail
  on public.product_images (product_id)
  where role = 'thumbnail';

create unique index if not exists idx_product_images_one_main
  on public.product_images (product_id)
  where role = 'main';

-- ---------------------------------------------------------------------------
-- Seed reference data (idempotent)
-- ---------------------------------------------------------------------------
insert into public.brands (name, slug, description, sort_order, is_active)
values
  ('Thăng Long Kim Việt', 'thang-long-kim-viet', null, 10, true),
  ('Bảo Tín Minh Châu', 'bao-tin-minh-chau', null, 20, true),
  ('Bảo Tín Mạnh Hải', 'bao-tin-manh-hai', null, 30, true)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;

insert into public.categories (name, slug, sort_order, is_active)
values
  ('Vàng Miếng', 'vang-mieng', 10, true),
  ('Nhẫn Trơn', 'nhan-tron', 20, true),
  ('Trang Sức', 'trang-suc', 30, true),
  ('Bạc', 'bac', 40, true)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;

-- Backfill category_id from legacy text column (best-effort slug match)
update public.products p
set category_id = c.id
from public.categories c
where p.category_id is null
  and p.category is not null
  and trim(p.category) <> ''
  and public.tlkv_slugify(p.category) = c.slug;

-- Default brand for orphan products
update public.products p
set brand_id = b.id
from public.brands b
where p.brand_id is null
  and b.slug = 'thang-long-kim-viet';

-- Migrate legacy single image → thumbnail row (once per product)
insert into public.product_images (product_id, role, public_url, sort_order, alt_text)
select p.id, 'thumbnail', trim(p.image), 0, p.name
from public.products p
where trim(coalesce(p.image, '')) <> ''
  and not exists (
    select 1 from public.product_images pi
    where pi.product_id = p.id and pi.role = 'thumbnail'
  );

-- ---------------------------------------------------------------------------
-- RLS (mirror products + news patterns)
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.product_images enable row level security;

drop policy if exists "Public read brands" on public.brands;
create policy "Public read brands"
  on public.brands for select to public
  using (is_active = true);

drop policy if exists "Admin write brands" on public.brands;
create policy "Admin write brands"
  on public.brands for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories"
  on public.categories for select to public
  using (is_active = true);

drop policy if exists "Admin write categories" on public.categories;
create policy "Admin write categories"
  on public.categories for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Public read product_images" on public.product_images;
create policy "Public read product_images"
  on public.product_images for select to public
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_images.product_id and pr.is_active = true
    )
  );

drop policy if exists "Admin write product_images" on public.product_images;
create policy "Admin write product_images"
  on public.product_images for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- products: extend public read to active-only when is_active column exists
drop policy if exists "Public read products" on public.products;
create policy "Public read products"
  on public.products for select to public
  using (coalesce(is_active, true) = true);

-- Realtime (optional): enable in Dashboard → Database → Replication for brands/products

-- ============================================================================
-- DONE. Next: run supabase/products-storage.sql for the product-media bucket.
-- ============================================================================
