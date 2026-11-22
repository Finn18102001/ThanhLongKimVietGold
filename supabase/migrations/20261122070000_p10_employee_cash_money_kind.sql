-- P10: Quỹ tiền NV tách tồn tiền mặt (CASH) / chuyển khoản (BANK).
-- YC confirm ± đúng bucket theo payment_method (CASH→CASH; TRANSFER/CARD→BANK).
-- Snapshot → tlkv_backup_20261110. §32.1: ALTER bảng đã GRANT (không tạo bảng mới).

do $$
begin
  create schema if not exists tlkv_backup_20261110;

  create table if not exists tlkv_backup_20261110._p10_m2_money_kind_note (
    note text primary key,
    created_at timestamptz not null default now()
  );
  insert into tlkv_backup_20261110._p10_m2_money_kind_note (note)
  values ('20261122070000_p10_employee_cash_money_kind')
  on conflict do nothing;

  create table if not exists tlkv_backup_20261110._routines_p10_money_kind (
    saved_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    primary key (schema_name, proname, identity_args, saved_at)
  );

  insert into tlkv_backup_20261110._routines_p10_money_kind (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('pos_private', 'employee_cash_post'),
    ('pos_private', 'employee_cash_post_allow_negative'),
    ('pos_private', 'employee_cash_reverse_requests_for_source'),
    ('public', 'pos_employee_cash_list_accounts'),
    ('public', 'pos_employee_cash_list_ledger'),
    ('public', 'pos_employee_cash_admin_capital'),
    ('public', 'pos_employee_cash_admin_allocate'),
    ('public', 'pos_employee_cash_request_confirm'),
    ('public', 'pos_employee_cash_transfer_create'),
    ('public', 'pos_employee_cash_transfer_confirm'),
    ('public', 'pos_employee_cash_transfer_list'),
    ('public', 'pos_employee_cash_transfer_get')
  );
end $$;

-- ---------------------------------------------------------------------------
-- 1) Schema: bucket balances + ledger money_kind + CTCT money_kind
-- ---------------------------------------------------------------------------

alter table public.pos_employee_cash_accounts
  add column if not exists cash_balance_dong bigint;

alter table public.pos_employee_cash_accounts
  add column if not exists bank_balance_dong bigint;

update public.pos_employee_cash_accounts
set
  cash_balance_dong = coalesce(cash_balance_dong, balance_dong, 0),
  bank_balance_dong = coalesce(bank_balance_dong, 0)
where cash_balance_dong is null or bank_balance_dong is null;

alter table public.pos_employee_cash_accounts
  alter column cash_balance_dong set default 0,
  alter column bank_balance_dong set default 0;

alter table public.pos_employee_cash_accounts
  alter column cash_balance_dong set not null,
  alter column bank_balance_dong set not null;

alter table public.pos_employee_cash_accounts
  drop constraint if exists pos_employee_cash_accounts_bucket_sum_chk;

alter table public.pos_employee_cash_accounts
  add constraint pos_employee_cash_accounts_bucket_sum_chk
  check (balance_dong = cash_balance_dong + bank_balance_dong);

comment on column public.pos_employee_cash_accounts.cash_balance_dong is
  'Tồn tiền mặt trong Quỹ NV (TM).';
comment on column public.pos_employee_cash_accounts.bank_balance_dong is
  'Tồn chuyển khoản / thẻ trong Quỹ NV (CK).';

alter table public.pos_employee_cash_ledger
  add column if not exists money_kind text;

update public.pos_employee_cash_ledger
set money_kind = 'CASH'
where money_kind is null;

alter table public.pos_employee_cash_ledger
  alter column money_kind set default 'CASH';

alter table public.pos_employee_cash_ledger
  alter column money_kind set not null;

alter table public.pos_employee_cash_ledger
  drop constraint if exists pos_employee_cash_ledger_money_kind_chk;

alter table public.pos_employee_cash_ledger
  add constraint pos_employee_cash_ledger_money_kind_chk
  check (money_kind in ('CASH', 'BANK'));

comment on column public.pos_employee_cash_ledger.money_kind is
  'CASH = tiền mặt; BANK = chuyển khoản/thẻ. balance_before/after vẫn là tổng quỹ.';

alter table public.pos_employee_cash_transfers
  add column if not exists money_kind text;

update public.pos_employee_cash_transfers
set money_kind = 'CASH'
where money_kind is null;

