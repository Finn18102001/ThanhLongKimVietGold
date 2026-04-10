-- Chạy NGUYÊN KHỐI này trong Supabase → SQL Editor (Primary, role postgres).
-- Sửa email ở cuối file nếu khác tuananh18101@gmail.com

-- 1) Xem policy hiện tại (kết quả: cột roles phải có {public} cho đọc công khai)
select policyname, permissive, roles, cmd, qual::text as using_expr
from pg_policies
where schemaname = 'public' and tablename = 'products'
order by policyname;

-- 2) Xóa policy đọc cũ (tránh lỗi "already exists"), tạo lại đúng: SELECT cho TO public
drop policy if exists "Public read products" on public.products;

create policy "Public read products"
on public.products
for select
to public
using (true);

-- 3) Ghi dữ liệu: tách riêng INSERT/UPDATE/DELETE (không dùng FOR ALL — tránh nhầm với SELECT)
drop policy if exists "Admin full products" on public.products;

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
