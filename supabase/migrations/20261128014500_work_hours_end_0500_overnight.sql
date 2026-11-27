-- Work hours: tan ca 05:00 VN (overnight 07:00 → next-day 05:00).
-- Fixes same-day-only assert/get_session/open/reconcile which blocked STAFF after 20:00
-- and would reject end < start.

create or replace function pos_private.work_hours_is_within(
  p_local time without time zone,
  p_start time without time zone,
  p_end time without time zone
)
returns boolean
language sql
immutable
as $$
  select case
    when p_start < p_end then (p_local >= p_start and p_local < p_end)
    when p_start > p_end then (p_local >= p_start or p_local < p_end) -- overnight
    else false
  end;
$$;

create or replace function pos_private.work_hours_next_end_at(
  p_local time without time zone,
  p_start time without time zone,
  p_end time without time zone
)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
begin
  if p_start < p_end then
    -- Same calendar day window.
    if p_local < p_end then
      return pos_private.vn_today_at(p_end, false);
    end if;
    return pos_private.vn_today_at(p_end, true);
  elsif p_start > p_end then
    -- Overnight: end is early morning; if already past midnight before end → today, else tomorrow.
    if p_local < p_end then
      return pos_private.vn_today_at(p_end, false);
    end if;
    return pos_private.vn_today_at(p_end, true);
  end if;
  return pos_private.vn_today_at(p_end, true);
end;
$$;