alter table public.pos_employee_cash_transfers
  alter column money_kind set default 'CASH';

alter table public.pos_employee_cash_transfers
  alter column money_kind set not null;

alter table public.pos_employee_cash_transfers
  drop constraint if exists pos_employee_cash_transfers_money_kind_chk;

alter table public.pos_employee_cash_transfers
  add constraint pos_employee_cash_transfers_money_kind_chk
  check (money_kind in ('CASH', 'BANK'));

-- Reclassify ledger đã gắn YC theo payment_method (tổng không đổi).
update public.pos_employee_cash_ledger l
set money_kind = case
  when upper(trim(coalesce(r.payment_method, 'CASH'))) = 'CASH' then 'CASH'
  else 'BANK'
end
from public.pos_employee_cash_requests r
where l.source_table = 'emp_cash_yc'
  and l.source_row_id = r.id
  and upper(trim(coalesce(r.payment_method, 'CASH'))) <> 'CASH';

update public.pos_employee_cash_ledger l
set money_kind = case
  when upper(trim(coalesce(r.payment_method, 'CASH'))) = 'CASH' then 'CASH'
  else 'BANK'
end
from public.pos_employee_cash_requests r
where l.source_table = 'emp_cash_yc_void'
  and l.source_row_id = r.id
  and upper(trim(coalesce(r.payment_method, 'CASH'))) <> 'CASH';

-- Tái tính bucket theo ledger (giữ balance_dong).
with deltas as (
  select
    account_id,
    sum(case
      when money_kind = 'CASH' and direction = 'IN' then amount_dong
      when money_kind = 'CASH' and direction = 'OUT' then -amount_dong
      else 0
    end) as cash_delta,
    sum(case
      when money_kind = 'BANK' and direction = 'IN' then amount_dong
      when money_kind = 'BANK' and direction = 'OUT' then -amount_dong
      else 0
    end) as bank_delta
  from public.pos_employee_cash_ledger
  group by account_id
)
update public.pos_employee_cash_accounts a
set
  cash_balance_dong = coalesce(d.cash_delta, 0),
  bank_balance_dong = coalesce(d.bank_delta, 0),
  balance_dong = coalesce(d.cash_delta, 0) + coalesce(d.bank_delta, 0),
  updated_at = now()
from deltas d
where a.id = d.account_id;

-- Tài khoản chưa có ledger: giữ tổng ở TM.
update public.pos_employee_cash_accounts
set
  cash_balance_dong = balance_dong,
  bank_balance_dong = 0
where not exists (
  select 1 from public.pos_employee_cash_ledger l where l.account_id = pos_employee_cash_accounts.id
);

-- ---------------------------------------------------------------------------
-- 2) Helper: map payment_method → money_kind
-- ---------------------------------------------------------------------------

