-- Spec §26: STAFF logs in and uses POS/customer/inventory.
-- ADMIN-only: dashboard revenue, staff CRUD, reports, audit, category admin.

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
      and s.role in ('ADMIN', 'STAFF')
  );
end;
$$;

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

create or replace function pos_private.require_pos_user()
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
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function pos_private.require_admin()
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
  if v_email = '' or not public.tlkv_is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function pos_private.get_session()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_role text;
  v_name text;
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_role := public.tlkv_staff_role();
  if v_role is null then
    v_role := 'ADMIN';
  end if;

  select s.full_name into v_name
  from public.pos_staff s
  where s.email = v_email
  limit 1;

  if v_name is null or v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'role', v_role,
    'full_name', v_name,
    'business_date', (timezone('Asia/Ho_Chi_Minh', now()))::date::text
  );
end;
$$;

create or replace function public.pos_get_session()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.get_session();
$$;

grant execute on function public.tlkv_has_pos_access() to authenticated, anon;
grant execute on function public.tlkv_is_admin() to authenticated, anon;
grant execute on function public.pos_get_session() to authenticated;

-- Operational RPCs: STAFF may call. Admin-only names stay on require_admin().
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_keep text[] := array[
    'require_admin',
    'require_pos_user',
    'get_dashboard',
    'get_session',
    'list_staff',
    'get_staff',
    'create_staff',
    'update_staff',
    'set_staff_active',
    'link_staff_auth',
    'delete_staff',
    'pos_get_dashboard',
    'pos_get_session',
    'pos_list_staff',
    'pos_get_staff',
    'pos_create_staff',
    'pos_update_staff',
    'pos_set_staff_active',
    'pos_link_staff_auth',
    'pos_delete_staff',
    'pos_list_audit_logs',
    'pos_get_reporting',
    'pos_list_categories',
    'pos_get_category',
    'pos_create_category',
    'pos_update_category',
    'pos_delete_category',
    'pos_list_assignable_skus'
  ];
begin
  for r in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('pos_private', 'public')
      and not (p.proname = any (v_keep))
      and pg_get_functiondef(p.oid) like '%pos_private.require_admin()%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'pos_private.require_admin()', 'pos_private.require_pos_user()');
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end;
$$;
