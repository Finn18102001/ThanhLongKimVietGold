-- P10 Module 2b: Chuyển tiền giữa Quỹ tiền NV — chứng từ CTCT, chờ xác nhận bên nhận.
-- Số dư chỉ đổi khi CONFIRMED. Không đụng CASH-001/BANK-001.

do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._p10_m2b_cash_transfer_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._p10_m2b_cash_transfer_note (note)
    values ('20261119021000_p10_employee_cash_transfer_ctct')
    on conflict do nothing;
  end if;
end $$;

create sequence if not exists public.pos_employee_cash_transfer_code_seq;

create table if not exists public.pos_employee_cash_transfers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  from_account_id uuid not null references public.pos_employee_cash_accounts (id) on delete restrict,
  to_account_id uuid not null references public.pos_employee_cash_accounts (id) on delete restrict,
  amount_dong bigint not null check (amount_dong > 0),
  content text not null check (char_length(trim(content)) > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  confirmed_by_email text null,
  confirmed_at timestamptz null,
  cancelled_by_email text null,
  cancelled_at timestamptz null,
  cancel_reason text null,
  transfer_group_id uuid null,
  constraint pos_employee_cash_transfers_accounts_diff check (from_account_id <> to_account_id),
  constraint pos_employee_cash_transfers_code_nonempty check (char_length(trim(code)) > 0)
);

create unique index if not exists pos_employee_cash_transfers_code_uidx
  on public.pos_employee_cash_transfers (code);

create index if not exists pos_employee_cash_transfers_status_idx
  on public.pos_employee_cash_transfers (status, created_at desc);

create index if not exists pos_employee_cash_transfers_from_idx
  on public.pos_employee_cash_transfers (from_account_id, created_at desc);

create index if not exists pos_employee_cash_transfers_to_idx
  on public.pos_employee_cash_transfers (to_account_id, created_at desc);

comment on table public.pos_employee_cash_transfers is
  'P10 chứng từ chuyển tiền Quỹ NV (CTCT). PENDING không đổi số dư; CONFIRMED ghi ledger 2 phía.';

alter table public.pos_employee_cash_transfers enable row level security;

drop policy if exists pos_employee_cash_transfers_select on public.pos_employee_cash_transfers;
create policy pos_employee_cash_transfers_select on public.pos_employee_cash_transfers
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1
      from public.pos_employee_cash_accounts a
      join public.pos_staff s on s.id = a.staff_id
      where a.kind = 'STAFF'
        and a.id in (pos_employee_cash_transfers.from_account_id, pos_employee_cash_transfers.to_account_id)
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and s.is_active
    )
  );

revoke all on table public.pos_employee_cash_transfers from public, anon, authenticated;
grant select on table public.pos_employee_cash_transfers to authenticated;
grant select, insert, update, delete on table public.pos_employee_cash_transfers to service_role;

create or replace function pos_private.employee_cash_actor_staff_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_id uuid;
begin
  select s.id into v_id
  from public.pos_staff s
  where lower(s.email) = lower(v_email) and s.is_active
  limit 1;
  return v_id;
end;
$$;

create or replace function pos_private.employee_cash_owns_account(p_account_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_staff_id uuid := pos_private.employee_cash_actor_staff_id();
begin
  if public.tlkv_is_admin() then
    return true;
  end if;
  if v_staff_id is null or p_account_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.pos_employee_cash_accounts a
    where a.id = p_account_id and a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
  );
end;
$$;

create or replace function public.pos_employee_cash_transfer_create(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_dong bigint,
  p_content text
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

  -- Người gửi phải sở hữu tài khoản gửi (Admin được tạo hộ).
  if not pos_private.employee_cash_owns_account(p_from_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_code := 'CTCT-' || lpad(nextval('public.pos_employee_cash_transfer_code_seq')::text, 6, '0');

  insert into public.pos_employee_cash_transfers (
    code, from_account_id, to_account_id, amount_dong, content, status, created_by_email
  ) values (
    v_code, p_from_account_id, p_to_account_id, p_amount_dong, v_content, 'PENDING', v_email
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'code', v_code,
    'status', 'PENDING',
    'amountDong', p_amount_dong,
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
    -- Idempotent: đã xác nhận rồi thì trả kết quả hiện có, không post lại.
    return jsonb_build_object(
      'ok', true,
      'id', v_tr.id,
      'code', v_tr.code,
      'status', v_tr.status,
      'transferGroupId', v_tr.transfer_group_id,
      'alreadyConfirmed', true
    );
  end if;

  if v_tr.status <> 'PENDING' then
    raise exception 'EMP_CASH_TRANSFER_NOT_PENDING';
  end if;

  -- Chỉ người nhận (hoặc Admin) được xác nhận.
  if not pos_private.employee_cash_owns_account(v_tr.to_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_from from public.pos_employee_cash_accounts where id = v_tr.from_account_id for update;
  select * into v_to from public.pos_employee_cash_accounts where id = v_tr.to_account_id for update;

  if v_from.id is null or v_to.id is null or not v_from.is_active or not v_to.is_active then
    raise exception 'EMP_CASH_TRANSFER_ACCOUNT_INVALID';
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
    'emp_cash_transfer', v_source_a, v_group
  );
  v_ledger_to := pos_private.employee_cash_post(
    v_tr.to_account_id, 'TRANSFER', 'IN', v_tr.amount_dong, v_content, v_email, now(), null,
    'employee_cash_transfer', v_tr.id, v_tr.code,
    'emp_cash_transfer', v_source_b, v_group
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
    'alreadyConfirmed', false
  );
end;
$$;

create or replace function public.pos_employee_cash_transfer_cancel(
  p_transfer_id uuid,
  p_reason text default null
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
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();

  select * into v_tr
  from public.pos_employee_cash_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'EMP_CASH_TRANSFER_NOT_FOUND';
  end if;
  if v_tr.status <> 'PENDING' then
    raise exception 'EMP_CASH_TRANSFER_NOT_PENDING';
  end if;

  -- Người gửi hoặc Admin được hủy.
  if not pos_private.employee_cash_owns_account(v_tr.from_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.pos_employee_cash_transfers
  set status = 'CANCELLED',
      cancelled_by_email = v_email,
      cancelled_at = now(),
      cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = v_tr.id;

  return jsonb_build_object('ok', true, 'id', v_tr.id, 'code', v_tr.code, 'status', 'CANCELLED');
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

revoke all on function public.pos_employee_cash_transfer_create(uuid, uuid, bigint, text) from public, anon;
revoke all on function public.pos_employee_cash_transfer_confirm(uuid) from public, anon;
revoke all on function public.pos_employee_cash_transfer_cancel(uuid, text) from public, anon;
revoke all on function public.pos_employee_cash_transfer_list(text, integer, integer) from public, anon;
revoke all on function public.pos_employee_cash_transfer_get(uuid) from public, anon;

grant execute on function public.pos_employee_cash_transfer_create(uuid, uuid, bigint, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_transfer_confirm(uuid) to authenticated, service_role;
grant execute on function public.pos_employee_cash_transfer_cancel(uuid, text) to authenticated, service_role;
grant execute on function public.pos_employee_cash_transfer_list(text, integer, integer) to authenticated, service_role;
grant execute on function public.pos_employee_cash_transfer_get(uuid) to authenticated, service_role;
