-- Products RLS: public read + admin write (JWT email).
-- Chạy trong Supabase → SQL Editor.
-- Đổi 'tuananh18101@gmail.com' thành email đăng nhập /admin (Supabase Auth → Users).

alter table public.products enable row level security;

drop policy if exists "Public read products" on public.products;
drop policy if exists "public_select_products" on public.products;
drop policy if exists "Admin full products" on public.products;
drop policy if exists "admin_write_products" on public.products;
drop policy if exists "admin_update_products" on public.products;
drop policy if exists "admin_delete_products" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;

create policy "Public read products"
  on public.products
  for select
  to public
  using (true);

create policy "products_admin_insert"
  on public.products
  for insert
  to public
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "products_admin_update"
  on public.products
  for update
  to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "products_admin_delete"
  on public.products
  for delete
  to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
