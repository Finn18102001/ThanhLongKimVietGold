-- =============================================================================
-- P6 U1 — DRAFT ONLY — DO NOT APPLY TO PRODUCTION
-- Doc: docs/pos-big-update/P6-01-UNIT-MSP-U1.md
-- Mục đích: tạo cấu trúc Unit + cột unit_id trên pos_label_pieces.
-- Không backfill tồn, không đổi RPC mint, không đụng 56 SKU MSP.
-- Trước khi chạy (Bước 3): backup tlkv_backup_20261110 theo 00-BACKUP-ROLLBACK §3.
-- =============================================================================

-- 0) Guard: dừng nếu bảng đã tồn tại (tránh chạy nhầm 2 lần)
do $guard$
begin
  if to_regclass('public.pos_inventory_units') is not null then
    raise exception 'DUNG: public.pos_inventory_units da ton tai — draft khong chay lai.';
  end if;
end $guard$;

-- 1) Bảng Unit
create table public.pos_inventory_units (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.pos_skus (id),
  status text not null,
  origin text not null,
  origin_receipt_item_id uuid null references public.pos_purchase_items (id),
  origin_note text null,
  sale_item_id uuid null references public.pos_sale_items (id),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  sold_at timestamptz null,
  -- P6-01 §7.2 / §7.3c: dao nhap Unit da Mint — giu piece.unit_id, Unit void + audit
  voided_at timestamptz null,
  voided_by text null,
  void_reason text null,
  void_receipt_id uuid null references public.pos_purchase_receipts (id),
  -- P6-02: khong dung status RETURNED — hoan kho sau ban = huy HD ban → IN_STOCK
  constraint pos_inventory_units_status_chk
    check (status in ('IN_STOCK', 'SOLD', 'VOIDED_RECEIPT', 'ADJUSTED_OUT')),
  constraint pos_inventory_units_origin_chk
    check (origin in ('RECEIPT', 'STOCK_BACKFILL', 'ADJUST_IN', 'SALE_VOID_RESTORE')),
  constraint pos_inventory_units_void_fields_chk
    check (
      (status <> 'VOIDED_RECEIPT' and voided_at is null)
      or (status = 'VOIDED_RECEIPT' and voided_at is not null and voided_by is not null
          and nullif(trim(void_reason), '') is not null)
    )
);

comment on table public.pos_inventory_units is
  'P6 U1: mot dong = mot don vi vat ly de Mint/xuat. Song song quantity; khong thay ledger.';

create index pos_inventory_units_sku_status_idx
  on public.pos_inventory_units (sku_id, status);

create index pos_inventory_units_receipt_item_idx
  on public.pos_inventory_units (origin_receipt_item_id)
  where origin_receipt_item_id is not null;

create index pos_inventory_units_sale_item_idx
  on public.pos_inventory_units (sale_item_id)
  where sale_item_id is not null;

-- 2) §32.1 Data API GRANT + RLS
grant select, insert, update on public.pos_inventory_units to authenticated;
grant select, insert, update on public.pos_inventory_units to service_role;
-- khong grant anon

alter table public.pos_inventory_units enable row level security;

-- Policy toi thieu (Bước 2 co the siet theo role): staff dang nhap doc/ghi
create policy pos_inventory_units_staff_all
  on public.pos_inventory_units
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- 3) Expand pos_label_pieces: unit_id nullable (MSP cu = null)
alter table public.pos_label_pieces
  add column if not exists unit_id uuid null;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_label_pieces_unit_id_fkey'
  ) then
    alter table public.pos_label_pieces
      add constraint pos_label_pieces_unit_id_fkey
      foreign key (unit_id) references public.pos_inventory_units (id);
  end if;
end $fk$;

create unique index if not exists pos_label_pieces_unit_id_uidx
  on public.pos_label_pieces (unit_id)
  where unit_id is not null;

comment on column public.pos_label_pieces.unit_id is
  'P6 U1: bat buoc voi MSP mint moi. MSP cu giu NULL; khong auto-map.';

-- 4) Feature flag (tuy chon) — chi tao neu bang settings da co; neu khong, bo qua o Bước 2
-- insert into public.pos_app_settings(key, value) values ('u1_mint_requires_unit', 'false')
-- on conflict do nothing;
