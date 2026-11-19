-- P10 Module 3a: Quỹ vàng nhân viên — tài khoản + tồn custody theo SKU + sổ + Admin phân bổ + chuyển vàng.
-- Không đụng pos_inventory_stock (trừ kho khi bán = giai đoạn POS sau). Kiểm kê chỉ ghi nhận, không chỉnh số dư.

do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._p10_m3_employee_gold_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._p10_m3_employee_gold_note (note)
    values ('20261119022000_p10_employee_gold_fund')
    on conflict do nothing;
  end if;
end $$;

create sequence if not exists public.pos_employee_gold_account_code_seq;
create sequence if not exists public.pos_employee_gold_transfer_code_seq;
create sequence if not exists public.pos_employee_gold_count_code_seq;

create table if not exists public.pos_employee_gold_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  kind text not null check (kind in ('STAFF', 'ADMIN_POOL')),
  staff_id uuid null references public.pos_staff (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text null,
  constraint pos_employee_gold_accounts_code_nonempty check (char_length(trim(code)) > 0),
  constraint pos_employee_gold_accounts_name_nonempty check (char_length(trim(name)) > 0),
  constraint pos_employee_gold_accounts_staff_kind check (
    (kind = 'STAFF' and staff_id is not null)
    or (kind = 'ADMIN_POOL' and staff_id is null)
  )
);

create unique index if not exists pos_employee_gold_accounts_code_uidx
  on public.pos_employee_gold_accounts (code);
create unique index if not exists pos_employee_gold_accounts_staff_uidx
  on public.pos_employee_gold_accounts (staff_id)
  where kind = 'STAFF' and staff_id is not null;
create unique index if not exists pos_employee_gold_accounts_admin_pool_uidx
  on public.pos_employee_gold_accounts (kind)
  where kind = 'ADMIN_POOL';

create table if not exists public.pos_employee_gold_stock (
  account_id uuid not null references public.pos_employee_gold_accounts (id) on delete restrict,
  sku_id uuid not null references public.pos_skus (id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, sku_id)
);

create index if not exists pos_employee_gold_stock_sku_idx
  on public.pos_employee_gold_stock (sku_id);

create table if not exists public.pos_employee_gold_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.pos_employee_gold_accounts (id) on delete restrict,
  sku_id uuid not null references public.pos_skus (id) on delete restrict,
  txn_type text not null check (txn_type in (
    'ADMIN_CAPITAL_IN',
    'ADMIN_CAPITAL_OUT',
    'ADMIN_ALLOCATE',
    'TRANSFER',
    'SALE_OUT',
    'BUY_IN',
    'VOID_REVERSAL'
  )),
  direction text not null check (direction in ('IN', 'OUT')),
  quantity integer not null check (quantity > 0),
  qty_before integer not null check (qty_before >= 0),
  qty_after integer not null check (qty_after >= 0),
  content text not null check (char_length(trim(content)) > 0),
  reason text null,
  reference_type text null,
  reference_id uuid null,
  reference_code text null,
  source_table text null,
  source_row_id uuid null,
  transfer_group_id uuid null,
  actor_email text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_employee_gold_ledger_qty_math check (
    (direction = 'IN' and qty_after = qty_before + quantity)
    or (direction = 'OUT' and qty_after = qty_before - quantity)
  )
);

create unique index if not exists pos_employee_gold_ledger_source_uidx
  on public.pos_employee_gold_ledger (source_table, source_row_id)
  where source_table is not null and source_row_id is not null;
create index if not exists pos_employee_gold_ledger_account_time_idx
  on public.pos_employee_gold_ledger (account_id, occurred_at desc);
create index if not exists pos_employee_gold_ledger_group_idx
  on public.pos_employee_gold_ledger (transfer_group_id)
  where transfer_group_id is not null;

-- Chuyển vàng: hoàn tất ngay (không chờ xác nhận như CTCT).
create table if not exists public.pos_employee_gold_transfers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  from_account_id uuid not null references public.pos_employee_gold_accounts (id) on delete restrict,
  to_account_id uuid not null references public.pos_employee_gold_accounts (id) on delete restrict,
  sku_id uuid not null references public.pos_skus (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  content text not null check (char_length(trim(content)) > 0),
  transfer_group_id uuid not null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  constraint pos_employee_gold_transfers_accounts_diff check (from_account_id <> to_account_id)
);

create unique index if not exists pos_employee_gold_transfers_code_uidx
  on public.pos_employee_gold_transfers (code);

