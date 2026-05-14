-- ============================================================
-- CHẠY NGUYÊN FILE NÀY trong Supabase → SQL Editor.
-- Xoá TOÀN BỘ policy cũ trên 3 bảng rồi tạo lại sạch sẽ.
-- Sửa email admin nếu khác tuananh18101@gmail.com
--
-- Project mới / sau đổi mặc định Supabase: chạy trước hoặc sau file
-- supabase/data-api-grants.sql (GRANT anon|authenticated|service_role).
-- ============================================================

-- ─── BƯỚC 0: Bật RLS (nếu chưa) ────────────────────────────
alter table public.gold_meta enable row level security;
alter table public.gold_price_rows enable row level security;
alter table public.products enable row level security;

-- ─── BƯỚC 1: Xóa HẾT policy cũ ─────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('gold_meta', 'gold_price_rows', 'products')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ─── BƯỚC 2: Public đọc (SELECT) — ai cũng xem được ────────
create policy "public_select_gold_meta"
  on public.gold_meta for select
  to public using (true);

create policy "public_select_gold_price_rows"
  on public.gold_price_rows for select
  to public using (true);

create policy "public_select_products"
  on public.products for select
  to public using (true);

-- ─── BƯỚC 3: Admin ghi (INSERT / UPDATE / DELETE) ───────────
-- gold_meta
create policy "admin_write_gold_meta"
  on public.gold_meta for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_update_gold_meta"
  on public.gold_meta for update
  to authenticated
  using  ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_delete_gold_meta"
  on public.gold_meta for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- gold_price_rows
create policy "admin_write_gold_price_rows"
  on public.gold_price_rows for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_update_gold_price_rows"
  on public.gold_price_rows for update
  to authenticated
  using  ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_delete_gold_price_rows"
  on public.gold_price_rows for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- products
create policy "admin_write_products"
  on public.products for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_update_products"
  on public.products for update
  to authenticated
  using  ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

create policy "admin_delete_products"
  on public.products for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- ─── BƯỚC 4: Kiểm tra — kết quả phải có 12 policy ──────────
select tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('gold_meta', 'gold_price_rows', 'products')
order by tablename, policyname;
