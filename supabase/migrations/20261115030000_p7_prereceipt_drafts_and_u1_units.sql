-- P7 Pre-receipt labeling: draft table + U1 units (Hybrid).
-- Doc: docs/pos-big-update/P7-00-PRERECEIPT-LABELING.md
-- Backup: snapshot routines/tables into tlkv_backup_20261110 per 00-BACKUP-ROLLBACK §3.
-- §32.1: explicit GRANT in this migration; no anon.

-- ---------------------------------------------------------------------------
-- 0) Backup snapshots (additive into existing backup schema if present)
-- ---------------------------------------------------------------------------
do $bak$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._routines__p7_prereceipt (
      schema_name text,
      proname text,
      args text,
      definition text,
      saved_at timestamptz default now()
    );
    -- No replace of existing mint RPCs in this migration; marker row only.
    insert into tlkv_backup_20261110._routines__p7_prereceipt (schema_name, proname, args, definition)
    values ('public', '_p7_marker', '', 'P7 drafts+units schema applied');
  end if;
end $bak$;

-- ---------------------------------------------------------------------------
-- 1) U1 units (from P6 draft; apply only if missing)
-- ---------------------------------------------------------------------------
do $guard_units$
begin
  if to_regclass('public.pos_inventory_units') is not null then
    raise notice 'pos_inventory_units already exists — skip create';
  else
    create table public.pos_inventory_units (
      id uuid primary key default gen_random_uuid(),
      sku_id uuid not null references public.pos_skus (id),
      status text not null,
      origin text not null,
      origin_receipt_item_id uuid null references public.pos_purchase_items (id),
      origin_note text null,
      sale_item_id uuid null references public.pos_sale_items (id),
      -- Shared product code (PRE_ASSIGNED); not unique. AUTO MSP uses pos_label_pieces.
      shared_product_code text null,
      created_at timestamptz not null default now(),
      created_by text not null,
      updated_at timestamptz not null default now(),
      sold_at timestamptz null,
      voided_at timestamptz null,
      voided_by text null,
      void_reason text null,
      void_receipt_id uuid null references public.pos_purchase_receipts (id),
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
      'P6/P7 U1: one physical unit. Created on successful receive (Hybrid). Not created at draft print.';

    create index pos_inventory_units_sku_status_idx
      on public.pos_inventory_units (sku_id, status);
    create index pos_inventory_units_receipt_item_idx
      on public.pos_inventory_units (origin_receipt_item_id)
      where origin_receipt_item_id is not null;
    create index pos_inventory_units_shared_code_idx
      on public.pos_inventory_units (shared_product_code)
      where shared_product_code is not null;

    -- §32.1 Data API GRANT
    grant select, insert, update on public.pos_inventory_units to authenticated;
    grant select, insert, update on public.pos_inventory_units to service_role;
    -- no anon

    alter table public.pos_inventory_units enable row level security;

    create policy pos_inventory_units_staff_all
      on public.pos_inventory_units
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;
end $guard_units$;

-- Expand pieces with nullable unit_id (legacy MSP keep null)
alter table public.pos_label_pieces
  add column if not exists unit_id uuid null;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_label_pieces_unit_id_fkey'
  ) then
    alter table public.pos_label_pieces
      add constraint pos_label_pieces_unit_id_fkey
      foreign key (unit_id) references public.pos_inventory_units (id);
  end if;
end $fk$;