-- Kiểm kê: chỉ ghi nhận, không chỉnh số dư.
create table if not exists public.pos_employee_gold_counts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  account_id uuid not null references public.pos_employee_gold_accounts (id) on delete restrict,
  note text null,
  counted_by_email text not null,
  counted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists pos_employee_gold_counts_code_uidx
  on public.pos_employee_gold_counts (code);

create table if not exists public.pos_employee_gold_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.pos_employee_gold_counts (id) on delete cascade,
  sku_id uuid not null references public.pos_skus (id) on delete restrict,
  system_qty integer not null check (system_qty >= 0),
  counted_qty integer not null check (counted_qty >= 0),
  note text null,
  unique (count_id, sku_id)
);

alter table public.pos_employee_gold_accounts enable row level security;
alter table public.pos_employee_gold_stock enable row level security;
alter table public.pos_employee_gold_ledger enable row level security;
alter table public.pos_employee_gold_transfers enable row level security;
alter table public.pos_employee_gold_counts enable row level security;
alter table public.pos_employee_gold_count_lines enable row level security;

drop policy if exists pos_employee_gold_accounts_select on public.pos_employee_gold_accounts;
create policy pos_employee_gold_accounts_select on public.pos_employee_gold_accounts
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or (
      kind = 'STAFF' and staff_id = (
        select s.id from public.pos_staff s
        where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
        limit 1
      )
    )
  );

drop policy if exists pos_employee_gold_stock_select on public.pos_employee_gold_stock;
create policy pos_employee_gold_stock_select on public.pos_employee_gold_stock
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1 from public.pos_employee_gold_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.id = pos_employee_gold_stock.account_id and a.kind = 'STAFF'
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
    )
  );

drop policy if exists pos_employee_gold_ledger_select on public.pos_employee_gold_ledger;
create policy pos_employee_gold_ledger_select on public.pos_employee_gold_ledger
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1 from public.pos_employee_gold_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.id = pos_employee_gold_ledger.account_id and a.kind = 'STAFF'
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
    )
  );

drop policy if exists pos_employee_gold_transfers_select on public.pos_employee_gold_transfers;
create policy pos_employee_gold_transfers_select on public.pos_employee_gold_transfers
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1 from public.pos_employee_gold_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.kind = 'STAFF'
        and a.id in (pos_employee_gold_transfers.from_account_id, pos_employee_gold_transfers.to_account_id)
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
    )
  );

drop policy if exists pos_employee_gold_counts_select on public.pos_employee_gold_counts;
create policy pos_employee_gold_counts_select on public.pos_employee_gold_counts
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1 from public.pos_employee_gold_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.id = pos_employee_gold_counts.account_id and a.kind = 'STAFF'
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
    )
  );

drop policy if exists pos_employee_gold_count_lines_select on public.pos_employee_gold_count_lines;
create policy pos_employee_gold_count_lines_select on public.pos_employee_gold_count_lines
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1
      from public.pos_employee_gold_counts c
      join public.pos_employee_gold_accounts a on a.id = c.account_id
      join public.pos_staff s on s.id = a.staff_id
      where c.id = pos_employee_gold_count_lines.count_id and a.kind = 'STAFF'
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_active
    )
  );

revoke all on table public.pos_employee_gold_accounts from public, anon, authenticated;
revoke all on table public.pos_employee_gold_stock from public, anon, authenticated;
revoke all on table public.pos_employee_gold_ledger from public, anon, authenticated;
revoke all on table public.pos_employee_gold_transfers from public, anon, authenticated;
revoke all on table public.pos_employee_gold_counts from public, anon, authenticated;
revoke all on table public.pos_employee_gold_count_lines from public, anon, authenticated;

grant select on table public.pos_employee_gold_accounts to authenticated;
grant select on table public.pos_employee_gold_stock to authenticated;
grant select on table public.pos_employee_gold_ledger to authenticated;
grant select on table public.pos_employee_gold_transfers to authenticated;
grant select on table public.pos_employee_gold_counts to authenticated;
grant select on table public.pos_employee_gold_count_lines to authenticated;

grant select, insert, update, delete on table public.pos_employee_gold_accounts to service_role;
grant select, insert, update, delete on table public.pos_employee_gold_stock to service_role;
grant select, insert, update, delete on table public.pos_employee_gold_ledger to service_role;
grant select, insert, update, delete on table public.pos_employee_gold_transfers to service_role;
grant select, insert, update, delete on table public.pos_employee_gold_counts to service_role;
grant select, insert, update, delete on table public.pos_employee_gold_count_lines to service_role;

insert into public.pos_employee_gold_accounts (code, name, kind, staff_id, created_by)
values ('QV-ADMIN', 'Quỹ vàng Admin', 'ADMIN_POOL', null, 'migration:20261119022000')
on conflict (code) do nothing;
