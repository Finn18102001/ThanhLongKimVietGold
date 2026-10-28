-- Dòng giá có thể chỉ phục vụ POS và không xuất hiện trên bảng giá website.
-- Mặc định true để mọi dòng hiện có vẫn hiển thị. NULL được backfill trước khi NOT NULL.

alter table public.gold_price_rows
  add column if not exists is_visible_on_website boolean;

update public.gold_price_rows
set is_visible_on_website = true
where is_visible_on_website is null;

alter table public.gold_price_rows
  alter column is_visible_on_website set default true;

alter table public.gold_price_rows
  alter column is_visible_on_website set not null;

comment on column public.gold_price_rows.is_visible_on_website is
  'true: hiện trên bảng giá website. false: không đưa lên bảng giá công khai. Không dùng làm điều kiện lọc của POS.';
