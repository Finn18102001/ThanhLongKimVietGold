-- Tách đúng nghiệp vụ Vàng Rồng Thăng Long (2 dòng giá, 2 giá/chỉ khác nhau):
--   A) Vàng Rồng Thăng Long 0.5, 1, 2, 3 chỉ  → SP weight 0.5, 1, 2, 3
--   B) Vàng Rồng Thăng Long 5, 10 chỉ         → SP weight 5, 10
-- Chạy trên Supabase SQL Editor. Điều chỉnh sell/buy nếu cần.

-- 1) Sửa dòng cũ gom nhầm 5 chỉ vào nhóm 0.5–3
update public.gold_price_rows
set product = 'Vàng Rồng Thăng Long 0.5, 1, 2, 3 chỉ'
where product = 'Vàng Rồng Thăng Long 0.5, 1, 2, 3, 5 chỉ';

-- 2) Đổi dòng "10 chỉ" riêng lẻ → nhóm 5, 10 chỉ (giữ id/sort_order/giá hiện có)
update public.gold_price_rows
set product = 'Vàng Rồng Thăng Long 5, 10 chỉ'
where product = 'Vàng Rồng Thăng Long 10 chỉ';

-- 3) Nếu chưa có dòng 5,10 — thêm mới (bỏ comment nếu bước 2 không chạm dòng nào)
-- insert into public.gold_price_rows (id, brand, product, purity, buy, sell, sort_order, metal)
-- values (
--   'r-vang-rong-5-10',
--   'BẢO TÍN MINH CHÂU',
--   'Vàng Rồng Thăng Long 5, 10 chỉ',
--   '999,9',
--   13350000,
--   13750000,
--   11,
--   'gold'
-- );

-- Kiểm tra
select id, product, buy, sell, sort_order
from public.gold_price_rows
where product ilike '%rồng%thăng long%'
order by sort_order;
