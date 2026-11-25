-- F12 — assert helpers + wire into require_* (Production already applied).

create or replace function pos_private.assert_session_fresh()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_created timestamptz;
  v_max interval;
begin
  v_created := pos_private.auth_session_created_at();
  if v_created is null then
    return;
  end if;
  v_max := pos_private.session_max_interval();
  if v_created + v_max <= now() then
    raise exception 'Phiên đăng nhập đã hết hạn.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function pos_private.assert_work_hours_for_staff()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_local time;
  v_start time;
  v_end time;
  v_warn int;
  v_over boolean;
begin
  if public.tlkv_can_admin_read() then
    return;
  end if;

  select w.start_t, w.end_t, w.warn_minutes, w.override_active
    into v_start, v_end, v_warn, v_over
  from pos_private.work_hours_window() w;

  v_local := (timezone('Asia/Ho_Chi_Minh', now()))::time;
  if v_local < v_start or v_local >= v_end then
    raise exception 'Đã hết ca làm việc.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function pos_private.require_pos_user()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pos_private.assert_session_fresh();
  perform pos_private.assert_work_hours_for_staff();
  return v_email;
end;
$$;

create or replace function pos_private.require_admin()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' or not public.tlkv_is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pos_private.assert_session_fresh();
  return v_email;
end;
$$;

create or replace function pos_private.require_admin_reader()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' or not public.tlkv_can_admin_read() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pos_private.assert_session_fresh();
  return v_email;
end;
$$;