create or replace function pos_private.work_hours_window()
returns table(
  start_t time without time zone,
  end_t time without time zone,
  warn_minutes integer,
  override_active boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_over boolean := pos_private.work_hours_dev_override_on();
  v_start time := time '07:00';
  v_end time := time '05:00'; -- production default tan ca
  v_warn int := 15;
  v_raw_start text;
  v_raw_end text;
  v_raw_warn int;
begin
  if v_over then
    select s.value_text into v_raw_start from public.pos_app_settings s where s.key = 'work_hours_start';
    select s.value_text into v_raw_end from public.pos_app_settings s where s.key = 'work_hours_end';
    select s.value_int into v_raw_warn from public.pos_app_settings s where s.key = 'work_hours_warn_minutes';
    v_start := pos_private.parse_hhmm(v_raw_start, time '07:00');
    v_end := pos_private.parse_hhmm(v_raw_end, time '05:00');
    -- Zero-width window invalid → fall back to production overnight default.
    if v_start = v_end then
      v_start := time '07:00';
      v_end := time '05:00';
    end if;
    v_warn := greatest(0, least(coalesce(v_raw_warn, 15), 24 * 60));
  end if;
  return query select v_start, v_end, v_warn, v_over;
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
  if not pos_private.work_hours_is_within(v_local, v_start, v_end) then
    raise exception 'Đã hết ca làm việc.'
      using errcode = 'P0001';
  end if;
end;
$$;

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
  v_sid uuid;
  v_otp_required boolean;
  v_otp_verified boolean := false;
  v_verified_at timestamptz;
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

  v_sid := pos_private.current_auth_session_id();
  v_otp_required := pos_private.otp_email_requires_step2(v_email);
  if v_otp_required and v_sid is not null then
    select v.verified_at into v_verified_at
    from public.pos_login_otp_verified v
    where v.session_id = v_sid
      and lower(v.email) = lower(v_email);
    v_otp_verified := v_verified_at is not null;
  end if;

  if v_otp_required and v_otp_verified then
    v_created := v_verified_at;
  else
    v_created := pos_private.auth_session_created_at();
  end if;
  if v_created is not null then
    v_expires := v_created + pos_private.session_max_interval();
  end if;

  select w.start_t, w.end_t, w.warn_minutes, w.override_active
    into v_start, v_end, v_warn, v_over
  from pos_private.work_hours_window() w;

  v_applies := not public.tlkv_can_admin_read();
  v_local := (timezone('Asia/Ho_Chi_Minh', now()))::time;
  v_within := pos_private.work_hours_is_within(v_local, v_start, v_end);
  v_end_at := pos_private.work_hours_next_end_at(v_local, v_start, v_end);

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
    'otp', jsonb_build_object(
      'required', v_otp_required,
      'verified', v_otp_verified,
      'verified_at', v_verified_at
    ),
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

create or replace function pos_private.reconcile_stale_work_shifts(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_start time;
  v_end time;
  v_count integer := 0;
  r record;
  v_opened_local time;
  v_scheduled_end timestamptz;
begin
  select w.start_t, w.end_t into v_start, v_end from pos_private.work_hours_window() w;
  if v_end is null then
    v_start := time '07:00';
    v_end := time '05:00';
  end if;

  for r in
    select s.id, s.work_date, s.opened_at
    from public.pos_work_shifts s
    where s.status = 'active'
      and (p_user_id is null or s.user_id = p_user_id)
  loop
    v_opened_local := timezone('Asia/Ho_Chi_Minh', r.opened_at)::time;
    if v_start < v_end then
      v_scheduled_end := (r.work_date + v_end) at time zone 'Asia/Ho_Chi_Minh';
    else
      -- Overnight: evening open → next calendar day end; early-morning open → same day end.
      if v_opened_local >= v_start then
        v_scheduled_end := ((r.work_date + 1) + v_end) at time zone 'Asia/Ho_Chi_Minh';
      else
        v_scheduled_end := (r.work_date + v_end) at time zone 'Asia/Ho_Chi_Minh';
      end if;
    end if;

    if now() >= v_scheduled_end then
      update public.pos_work_shifts s
      set
        status = 'closed',
        closed_at = least(now(), v_scheduled_end),
        close_reason = 'auto_end_of_day',
        updated_at = now()
      where s.id = r.id
        and s.status = 'active';
      if found then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.pos_open_work_shift()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_name text;
  v_now_vn timestamp := timezone('Asia/Ho_Chi_Minh', now());
  v_work_date date := v_now_vn::date;
  v_start time;
  v_end time;
  v_row public.pos_work_shifts%rowtype;
begin
  if v_uid is null or v_email = '' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if public.tlkv_can_admin_read() then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'admin');
  end if;

  perform pos_private.reconcile_stale_work_shifts(v_uid);

  select w.start_t, w.end_t into v_start, v_end from pos_private.work_hours_window() w;
  if not pos_private.work_hours_is_within(v_now_vn::time, v_start, v_end) then
    raise exception 'Đã hết ca làm việc.' using errcode = 'P0001';
  end if;

  select s.id, s.full_name
    into v_staff_id, v_name
  from public.pos_staff s
  where lower(s.email) = lower(v_email)
  limit 1;

  v_name := coalesce(nullif(trim(v_name), ''), split_part(v_email, '@', 1));

  select * into v_row
  from public.pos_work_shifts s
  where s.user_id = v_uid and s.status = 'active'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'id', v_row.id,
      'opened_at', v_row.opened_at,
      'already_open', true
    );
  end if;

  insert into public.pos_work_shifts (
    user_id, staff_id, employee_email, employee_name, work_date, opened_at, status
  ) values (
    v_uid, v_staff_id, lower(v_email), v_name, v_work_date, now(), 'active'
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'opened_at', v_row.opened_at,
    'already_open', false
  );
end;
$$;

create or replace function public.pos_set_work_hours_dev_config(
  p_enabled boolean,
  p_start text default '07:00',
  p_end text default '05:00',
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
  v_end := pos_private.parse_hhmm(p_end, time '05:00');
  if v_start = v_end then
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

update public.pos_app_settings
set value_text = '05:00',
    updated_at = now(),
    updated_by = 'migration:20261128014500'
where key = 'work_hours_end'
  and coalesce(value_text, '') <> '05:00';
