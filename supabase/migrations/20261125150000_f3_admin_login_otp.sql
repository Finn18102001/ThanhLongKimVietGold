-- Future 3 — OTP email challenge for fixed Admin allowlist (2 Gmails).
-- GRANT §32.1: explicit grants in this migration; RLS on; no anon.

-- Snapshot note (best-effort)
do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._f3_otp_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._f3_otp_note (note)
    values ('20261125150000_f3_admin_login_otp: challenges + verified + require_* gates')
    on conflict do nothing;
  end if;
end $$;

create extension if not exists pgcrypto with schema extensions;

insert into public.pos_app_settings (key, value_bool, value_text, value_int)
values
  ('otp_dev_return_code', true, null, null),
  ('otp_ttl_minutes', false, null, 10),
  ('otp_resend_seconds', false, null, 60)
on conflict (key) do nothing;

create table if not exists public.pos_login_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  session_id uuid not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_sent_at timestamptz not null default now(),
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists pos_login_otp_challenges_session_active_idx
  on public.pos_login_otp_challenges (session_id, created_at desc)
  where consumed_at is null;

create table if not exists public.pos_login_otp_verified (
  session_id uuid primary key,
  email text not null,
  verified_at timestamptz not null default now()
);

comment on table public.pos_login_otp_challenges is
  'F3: hashed email OTP challenges for Admin allowlist login step-2.';
comment on table public.pos_login_otp_verified is
  'F3: OTP verified for auth.sessions.id; 24h clock starts at verified_at for allowlist.';

alter table public.pos_login_otp_challenges enable row level security;
alter table public.pos_login_otp_verified enable row level security;

revoke all on table public.pos_login_otp_challenges from public, anon, authenticated;
revoke all on table public.pos_login_otp_verified from public, anon, authenticated;
grant select, insert, update, delete on table public.pos_login_otp_challenges to service_role;
grant select, insert, update, delete on table public.pos_login_otp_verified to service_role;

-- No direct Data API for authenticated — only via SECURITY DEFINER RPCs.
-- Intentional: avoid exposing OTP hashes via PostgREST.

create or replace function pos_private.otp_admin_allowlist()
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select array[
    'tuananh18101@gmail.com',
    'thanglongkimviet@gmail.com'
  ]::text[];
$$;

create or replace function pos_private.otp_email_requires_step2(p_email text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select lower(trim(coalesce(p_email, ''))) = any (
    select lower(unnest(pos_private.otp_admin_allowlist()))
  );
$$;

create or replace function pos_private.current_auth_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
declare
  v_claims json;
  v_sid uuid;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    v_claims := null;
  end;
  if v_claims is null then
    return null;
  end if;
  begin
    v_sid := nullif(v_claims->>'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;
  return v_sid;
end;
$$;

create or replace function pos_private.assert_admin_otp_verified()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
  v_sid uuid;
begin
  if not pos_private.otp_email_requires_step2(v_email) then
    return;
  end if;
  v_sid := pos_private.current_auth_session_id();
  if v_sid is null then
    raise exception 'Cần xác thực OTP email.'
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.pos_login_otp_verified v
    where v.session_id = v_sid
      and lower(v.email) = lower(v_email)
  ) then
    raise exception 'Cần xác thực OTP email.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Allowlist: 24h counted from OTP verified_at (SRS). Others: auth.sessions.created_at.
create or replace function pos_private.assert_session_fresh()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
  v_sid uuid;
  v_created timestamptz;
  v_verified timestamptz;
  v_max interval;
begin
  v_max := pos_private.session_max_interval();
  v_sid := pos_private.current_auth_session_id();

  if pos_private.otp_email_requires_step2(v_email) then
    if v_sid is null then
      raise exception 'Cần xác thực OTP email.'
        using errcode = 'P0001';
    end if;
    select v.verified_at into v_verified
    from public.pos_login_otp_verified v
    where v.session_id = v_sid
      and lower(v.email) = lower(v_email);
    if v_verified is null then
      raise exception 'Cần xác thực OTP email.'
        using errcode = 'P0001';
    end if;
    if v_verified + v_max <= now() then
      raise exception 'Phiên đăng nhập đã hết hạn.'
        using errcode = 'P0001';
    end if;
    return;
  end if;

  v_created := pos_private.auth_session_created_at();
  if v_created is null then
    return;
  end if;
  if v_created + v_max <= now() then
    raise exception 'Phiên đăng nhập đã hết hạn.'
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
  perform pos_private.assert_admin_otp_verified();
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
  perform pos_private.assert_admin_otp_verified();
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
  perform pos_private.assert_admin_otp_verified();
  perform pos_private.assert_session_fresh();
  return v_email;
end;
$$;

-- Enrich get_session with OTP status for allowlist UX.
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

create or replace function public.pos_get_session()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select pos_private.get_session();
$$;

create or replace function public.pos_create_login_otp_challenge()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
  v_sid uuid := pos_private.current_auth_session_id();
  v_code text;
  v_hash text;
  v_ttl int := 10;
  v_resend int := 60;
  v_raw_ttl int;
  v_raw_resend int;
  v_last timestamptz;
  v_dev boolean := false;
  v_id uuid;
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not pos_private.otp_email_requires_step2(v_email) then
    raise exception 'OTP_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_sid is null then
    raise exception 'OTP_NO_SESSION' using errcode = 'P0001';
  end if;

  select s.value_int into v_raw_ttl from public.pos_app_settings s where s.key = 'otp_ttl_minutes';
  select s.value_int into v_raw_resend from public.pos_app_settings s where s.key = 'otp_resend_seconds';
  select coalesce(s.value_bool, false) into v_dev from public.pos_app_settings s where s.key = 'otp_dev_return_code';
  if v_raw_ttl is not null and v_raw_ttl between 1 and 30 then
    v_ttl := v_raw_ttl;
  end if;
  if v_raw_resend is not null and v_raw_resend between 10 and 600 then
    v_resend := v_raw_resend;
  end if;

  select c.last_sent_at into v_last
  from public.pos_login_otp_challenges c
  where c.session_id = v_sid
    and c.consumed_at is null
  order by c.created_at desc
  limit 1;

  if v_last is not null and v_last + make_interval(secs => v_resend) > now() then
    raise exception 'OTP_RESEND_TOO_SOON'
      using errcode = 'P0001',
            detail = ceil(extract(epoch from (v_last + make_interval(secs => v_resend) - now())))::text;
  end if;

  -- Invalidate prior open challenges for this session.
  update public.pos_login_otp_challenges
    set consumed_at = now()
  where session_id = v_sid
    and consumed_at is null;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(extensions.digest(convert_to(v_code || '|' || v_sid::text || '|' || lower(v_email), 'utf8'), 'sha256'), 'hex');

  insert into public.pos_login_otp_challenges (email, session_id, code_hash, expires_at, last_sent_at)
  values (lower(v_email), v_sid, v_hash, now() + make_interval(mins => v_ttl), now())
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_id,
    'email', lower(v_email),
    'expires_in_seconds', v_ttl * 60,
    'resend_after_seconds', v_resend,
    -- `code` for server mailer only; app must not put in URL when SMTP succeeds.
    'code', v_code,
    'dev_code', case when v_dev then v_code else null end
  );
