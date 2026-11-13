-- ============================================================================
-- 01 PREFLIGHT (CHỈ ĐỌC) — chạy ngay trước 02_migration.sql
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- Không có câu lệnh ghi. Kết quả là một bảng: so cột ket_qua với mong_doi.
-- Nếu mục 1 hoặc 2 khác 0: DỪNG, không chạy 02, gửi kết quả để xử lý.
-- Lưu lại các dòng checksum (mục 13-16) để so với 03_verify_readonly.sql.
-- ============================================================================
with
nb as (
  select lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)) as nk
  from public.brands
),
nc as (
  select lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)) as nk
  from public.categories
)
select '01. Ten Brand trung (chuan hoa)' as kiem_tra,
       (select count(*) from (select nk from nb group by nk having count(*) > 1) d)::text as ket_qua,
       '0' as mong_doi
union all
select '02. Ten Category trung (chuan hoa)',
       (select count(*) from (select nk from nc group by nk having count(*) > 1) d)::text,
       '0'
union all
select '03. Bang product_types',
       case when to_regclass('public.product_types') is null then 'chua co' else 'DA TON TAI' end,
       'chua co'
union all
select '04. Bang brand_categories',
       case when to_regclass('public.brand_categories') is null then 'chua co' else 'DA TON TAI' end,
       'chua co'
union all
select '05. Cot products.product_type_id',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'products' and column_name = 'product_type_id'
       ) then 'DA TON TAI' else 'chua co' end,
       'chua co'
union all
select '06. Index brands_name_norm_key / categories_name_norm_key',
       case when to_regclass('public.brands_name_norm_key') is null
             and to_regclass('public.categories_name_norm_key') is null
            then 'chua co' else 'DA TON TAI' end,
       'chua co'
union all
select '07. Ham public.tlkv_is_admin()',
       case when to_regprocedure('public.tlkv_is_admin()') is null then 'THIEU' else 'co' end,
       'co'
union all
select '08. Ham public.tlkv_set_updated_at()',
       case when to_regprocedure('public.tlkv_set_updated_at()') is null then 'THIEU' else 'co' end,
       'co'
union all
select '09. So dong brands', (select count(*) from public.brands)::text, 'ghi lai'
union all
select '10. So dong categories', (select count(*) from public.categories)::text, 'ghi lai'
union all
select '11. So dong products', (select count(*) from public.products)::text, 'ghi lai'
union all
select '12. So dong pos_skus', (select count(*) from public.pos_skus)::text, 'ghi lai'
union all
select '13. Checksum brands',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, is_active, sort_order, updated_at), ',' order by id), ''))
        from public.brands),
       'ghi lai, so voi 03'
union all
select '14. Checksum categories',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, is_active, sort_order, updated_at), ',' order by id), ''))
        from public.categories),
       'ghi lai, so voi 03'
union all
select '15. Checksum products',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, brand_id, category_id, category,
                                                 price_row_id, price_source_product, price_text, weight,
                                                 is_active, is_featured, is_best_seller, is_hot, gold_age,
                                                 image, updated_at), ',' order by id), ''))
        from public.products),
       'ghi lai, so voi 03'
union all
select '16. Checksum pos_skus (id, sku, price_row_id, brand_id, catalog_product_id)',
       (select md5(coalesce(string_agg(concat_ws('|', id, sku, price_row_id, brand_id, catalog_product_id), ',' order by id), ''))
        from public.pos_skus),
       'ghi lai, so voi 03'
union all
select '17. Trigger dong bo SKU',
       (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_products_sync_pos_sku'),
       'AFTER INSERT OR UPDATE OF name, weight, price_source_product, brand_id, is_active';
