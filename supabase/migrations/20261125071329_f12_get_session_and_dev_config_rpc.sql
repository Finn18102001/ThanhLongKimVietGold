-- F12 — enriched pos_get_session + admin RPC to toggle work-hours / session dev config.

create or replace function pos_private.get_session()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
  v_role text;
  v_name text;
  v_staff_id uuid;
  v_shared boolean := false;
  v_created timestamptz;
  v_expires timestamptz;
  v_start time;
  v_end time;
  v_warn int;
  v_over boolean;
  v_local time;
  v_within boolean;
  v_end_at timestamptz;
  v_warn_at timestamptz;
  v_applies boolean;
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_role := public.tlkv_staff_role();
  if v_role is null then
    v_role := 'ADMIN';
  end if;

  select s.id, s.full_name, coalesce(s.is_shared, false)
    into v_staff_id, v_name, v_shared
  from public.pos_staff s
  where s.email = v_email
  limit 1;

  if v_name is null or v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  v_created := pos_private.auth_session_created_at();
  if v_created is not null then
    v_expires := v_created + pos_private.session_max_interval();
  end if;

  select w.start_t, w.end_t, w.warn_minutes, w.override_active
    into v_start, v_end, v_warn, v_over
  from pos_private.work_hours_window() w;

  v_applies := not public.tlkv_can_admin_read();
  v_local := (timezone('Asia/Ho_Chi_Minh', now()))::time;
  v_within := (v_local >= v_start and v_local < v_end);

  if v_local < v_end then
    v_end_at := pos_private.vn_today_at(v_end, false);
  else
    v_end_at := pos_private.vn_today_at(v_end, true);
  end if;

  if v_warn > 0 then
    v_warn_at := v_end_at - make_interval(mins => v_warn);
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'role', v_role,
    'full_name', v_name,
    'staff_id', v_staff_id,
    'is_shared', v_shared,
    'business_date', (timezone('Asia/Ho_Chi_Minh', now()))::date::text,
    'session_created_at', v_created,
    'session_expires_at', v_expires,
    'work_hours', jsonb_build_object(
      'applies', v_applies,
      'within', v_within,
      'start', to_char(v_start, 'HH24:MI'),
      'end', to_char(v_end, 'HH24:MI'),
      'warn_minutes', v_warn,
      'override_active', v_over,
      'end_at', v_end_at,
      'warn_at', v_warn_at
    )
  );
end;
$$;

create or replace function public.pos_get_session()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select pos_private.get_session();
$$;

create or replace function public.pos_set_work_hours_dev_config(
  p_enabled boolean,
  p_start text default '07:00',
  p_end text default '20:00',
  p_warn_minutes integer default 15,
  p_session_max_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
  v_start time;
  v_end time;
begin
  v_actor := pos_private.require_admin();

  v_start := pos_private.parse_hhmm(p_start, time '07:00');
  v_end := pos_private.parse_hhmm(p_end, time '20:00');
  if v_end <= v_start then
    raise exception 'WORK_HOURS_INVALID_WINDOW';
  end if;
  if p_warn_minutes is null or p_warn_minutes < 0 or p_warn_minutes > 24 * 60 then
    raise exception 'WORK_HOURS_INVALID_WARN';
  end if;
  if p_session_max_minutes is null or p_session_max_minutes < 1 or p_session_max_minutes > 7 * 24 * 60 then
    raise exception 'SESSION_MAX_INVALID';
  end if;

  insert into public.pos_app_settings (key, value_bool, updated_by)
  values
    ('work_hours_dev_override', false, v_actor),
    ('work_hours_start', false, v_actor),
    ('work_hours_end', false, v_actor),
    ('work_hours_warn_minutes', false, v_actor),
    ('session_dev_max_minutes', false, v_actor)
  on conflict (key) do nothing;

  update public.pos_app_settings
    set value_bool = coalesce(p_enabled, false),
        value_text = null,
        value_int = null,
        updated_at = now(),
        updated_by = v_actor
  where key = 'work_hours_dev_override';

  update public.pos_app_settings
    set value_text = to_char(v_start, 'HH24:MI'),
        value_bool = false,
        updated_at = now(),
        updated_by = v_actor
  where key = 'work_hours_start';

  update public.pos_app_settings
    set value_text = to_char(v_end, 'HH24:MI'),
        value_bool = false,
        updated_at = now(),
        updated_by = v_actor
  where key = 'work_hours_end';

  update public.pos_app_settings
    set value_int = p_warn_minutes,
        value_bool = false,
        updated_at = now(),
        updated_by = v_actor
  where key = 'work_hours_warn_minutes';

  update public.pos_app_settings
    set value_int = p_session_max_minutes,
        value_bool = false,
        updated_at = now(),
        updated_by = v_actor
  where key = 'session_dev_max_minutes';

  return jsonb_build_object(
    'ok', true,
    'override_active', coalesce(p_enabled, false),
    'start', to_char(v_start, 'HH24:MI'),
    'end', to_char(v_end, 'HH24:MI'),
    'warn_minutes', p_warn_minutes,
    'session_max_minutes', p_session_max_minutes,
    'updated_by', v_actor
  );
end;
$$;

revoke all on function public.pos_set_work_hours_dev_config(boolean, text, text, integer, integer)
  from public, anon;
grant execute on function public.pos_set_work_hours_dev_config(boolean, text, text, integer, integer)
  to authenticated, service_role;

revoke all on function public.pos_get_session() from public, anon;
grant execute on function public.pos_get_session() to authenticated, service_role;