end;
$$;

create or replace function public.pos_verify_login_otp(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
  v_sid uuid := pos_private.current_auth_session_id();
  v_row public.pos_login_otp_challenges%rowtype;
  v_hash text;
  v_code text := trim(coalesce(p_code, ''));
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not pos_private.otp_email_requires_step2(v_email) then
    raise exception 'OTP_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_sid is null then
    raise exception 'OTP_NO_SESSION' using errcode = 'P0001';
  end if;
  if v_code !~ '^\d{6}$' then
    raise exception 'OTP_INVALID' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.pos_login_otp_challenges c
  where c.session_id = v_sid
    and c.consumed_at is null
  order by c.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'OTP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_row.expires_at <= now() then
    update public.pos_login_otp_challenges set consumed_at = now() where id = v_row.id;
    raise exception 'OTP_EXPIRED' using errcode = 'P0001';
  end if;
  if v_row.attempts >= v_row.max_attempts then
    update public.pos_login_otp_challenges set consumed_at = now() where id = v_row.id;
    raise exception 'OTP_TOO_MANY_ATTEMPTS' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(convert_to(v_code || '|' || v_sid::text || '|' || lower(v_email), 'utf8'), 'sha256'), 'hex');
  if v_hash <> v_row.code_hash then
    update public.pos_login_otp_challenges
      set attempts = attempts + 1
    where id = v_row.id;
    raise exception 'OTP_INVALID' using errcode = 'P0001';
  end if;

  update public.pos_login_otp_challenges
    set consumed_at = now(), attempts = attempts + 1
  where id = v_row.id;

  insert into public.pos_login_otp_verified (session_id, email, verified_at)
  values (v_sid, lower(v_email), now())
  on conflict (session_id) do update
    set email = excluded.email,
        verified_at = excluded.verified_at;

  return jsonb_build_object(
    'ok', true,
    'verified_at', now(),
    'session_id', v_sid
  );
end;
$$;

revoke all on function public.pos_create_login_otp_challenge() from public, anon;
revoke all on function public.pos_verify_login_otp(text) from public, anon;
grant execute on function public.pos_create_login_otp_challenge() to authenticated, service_role;
grant execute on function public.pos_verify_login_otp(text) to authenticated, service_role;
revoke all on function public.pos_get_session() from public, anon;
grant execute on function public.pos_get_session() to authenticated, service_role;
