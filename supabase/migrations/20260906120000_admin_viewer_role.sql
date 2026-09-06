-- ADMIN_VIEWER: full admin read + STAFF-level mutations; no admin writes.
-- Does not change meaning of tlkv_is_admin() / require_admin() (full ADMIN only).

alter table public.pos_staff
  drop constraint if exists pos_staff_role_check;

alter table public.pos_staff
  add constraint pos_staff_role_check
  check (role = any (array['ADMIN'::text, 'STAFF'::text, 'ADMIN_VIEWER'::text]));

create or replace function public.tlkv_has_pos_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' then
    return false;
  end if;

  if exists (
    select 1
    from unnest(public.tlkv_admin_emails()) as e(email)
    where lower(trim(e.email)) = v_email
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.pos_staff s
    where s.email = v_email
      and s.is_active
      and s.role in ('ADMIN', 'STAFF', 'ADMIN_VIEWER')
  );
end;
$$;

-- Full admin only (writes). Unchanged semantics for ADMIN / STAFF.
create or replace function public.tlkv_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' then
    return false;
  end if;

  if exists (
    select 1
    from unnest(public.tlkv_admin_emails()) as e(email)
    where lower(trim(e.email)) = v_email
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.pos_staff s
    where s.email = v_email
      and s.role = 'ADMIN'
      and s.is_active
  );
end;
$$;

create or replace function public.tlkv_can_admin_read()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' then
    return false;
  end if;

  if exists (
    select 1
    from unnest(public.tlkv_admin_emails()) as e(email)
    where lower(trim(e.email)) = v_email
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.pos_staff s
    where s.email = v_email
      and s.is_active
      and s.role in ('ADMIN', 'ADMIN_VIEWER')
  );
end;
$$;

create or replace function pos_private.require_admin_reader()
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' or not public.tlkv_can_admin_read() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

grant execute on function public.tlkv_has_pos_access() to authenticated, anon;
grant execute on function public.tlkv_is_admin() to authenticated, anon;
grant execute on function public.tlkv_can_admin_read() to authenticated, anon;

-- Allow ADMIN to assign ADMIN_VIEWER on create/update.
do $patch$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pos_private'
      and p.proname in ('create_staff', 'update_staff')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(
      v_def,
      $s$v_role not in ('ADMIN', 'STAFF')$s$,
      $s$v_role not in ('ADMIN', 'STAFF', 'ADMIN_VIEWER')$s$
    );
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end;
$patch$;

-- Open admin READ RPCs to ADMIN_VIEWER; WRITE RPCs stay on require_admin().
do $read$
declare
  r record;
  v_def text;
  v_new text;
  v_read text[] := array[
    'pos_get_dashboard',
    'get_dashboard',
    'pos_list_staff',
    'list_staff',
    'pos_get_staff',
    'get_staff',
    'pos_list_audit_logs',
    'list_audit_logs',
    'pos_get_reporting',
    'get_reporting',
    'pos_list_categories',
    'list_categories',
    'pos_get_category',
    'get_category',
    'pos_list_assignable_skus',
    'list_assignable_skus',
    'pos_report_staff_sales',
    'pos_export_transactions',
    'pos_cashflow_overview',
    'pos_cashflow_list',
    'pos_cashflow_capital_by_group',
    'pos_customer_directory_stats'
  ];
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'pos_private')
      and p.proname = any (v_read)
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('pos_private.require_admin()' in v_def) = 0 then
      continue;
    end if;
    v_new := replace(v_def, 'pos_private.require_admin()', 'pos_private.require_admin_reader()');
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end;
$read$;

-- Widen SELECT policies so ADMIN_VIEWER can read admin tables used by UI.
drop policy if exists pos_cash_accounts_admin_select on public.pos_cash_accounts;
drop policy if exists pos_cash_ledger_admin_select on public.pos_cash_ledger;
drop policy if exists pos_staff_admin_select on public.pos_staff;

create policy pos_cash_accounts_admin_select
  on public.pos_cash_accounts for select to authenticated
  using (public.tlkv_can_admin_read());

create policy pos_cash_ledger_admin_select
  on public.pos_cash_ledger for select to authenticated
  using (public.tlkv_can_admin_read());

create policy pos_staff_admin_select
  on public.pos_staff for select to authenticated
  using (public.tlkv_can_admin_read());
