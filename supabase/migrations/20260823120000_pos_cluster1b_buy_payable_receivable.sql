-- Cluster 1b: Customer BUY (≠ supplier PN), payable/receivable entities,
-- price exception ±300k/chỉ, overdue mark, staff sales report helpers.
-- Spec: TLKV_AI_IMPLEMENTATION_SPEC §2–16, §35, §39.

-- ---------------------------------------------------------------------------
-- Sequences / constants
-- ---------------------------------------------------------------------------
create sequence if not exists public.pos_buy_seq;
create sequence if not exists public.pos_buy_doc_seq;

-- ---------------------------------------------------------------------------
-- BUY (mua từ khách) — tách biệt pos_purchase_receipts (nhập NCC)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_buys (
  id uuid primary key default gen_random_uuid(),
  buy_no text not null unique,
  customer_id uuid not null references public.pos_customers (id) on delete restrict,
  status text not null default 'COMPLETED',
  payment_method text not null,
  total_dong bigint not null,
  paid_dong bigint not null default 0,
  remaining_dong bigint not null default 0,
  payment_status text not null default 'PAID',
  due_date date,
  note text,
  idempotency_key text not null unique,
  actor_email text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pos_buys_status_check check (status in ('COMPLETED', 'FAILED')),
  constraint pos_buys_payment_method_check check (payment_method in ('CASH', 'TRANSFER', 'CARD')),
  constraint pos_buys_payment_status_check check (
    payment_status in ('PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERDUE')
  ),
  constraint pos_buys_total_nonneg check (total_dong >= 0),
  constraint pos_buys_paid_nonneg check (paid_dong >= 0),
  constraint pos_buys_remaining_nonneg check (remaining_dong >= 0),
  constraint pos_buys_paid_lte_total check (paid_dong <= total_dong),
  constraint pos_buys_remaining_eq check (remaining_dong = total_dong - paid_dong)
);

create table if not exists public.pos_buy_items (
  id uuid primary key default gen_random_uuid(),
  buy_id uuid not null references public.pos_buys (id) on delete restrict,
  sku_id uuid references public.pos_skus (id) on delete restrict,
  product_name_snapshot text not null,
  gold_type text,
  gold_age text,
  quantity integer not null,
  weight_chi numeric(12, 4) not null,
  unit_price_dong bigint not null,
  total_price_dong bigint not null,
  reference_price_dong_per_chi bigint,
  price_row_id text,
  is_market_gold boolean not null default false,
  price_exception boolean not null default false,
  difference_per_chi bigint,
  constraint pos_buy_items_qty_pos check (quantity > 0),
  constraint pos_buy_items_weight_pos check (weight_chi > 0),
  constraint pos_buy_items_unit_nonneg check (unit_price_dong >= 0),
  constraint pos_buy_items_total_nonneg check (total_price_dong >= 0),
  constraint pos_buy_items_sku_or_market check (
    (is_market_gold = true and sku_id is not null)
    or (is_market_gold = false and sku_id is not null)
  )
);

create table if not exists public.pos_buy_payments (
  id uuid primary key default gen_random_uuid(),
  buy_id uuid not null references public.pos_buys (id) on delete restrict,
  amount_dong bigint not null,
  payment_method text not null,
  paid_at timestamptz not null default now(),
  actor_email text not null,
  note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint pos_buy_payments_amount_pos check (amount_dong > 0),
  constraint pos_buy_payments_method_check check (payment_method in ('CASH', 'TRANSFER', 'CARD'))
);

create unique index if not exists pos_buy_payments_idempotency_uidx
  on public.pos_buy_payments (idempotency_key)
  where idempotency_key is not null;

create index if not exists pos_buys_customer_id_idx
  on public.pos_buys (customer_id, completed_at desc);

create index if not exists pos_buys_payment_status_idx
  on public.pos_buys (payment_status, due_date);

create index if not exists pos_buy_items_buy_id_idx
  on public.pos_buy_items (buy_id);

create index if not exists pos_buy_payments_buy_id_idx
  on public.pos_buy_payments (buy_id, paid_at);

-- ---------------------------------------------------------------------------
-- Receivable (khách nợ cửa hàng) / Payable (cửa hàng nợ khách)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_receivables (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.pos_customers (id) on delete restrict,
  sale_id uuid not null unique references public.pos_sales (id) on delete restrict,
  total_dong bigint not null,
  paid_dong bigint not null default 0,
  remaining_dong bigint not null,
  due_date date,
  status text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pos_receivables_status_check check (
    status in ('OPEN', 'PARTIAL', 'CLOSED', 'OVERDUE')
  ),
  constraint pos_receivables_remaining_eq check (remaining_dong = total_dong - paid_dong),
  constraint pos_receivables_nonneg check (
    total_dong >= 0 and paid_dong >= 0 and remaining_dong >= 0 and paid_dong <= total_dong
  )
);

