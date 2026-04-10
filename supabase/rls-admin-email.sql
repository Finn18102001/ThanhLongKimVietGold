-- RLS: cho phép ghi (INSERT/UPDATE/DELETE) khi JWT có email khớp admin.
-- Thay 'tuananh18101@gmail.com' bằng email đúng với policy "Admin full meta" của bạn.
-- Chạy từng khối trong Supabase → SQL Editor (nếu policy trùng tên thì DROP trước).

-- ─── gold_price_rows (lỗi thường gặp: chỉ có policy trên gold_meta) ─────────
drop policy if exists "Admin full gold_price_rows" on public.gold_price_rows;

create policy "Admin full gold_price_rows"
on public.gold_price_rows
for all
to public
using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- ─── products ────────────────────────────────────────────────────────────────
drop policy if exists "Admin full products" on public.products;

create policy "Admin full products"
on public.products
for all
to public
using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- gold_meta: nếu policy "Admin full meta" của bạn thiếu WITH CHECK, nên bổ sung:
-- alter policy "Admin full meta" on public.gold_meta ... ;
-- Hoặc tạo policy mới có cả using + with check giống trên.
