-- POS v1.1: BUG-001 payment display integrity + NEW-001..004 schema.
-- Additive only. Does not drop business tables or rewrite historical totals.

-- ---------------------------------------------------------------------------
-- 1) Staff shared POS account (REQ-NEW-003)
-- ---------------------------------------------------------------------------
alter table public.pos_staff
  add column if not exists is_shared boolean not null default false;

comment on column public.pos_staff.is_shared is
  'Shared POS login. Not the operator. Permission remains STAFF.';

-- ---------------------------------------------------------------------------
-- 2) Sale header: type, operator, fulfillment, pickup (REQ-NEW-003/004)
-- ---------------------------------------------------------------------------
alter table public.pos_sales
  add column if not exists transaction_type text not null default 'SALE',
  add column if not exists operator_staff_id uuid references public.pos_staff (id) on delete restrict,
  add column if not exists pickup_due_at timestamptz,
  add column if not exists fulfillment_status text not null default 'DELIVERED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_sales_transaction_type_check'
      and conrelid = 'public.pos_sales'::regclass
  ) then
    alter table public.pos_sales
      add constraint pos_sales_transaction_type_check
      check (transaction_type in ('SALE', 'PREORDER'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_sales_fulfillment_status_check'
      and conrelid = 'public.pos_sales'::regclass
  ) then
    alter table public.pos_sales
      add constraint pos_sales_fulfillment_status_check
      check (fulfillment_status in ('DELIVERED', 'UNFULFILLED', 'READY', 'FULFILLED', 'CANCELLED'));
  end if;
end;
$$;

create index if not exists pos_sales_operator_idx
  on public.pos_sales (operator_staff_id, completed_at desc);

create index if not exists pos_sales_type_fulfill_idx
  on public.pos_sales (transaction_type, fulfillment_status);

comment on column public.pos_sales.transaction_type is
  'SALE = giao ngay. PREORDER = đặt hàng khi hết kho. Independent of payment_status.';
comment on column public.pos_sales.operator_staff_id is
  'Nhân viên bán thực tế. Khác authenticated actor_email khi dùng tài khoản chung.';
comment on column public.pos_sales.pickup_due_at is
  'Hẹn lấy hàng. Independent of due_date (hẹn thanh toán).';
comment on column public.pos_sales.fulfillment_status is
  'DELIVERED for SALE. PREORDER: UNFULFILLED/READY/FULFILLED/CANCELLED.';

update public.pos_sales s
set operator_staff_id = st.id
from public.pos_staff st
where s.operator_staff_id is null
  and st.email = lower(trim(s.actor_email));

-- ---------------------------------------------------------------------------
-- 3) Sale item snapshots + ±300k/chỉ (REQ-NEW-001)
-- ---------------------------------------------------------------------------
alter table public.pos_sale_items
  add column if not exists product_name_snapshot text,
  add column if not exists sku_snapshot text,
  add column if not exists reference_unit_price_dong bigint,
  add column if not exists price_adjustment_per_chi bigint not null default 0;

update public.pos_sale_items si
set
  product_name_snapshot = coalesce(si.product_name_snapshot, sk.name),
  sku_snapshot = coalesce(si.sku_snapshot, sk.sku),
  reference_unit_price_dong = coalesce(si.reference_unit_price_dong, si.unit_price_dong)
from public.pos_skus sk
where sk.id = si.sku_id;

alter table public.pos_sale_items
  alter column product_name_snapshot set default '',
  alter column sku_snapshot set default '';

update public.pos_sale_items
set
  product_name_snapshot = coalesce(product_name_snapshot, ''),
  sku_snapshot = coalesce(sku_snapshot, ''),
  reference_unit_price_dong = coalesce(reference_unit_price_dong, unit_price_dong);

alter table public.pos_sale_items
  alter column product_name_snapshot set not null,
  alter column sku_snapshot set not null,
  alter column reference_unit_price_dong set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_sale_items_adj_finite_check'
      and conrelid = 'public.pos_sale_items'::regclass
  ) then
    alter table public.pos_sale_items
      add constraint pos_sale_items_adj_finite_check
      check (reference_unit_price_dong >= 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Additional receivable charges (REQ-NEW-002)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_sale_charges (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales (id) on delete restrict,
  name text not null,
  amount_dong bigint not null,
  reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint pos_sale_charges_name_check check (length(trim(name)) > 0),
  constraint pos_sale_charges_amount_pos check (amount_dong > 0)
);

create index if not exists pos_sale_charges_sale_idx
  on public.pos_sale_charges (sale_id, created_at);

alter table public.pos_sale_charges enable row level security;

drop policy if exists pos_sale_charges_select on public.pos_sale_charges;
create policy pos_sale_charges_select on public.pos_sale_charges
  for select to authenticated using (true);

revoke all on table public.pos_sale_charges from anon;
grant select on table public.pos_sale_charges to authenticated;

comment on table public.pos_sale_charges is
  'Invoice line charges (hộp, túi, phí). Snapshot. Never a negative discount.';

-- ---------------------------------------------------------------------------
-- 5) Payment received-by staff (REQ-NEW-003, edge 39)
-- ---------------------------------------------------------------------------
alter table public.pos_sale_payments
  add column if not exists received_by_staff_id uuid references public.pos_staff (id) on delete restrict;

update public.pos_sale_payments p
set received_by_staff_id = st.id
from public.pos_staff st
where p.received_by_staff_id is null
  and st.email = lower(trim(p.actor_email));

-- ---------------------------------------------------------------------------
-- 6) Inventory type for preorder fulfill (REQ-NEW-004)
-- ---------------------------------------------------------------------------
alter table public.pos_inventory_transactions
  drop constraint if exists pos_inventory_tx_type_check;

alter table public.pos_inventory_transactions
  add constraint pos_inventory_tx_type_check check (
    type in (
      'PURCHASE_RECEIVED',
      'SALE',
      'CUSTOMER_RETURN',
      'SUPPLIER_RETURN',
      'STOCK_ADJUSTMENT_IN',
      'STOCK_ADJUSTMENT_OUT',
      'PREORDER_FULFILL'
    )
  );

create sequence if not exists public.pos_preorder_seq;

-- ---------------------------------------------------------------------------
-- 7) BUG-001: never auto-mark paid = total on total_dong update
-- The old 7-arg complete_sale only set total_dong; this trigger then
-- wrote paid_dong = total and payment_status = PAID, wiping partial pay.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_pos_sales_fill_payment on public.pos_sales;
drop function if exists pos_private.pos_sales_fill_payment_on_total();
