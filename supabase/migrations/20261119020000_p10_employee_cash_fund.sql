-- P10 Module 2a: Quỹ tiền nhân viên — tài khoản + sổ + Admin nạp vốn/phân bổ/thu hồi.
-- Không đụng CASH-001/BANK-001 / payment trigger. Flag OFF → app không mở module này.
-- Backup note: bảng mới.

do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._p10_m2_employee_cash_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._p10_m2_employee_cash_note (note)
    values ('20261119020000_p10_employee_cash_fund: pos_employee_cash_accounts + ledger + RPCs')
    on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.pos_employee_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  kind text not null check (kind in ('STAFF', 'ADMIN_POOL')),
  staff_id uuid null references public.pos_staff (id) on delete restrict,
  balance_dong bigint not null default 0 check (balance_dong >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text null,
  constraint pos_employee_cash_accounts_code_nonempty check (char_length(trim(code)) > 0),
  constraint pos_employee_cash_accounts_name_nonempty check (char_length(trim(name)) > 0),
  constraint pos_employee_cash_accounts_staff_kind check (
    (kind = 'STAFF' and staff_id is not null)
    or (kind = 'ADMIN_POOL' and staff_id is null)
  )
);

create unique index if not exists pos_employee_cash_accounts_code_uidx
  on public.pos_employee_cash_accounts (code);

create unique index if not exists pos_employee_cash_accounts_staff_uidx
  on public.pos_employee_cash_accounts (staff_id)
  where kind = 'STAFF' and staff_id is not null;

create unique index if not exists pos_employee_cash_accounts_admin_pool_uidx
  on public.pos_employee_cash_accounts (kind)
  where kind = 'ADMIN_POOL';

create index if not exists pos_employee_cash_accounts_active_idx
  on public.pos_employee_cash_accounts (is_active, kind);

comment on table public.pos_employee_cash_accounts is
  'P10 Quỹ tiền nhân viên. STAFF: tối đa 1/NV. ADMIN_POOL: quỹ Admin để nạp vốn/phân bổ.';

create table if not exists public.pos_employee_cash_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.pos_employee_cash_accounts (id) on delete restrict,
  txn_type text not null check (txn_type in (
    'ADMIN_CAPITAL_IN',
    'ADMIN_CAPITAL_OUT',
    'ADMIN_ALLOCATE',
    'SALE_RECEIPT',
    'PURCHASE_PAY',
    'TRANSFER',
    'VOID_REVERSAL'
  )),
  direction text not null check (direction in ('IN', 'OUT')),
  amount_dong bigint not null check (amount_dong > 0),
  balance_before_dong bigint not null check (balance_before_dong >= 0),
  balance_after_dong bigint not null check (balance_after_dong >= 0),
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
  constraint pos_employee_cash_ledger_balance_math check (
    (direction = 'IN' and balance_after_dong = balance_before_dong + amount_dong)
    or (direction = 'OUT' and balance_after_dong = balance_before_dong - amount_dong)
  )
);

create unique index if not exists pos_employee_cash_ledger_source_uidx
  on public.pos_employee_cash_ledger (source_table, source_row_id)
  where source_table is not null and source_row_id is not null;

create index if not exists pos_employee_cash_ledger_account_time_idx
  on public.pos_employee_cash_ledger (account_id, occurred_at desc);

create index if not exists pos_employee_cash_ledger_group_idx
  on public.pos_employee_cash_ledger (transfer_group_id)
  where transfer_group_id is not null;

create index if not exists pos_employee_cash_ledger_occurred_idx
  on public.pos_employee_cash_ledger (occurred_at desc);

comment on table public.pos_employee_cash_ledger is
  'Sổ biến động Quỹ tiền NV. Không xóa; đảo bằng VOID_REVERSAL / đối ứng.';

create sequence if not exists public.pos_employee_cash_account_code_seq;

-- ---------------------------------------------------------------------------
-- RLS + GRANT (§32.1)
-- ---------------------------------------------------------------------------

alter table public.pos_employee_cash_accounts enable row level security;
alter table public.pos_employee_cash_ledger enable row level security;

drop policy if exists pos_employee_cash_accounts_select on public.pos_employee_cash_accounts;
create policy pos_employee_cash_accounts_select on public.pos_employee_cash_accounts
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or (
      kind = 'STAFF'
      and staff_id is not null
      and staff_id = (
        select s.id from public.pos_staff s
        where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and s.is_active
        limit 1
      )
    )
  );

