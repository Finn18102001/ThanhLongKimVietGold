-- ============================================================================
-- 02 MIGRATION — Product Type, quan hệ Brand–Category, chặn trùng tên
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run (một lần).
--
-- Chỉ TẠO đối tượng mới:
--   - bảng public.product_types
--   - bảng public.brand_categories (rỗng; mapping là bước dữ liệu riêng, làm sau)
--   - cột public.products.product_type_id (nullable, không default)
--   - unique index chặn trùng tên cho brands, categories, product_types
--   - RLS, policy, quyền truy cập cho 2 bảng mới
-- Không có INSERT / UPDATE / DELETE / TRUNCATE trên dữ liệu nào.
-- Không đổi trigger, function, cột cũ. ADD COLUMN không chạy trigger đồng bộ SKU.
-- Chạy trong một transaction: lỗi ở bất kỳ bước nào thì toàn bộ được hoàn tác.
-- Hoàn tác sau khi đã chạy xong: 99_rollback.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 0. Điều kiện dừng: tên trùng hoặc đối tượng đã tồn tại -------------------
do $$
begin
  if exists (
    select 1 from public.brands
    group by lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC))
    having count(*) > 1
  ) then
    raise exception 'DUNG: co ten Brand trung theo quy tac chuan hoa. Chay 01_preflight_readonly.sql de xem.';
  end if;

  if exists (
    select 1 from public.categories
    group by lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC))
    having count(*) > 1
  ) then
    raise exception 'DUNG: co ten Category trung theo quy tac chuan hoa. Chay 01_preflight_readonly.sql de xem.';
  end if;

  if to_regclass('public.product_types') is not null
     or to_regclass('public.brand_categories') is not null
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'products' and column_name = 'product_type_id'
     ) then
    raise exception 'DUNG: doi tuong cua migration nay da ton tai. Khong chay lai.';
  end if;
end $$;

-- 1. Product Type (danh sách dùng chung, không thuộc Brand/Category) --------
create table public.product_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_types_slug_key unique (slug),
  constraint product_types_name_not_blank check (btrim(name) <> '')
);

create unique index product_types_name_norm_key
  on public.product_types (lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)));

create index idx_product_types_active_sort
  on public.product_types (is_active, sort_order, name);

create trigger trg_product_types_updated_at
  before update on public.product_types
  for each row execute function public.tlkv_set_updated_at();

comment on table public.product_types is
  'Loai hinh san pham dung chung toan he thong. Khong tham gia tinh gia, tao SKU, ton kho.';

-- 2. Quan hệ Brand–Category (nhiều–nhiều) -----------------------------------
create table public.brand_categories (
  brand_id     uuid not null references public.brands(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint brand_categories_pkey primary key (brand_id, category_id)
);

create index brand_categories_category_idx
  on public.brand_categories (category_id);

comment on table public.brand_categories is
  'Category duoc phep chon cho tung Brand. Chi dung de loc lua chon trong Admin; khong thay doi products.';

-- 3. products.product_type_id (không bắt buộc) ------------------------------
alter table public.products
  add column product_type_id uuid references public.product_types(id) on delete restrict;

create index idx_products_product_type
  on public.products (product_type_id)
  where product_type_id is not null;

comment on column public.products.product_type_id is
  'Loai hinh san pham (khong bat buoc). Khong nam trong cac cot kich hoat trg_products_sync_pos_sku.';

-- 4. Chặn trùng tên Brand / Category ở database ----------------------------
create unique index brands_name_norm_key
  on public.brands (lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)));

create unique index categories_name_norm_key
  on public.categories (lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)));

-- 5. RLS, policy, quyền cho 2 bảng mới (theo mẫu bảng brands) ---------------
alter table public.product_types enable row level security;
alter table public.brand_categories enable row level security;

create policy "Public read product_types"
  on public.product_types for select to public
  using (is_active = true);

create policy "Admin write product_types"
  on public.product_types for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

create policy "Public read brand_categories"
  on public.brand_categories for select to public
  using (true);

create policy "Admin write brand_categories"
  on public.brand_categories for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

grant select on public.product_types, public.brand_categories to anon;
grant select, insert, update, delete on public.product_types, public.brand_categories to authenticated;
grant all on public.product_types, public.brand_categories to service_role;

commit;

-- Làm mới schema cache của API (PostgREST) để nhận bảng/cột mới.
notify pgrst, 'reload schema';
