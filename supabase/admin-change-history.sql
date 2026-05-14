-- ============================================================
-- Lịch sử thay đổi admin (giá vàng + sản phẩm)
-- Chạy toàn bộ file trong Supabase → SQL Editor.
--
-- SELECT: công khai (anon + authenticated) — ai cũng đọc được.
-- INSERT: chỉ email admin (đổi email bên dưới nếu khác).
-- Không cho UPDATE/DELETE qua API (chỉ service_role nếu cần dọn dữ liệu).
-- ============================================================

-- ─── Cấu hình email admin (trùng policy các bảng khác) ─────
-- Sửa nếu khác:
--   tuananh18101@gmail.com

-- ─── Bảng 1: CRUD / meta bảng giá vàng ─────────────────────
create table if not exists public.gold_price_change_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  entity_name text not null default '',
  entity_id text,
  summary text,
  payload jsonb
);

create index if not exists gold_price_change_log_created_at_idx
  on public.gold_price_change_log (created_at desc);

comment on table public.gold_price_change_log is 'Lịch sử thao tác admin trên bảng giá vàng (meta + dòng giá).';

-- ─── Bảng 2: CRUD sản phẩm ─────────────────────────────────
create table if not exists public.product_change_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  entity_name text not null default '',
  entity_id text,
  summary text,
  payload jsonb
);

create index if not exists product_change_log_created_at_idx
  on public.product_change_log (created_at desc);

comment on table public.product_change_log is 'Lịch sử thao tác admin trên bảng products.';

-- ─── RLS ───────────────────────────────────────────────────
alter table public.gold_price_change_log enable row level security;
alter table public.product_change_log enable row level security;

drop policy if exists "public_read_gold_price_change_log" on public.gold_price_change_log;
create policy "public_read_gold_price_change_log"
  on public.gold_price_change_log
  for select
  to public
  using (true);

drop policy if exists "admin_insert_gold_price_change_log" on public.gold_price_change_log;
create policy "admin_insert_gold_price_change_log"
  on public.gold_price_change_log
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "public_read_product_change_log" on public.product_change_log;
create policy "public_read_product_change_log"
  on public.product_change_log
  for select
  to public
  using (true);

drop policy if exists "admin_insert_product_change_log" on public.product_change_log;
create policy "admin_insert_product_change_log"
  on public.product_change_log
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- (Tuỳ chọn) hỗ trợ tìm theo tên nhanh hơn khi dữ liệu lớn:
-- create extension if not exists pg_trgm;
-- create index if not exists gold_price_change_log_entity_name_trgm
--   on public.gold_price_change_log using gin (entity_name gin_trgm_ops);
-- create index if not exists product_change_log_entity_name_trgm
--   on public.product_change_log using gin (entity_name gin_trgm_ops);

-- ─── Bổ sung: mô tả cột + index (chạy lại an toàn) ───────────
-- summary: nhiều dòng (xuống dòng), ví dụ "Giá bán: 15.000.000 → 16.000.000".
-- payload row_update: {"before":{...},"after":{...}} — web có thể so sánh buy/sell
--   (parse chuỗi VN) theo entity_id + ngày created_at (Asia/Ho_Chi_Minh) để icon mũi tên xanh/đỏ.
comment on column public.gold_price_change_log.summary is 'Mô tả thay đổi; có thể nhiều dòng (ký tự xuống dòng).';
comment on column public.gold_price_change_log.payload is 'JSON: row_update {before, after}; row_insert {after}; row_delete {before}; meta_update {…}.';

create index if not exists gold_price_change_log_entity_created_idx
  on public.gold_price_change_log (entity_id, created_at desc);

-- ─── Data API: GRANT cho PostgREST (bắt buộc project mới từ 30/05/2026) ───
-- Chi tiết đầy đủ mọi bảng app: supabase/data-api-grants.sql
do $$
begin
  if to_regclass('public.gold_price_change_log') is not null then
    execute 'grant select on public.gold_price_change_log to anon';
    execute 'grant select, insert, update, delete on public.gold_price_change_log to authenticated';
    execute 'grant select, insert, update, delete on public.gold_price_change_log to service_role';
  end if;
  if to_regclass('public.product_change_log') is not null then
    execute 'grant select on public.product_change_log to anon';
    execute 'grant select, insert, update, delete on public.product_change_log to authenticated';
    execute 'grant select, insert, update, delete on public.product_change_log to service_role';
  end if;
end $$;
