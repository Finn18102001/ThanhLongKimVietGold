-- =============================================================================
-- P6 U1 — DRAFT BACKFILL BF-B — DO NOT APPLY TO PRODUCTION
-- Doc: docs/pos-big-update/P6-01-UNIT-MSP-U1.md §4
--
-- Quy tac:
--   Chi SKU co quantity > 0 VA chua tung co bat ky pos_label_pieces nao
--   → tao dung Q Unit origin=STOCK_BACKFILL, status=IN_STOCK
--   SKU da co >=1 MSP: BO QUA (khong tao Unit tu ton cu)
--   Khong gan unit_id cho bat ky MSP nao
--   Khong UPDATE/DELETE pos_label_pieces
--
-- Chay sau: schema U1 da apply + verify A–F dat; truoc: bat mint-limit.
-- =============================================================================

-- Preview (read-only) — so SKU se backfill
/*
with candidates as (
  select s.id as sku_id, s.sku, coalesce(st.quantity, 0) as q
  from public.pos_skus s
  left join public.pos_inventory_stock st on st.sku_id = s.id
  where coalesce(st.quantity, 0) > 0
    and not exists (
      select 1 from public.pos_label_pieces p where p.sku_id = s.id
    )
)
select count(*) as skus_to_backfill, coalesce(sum(q),0) as units_to_create from candidates;
*/

-- Guard: khong chay neu chua co bang Unit
do $guard$
begin
  if to_regclass('public.pos_inventory_units') is null then
    raise exception 'DUNG: chua co pos_inventory_units — chay schema truoc.';
  end if;
end $guard$;

-- Snapshot counts truoc backfill (doi soat)
-- select count(*) from public.pos_inventory_units;
-- select count(*) from public.pos_label_pieces where unit_id is not null; -- expect 0

/*
-- === LENH BACKFILL (comment — chi mo khi Bước 5 duoc duyet) ===
with candidates as (
  select s.id as sku_id, coalesce(st.quantity, 0)::int as q
  from public.pos_skus s
  left join public.pos_inventory_stock st on st.sku_id = s.id
  where coalesce(st.quantity, 0) > 0
    and not exists (select 1 from public.pos_label_pieces p where p.sku_id = s.id)
),
expanded as (
  select c.sku_id, g.n
  from candidates c
  cross join lateral generate_series(1, c.q) as g(n)
)
insert into public.pos_inventory_units (
  sku_id, status, origin, origin_note, created_by
)
select
  e.sku_id,
  'IN_STOCK',
  'STOCK_BACKFILL',
  'P6 U1 BF-B backfill ton chua co MSP',
  'system:p6-u1-bf-b'
from expanded e;

-- Verify sau backfill:
-- 1) pieces.unit_id van toan NULL
-- 2) count(pieces) khong doi
-- 3) moi SKU co piece: 0 unit STOCK_BACKFILL
-- 4) moi SKU khong piece + q>0: count(units IN_STOCK) = q
*/
