-- =============================================================================
-- TLKV — Admin RLS (một chỗ cấu hình email, dùng cho mọi policy ghi)
-- Chạy TOÀN BỘ file trong Supabase → SQL Editor.
--
-- Bước 1: Sửa danh sách email trong hàm tlkv_admin_emails() (dòng ARRAY[...]).
-- Bước 2: Chạy file → thử lưu sản phẩm lại trên /admin.
--
-- Kiểm tra JWT khi đã đăng nhập /admin:
--   select auth.jwt() ->> 'email' as jwt_email, public.tlkv_is_admin() as is_admin;
-- =============================================================================

create or replace function public.tlkv_admin_emails()
returns text[]
language sql
immutable
as $$
  select array[
    'tuananh18101@gmail.com',
    'thanglongkimviet@gmail.com'
  ]::text[];
$$;

create or replace function public.tlkv_is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(public.tlkv_admin_emails()) as e(email)
    where lower(trim(e.email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ─── products ────────────────────────────────────────────────────────────────
alter table public.products enable row level security;

drop policy if exists "Public read products" on public.products;
drop policy if exists "public_select_products" on public.products;
drop policy if exists "Admin full products" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;
drop policy if exists "admin_write_products" on public.products;
drop policy if exists "admin_update_products" on public.products;
drop policy if exists "admin_delete_products" on public.products;

create policy "Public read products"
  on public.products for select to public
  using (true);

create policy "products_admin_insert"
  on public.products for insert to authenticated
  with check (public.tlkv_is_admin());

create policy "products_admin_update"
  on public.products for update to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

create policy "products_admin_delete"
  on public.products for delete to authenticated
  using (public.tlkv_is_admin());

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- ─── brands / categories / product_images (nếu đã tạo catalog schema) ───────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'brands') then
    execute 'alter table public.brands enable row level security';
    execute 'drop policy if exists "Admin write brands" on public.brands';
    execute 'create policy "Admin write brands" on public.brands for all to authenticated using (public.tlkv_is_admin()) with check (public.tlkv_is_admin())';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'categories') then
    execute 'alter table public.categories enable row level security';
    execute 'drop policy if exists "Admin write categories" on public.categories';
    execute 'create policy "Admin write categories" on public.categories for all to authenticated using (public.tlkv_is_admin()) with check (public.tlkv_is_admin())';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'product_images') then
    execute 'alter table public.product_images enable row level security';
    execute 'drop policy if exists "Admin write product_images" on public.product_images';
    execute 'create policy "Admin write product_images" on public.product_images for all to authenticated using (public.tlkv_is_admin()) with check (public.tlkv_is_admin())';
  end if;
end $$;

-- ─── product_change_log (audit) ──────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'product_change_log') then
    execute 'drop policy if exists "admin_insert_product_change_log" on public.product_change_log';
    execute 'create policy "admin_insert_product_change_log" on public.product_change_log for insert to authenticated with check (public.tlkv_is_admin())';
  end if;
end $$;
