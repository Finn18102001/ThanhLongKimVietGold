-- RLS: cho phép ghi (INSERT/UPDATE/DELETE) khi JWT có email khớp admin.
-- Thay 'tuananh18101@gmail.com' bằng email đúng với policy "Admin full meta" của bạn.
--
-- Nếu gặp ERROR 42710 "policy ... already exists": KHÔNG chạy riêng CREATE — luôn có
-- "drop policy if exists ..." ngay phía trên (hoặc dùng file products-fix-select.sql).

-- ─── gold_meta (đọc công khai cho dòng meta trên trang chủ) ──────────────────
drop policy if exists "Public read gold_meta" on public.gold_meta;

create policy "Public read gold_meta"
on public.gold_meta
for select
to public
using (true);

-- ─── gold_price_rows ─────────────────────────────────────────────────────────
-- Tương tự products: cần SELECT công khai nếu trang chủ đọc bằng anon key.
drop policy if exists "Public read gold_price_rows" on public.gold_price_rows;

create policy "Public read gold_price_rows"
on public.gold_price_rows
for select
to public
using (true);

drop policy if exists "Admin full gold_price_rows" on public.gold_price_rows;

create policy "Admin full gold_price_rows"
on public.gold_price_rows
for all
to public
using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- ─── products ────────────────────────────────────────────────────────────────
-- QUAN TRỌNG: policy "Admin full products" (FOR ALL + check email) KHÔNG cho phép
-- anon / JWT không khớp email đọc được dòng → API trả [] dù Table Editor vẫn thấy data.
-- Policy SELECT riêng (chỉ đọc) để trang /san-pham + bảng admin hiển thị danh sách.
drop policy if exists "Public read products" on public.products;

create policy "Public read products"
on public.products
for select
to public
using (true);

-- Ghi: tách INSERT/UPDATE/DELETE (không FOR ALL) để SELECT luôn do "Public read products" đảm nhận.
drop policy if exists "Admin full products" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;

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

-- gold_meta: nếu policy "Admin full meta" của bạn thiếu WITH CHECK, nên bổ sung:
-- alter policy "Admin full meta" on public.gold_meta ... ;
-- Hoặc tạo policy mới có cả using + with check giống trên.
