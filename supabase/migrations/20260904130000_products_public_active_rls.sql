-- Website: only products with Hiển thị (is_active = true).
-- Admin (/admin): tlkv_is_admin() can SELECT all rows including ẩn.

drop policy if exists "Public read products" on public.products;
drop policy if exists "Admin read all products" on public.products;

create policy "Public read products"
  on public.products
  for select
  to public
  using (coalesce(is_active, true) = true);

create policy "Admin read all products"
  on public.products
  for select
  to authenticated
  using (public.tlkv_is_admin());
