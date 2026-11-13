-- =============================================================================
-- P6 U1 — DRAFT VERIFY — chạy SAU migration schema (Bước 3), trước backfill/mint-limit
-- Doc: docs/pos-big-update/P6-01-UNIT-MSP-U1.md
-- =============================================================================

-- A) Cấu trúc
select to_regclass('public.pos_inventory_units') as units_table;
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'pos_label_pieces' and column_name = 'unit_id';

-- B) GRANT / RLS
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pos_inventory_units'
order by grantee, privilege_type;

select relrowsecurity
from pg_class
where oid = 'public.pos_inventory_units'::regclass;

-- C) Bảo vệ MSP cũ: mọi piece hiện tại phải unit_id IS NULL ngay sau schema-only
select count(*) as pieces_total,
       count(*) filter (where unit_id is not null) as pieces_with_unit_should_be_0
from public.pos_label_pieces;

-- D) Snapshot so khớp 56 SKU vượt tồn (pieces > stock) — so với backup trước migrate
with over as (
  select s.id as sku_id, s.sku,
         coalesce(st.quantity, 0) as stock,
         (select count(*) from public.pos_label_pieces p where p.sku_id = s.id) as pieces
  from public.pos_skus s
  left join public.pos_inventory_stock st on st.sku_id = s.id
)
select count(*) as skus_pieces_gt_stock_expect_56
from over
where pieces > stock;

-- E) Chưa có Unit backfill ở Bước 3
select count(*) as units_rows_expect_0_after_schema_only
from public.pos_inventory_units;

-- F) md5 / count pieces không đổi so với backup (điền tên bảng snapshot khi Bước 3 chạy)
-- select
--   (select count(*) from public.pos_label_pieces) as live_pieces,
--   (select count(*) from tlkv_backup_20261110.pos_label_pieces__p6_u1) as bak_pieces;

-- G) BF-B preview: SKU duoc / khong duoc backfill (read-only)
with stock as (
  select s.id as sku_id, s.sku, coalesce(st.quantity,0) as q,
         (select count(*) from public.pos_label_pieces p where p.sku_id = s.id) as pieces
  from public.pos_skus s
  left join public.pos_inventory_stock st on st.sku_id = s.id
)
select
  count(*) filter (where q > 0 and pieces = 0) as skus_bf_b_eligible,
  coalesce(sum(q) filter (where q > 0 and pieces = 0),0) as units_bf_b_would_create,
  count(*) filter (where q > 0 and pieces > 0) as skus_with_stock_and_msp_skip_backfill,
  count(*) filter (where pieces > q) as skus_pieces_gt_stock_untouched
from stock;

-- H) Sau backfill BF-B (Bước 5): khong Unit STOCK_BACKFILL tren SKU da co piece
-- select count(*) as should_be_0
-- from public.pos_inventory_units u
-- where u.origin = 'STOCK_BACKFILL'
--   and exists (select 1 from public.pos_label_pieces p where p.sku_id = u.sku_id);
