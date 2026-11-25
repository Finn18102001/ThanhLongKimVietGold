-- F12 Future 1+2 — seed settings + low-level helpers (already applied on Production 2026-11-25).
-- Repo sync: keep identical version so migration history matches remote.
-- Default window 07:00–20:00 VN; session max 1440 minutes.
-- Dev override keys exist so hard-test can widen the window without redeploying SQL.

alter table public.pos_app_settings
  add column if not exists value_text text,
  add column if not exists value_int integer;

insert into public.pos_app_settings (key, value_bool, value_text, value_int)
values
  ('work_hours_dev_override', true, null, null),
  ('work_hours_start', false, '00:00', null),
  ('work_hours_end', false, '23:59', null),
  ('work_hours_warn_minutes', false, null, 0),
  ('session_dev_max_minutes', false, null, 1440)
on conflict (key) do nothing;

create or replace function pos_private.parse_hhmm(p_raw text, p_fallback time without time zone)
returns time without time zone
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text := trim(coalesce(p_raw, ''));
  v_h int;
  v_m int;
begin
  if v ~ '^\d{1,2}:\d{2}$' then
    v_h := split_part(v, ':', 1)::int;
    v_m := split_part(v, ':', 2)::int;
    if v_h between 0 and 23 and v_m between 0 and 59 then
      return make_time(v_h, v_m, 0);
    end if;
  end if;
  return p_fallback;
end;
$$;

create or replace function pos_private.vn_today_at(p_t time without time zone, p_next_day boolean default false)
returns timestamp with time zone
language sql
stable
set search_path to 'public'
as $$
  select (
    ((timezone('Asia/Ho_Chi_Minh', now()))::date + case when p_next_day then 1 else 0 end)
    + p_t
  ) at time zone 'Asia/Ho_Chi_Minh';
$$;

create or replace function pos_private.work_hours_dev_override_on()
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select coalesce(
    (select s.value_bool from public.pos_app_settings s where s.key = 'work_hours_dev_override'),
    false
  );
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
  v_end time := time '20:00';
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
    v_end := pos_private.parse_hhmm(v_raw_end, time '20:00');
    if v_end <= v_start then
      v_start := time '07:00';
      v_end := time '20:00';
    end if;
    v_warn := greatest(0, least(coalesce(v_raw_warn, 15), 24 * 60));
  end if;
  return query select v_start, v_end, v_warn, v_over;
end;
$$;

create or replace function pos_private.session_max_interval()
returns interval
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_mins int := 1440;
  v_raw int;
begin
  if pos_private.work_hours_dev_override_on() then
    select s.value_int into v_raw from public.pos_app_settings s where s.key = 'session_dev_max_minutes';
    if v_raw is not null and v_raw > 0 and v_raw <= 7 * 24 * 60 then
      v_mins := v_raw;
    end if;
  end if;
  return make_interval(mins => v_mins);
end;
$$;

create or replace function pos_private.auth_session_created_at()
returns timestamp with time zone
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
declare
  v_sid uuid;
  v_created timestamptz;
  v_uid uuid := auth.uid();
  v_claims json;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    v_claims := null;
  end;

  if v_claims is not null then
    begin
      v_sid := nullif(v_claims->>'session_id', '')::uuid;
    exception when others then
      v_sid := null;
    end;
  end if;

  if v_sid is not null then
    select s.created_at into v_created from auth.sessions s where s.id = v_sid;
    if v_created is not null then
      return v_created;
    end if;
  end if;

  if v_uid is null then
    return null;
  end if;

  select s.created_at into v_created
  from auth.sessions s
  where s.user_id = v_uid
  order by s.created_at desc
  limit 1;

  return v_created;
end;
$$;
