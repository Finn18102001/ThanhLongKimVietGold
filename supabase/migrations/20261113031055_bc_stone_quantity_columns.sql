-- Big Change — đá có SỐ LƯỢNG + ĐƠN GIÁ (docs/pos-big-update/P4-04-BIG-CHANGE-BASELINE.md, BC-1..BC-16, BC-24..BC-27)
-- Thành tiền đá = đơn giá đá × số lượng đá. Trọng lượng đá chỉ để ghi nhận, không tham gia tính tiền.
--
-- Additive (expand): chỉ thêm cột + function mới, không drop, không đổi tên, không tính lại dòng cũ.
--   * stone_price_dong giữ nguyên nghĩa "thành tiền đá của 1 chiếc sản phẩm"
--     → mọi đẳng thức đang chạy (tổng dòng mua, tổng dòng bán, giá vốn, báo cáo) không đổi.
--   * Dòng cũ: stone_quantity = 0, stone_unit_price_dong = 0, stone_price_dong giữ nguyên (tiền đá nhập tay).
--   * Chữ ký các RPC cũ giữ nguyên; client cũ (chưa gửi số lượng / đơn giá đá) vẫn chạy được.
-- Bảng có sẵn, grant mức bảng → cột mới tự được expose (SYSTEM_DEVELOPMENT_RULES §32.1). Không tạo bảng public mới.
-- Rollback: xem cuối file.
-- Phần 1 / 4: backup + cột + check. Phần 2..4: bc_stone_quantity_buy, _sale, _stone_edit.

-- 0. Backup (00-BACKUP-ROLLBACK.md §3). Schema backup không expose Data API.
create table if not exists tlkv_backup_20261110.pos_buy_items__bc as table public.pos_buy_items;
create table if not exists tlkv_backup_20261110.pos_skus__bc as table public.pos_skus;
create table if not exists tlkv_backup_20261110.pos_sale_items__bc as table public.pos_sale_items;
create table if not exists tlkv_backup_20261110._routines__bc as
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition, now() as saved_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'pos_private' and p.proname in ('create_buy_intake', 'complete_sale'))
   or (n.nspname = 'public' and p.proname in (
         'pos_get_buy', 'pos_set_buy_melt_weights', 'pos_set_sku_sale_components'));

alter table tlkv_backup_20261110.pos_buy_items__bc enable row level security;
alter table tlkv_backup_20261110.pos_skus__bc enable row level security;
alter table tlkv_backup_20261110.pos_sale_items__bc enable row level security;
alter table tlkv_backup_20261110._routines__bc enable row level security;

-- 1. Cột số lượng đá + đơn giá đá
alter table public.pos_buy_items
  add column if not exists stone_quantity integer not null default 0,
  add column if not exists stone_unit_price_dong bigint not null default 0;

alter table public.pos_buy_items drop constraint if exists pos_buy_items_stone_qty_chk;
alter table public.pos_buy_items
  add constraint pos_buy_items_stone_qty_chk check (
    stone_quantity >= 0 and stone_unit_price_dong >= 0
    and (stone_price_dong = stone_unit_price_dong * stone_quantity
         or (stone_quantity = 0 and stone_unit_price_dong = 0))
  );

comment on column public.pos_buy_items.stone_weight_chi is 'Trọng lượng đá của 1 chiếc sản phẩm (chỉ). Chỉ ghi nhận / hiển thị, không tham gia tính tiền.';
comment on column public.pos_buy_items.stone_quantity is 'Số lượng đá (viên) của 1 chiếc sản phẩm. 0 = không có đá hoặc dòng cũ nhập tiền đá bằng tay.';
comment on column public.pos_buy_items.stone_unit_price_dong is 'Đơn giá đá / 1 viên (VND) lúc mua.';
comment on column public.pos_buy_items.stone_price_dong is 'Thành tiền đá của 1 chiếc sản phẩm (VND) = stone_unit_price_dong × stone_quantity. total_price_dong = gold_amount_dong + stone_price_dong × quantity.';

alter table public.pos_skus
  add column if not exists stone_quantity integer not null default 0,
  add column if not exists stone_unit_price_dong bigint not null default 0;

alter table public.pos_skus drop constraint if exists pos_skus_stone_qty_chk;
alter table public.pos_skus
  add constraint pos_skus_stone_qty_chk check (
    stone_quantity >= 0 and stone_unit_price_dong >= 0
    and (stone_price_dong = stone_unit_price_dong * stone_quantity
         or (stone_quantity = 0 and stone_unit_price_dong = 0))
  );

comment on column public.pos_skus.stone_weight_chi is 'Trọng lượng đá của 1 chiếc (chỉ). weight_chi = TL vàng. Không tham gia tính tiền.';
comment on column public.pos_skus.stone_quantity is 'Số lượng đá (viên) mặc định của 1 chiếc khi bán.';
comment on column public.pos_skus.stone_unit_price_dong is 'Đơn giá đá / 1 viên (VND) mặc định khi bán.';
comment on column public.pos_skus.stone_price_dong is 'Thành tiền đá mặc định của 1 chiếc khi bán (VND) = stone_unit_price_dong × stone_quantity.';

alter table public.pos_sale_items
  add column if not exists stone_quantity integer not null default 0,
  add column if not exists stone_unit_price_dong bigint not null default 0;

alter table public.pos_sale_items drop constraint if exists pos_sale_items_stone_qty_chk;
alter table public.pos_sale_items
  add constraint pos_sale_items_stone_qty_chk check (
    stone_quantity >= 0 and stone_unit_price_dong >= 0
    and (stone_price_dong = stone_unit_price_dong * stone_quantity
         or (stone_quantity = 0 and stone_unit_price_dong = 0))
  );

comment on column public.pos_sale_items.stone_weight_chi is 'Trọng lượng đá của 1 chiếc (snapshot SKU). Không tham gia tính tiền.';
comment on column public.pos_sale_items.stone_quantity is 'Số lượng đá (viên) của 1 chiếc thực tế khi bán.';
comment on column public.pos_sale_items.stone_unit_price_dong is 'Đơn giá đá / 1 viên (VND) thực tế khi bán.';
comment on column public.pos_sale_items.stone_price_dong is 'Thành tiền đá của 1 chiếc thực tế khi bán (VND) = stone_unit_price_dong × stone_quantity.';
comment on column public.pos_sale_items.stone_price_default_dong is 'Thành tiền đá mặc định của 1 chiếc theo SKU lúc bán (VND).';
