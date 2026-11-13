-- ============================================================================
-- 03 VERIFY (CHỈ ĐỌC) — chạy ngay sau 02_migration.sql
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- So cột ket_qua với mong_doi. Các dòng checksum (13-16) phải GIỐNG kết quả
-- của 01_preflight_readonly.sql (chứng minh dữ liệu cũ không đổi).
-- Lưu ý: nếu trong lúc chạy có người sửa sản phẩm ở Admin hoặc POS tạo SKU,
-- checksum 15/16 có thể khác vì thao tác đó, không phải do migration.
-- ============================================================================
select '01. Bang product_types' as kiem_tra,
       case when to_regclass('public.product_types') is null then 'THIEU' else 'co' end as ket_qua,
       'co' as mong_doi
union all
select '02. Bang brand_categories',
       case when to_regclass('public.brand_categories') is null then 'THIEU' else 'co' end, 'co'
union all
select '03. Cot products.product_type_id',
       coalesce((select data_type || ', nullable=' || is_nullable || ', default=' || coalesce(column_default, 'null')
                 from information_schema.columns
                 where table_schema = 'public' and table_name = 'products' and column_name = 'product_type_id'), 'THIEU'),
       'uuid, nullable=YES, default=null'
union all
select '04. So dong product_types', (select count(*) from public.product_types)::text, '0'
union all
select '05. So dong brand_categories', (select count(*) from public.brand_categories)::text, '0'
union all
select '06. San pham co product_type_id', (select count(*) from public.products where product_type_id is not null)::text, '0'
union all
select '07. Unique index ten',
       (select string_agg(indexname, ', ' order by indexname) from pg_indexes
        where schemaname = 'public'
          and indexname in ('brands_name_norm_key', 'categories_name_norm_key', 'product_types_name_norm_key')),
       'brands_name_norm_key, categories_name_norm_key, product_types_name_norm_key'
union all
select '08. RLS bat tren 2 bang moi',
       (select string_agg(relname || '=' || relrowsecurity::text, ', ' order by relname) from pg_class
        where oid in ('public.product_types'::regclass, 'public.brand_categories'::regclass)),
       'brand_categories=true, product_types=true'
union all
select '09. So policy tren 2 bang moi',
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('product_types', 'brand_categories'))::text,
       '4'
union all
select '10. So dong brands', (select count(*) from public.brands)::text, 'bang 01'
union all
select '11. So dong categories', (select count(*) from public.categories)::text, 'bang 01'
union all
select '12. So dong products', (select count(*) from public.products)::text, 'bang 01'
union all
select '13. Checksum brands',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, is_active, sort_order, updated_at), ',' order by id), ''))
        from public.brands),
       'bang 01 muc 13'
union all
select '14. Checksum categories',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, is_active, sort_order, updated_at), ',' order by id), ''))
        from public.categories),
       'bang 01 muc 14'
union all
select '15. Checksum products',
       (select md5(coalesce(string_agg(concat_ws('|', id, name, slug, brand_id, category_id, category,
                                                 price_row_id, price_source_product, price_text, weight,
                                                 is_active, is_featured, is_best_seller, is_hot, gold_age,
                                                 image, updated_at), ',' order by id), ''))
        from public.products),
       'bang 01 muc 15'
union all
select '16. Checksum pos_skus (id, sku, price_row_id, brand_id, catalog_product_id)',
       (select md5(coalesce(string_agg(concat_ws('|', id, sku, price_row_id, brand_id, catalog_product_id), ',' order by id), ''))
        from public.pos_skus),
       'bang 01 muc 16'
union all
select '17. Trigger dong bo SKU khong doi',
       (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_products_sync_pos_sku'),
       'AFTER INSERT OR UPDATE OF name, weight, price_source_product, brand_id, is_active';
