-- ============================================================================
-- 99 ROLLBACK — hoàn tác 02_migration.sql
-- Chỉ xóa các đối tượng do 02 tạo. Không chạm cột, dòng, trigger hay function cũ.
--
-- TRƯỚC KHI CHẠY:
--   1. Gỡ (revert) code Admin đang dùng product_types / brand_categories /
--      product_type_id, nếu không trang Admin sẽ lỗi khi đọc các đối tượng đã xóa.
--   2. Chạy riêng câu SELECT dưới đây để biết dữ liệu nào sẽ mất. Mọi dữ liệu đã
--      nhập vào 2 bảng mới và cột product_type_id sẽ bị xóa cùng đối tượng.
--
--   select (select count(*) from public.product_types)                          as product_types,
--          (select count(*) from public.brand_categories)                       as brand_categories,
--          (select count(*) from public.products where product_type_id is not null) as products_co_product_type;
--
-- DROP COLUMN không chạy trigger đồng bộ SKU và không đổi giá trị các cột khác.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop index if exists public.categories_name_norm_key;
drop index if exists public.brands_name_norm_key;

drop index if exists public.idx_products_product_type;
alter table public.products drop column if exists product_type_id;

-- Xóa bảng kéo theo policy, trigger, index và FK của chính bảng đó.
drop table if exists public.brand_categories;
drop table if exists public.product_types;

commit;

notify pgrst, 'reload schema';