drop policy if exists pos_employee_cash_ledger_select on public.pos_employee_cash_ledger;
create policy pos_employee_cash_ledger_select on public.pos_employee_cash_ledger
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1
      from public.pos_employee_cash_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.id = pos_employee_cash_ledger.account_id
        and a.kind = 'STAFF'
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and s.is_active
    )
  );

revoke all on table public.pos_employee_cash_accounts from public, anon, authenticated;
revoke all on table public.pos_employee_cash_ledger from public, anon, authenticated;
grant select on table public.pos_employee_cash_accounts to authenticated;
grant select on table public.pos_employee_cash_ledger to authenticated;
grant select, insert, update, delete on table public.pos_employee_cash_accounts to service_role;
grant select, insert, update, delete on table public.pos_employee_cash_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function pos_private.employee_cash_post(
  p_account_id uuid,
  p_txn_type text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_actor_email text,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_code text default null,
  p_source_table text default null,
  p_source_row_id uuid default null,
  p_transfer_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_bal bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'EMP_CASH_CONTENT_REQUIRED';
  end if;

  if p_source_table is not null and p_source_row_id is not null then
    select id into v_id
    from public.pos_employee_cash_ledger
    where source_table = p_source_table and source_row_id = p_source_row_id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select balance_dong into v_bal
  from public.pos_employee_cash_accounts
  where id = p_account_id and is_active
  for update;

  if v_bal is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;

  if p_direction = 'IN' then
    v_after := v_bal + p_amount_dong;
  elsif p_direction = 'OUT' then
    if v_bal < p_amount_dong then
      raise exception 'EMP_CASH_INSUFFICIENT_BALANCE';
    end if;
    v_after := v_bal - p_amount_dong;
  else
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;

  insert into public.pos_employee_cash_ledger (
    account_id, txn_type, direction, amount_dong,
    balance_before_dong, balance_after_dong, content, reason,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong,
    v_bal, v_after, trim(p_content), nullif(trim(coalesce(p_reason, '')), ''),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  update public.pos_employee_cash_accounts
  set balance_dong = v_after, updated_at = now()
  where id = p_account_id;

  return v_id;
end;
$$;

create or replace function pos_private.employee_cash_admin_pool_id()
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.pos_employee_cash_accounts
  where kind = 'ADMIN_POOL'
  limit 1;

  if v_id is null then
    insert into public.pos_employee_cash_accounts (code, name, kind, staff_id, created_by)
    values ('QT-ADMIN', 'Quỹ tiền Admin', 'ADMIN_POOL', null, 'system:seed')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Seed ADMIN_POOL
insert into public.pos_employee_cash_accounts (code, name, kind, staff_id, created_by)
values ('QT-ADMIN', 'Quỹ tiền Admin', 'ADMIN_POOL', null, 'migration:20261119020000')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create or replace function public.pos_employee_cash_list_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();

  if not v_is_admin then
    select s.id into v_staff_id
    from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active
    limit 1;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sort_key, t.code), '[]'::jsonb)
  into v_items
  from (
    select
      a.id,
      a.code,
      a.name,
      a.kind,
      a.staff_id as "staffId",
      s.full_name as "staffName",
      s.email as "staffEmail",
      a.balance_dong as "balanceDong",
      a.is_active as "isActive",
      a.updated_at as "updatedAt",
      case when a.kind = 'ADMIN_POOL' then 0 else 1 end as sort_key
    from public.pos_employee_cash_accounts a
    left join public.pos_staff s on s.id = a.staff_id
    where a.is_active
      and (
        v_is_admin
        or (a.kind = 'STAFF' and a.staff_id = v_staff_id)
      )
  ) t;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_employee_cash_create_staff_account(
  p_staff_id uuid,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_staff public.pos_staff%rowtype;
  v_code text;
  v_name text;
  v_id uuid;
begin
  v_actor := pos_private.require_admin();

  if p_staff_id is null then
    raise exception 'EMP_CASH_STAFF_REQUIRED';
  end if;

  select * into v_staff from public.pos_staff where id = p_staff_id;
  if not found then
    raise exception 'EMP_CASH_STAFF_NOT_FOUND';
  end if;
  if not v_staff.is_active then
    raise exception 'EMP_CASH_STAFF_INACTIVE';
  end if;

  if exists (
    select 1 from public.pos_employee_cash_accounts
    where kind = 'STAFF' and staff_id = p_staff_id
  ) then
    raise exception 'EMP_CASH_STAFF_ALREADY_HAS_ACCOUNT';
  end if;

  v_code := 'QT-' || lpad(nextval('public.pos_employee_cash_account_code_seq')::text, 6, '0');
  v_name := coalesce(nullif(trim(p_name), ''), 'Quỹ tiền ' || v_staff.full_name);

  insert into public.pos_employee_cash_accounts (
    code, name, kind, staff_id, created_by
  ) values (
    v_code, v_name, 'STAFF', p_staff_id, v_actor
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'code', v_code,
    'name', v_name,
    'staffId', p_staff_id,
    'balanceDong', 0
  );
end;
$$;

create or replace function public.pos_employee_cash_set_active(
  p_account_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_kind text;
begin
  v_actor := pos_private.require_admin();
  if p_account_id is null or p_is_active is null then
    raise exception 'EMP_CASH_ARGS_REQUIRED';
  end if;

  select kind into v_kind
  from public.pos_employee_cash_accounts
  where id = p_account_id
  for update;

  if v_kind is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;
  if v_kind = 'ADMIN_POOL' and p_is_active = false then
    raise exception 'EMP_CASH_ADMIN_POOL_REQUIRED';
  end if;

  update public.pos_employee_cash_accounts
  set is_active = p_is_active, updated_at = now()
  where id = p_account_id;

  return jsonb_build_object('ok', true, 'id', p_account_id, 'isActive', p_is_active, 'actor', v_actor);
end;
$$;

create or replace function public.pos_employee_cash_admin_capital(
  p_idempotency_key text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_pool uuid;
  v_source uuid;
  v_ledger uuid;
  v_dir text;
  v_txn text;
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  if v_dir not in ('IN', 'OUT') then
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;

  v_pool := pos_private.employee_cash_admin_pool_id();
  v_txn := case when v_dir = 'IN' then 'ADMIN_CAPITAL_IN' else 'ADMIN_CAPITAL_OUT' end;
  v_source := (
    '00000000-0000-4000-8000-' || substr(md5('emp-cash-capital:' || coalesce(p_idempotency_key, gen_random_uuid()::text)), 1, 12)
  )::uuid;

  v_ledger := pos_private.employee_cash_post(
    v_pool, v_txn, v_dir, p_amount_dong,
    coalesce(nullif(trim(p_content), ''), case when v_dir = 'IN' then 'Nạp vốn Quỹ Admin' else 'Rút vốn Quỹ Admin' end),
    v_actor, now(), p_reason,
    'admin_capital', v_pool, null,
    'emp_cash_capital', v_source, null
  );

  return jsonb_build_object('ok', true, 'ledgerId', v_ledger, 'poolAccountId', v_pool, 'direction', v_dir);
end;
$$;

create or replace function public.pos_employee_cash_admin_allocate(
  p_idempotency_key text,
  p_staff_account_id uuid,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_pool uuid;
  v_staff_acc public.pos_employee_cash_accounts%rowtype;
  v_dir text;
  v_group uuid := gen_random_uuid();
  v_source_a uuid;
  v_source_b uuid;
  v_ledger_pool uuid;
  v_ledger_staff uuid;
  v_content text;
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  -- IN = cộng vào quỹ NV (trừ pool); OUT = trừ quỹ NV (cộng pool)
  if v_dir not in ('IN', 'OUT') then
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if p_staff_account_id is null then
    raise exception 'EMP_CASH_ACCOUNT_REQUIRED';
  end if;

  select * into v_staff_acc
  from public.pos_employee_cash_accounts
  where id = p_staff_account_id
  for update;

  if not found or v_staff_acc.kind <> 'STAFF' or not v_staff_acc.is_active then
    raise exception 'EMP_CASH_STAFF_ACCOUNT_INVALID';
  end if;

  v_pool := pos_private.employee_cash_admin_pool_id();
  perform 1 from public.pos_employee_cash_accounts where id = v_pool for update;

  v_content := coalesce(
    nullif(trim(p_content), ''),
    case when v_dir = 'IN' then 'Admin phân bổ tiền cho nhân viên' else 'Admin thu hồi tiền từ nhân viên' end
  );

  v_source_a := (
    '00000000-0000-4000-8000-' || substr(md5('emp-cash-alloc-a:' || coalesce(p_idempotency_key, v_group::text)), 1, 12)
  )::uuid;
  v_source_b := (
    '00000000-0000-4000-8000-' || substr(md5('emp-cash-alloc-b:' || coalesce(p_idempotency_key, v_group::text)), 1, 12)
  )::uuid;

  if v_dir = 'IN' then
    -- Pool OUT, Staff IN
    v_ledger_pool := pos_private.employee_cash_post(
      v_pool, 'ADMIN_ALLOCATE', 'OUT', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', p_staff_account_id, v_staff_acc.code,
      'emp_cash_allocate', v_source_a, v_group
    );
    v_ledger_staff := pos_private.employee_cash_post(
      p_staff_account_id, 'ADMIN_ALLOCATE', 'IN', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', v_pool, 'QT-ADMIN',
      'emp_cash_allocate', v_source_b, v_group
    );
  else
    -- Staff OUT, Pool IN
    v_ledger_staff := pos_private.employee_cash_post(
      p_staff_account_id, 'ADMIN_ALLOCATE', 'OUT', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', v_pool, 'QT-ADMIN',
      'emp_cash_allocate', v_source_a, v_group
    );
    v_ledger_pool := pos_private.employee_cash_post(
      v_pool, 'ADMIN_ALLOCATE', 'IN', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', p_staff_account_id, v_staff_acc.code,
      'emp_cash_allocate', v_source_b, v_group
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'transferGroupId', v_group,
    'poolLedgerId', v_ledger_pool,
    'staffLedgerId', v_ledger_staff,
    'direction', v_dir,
    'amountDong', p_amount_dong
  );
end;
$$;

create or replace function public.pos_employee_cash_list_ledger(
  p_account_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();

  if not v_is_admin then
    select s.id into v_staff_id
    from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active
    limit 1;

    if p_account_id is not null and not exists (
      select 1 from public.pos_employee_cash_accounts a
      where a.id = p_account_id and a.kind = 'STAFF' and a.staff_id = v_staff_id
    ) then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  select count(*)::integer into v_total
  from public.pos_employee_cash_ledger l
  join public.pos_employee_cash_accounts a on a.id = l.account_id
  where (p_account_id is null or l.account_id = p_account_id)
    and (
      v_is_admin
      or (a.kind = 'STAFF' and a.staff_id = v_staff_id)
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      l.id,
      l.account_id as "accountId",
      a.code as "accountCode",
      a.name as "accountName",
      l.txn_type as "txnType",
      l.direction,
      l.amount_dong as "amountDong",
      l.balance_before_dong as "balanceBeforeDong",
      l.balance_after_dong as "balanceAfterDong",
      l.content,
      l.reason,
      l.reference_code as "referenceCode",
      l.transfer_group_id as "transferGroupId",
      l.actor_email as "actorEmail",
      l.occurred_at as "occurredAt"
    from public.pos_employee_cash_ledger l
    join public.pos_employee_cash_accounts a on a.id = l.account_id
    where (p_account_id is null or l.account_id = p_account_id)
      and (
        v_is_admin
        or (a.kind = 'STAFF' and a.staff_id = v_staff_id)
      )
    order by l.occurred_at desc, l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0))
  );
end;
$$;

create or replace function public.pos_employee_cash_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_account_id uuid;
begin
  perform pos_private.require_pos_user();

  if v_is_admin then
    return jsonb_build_object(
      'canAccess', true,
      'isAdmin', true,
      'staffAccountId', null
    );
  end if;

  select s.id into v_staff_id
  from public.pos_staff s
  where lower(s.email) = lower(v_email) and s.is_active
  limit 1;

  select a.id into v_account_id
  from public.pos_employee_cash_accounts a
  where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
  limit 1;

  return jsonb_build_object(
    'canAccess', v_account_id is not null,
    'isAdmin', false,
    'staffAccountId', v_account_id
  );
end;
$$;

revoke all on function public.pos_employee_cash_list_accounts() from public, anon;
revoke all on function public.pos_employee_cash_create_staff_account(uuid, text) from public, anon;
revoke all on function public.pos_employee_cash_set_active(uuid, boolean) from public, anon;
revoke all on function public.pos_employee_cash_admin_capital(text, text, bigint, text, text) from public, anon;
revoke all on function public.pos_employee_cash_admin_allocate(text, uuid, text, bigint, text, text) from public, anon;
revoke all on function public.pos_employee_cash_list_ledger(uuid, integer, integer) from public, anon;
revoke all on function public.pos_employee_cash_my_access() from public, anon;

grant execute on function public.pos_employee_cash_list_accounts() to authenticated, service_role;
grant execute on function public.pos_employee_cash_create_staff_account(uuid, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_set_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.pos_employee_cash_admin_capital(text, text, bigint, text, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_admin_allocate(text, uuid, text, bigint, text, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_list_ledger(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.pos_employee_cash_my_access() to authenticated, service_role;
