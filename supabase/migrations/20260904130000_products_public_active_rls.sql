-- Website (anon): only products with Hiển thị (is_active = true).
-- /admin (authenticated): SELECT all products — no is_active filter for CRUD.

drop policy if exists "Public read products" on public.products;
drop policy if exists "Admin read all products" on public.products;
drop policy if exists "Authenticated read all products" on public.products;

create policy "Public read products"
  on public.products
  for select
  to anon
  using (coalesce(is_active, true) = true);

create policy "Authenticated read all products"
  on public.products
  for select
  to authenticated
  using (true);
