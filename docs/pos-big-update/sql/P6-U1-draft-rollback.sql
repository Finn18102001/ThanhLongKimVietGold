-- =============================================================================
-- P6 U1 — DRAFT ROLLBACK schema-only (Bước 3 thất bại / chưa có data Unit nghiệp vụ)
-- Doc: docs/pos-big-update/P6-01-UNIT-MSP-U1.md
-- CHỈ dùng khi: chua backfill Unit, chua mint gan unit_id, chua doi RPC.
-- Neu da co Unit/MSP moi: KHONG chay file nay — can phuong an rieng.
-- =============================================================================

do $chk$
declare
  v_units bigint;
  v_linked bigint;
begin
  select count(*) into v_units from public.pos_inventory_units;
  select count(*) into v_linked from public.pos_label_pieces where unit_id is not null;
  if v_units > 0 or v_linked > 0 then
    raise exception
      'DUNG rollback schema: units=% linked_pieces=% — co du lieu U1, can ke hoach rieng.',
      v_units, v_linked;
  end if;
end $chk$;

alter table public.pos_label_pieces drop constraint if exists pos_label_pieces_unit_id_fkey;
drop index if exists public.pos_label_pieces_unit_id_uidx;
alter table public.pos_label_pieces drop column if exists unit_id;

drop policy if exists pos_inventory_units_staff_all on public.pos_inventory_units;
drop table if exists public.pos_inventory_units;

-- Khoi phuc RPC tu tlkv_backup_20261110._routines neu da replace (Bước 4) — thu cong theo def backup.
