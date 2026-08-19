-- Phase 1 POS/inventory tables.
-- Does not alter website catalog tables (products, gold_price_rows, ...).

create schema if not exists pos_private;
revoke all on schema pos_private from public;

create sequence if not exists public.pos_invoice_seq;
create sequence if not exists public.pos_sale_seq;
create sequence if not exists public.pos_purchase_seq;

create table if not exists public.pos_skus (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  catalog_product_id text references public.products(id) on delete set null,
  price_row_id text references public.gold_price_rows(id) on delete restrict,
  weight_chi numeric(12, 4) not null default 1,
  board_unit_chi numeric(12, 4) not null default 1,
  labor_fee_dong bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pos_skus_weight_positive check (weight_chi > 0),
  constraint pos_skus_board_unit_positive check (board_unit_chi > 0),
  constraint pos_skus_labor_nonneg check (labor_fee_dong >= 0)
);

create table if not exists public.pos_inventory_stock (
  sku_id uuid primary key references public.pos_skus(id) on delete restrict,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint pos_inventory_stock_qty_nonneg check (quantity >= 0)
);

create table if not exists public.pos_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  type text not null,
  quantity integer not null,
  before_quantity integer not null,
  after_quantity integer not null,
  reason text not null,
  reference_type text not null,
  reference_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint pos_inventory_tx_type_check check (
    type in (
      'PURCHASE_RECEIVED',
      'SALE',
      'CUSTOMER_RETURN',
      'SUPPLIER_RETURN',
      'STOCK_ADJUSTMENT_IN',
      'STOCK_ADJUSTMENT_OUT'
    )
  ),
  constraint pos_inventory_tx_qty_nonzero check (quantity <> 0)
);

create table if not exists public.pos_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  address text,
  tax_code text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_customers_name_check check (length(trim(name)) > 0),
  constraint pos_customers_phone_check check (length(trim(phone)) > 0)
);

create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  customer_id uuid not null references public.pos_customers(id) on delete restrict,
  status text not null,
  payment_method text not null,
  total_dong bigint not null,
  idempotency_key text not null unique,
  actor_email text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pos_sales_status_check check (status in ('COMPLETED', 'FAILED')),
  constraint pos_sales_payment_check check (payment_method in ('CASH', 'TRANSFER', 'CARD')),
  constraint pos_sales_total_nonneg check (total_dong >= 0)
);

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales(id) on delete restrict,
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  quantity integer not null,
  unit_price_dong bigint not null,
  total_price_dong bigint not null,
  gold_sell_dong bigint not null,
  weight_chi numeric(12, 4) not null,
  board_unit_chi numeric(12, 4) not null,
  labor_fee_dong bigint not null,
  price_row_id text not null,
  constraint pos_sale_items_qty_positive check (quantity > 0),
  constraint pos_sale_items_money_nonneg check (
    unit_price_dong >= 0 and total_price_dong >= 0 and gold_sell_dong >= 0
  )
);

create table if not exists public.pos_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  sale_id uuid not null unique references public.pos_sales(id) on delete restrict,
  customer_id uuid not null references public.pos_customers(id) on delete restrict,
  status text not null,
  total_dong bigint not null,
  issued_at timestamptz not null default now(),
  actor_email text not null,
  constraint pos_invoices_status_check check (status in ('ISSUED')),
  constraint pos_invoices_total_nonneg check (total_dong >= 0)
);

create table if not exists public.pos_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  status text not null,
  supplier_name text not null,
  reason text not null,
  idempotency_key text not null unique,
  actor_email text not null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pos_purchase_status_check check (status in ('RECEIVED')),
  constraint pos_purchase_supplier_check check (length(trim(supplier_name)) > 0)
);

create table if not exists public.pos_purchase_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.pos_purchase_receipts(id) on delete restrict,
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  expected_qty integer not null,
  received_qty integer not null,
  constraint pos_purchase_items_expected_nonneg check (expected_qty >= 0),
  constraint pos_purchase_items_received_positive check (received_qty > 0)
);

create table if not exists public.pos_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  quantity integer not null,
  reason text not null,
  idempotency_key text not null unique,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint pos_adjustments_qty_nonzero check (quantity <> 0),
  constraint pos_adjustments_reason_check check (length(trim(reason)) > 0)
);

create table if not exists public.pos_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_idempotency_keys (
  key text primary key,
  operation text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pos_inventory_tx_sku_created_idx
  on public.pos_inventory_transactions (sku_id, created_at desc);
create index if not exists pos_sales_completed_at_idx
  on public.pos_sales (completed_at desc);
create index if not exists pos_sale_items_sku_idx
  on public.pos_sale_items (sku_id);
create index if not exists pos_invoices_issued_at_idx
  on public.pos_invoices (issued_at desc);
create index if not exists pos_customers_phone_idx
  on public.pos_customers (phone);

alter table public.pos_skus enable row level security;
alter table public.pos_inventory_stock enable row level security;
alter table public.pos_inventory_transactions enable row level security;
alter table public.pos_customers enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.pos_invoices enable row level security;
alter table public.pos_purchase_receipts enable row level security;
alter table public.pos_purchase_items enable row level security;
alter table public.pos_stock_adjustments enable row level security;
alter table public.pos_audit_log enable row level security;
alter table public.pos_idempotency_keys enable row level security;

-- Do not FORCE RLS: SECURITY DEFINER RPCs run as owner and must write ledger rows.

create policy pos_skus_admin_select on public.pos_skus
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_stock_admin_select on public.pos_inventory_stock
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_tx_admin_select on public.pos_inventory_transactions
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_customers_admin_select on public.pos_customers
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_sales_admin_select on public.pos_sales
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_sale_items_admin_select on public.pos_sale_items
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_invoices_admin_select on public.pos_invoices
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_purchase_admin_select on public.pos_purchase_receipts
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_purchase_items_admin_select on public.pos_purchase_items
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_adjust_admin_select on public.pos_stock_adjustments
  for select to authenticated using (public.tlkv_is_admin());
create policy pos_audit_admin_select on public.pos_audit_log
  for select to authenticated using (public.tlkv_is_admin());

revoke all on public.pos_skus from anon, authenticated;
revoke all on public.pos_inventory_stock from anon, authenticated;
revoke all on public.pos_inventory_transactions from anon, authenticated;
revoke all on public.pos_customers from anon, authenticated;
revoke all on public.pos_sales from anon, authenticated;
revoke all on public.pos_sale_items from anon, authenticated;
revoke all on public.pos_invoices from anon, authenticated;
revoke all on public.pos_purchase_receipts from anon, authenticated;
revoke all on public.pos_purchase_items from anon, authenticated;
revoke all on public.pos_stock_adjustments from anon, authenticated;
revoke all on public.pos_audit_log from anon, authenticated;
revoke all on public.pos_idempotency_keys from anon, authenticated;

grant select on public.pos_skus to authenticated;
grant select on public.pos_inventory_stock to authenticated;
grant select on public.pos_inventory_transactions to authenticated;
grant select on public.pos_customers to authenticated;
grant select on public.pos_sales to authenticated;
grant select on public.pos_sale_items to authenticated;
grant select on public.pos_invoices to authenticated;
grant select on public.pos_purchase_receipts to authenticated;
grant select on public.pos_purchase_items to authenticated;
grant select on public.pos_stock_adjustments to authenticated;
grant select on public.pos_audit_log to authenticated;