create unique index if not exists pos_label_pieces_unit_id_uidx
  on public.pos_label_pieces (unit_id)
  where unit_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Draft table (B)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_label_drafts (
  id uuid primary key default gen_random_uuid(),
  code_mode text not null,
  -- AUTO: type_code + reserved serial/msp. PRE_ASSIGNED: type_code + product_number → printable_code
  type_code text not null default '',
  product_number text null,
  reserved_serial_no text null,
  reserved_msp text null,
  printable_code text not null,
  -- Product snapshot (immutable copy also in snapshot_json)
  product_name text not null,
  brand_text text not null default '',
  category_text text not null default '',
  product_type_text text null,
  price_row_id text null,
  price_note text null,
  cost_price_dong bigint null,
  sell_price_dong bigint null,
  labor_fee_dong bigint null,
  weight_chi numeric(12, 4) null,
  gold_age_text text null,
  stone_weight_chi numeric(12, 4) null,
  stone_quantity integer null,
  stone_unit_price_dong bigint null,
  note text null,
  -- Status machine
  status text not null default 'DRAFT',
  printed_at timestamptz null,
  print_count integer not null default 0,
  received_at timestamptz null,
  receipt_id uuid null references public.pos_purchase_receipts (id),
  receipt_item_id uuid null references public.pos_purchase_items (id),
  unit_id uuid null references public.pos_inventory_units (id),
  piece_id uuid null references public.pos_label_pieces (id),
  sku_id uuid null references public.pos_skus (id),
  -- Immutable original snapshot at create (PRE-24)
  snapshot_json jsonb not null,
  test_marker text null,
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  cancelled_by text null,
  cancel_reason text null,
  constraint pos_label_drafts_code_mode_chk
    check (code_mode in ('AUTO_MSP', 'PRE_ASSIGNED')),
  constraint pos_label_drafts_status_chk
    check (status in ('DRAFT', 'PRINTED', 'RECEIVED', 'CANCELLED')),
  constraint pos_label_drafts_money_chk
    check (
      (cost_price_dong is null or cost_price_dong >= 0)
      and (sell_price_dong is null or sell_price_dong >= 0)
      and (labor_fee_dong is null or labor_fee_dong >= 0)
    )
);

comment on table public.pos_label_drafts is
  'P7: pre-receipt label draft. No stock. Snapshot immutable. Receive qty=1 links Unit/MSP.';

create index if not exists pos_label_drafts_status_printed_idx
  on public.pos_label_drafts (status, printed_at desc);
create index if not exists pos_label_drafts_printable_idx
  on public.pos_label_drafts (printable_code);
create index if not exists pos_label_drafts_test_marker_idx
  on public.pos_label_drafts (test_marker)
  where test_marker is not null;
create unique index if not exists pos_label_drafts_reserved_msp_uidx
  on public.pos_label_drafts (reserved_msp)
  where reserved_msp is not null and status in ('DRAFT', 'PRINTED');

-- §32.1
grant select, insert, update on public.pos_label_drafts to authenticated;
grant select, insert, update on public.pos_label_drafts to service_role;
-- no delete grant for authenticated (cleanup via controlled RPC / service)
grant delete on public.pos_label_drafts to service_role;

alter table public.pos_label_drafts enable row level security;

drop policy if exists pos_label_drafts_staff_all on public.pos_label_drafts;
create policy pos_label_drafts_staff_all
  on public.pos_label_drafts
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Draft print history (in mới / in lại) — separate from pos_label_print_log (piece-based)
create table if not exists public.pos_label_draft_print_log (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.pos_label_drafts (id) on delete restrict,
  printed_at timestamptz not null default now(),
  actor_email text not null,
  action_type text not null,
  print_qty integer not null default 1,
  stock_size text not null default '90x14',
  printable_code text not null,
  payload_json jsonb not null default '{}'::jsonb,
  constraint pos_label_draft_print_log_action_chk
    check (action_type in ('FIRST_PRINT', 'REPRINT')),
  constraint pos_label_draft_print_log_qty_chk
    check (print_qty > 0)
);

grant select, insert on public.pos_label_draft_print_log to authenticated;
grant select, insert, delete on public.pos_label_draft_print_log to service_role;

alter table public.pos_label_draft_print_log enable row level security;

drop policy if exists pos_label_draft_print_log_staff on public.pos_label_draft_print_log;
create policy pos_label_draft_print_log_staff
  on public.pos_label_draft_print_log
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists pos_label_draft_print_log_draft_idx
  on public.pos_label_draft_print_log (draft_id, printed_at desc);
