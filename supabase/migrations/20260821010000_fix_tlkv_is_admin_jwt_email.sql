-- Fix Forbidden after staff CRUD: JWT may omit email claim.
-- Resolve email via auth.uid() → auth.users, and disable RLS inside helpers.

create or replace function public.tlkv_current_email()
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_uid uuid;
begin
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_email <> '' then
    return v_email;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return '';
  end if;

  select lower(trim(u.email))
  into v_email
  from auth.users u
  where u.id = v_uid;

  return coalesce(v_email, '');
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

create or replace function public.tlkv_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_role text;
begin
  if v_email = '' then
    return null;
  end if;

  if exists (
    select 1
    from unnest(public.tlkv_admin_emails()) as e(email)
    where lower(trim(e.email)) = v_email
  ) then
    return 'ADMIN';
  end if;

  select s.role into v_role
  from public.pos_staff s
  where s.email = v_email
    and s.is_active
  limit 1;

  return v_role;
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
  v_email text;
begin
  v_email := public.tlkv_current_email();
  if v_email = '' or not public.tlkv_is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

grant execute on function public.tlkv_current_email() to authenticated, anon;
grant execute on function public.tlkv_is_admin() to authenticated, anon;
grant execute on function public.tlkv_staff_role() to authenticated, anon;
