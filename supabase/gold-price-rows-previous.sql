-- Giá trước khi đổi: dùng so sánh mũi tên trên web/TV (current - previous_*).
-- Chạy trên Supabase SQL Editor (hoặc migration) sau khi backup.

alter table public.gold_price_rows add column if not exists previous_buy bigint;
alter table public.gold_price_rows add column if not exists previous_sell bigint;
alter table public.gold_price_rows add column if not exists previous_updated_at timestamptz;

comment on column public.gold_price_rows.previous_buy is 'Giá mua (đơn vị DB) ngay trước lần đổi buy gần nhất.';
comment on column public.gold_price_rows.previous_sell is 'Giá bán (đơn vị DB) ngay trước lần đổi sell gần nhất.';
comment on column public.gold_price_rows.previous_updated_at is 'Thời điểm cập nhật previous_buy / previous_sell.';