create table if not exists public.pos_payables (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.pos_customers (id) on delete restrict,
  buy_id uuid not null unique references public.pos_buys (id) on delete restrict,
  total_dong bigint not null,
  paid_dong bigint not null default 0,
  remaining_dong bigint not null,
  due_date date,
  status text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pos_payables_status_check check (
    status in ('OPEN', 'PARTIAL', 'CLOSED', 'OVERDUE')
  ),
  constraint pos_payables_remaining_eq check (remaining_dong = total_dong - paid_dong),
  constraint pos_payables_nonneg check (
    total_dong >= 0 and paid_dong >= 0 and remaining_dong >= 0 and paid_dong <= total_dong
  )
);

create index if not exists pos_receivables_customer_idx
  on public.pos_receivables (customer_id, status);

create index if not exists pos_payables_customer_idx
  on public.pos_payables (customer_id, status);

create index if not exists pos_receivables_due_idx
  on public.pos_receivables (due_date)
  where status in ('OPEN', 'PARTIAL', 'OVERDUE');

create index if not exists pos_payables_due_idx
  on public.pos_payables (due_date)
  where status in ('OPEN', 'PARTIAL', 'OVERDUE');

-- ---------------------------------------------------------------------------
-- Price exception audit (±300.000đ/chỉ)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_price_exceptions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  transaction_id uuid not null,
  line_id uuid,
  reference_price_dong_per_chi bigint not null,
  actual_price_dong_per_chi bigint not null,
  difference_per_chi bigint not null,
  weight_chi numeric(12, 4) not null,
  reason text,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pos_price_exceptions_type_check check (transaction_type in ('SALE', 'BUY'))
);

create index if not exists pos_price_exceptions_tx_idx
  on public.pos_price_exceptions (transaction_type, transaction_id);

-- Market gold flag on SKU (created on BUY for non-catalog gold)
alter table public.pos_skus
  add column if not exists is_market_gold boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.pos_buys enable row level security;
alter table public.pos_buy_items enable row level security;
alter table public.pos_buy_payments enable row level security;
alter table public.pos_receivables enable row level security;
alter table public.pos_payables enable row level security;
alter table public.pos_price_exceptions enable row level security;

drop policy if exists pos_buys_pos_select on public.pos_buys;
create policy pos_buys_pos_select on public.pos_buys
  for select to authenticated using (true);

drop policy if exists pos_buy_items_pos_select on public.pos_buy_items;
create policy pos_buy_items_pos_select on public.pos_buy_items
  for select to authenticated using (true);

drop policy if exists pos_buy_payments_pos_select on public.pos_buy_payments;
create policy pos_buy_payments_pos_select on public.pos_buy_payments
  for select to authenticated using (true);

drop policy if exists pos_receivables_pos_select on public.pos_receivables;
create policy pos_receivables_pos_select on public.pos_receivables
  for select to authenticated using (true);

drop policy if exists pos_payables_pos_select on public.pos_payables;
create policy pos_payables_pos_select on public.pos_payables
  for select to authenticated using (true);

drop policy if exists pos_price_exceptions_pos_select on public.pos_price_exceptions;
create policy pos_price_exceptions_pos_select on public.pos_price_exceptions
  for select to authenticated using (true);

revoke all on table public.pos_buys from anon;
revoke all on table public.pos_buy_items from anon;
revoke all on table public.pos_buy_payments from anon;
revoke all on table public.pos_receivables from anon;
revoke all on table public.pos_payables from anon;
revoke all on table public.pos_price_exceptions from anon;

grant select on table public.pos_buys to authenticated;
grant select on table public.pos_buy_items to authenticated;
grant select on table public.pos_buy_payments to authenticated;
grant select on table public.pos_receivables to authenticated;
grant select on table public.pos_payables to authenticated;
grant select on table public.pos_price_exceptions to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers: debt status + ±300k check + market SKU ensure
-- ---------------------------------------------------------------------------
create or replace function pos_private.derive_debt_entity_status(
  p_paid_dong bigint,
  p_total_dong bigint,
  p_due_date date
)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_paid_dong >= p_total_dong then
    return 'CLOSED';
  end if;
  if p_due_date is not null and p_due_date < (timezone('Asia/Ho_Chi_Minh', now()))::date then
    return 'OVERDUE';
  end if;
  if p_paid_dong = 0 then
    return 'OPEN';
  end if;
  return 'PARTIAL';
end;
$$;