create or replace function pos_private.employee_cash_money_kind_from_method(p_method text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  if upper(trim(coalesce(p_method, 'CASH'))) = 'CASH' then
    return 'CASH';
  end if;
  return 'BANK'; -- TRANSFER, CARD, MIXED (YC tách sẵn khi MIXED)
end;
$$;

revoke all on function pos_private.employee_cash_money_kind_from_method(text) from public;
grant execute on function pos_private.employee_cash_money_kind_from_method(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) employee_cash_post (+ money_kind)
-- ---------------------------------------------------------------------------

drop function if exists pos_private.employee_cash_post(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid
);

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
  p_transfer_group_id uuid default null,
  p_money_kind text default 'CASH'
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text := upper(trim(coalesce(p_money_kind, 'CASH')));
  v_total bigint;
  v_cash bigint;
  v_bank bigint;
  v_bucket bigint;
  v_bucket_after bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'EMP_CASH_CONTENT_REQUIRED';
  end if;
  if v_kind not in ('CASH', 'BANK') then
    raise exception 'EMP_CASH_MONEY_KIND_INVALID';
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

  select balance_dong, cash_balance_dong, bank_balance_dong
  into v_total, v_cash, v_bank
  from public.pos_employee_cash_accounts
  where id = p_account_id and is_active
  for update;

  if v_total is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;

  v_bucket := case when v_kind = 'CASH' then v_cash else v_bank end;

  if p_direction = 'IN' then
    v_bucket_after := v_bucket + p_amount_dong;
    v_after := v_total + p_amount_dong;
  elsif p_direction = 'OUT' then
    if v_bucket < p_amount_dong then
      raise exception 'EMP_CASH_INSUFFICIENT_BALANCE';
    end if;
    v_bucket_after := v_bucket - p_amount_dong;
    v_after := v_total - p_amount_dong;
  else
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;

  insert into public.pos_employee_cash_ledger (
    account_id, txn_type, direction, amount_dong, money_kind,
    balance_before_dong, balance_after_dong, content, reason,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong, v_kind,
    v_total, v_after, trim(p_content), nullif(trim(coalesce(p_reason, '')), ''),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  if v_kind = 'CASH' then
    update public.pos_employee_cash_accounts
    set balance_dong = v_after,
        cash_balance_dong = v_bucket_after,
        updated_at = now()
    where id = p_account_id;
  else
    update public.pos_employee_cash_accounts
    set balance_dong = v_after,
        bank_balance_dong = v_bucket_after,
        updated_at = now()
    where id = p_account_id;
  end if;

  return v_id;
end;
$$;

revoke all on function pos_private.employee_cash_post(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid, text
) from public;
grant execute on function pos_private.employee_cash_post(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 4) employee_cash_post_allow_negative (+ money_kind)
-- ---------------------------------------------------------------------------

drop function if exists pos_private.employee_cash_post_allow_negative(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid
);

create or replace function pos_private.employee_cash_post_allow_negative(
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
  p_transfer_group_id uuid default null,
  p_money_kind text default 'CASH'
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text := upper(trim(coalesce(p_money_kind, 'CASH')));
  v_total bigint;
  v_cash bigint;
  v_bank bigint;
  v_bucket bigint;
  v_bucket_after bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'EMP_CASH_CONTENT_REQUIRED';
  end if;
  if v_kind not in ('CASH', 'BANK') then
    raise exception 'EMP_CASH_MONEY_KIND_INVALID';
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

  select balance_dong, cash_balance_dong, bank_balance_dong
  into v_total, v_cash, v_bank
  from public.pos_employee_cash_accounts
  where id = p_account_id and is_active
  for update;

  if v_total is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;

  v_bucket := case when v_kind = 'CASH' then v_cash else v_bank end;

  if p_direction = 'IN' then
    v_bucket_after := v_bucket + p_amount_dong;
    v_after := v_total + p_amount_dong;
  elsif p_direction = 'OUT' then
    v_bucket_after := v_bucket - p_amount_dong; -- allow negative on void reclaim
    v_after := v_total - p_amount_dong;
  else
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;

  insert into public.pos_employee_cash_ledger (
    account_id, txn_type, direction, amount_dong, money_kind,
    balance_before_dong, balance_after_dong, content, reason,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong, v_kind,
    v_total, v_after, trim(p_content), nullif(trim(coalesce(p_reason, '')), ''),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  if v_kind = 'CASH' then
    update public.pos_employee_cash_accounts
    set balance_dong = v_after,
        cash_balance_dong = v_bucket_after,
        updated_at = now()
    where id = p_account_id;
  else
    update public.pos_employee_cash_accounts
    set balance_dong = v_after,
        bank_balance_dong = v_bucket_after,
        updated_at = now()
    where id = p_account_id;
  end if;

  return v_id;
end;
$$;

revoke all on function pos_private.employee_cash_post_allow_negative(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid, text
) from public;
grant execute on function pos_private.employee_cash_post_allow_negative(
  uuid, text, text, bigint, text, text, timestamptz, text, text, uuid, text, text, uuid, uuid, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5) List accounts / ledger — expose buckets
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
      a.cash_balance_dong as "cashBalanceDong",
      a.bank_balance_dong as "bankBalanceDong",
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
      l.money_kind as "moneyKind",
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

-- ---------------------------------------------------------------------------
-- 6) Admin capital / allocate — chọn money_kind
-- ---------------------------------------------------------------------------

drop function if exists public.pos_employee_cash_admin_capital(text, text, bigint, text, text);

create or replace function public.pos_employee_cash_admin_capital(
  p_idempotency_key text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_reason text default null,
  p_money_kind text default 'CASH'
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
  v_kind text := pos_private.employee_cash_money_kind_from_method(p_money_kind);
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  if v_dir not in ('IN', 'OUT') then
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if upper(trim(coalesce(p_money_kind, 'CASH'))) not in ('CASH', 'BANK') then
    raise exception 'EMP_CASH_MONEY_KIND_INVALID';
  end if;
  v_kind := upper(trim(coalesce(p_money_kind, 'CASH')));

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
    'emp_cash_capital', v_source, null,
    v_kind
  );

  return jsonb_build_object(
    'ok', true, 'ledgerId', v_ledger, 'poolAccountId', v_pool,
    'direction', v_dir, 'moneyKind', v_kind
  );
end;
$$;

drop function if exists public.pos_employee_cash_admin_allocate(text, uuid, text, bigint, text, text);

create or replace function public.pos_employee_cash_admin_allocate(
  p_idempotency_key text,
  p_staff_account_id uuid,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_reason text default null,
  p_money_kind text default 'CASH'
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
  v_kind text;
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  if v_dir not in ('IN', 'OUT') then
    raise exception 'EMP_CASH_DIRECTION_INVALID';
  end if;
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if p_staff_account_id is null then
    raise exception 'EMP_CASH_ACCOUNT_REQUIRED';
  end if;
  if upper(trim(coalesce(p_money_kind, 'CASH'))) not in ('CASH', 'BANK') then
    raise exception 'EMP_CASH_MONEY_KIND_INVALID';
  end if;
  v_kind := upper(trim(coalesce(p_money_kind, 'CASH')));

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
    v_ledger_pool := pos_private.employee_cash_post(
      v_pool, 'ADMIN_ALLOCATE', 'OUT', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', p_staff_account_id, v_staff_acc.code,
      'emp_cash_allocate', v_source_a, v_group, v_kind
    );
    v_ledger_staff := pos_private.employee_cash_post(
      p_staff_account_id, 'ADMIN_ALLOCATE', 'IN', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', v_pool, 'QT-ADMIN',
      'emp_cash_allocate', v_source_b, v_group, v_kind
    );
  else
    v_ledger_staff := pos_private.employee_cash_post(
      p_staff_account_id, 'ADMIN_ALLOCATE', 'OUT', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', v_pool, 'QT-ADMIN',
      'emp_cash_allocate', v_source_a, v_group, v_kind
    );
    v_ledger_pool := pos_private.employee_cash_post(
      v_pool, 'ADMIN_ALLOCATE', 'IN', p_amount_dong, v_content, v_actor, now(), p_reason,
      'employee_cash_account', p_staff_account_id, v_staff_acc.code,
      'emp_cash_allocate', v_source_b, v_group, v_kind
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'transferGroupId', v_group,
    'poolLedgerId', v_ledger_pool,
    'staffLedgerId', v_ledger_staff,
    'direction', v_dir,
    'amountDong', p_amount_dong,
    'moneyKind', v_kind
  );
end;
$$;

revoke all on function public.pos_employee_cash_admin_capital(text, text, bigint, text, text, text) from public, anon;
revoke all on function public.pos_employee_cash_admin_allocate(text, uuid, text, bigint, text, text, text) from public, anon;
grant execute on function public.pos_employee_cash_admin_capital(text, text, bigint, text, text, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_admin_allocate(text, uuid, text, bigint, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) YC confirm — ± đúng money_kind từ payment_method
-- ---------------------------------------------------------------------------

create or replace function public.pos_employee_cash_request_confirm(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_is_admin boolean := public.tlkv_is_admin();
  v_req public.pos_employee_cash_requests%rowtype;
  v_cash_id uuid;
  v_cash public.pos_employee_cash_accounts%rowtype;
  v_ledger uuid;
  v_txn text;
  v_dir text;
  v_content text;
  v_kind text;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  select * into v_req from public.pos_employee_cash_requests where id = p_request_id for update;
  if not found then raise exception 'EMP_CASH_YC_NOT_FOUND'; end if;
  if v_req.status = 'CONFIRMED' then
    return jsonb_build_object(
      'ok', true, 'code', v_req.code, 'alreadyConfirmed', true,
      'ledgerId', v_req.ledger_id,
      'moneyKind', pos_private.employee_cash_money_kind_from_method(v_req.payment_method)
    );
  end if;
  if v_req.status <> 'PENDING' then raise exception 'EMP_CASH_YC_NOT_PENDING'; end if;

  v_cash_id := pos_private.employee_cash_my_staff_account_id();
  if v_cash_id is null and v_is_admin then
    v_cash_id := pos_private.employee_cash_admin_pool_id();
  end if;
  if v_cash_id is null then
    raise exception 'EMP_CASH_YC_CONFIRM_NO_ACCOUNT';
  end if;

  select * into v_cash from public.pos_employee_cash_accounts where id = v_cash_id for update;
  if not found or not v_cash.is_active then raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND'; end if;

  v_kind := pos_private.employee_cash_money_kind_from_method(v_req.payment_method);

  if v_req.kind = 'THU' then
    v_txn := 'SALE_RECEIPT';
    v_dir := 'IN';
    v_content := 'Xác nhận thu ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  else
    v_txn := 'PURCHASE_PAY';
    v_dir := 'OUT';
    v_content := 'Xác nhận chi ' || v_req.code || ' · ' || coalesce(v_req.source_code, v_req.content);
  end if;

  v_ledger := pos_private.employee_cash_post(
    v_cash_id, v_txn, v_dir, v_req.amount_dong, v_content, v_email, now(),
    null, 'employee_cash_request', v_req.id, v_req.code,
    'emp_cash_yc', v_req.id, null,
    v_kind
  );

  update public.pos_employee_cash_requests
  set status = 'CONFIRMED',
      cash_account_id = v_cash_id,
      confirmed_by_email = v_email,
      confirmed_at = now(),
      ledger_id = v_ledger,
      updated_at = now()
  where id = v_req.id;

  return jsonb_build_object(
    'ok', true, 'code', v_req.code, 'alreadyConfirmed', false,
    'ledgerId', v_ledger, 'cashAccountId', v_cash_id, 'cashAccountCode', v_cash.code,
    'moneyKind', v_kind, 'paymentMethod', v_req.payment_method
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Void reverse — đảo đúng money_kind gốc
-- ---------------------------------------------------------------------------

create or replace function pos_private.employee_cash_reverse_requests_for_source(
  p_source_type text,
  p_source_id uuid,
  p_actor_email text,
  p_reason text,
  p_void_ref_type text,
  p_void_ref_id uuid,
  p_void_ref_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_src text := lower(trim(coalesce(p_source_type, '')));
  v_actor text := lower(trim(coalesce(p_actor_email, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_req public.pos_employee_cash_requests%rowtype;
  v_dir text;
  v_ledger uuid;
  v_lines jsonb := '[]'::jsonb;
  v_pending_closed int := 0;
  v_reversed int := 0;
  v_kind text;
begin
  if v_src not in ('sale', 'buy') then
    raise exception 'EMP_CASH_YC_SOURCE_INVALID' using errcode = '22023';
  end if;
  if p_source_id is null then
    raise exception 'EMP_CASH_YC_SOURCE_REQUIRED' using errcode = '22023';
  end if;
  if v_actor = '' then
    v_actor := 'system';
  end if;
  if v_reason is null then
    v_reason := 'Hủy chứng từ — đảo Quỹ tiền YC';
  end if;

  for v_req in
    select *
    from public.pos_employee_cash_requests
    where source_type = v_src
      and source_id = p_source_id
    order by created_at asc, id asc
    for update
  loop
    if v_req.status = 'REVERSED' then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'requestId', v_req.id,
        'code', v_req.code,
        'status', 'REVERSED',
        'alreadyReversed', true,
        'reverseLedgerId', v_req.reverse_ledger_id
      ));
      continue;
    end if;

    if v_req.status = 'REJECTED' then
      continue;
    end if;

    if v_req.status = 'PENDING' then
      update public.pos_employee_cash_requests
      set status = 'REJECTED',
          rejected_by_email = v_actor,
          rejected_at = now(),
          reject_reason = left('Hủy chứng từ — đóng YC PENDING. ' || v_reason, 500),
          updated_at = now()
      where id = v_req.id;
      v_pending_closed := v_pending_closed + 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'requestId', v_req.id,
        'code', v_req.code,
        'status', 'REJECTED',
        'closedPending', true
      ));
      continue;
    end if;

    if v_req.status <> 'CONFIRMED' then
      continue;
    end if;

    if v_req.cash_account_id is null then
      raise exception 'EMP_CASH_YC_REVERSE_NO_ACCOUNT: %', v_req.code using errcode = 'P0001';
    end if;

    v_kind := pos_private.employee_cash_money_kind_from_method(v_req.payment_method);

    if v_req.kind = 'THU' then
      v_dir := 'OUT';
    elsif v_req.kind = 'CHI' then
      v_dir := 'IN';
    else
      raise exception 'EMP_CASH_YC_KIND_INVALID: %', v_req.code using errcode = '22023';
    end if;

    if v_dir = 'OUT' then
      v_ledger := pos_private.employee_cash_post_allow_negative(
        v_req.cash_account_id,
        'VOID_REVERSAL',
        v_dir,
        v_req.amount_dong,
        format(
          'Hủy %s — đảo %s %s (%s). %s',
          coalesce(p_void_ref_code, p_void_ref_type, 'chung-tu'),
          v_req.kind,
          v_req.code,
          to_char(v_req.amount_dong, 'FM999,999,999,999'),
          v_reason
        ),
        v_actor,
        now(),
        v_reason,
        coalesce(p_void_ref_type, 'EMP_CASH_YC_VOID'),
        coalesce(p_void_ref_id, v_req.id),
        coalesce(p_void_ref_code, v_req.source_code, v_req.code),
        'emp_cash_yc_void',
        v_req.id,
        null,
        v_kind
      );
    else
      v_ledger := pos_private.employee_cash_post(
        v_req.cash_account_id,
        'VOID_REVERSAL',
        v_dir,
        v_req.amount_dong,
        format(
          'Hủy %s — đảo %s %s (%s). %s',
          coalesce(p_void_ref_code, p_void_ref_type, 'chung-tu'),
          v_req.kind,
          v_req.code,
          to_char(v_req.amount_dong, 'FM999,999,999,999'),
          v_reason
        ),
        v_actor,
        now(),
        v_reason,
        coalesce(p_void_ref_type, 'EMP_CASH_YC_VOID'),
        coalesce(p_void_ref_id, v_req.id),
        coalesce(p_void_ref_code, v_req.source_code, v_req.code),
        'emp_cash_yc_void',
        v_req.id,
        null,
        v_kind
      );
    end if;

    update public.pos_employee_cash_requests
    set status = 'REVERSED',
        reverse_ledger_id = v_ledger,
        reversed_at = now(),
        reversed_by_email = v_actor,
        updated_at = now()
    where id = v_req.id;

    v_reversed := v_reversed + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'requestId', v_req.id,
      'code', v_req.code,
      'status', 'REVERSED',
      'reverseLedgerId', v_ledger,
      'moneyKind', v_kind
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'pendingClosed', v_pending_closed,
    'reversed', v_reversed,
    'lines', v_lines
  );
end;
$$;

revoke all on function pos_private.employee_cash_reverse_requests_for_source(text, uuid, text, text, text, uuid, text) from public;
grant execute on function pos_private.employee_cash_reverse_requests_for_source(text, uuid, text, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9) CTCT — chuyển theo money_kind
-- ---------------------------------------------------------------------------

drop function if exists public.pos_employee_cash_transfer_create(uuid, uuid, bigint, text);

create or replace function public.pos_employee_cash_transfer_create(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_dong bigint,
  p_content text,
  p_money_kind text default 'CASH'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_from public.pos_employee_cash_accounts%rowtype;
  v_to public.pos_employee_cash_accounts%rowtype;
  v_code text;
  v_id uuid;
  v_content text;
  v_kind text;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'EMP_CASH_AMOUNT_INVALID';
  end if;
  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'EMP_CASH_ACCOUNT_REQUIRED';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'EMP_CASH_TRANSFER_SAME_ACCOUNT';
  end if;
  if upper(trim(coalesce(p_money_kind, 'CASH'))) not in ('CASH', 'BANK') then
    raise exception 'EMP_CASH_MONEY_KIND_INVALID';
  end if;
  v_kind := upper(trim(coalesce(p_money_kind, 'CASH')));

  v_content := nullif(trim(coalesce(p_content, '')), '');
  if v_content is null then
    raise exception 'EMP_CASH_CONTENT_REQUIRED';
  end if;

  select * into v_from from public.pos_employee_cash_accounts where id = p_from_account_id;
  select * into v_to from public.pos_employee_cash_accounts where id = p_to_account_id;

  if v_from.id is null or v_to.id is null then
    raise exception 'EMP_CASH_ACCOUNT_NOT_FOUND';
  end if;
  if v_from.kind <> 'STAFF' or v_to.kind <> 'STAFF' or not v_from.is_active or not v_to.is_active then
    raise exception 'EMP_CASH_TRANSFER_ACCOUNT_INVALID';
  end if;

  if not pos_private.employee_cash_owns_account(p_from_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_code := 'CTCT-' || lpad(nextval('public.pos_employee_cash_transfer_code_seq')::text, 6, '0');

  insert into public.pos_employee_cash_transfers (
    code, from_account_id, to_account_id, amount_dong, content, status, created_by_email, money_kind
  ) values (
    v_code, p_from_account_id, p_to_account_id, p_amount_dong, v_content, 'PENDING', v_email, v_kind
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'code', v_code,
    'status', 'PENDING',
    'amountDong', p_amount_dong,
    'moneyKind', v_kind,
    'fromAccountId', p_from_account_id,
    'toAccountId', p_to_account_id
  );
end;
$$;

create or replace function public.pos_employee_cash_transfer_confirm(
  p_transfer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_tr public.pos_employee_cash_transfers%rowtype;
  v_from public.pos_employee_cash_accounts%rowtype;
  v_to public.pos_employee_cash_accounts%rowtype;
  v_group uuid;
  v_ledger_from uuid;
  v_ledger_to uuid;
  v_source_a uuid;
  v_source_b uuid;
  v_content text;
  v_kind text;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  if p_transfer_id is null then
    raise exception 'EMP_CASH_TRANSFER_REQUIRED';
  end if;

  select * into v_tr
  from public.pos_employee_cash_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'EMP_CASH_TRANSFER_NOT_FOUND';
  end if;

  if v_tr.status = 'CONFIRMED' then
    return jsonb_build_object(
      'ok', true,
      'id', v_tr.id,
      'code', v_tr.code,
      'status', v_tr.status,
      'transferGroupId', v_tr.transfer_group_id,
      'moneyKind', coalesce(v_tr.money_kind, 'CASH'),
      'alreadyConfirmed', true
    );
  end if;

  if v_tr.status <> 'PENDING' then
    raise exception 'EMP_CASH_TRANSFER_NOT_PENDING';
  end if;

  if not pos_private.employee_cash_owns_account(v_tr.to_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_from from public.pos_employee_cash_accounts where id = v_tr.from_account_id for update;
  select * into v_to from public.pos_employee_cash_accounts where id = v_tr.to_account_id for update;

  if v_from.id is null or v_to.id is null or not v_from.is_active or not v_to.is_active then
    raise exception 'EMP_CASH_TRANSFER_ACCOUNT_INVALID';
  end if;

  v_kind := coalesce(nullif(upper(trim(v_tr.money_kind)), ''), 'CASH');
  if v_kind not in ('CASH', 'BANK') then
    v_kind := 'CASH';
  end if;

  v_group := coalesce(v_tr.transfer_group_id, gen_random_uuid());
  v_content := 'Chuyển quỹ ' || v_tr.code || ' · ' || v_tr.content;
  v_source_a := (
    '00000000-0000-4000-8000-' || substr(md5('emp-cash-ctct-from:' || v_tr.id::text), 1, 12)
  )::uuid;
  v_source_b := (
    '00000000-0000-4000-8000-' || substr(md5('emp-cash-ctct-to:' || v_tr.id::text), 1, 12)
  )::uuid;

  v_ledger_from := pos_private.employee_cash_post(
    v_tr.from_account_id, 'TRANSFER', 'OUT', v_tr.amount_dong, v_content, v_email, now(), null,
    'employee_cash_transfer', v_tr.id, v_tr.code,
    'emp_cash_transfer', v_source_a, v_group, v_kind
  );
  v_ledger_to := pos_private.employee_cash_post(
    v_tr.to_account_id, 'TRANSFER', 'IN', v_tr.amount_dong, v_content, v_email, now(), null,
    'employee_cash_transfer', v_tr.id, v_tr.code,
    'emp_cash_transfer', v_source_b, v_group, v_kind
  );

  update public.pos_employee_cash_transfers
  set status = 'CONFIRMED',
      confirmed_by_email = v_email,
      confirmed_at = now(),
      transfer_group_id = v_group
  where id = v_tr.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_tr.id,
    'code', v_tr.code,
    'status', 'CONFIRMED',
    'transferGroupId', v_group,
    'fromLedgerId', v_ledger_from,
    'toLedgerId', v_ledger_to,
    'moneyKind', v_kind,
    'alreadyConfirmed', false
  );
end;
$$;

create or replace function public.pos_employee_cash_transfer_list(
  p_status text default null,
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
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_status text := nullif(upper(trim(coalesce(p_status, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  v_staff_id := pos_private.employee_cash_actor_staff_id();

  select count(*)::integer into v_total
  from public.pos_employee_cash_transfers t
  join public.pos_employee_cash_accounts fa on fa.id = t.from_account_id
  join public.pos_employee_cash_accounts ta on ta.id = t.to_account_id
  where (v_status is null or t.status = v_status)
    and (
      v_is_admin
      or fa.staff_id = v_staff_id
      or ta.staff_id = v_staff_id
    );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      t.id,
      t.code,
      t.status,
      t.amount_dong as "amountDong",
      t.money_kind as "moneyKind",
      t.content,
      t.from_account_id as "fromAccountId",
      fa.code as "fromAccountCode",
      fa.name as "fromAccountName",
      fs.full_name as "fromStaffName",
      t.to_account_id as "toAccountId",
      ta.code as "toAccountCode",
      ta.name as "toAccountName",
      ts.full_name as "toStaffName",
      t.created_by_email as "createdByEmail",
      t.created_at as "createdAt",
      t.confirmed_by_email as "confirmedByEmail",
      t.confirmed_at as "confirmedAt",
      t.cancelled_by_email as "cancelledByEmail",
      t.cancelled_at as "cancelledAt",
      t.cancel_reason as "cancelReason",
      t.transfer_group_id as "transferGroupId",
      (v_is_admin or ta.staff_id = v_staff_id) as "canConfirm",
      (v_is_admin or fa.staff_id = v_staff_id) as "canCancel"
    from public.pos_employee_cash_transfers t
    join public.pos_employee_cash_accounts fa on fa.id = t.from_account_id
    join public.pos_employee_cash_accounts ta on ta.id = t.to_account_id
    left join public.pos_staff fs on fs.id = fa.staff_id
    left join public.pos_staff ts on ts.id = ta.staff_id
    where (v_status is null or t.status = v_status)
      and (
        v_is_admin
        or fa.staff_id = v_staff_id
        or ta.staff_id = v_staff_id
      )
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0))
  );
end;
$$;

create or replace function public.pos_employee_cash_transfer_get(p_transfer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_row jsonb;
begin
  perform pos_private.require_pos_user();
  v_staff_id := pos_private.employee_cash_actor_staff_id();

  select row_to_json(x)::jsonb into v_row
  from (
    select
      t.id,
      t.code,
      t.status,
      t.amount_dong as "amountDong",
      t.money_kind as "moneyKind",
      t.content,
      t.from_account_id as "fromAccountId",
      fa.code as "fromAccountCode",
      fa.name as "fromAccountName",
      fs.full_name as "fromStaffName",
      fs.email as "fromStaffEmail",
      t.to_account_id as "toAccountId",
      ta.code as "toAccountCode",
      ta.name as "toAccountName",
      ts.full_name as "toStaffName",
      ts.email as "toStaffEmail",
      t.created_by_email as "createdByEmail",
      t.created_at as "createdAt",
      t.confirmed_by_email as "confirmedByEmail",
      t.confirmed_at as "confirmedAt",
      t.cancelled_by_email as "cancelledByEmail",
      t.cancelled_at as "cancelledAt",
      t.cancel_reason as "cancelReason",
      t.transfer_group_id as "transferGroupId",
      (v_is_admin or ta.staff_id = v_staff_id) as "canConfirm",
      (v_is_admin or fa.staff_id = v_staff_id) as "canCancel"
    from public.pos_employee_cash_transfers t
    join public.pos_employee_cash_accounts fa on fa.id = t.from_account_id
    join public.pos_employee_cash_accounts ta on ta.id = t.to_account_id
    left join public.pos_staff fs on fs.id = fa.staff_id
    left join public.pos_staff ts on ts.id = ta.staff_id
    where t.id = p_transfer_id
      and (
        v_is_admin
        or fa.staff_id = v_staff_id
        or ta.staff_id = v_staff_id
      )
  ) x;

  if v_row is null then
    raise exception 'EMP_CASH_TRANSFER_NOT_FOUND';
  end if;
  return v_row;
end;
$$;

revoke all on function public.pos_employee_cash_transfer_create(uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.pos_employee_cash_transfer_create(uuid, uuid, bigint, text, text) to authenticated, service_role;