create or replace function pos_private.assert_price_within_or_exception(
  p_actual_per_chi bigint,
  p_reference_per_chi bigint,
  p_approve boolean,
  p_actor_is_admin boolean,
  p_reason text
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_diff bigint;
  v_limit constant bigint := 300000;
begin
  if p_reference_per_chi is null or p_reference_per_chi < 0 then
    raise exception 'Giá tham chiếu không hợp lệ' using errcode = '22023';
  end if;
  if p_actual_per_chi is null or p_actual_per_chi < 0 then
    raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
  end if;

  v_diff := p_actual_per_chi - p_reference_per_chi;
  if abs(v_diff) <= v_limit then
    return v_diff;
  end if;

  if not coalesce(p_approve, false) then
    raise exception
      'Giá giao dịch vượt ngưỡng ±300.000đ/chỉ (lệch % đ/chỉ). Cần quản trị duyệt ngoại lệ.',
      abs(v_diff)
      using errcode = 'P0001';
  end if;

  if not p_actor_is_admin then
    raise exception
      'Chỉ quản trị mới được duyệt giá vượt ±300.000đ/chỉ'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Phải ghi lý do khi duyệt ngoại lệ giá' using errcode = '22023';
  end if;

  return v_diff;
end;
$$;

create or replace function pos_private.ensure_market_gold_sku(
  p_name text,
  p_gold_type text,
  p_gold_age text,
  p_weight_chi numeric,
  p_price_row_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sku_code text;
  v_id uuid;
  v_name text;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := format(
      'Vàng thị trường %s %s %s chỉ',
      coalesce(nullif(trim(p_gold_type), ''), 'N/A'),
      coalesce(nullif(trim(p_gold_age), ''), ''),
      trim(to_char(p_weight_chi, 'FM999999990.####'))
    );
  end if;

  v_sku_code := 'MG-' || upper(substr(md5(
    coalesce(p_gold_type, '') || '|' || coalesce(p_gold_age, '') || '|' ||
    p_weight_chi::text || '|' || coalesce(p_price_row_id, '') || '|' || v_name
  ), 1, 12));

  select id into v_id from public.pos_skus where sku = v_sku_code;
  if v_id is not null then
    insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
    values (v_id, 0, now())
    on conflict (sku_id) do nothing;
    return v_id;
  end if;

  insert into public.pos_skus (
    sku, name, catalog_product_id, price_row_id,
    weight_chi, board_unit_chi, labor_fee_dong, is_active, is_market_gold
  ) values (
    v_sku_code, v_name, null, nullif(trim(coalesce(p_price_row_id, '')), ''),
    p_weight_chi, 1, 0, true, true
  )
  returning id into v_id;

  insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
  values (v_id, 0, now())
  on conflict (sku_id) do nothing;

  return v_id;
end;
$$;

create or replace function pos_private.upsert_receivable_for_sale(
  p_sale_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.pos_sales%rowtype;
  v_status text;
begin
  select * into v_sale from public.pos_sales where id = p_sale_id;
  if not found then
    return;
  end if;

  if v_sale.remaining_dong <= 0 then
    update public.pos_receivables
    set
      paid_dong = v_sale.paid_dong,
      remaining_dong = 0,
      status = 'CLOSED',
      due_date = v_sale.due_date,
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where sale_id = p_sale_id;
    return;
  end if;

  v_status := pos_private.derive_debt_entity_status(
    v_sale.paid_dong, v_sale.total_dong, v_sale.due_date
  );

  insert into public.pos_receivables (
    customer_id, sale_id, total_dong, paid_dong, remaining_dong,
    due_date, status, opened_at, closed_at, updated_at
  ) values (
    v_sale.customer_id, v_sale.id, v_sale.total_dong, v_sale.paid_dong, v_sale.remaining_dong,
    v_sale.due_date, v_status, now(), null, now()
  )
  on conflict (sale_id) do update set
    paid_dong = excluded.paid_dong,
    remaining_dong = excluded.remaining_dong,
    due_date = excluded.due_date,
    status = excluded.status,
    closed_at = case when excluded.status = 'CLOSED' then coalesce(pos_receivables.closed_at, now()) else null end,
    updated_at = now();
end;
$$;

create or replace function pos_private.upsert_payable_for_buy(
  p_buy_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buy public.pos_buys%rowtype;
  v_status text;
begin
  select * into v_buy from public.pos_buys where id = p_buy_id;
  if not found then
    return;
  end if;

  if v_buy.remaining_dong <= 0 then
    update public.pos_payables
    set
      paid_dong = v_buy.paid_dong,
      remaining_dong = 0,
      status = 'CLOSED',
      due_date = v_buy.due_date,
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where buy_id = p_buy_id;
    return;
  end if;

  v_status := pos_private.derive_debt_entity_status(
    v_buy.paid_dong, v_buy.total_dong, v_buy.due_date
  );

  insert into public.pos_payables (
    customer_id, buy_id, total_dong, paid_dong, remaining_dong,
    due_date, status, opened_at, closed_at, updated_at
  ) values (
    v_buy.customer_id, v_buy.id, v_buy.total_dong, v_buy.paid_dong, v_buy.remaining_dong,
    v_buy.due_date, v_status, now(), null, now()
  )
  on conflict (buy_id) do update set
    paid_dong = excluded.paid_dong,
    remaining_dong = excluded.remaining_dong,
    due_date = excluded.due_date,
    status = excluded.status,
    closed_at = case when excluded.status = 'CLOSED' then coalesce(pos_payables.closed_at, now()) else null end,
    updated_at = now();
end;
$$;
