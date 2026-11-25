-- P11 — Work shift attendance (STAFF open/close ledger).
-- §32.1: RPC-only table — revoke anon/authenticated; grant service_role; RLS on.
-- Independent of P10. Reuses Future 1 work_hours_window().

do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._p11_work_shift_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._p11_work_shift_note (note)
    values ('20261125161500_p11_work_shift_attendance: pos_work_shifts + open/close/list RPCs')
    on conflict do nothing;
  end if;
end $$;

create table if not exists public.pos_work_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  staff_id uuid null,
  employee_email text not null,
  employee_name text not null,
  work_date date not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  status text not null
    check (status in ('active', 'closed')),
  close_reason text null
    check (close_reason is null or close_reason in ('logout', 'auto_end_of_day')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_work_shifts_closed_consistency check (
    (status = 'active' and closed_at is null and close_reason is null)
    or (status = 'closed' and closed_at is not null and close_reason is not null)
  )
);

comment on table public.pos_work_shifts is
  'P11: STAFF work-shift open/close ledger (auto on login; close on logout or end-of-day).';

create unique index if not exists pos_work_shifts_one_active_per_user_uidx
  on public.pos_work_shifts (user_id)
  where status = 'active';

create index if not exists pos_work_shifts_work_date_idx
  on public.pos_work_shifts (work_date desc, opened_at desc);

create index if not exists pos_work_shifts_email_idx
  on public.pos_work_shifts (lower(employee_email), work_date desc);

alter table public.pos_work_shifts enable row level security;

-- Intentional: no direct Data API for authenticated/anon — only SECURITY DEFINER RPCs.
revoke all on table public.pos_work_shifts from public, anon, authenticated;
grant select, insert, update, delete on table public.pos_work_shifts to service_role;

create or replace function pos_private.reconcile_stale_work_shifts(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_end time;
  v_now_vn timestamp;
  v_today date;
  v_count integer := 0;
begin
  select w.end_t into v_end from pos_private.work_hours_window() w;
  if v_end is null then
    v_end := time '20:00';
  end if;

  v_now_vn := timezone('Asia/Ho_Chi_Minh', now());
  v_today := v_now_vn::date;

  update public.pos_work_shifts s
  set
    status = 'closed',
    closed_at = least(
      now(),
      ((s.work_date + v_end) at time zone 'Asia/Ho_Chi_Minh')
    ),
    close_reason = 'auto_end_of_day',
    updated_at = now()
  where s.status = 'active'
    and (p_user_id is null or s.user_id = p_user_id)
    and (
      s.work_date < v_today
      or (s.work_date = v_today and v_now_vn::time >= v_end)
    );

  get diagnostics v_count = row_count;
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

  -- Admin / Admin viewer: no staff attendance shift.
  if public.tlkv_can_admin_read() then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'admin');
  end if;

  perform pos_private.reconcile_stale_work_shifts(v_uid);

  select w.start_t, w.end_t into v_start, v_end from pos_private.work_hours_window() w;
  if v_now_vn::time < v_start or v_now_vn::time >= v_end then
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

create or replace function public.pos_close_work_shift(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := lower(trim(coalesce(p_reason, '')));
  v_row public.pos_work_shifts%rowtype;
begin
  if v_uid is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_reason not in ('logout', 'auto_end_of_day') then
    raise exception 'Invalid close reason' using errcode = '22023';
  end if;

  perform pos_private.reconcile_stale_work_shifts(v_uid);

  select * into v_row
  from public.pos_work_shifts s
  where s.user_id = v_uid and s.status = 'active'
  for update
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'closed', false, 'reason', 'none_open');
  end if;

  update public.pos_work_shifts
  set
    status = 'closed',
    closed_at = now(),
    close_reason = v_reason,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'closed', true,
    'id', v_row.id,
    'close_reason', v_row.close_reason,
    'closed_at', v_row.closed_at
  );
end;
$$;

create or replace function public.pos_work_shift_overview(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_day date := coalesce(p_date, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_opened int := 0;
  v_active int := 0;
  v_closed int := 0;
  v_auto int := 0;
begin
  if not public.tlkv_can_admin_read() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform pos_private.reconcile_stale_work_shifts(null);

  select count(distinct lower(employee_email)) into v_opened
  from public.pos_work_shifts
  where work_date = v_day;

  select count(*) into v_active
  from public.pos_work_shifts
  where work_date = v_day and status = 'active';

  select count(*) into v_closed
  from public.pos_work_shifts
  where work_date = v_day and status = 'closed';

  select count(*) into v_auto
  from public.pos_work_shifts
  where work_date = v_day
    and status = 'closed'
    and close_reason = 'auto_end_of_day';

  return jsonb_build_object(
    'date', v_day,
    'opened_staff_count', v_opened,
    'active_count', v_active,
    'closed_count', v_closed,
    'auto_closed_count', v_auto
  );
end;
$$;

create or replace function public.pos_list_work_shifts(
  p_from date default null,
  p_to date default null,
  p_email text default null,
  p_status text default null,
  p_close_reason text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_from date := coalesce(p_from, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_to date := coalesce(p_to, v_from);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_reason text := nullif(lower(trim(coalesce(p_close_reason, ''))), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total int := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if not public.tlkv_can_admin_read() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_to < v_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  if v_status is not null and v_status not in ('active', 'closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  if v_reason is not null and v_reason not in ('logout', 'auto_end_of_day') then
    raise exception 'Invalid close reason' using errcode = '22023';
  end if;

  perform pos_private.reconcile_stale_work_shifts(null);

  select count(*) into v_total
  from public.pos_work_shifts s
  where s.work_date between v_from and v_to
    and (v_email is null or lower(s.employee_email) = v_email)
    and (v_status is null or s.status = v_status)
    and (v_reason is null or s.close_reason = v_reason);

  select coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb)
    into v_items
  from (
    select
      s.id,
      s.user_id,
      s.staff_id,
      s.employee_email,
      s.employee_name,
      s.work_date,
      s.opened_at,
      s.closed_at,
      s.status,
      s.close_reason
    from public.pos_work_shifts s
    where s.work_date between v_from and v_to
      and (v_email is null or lower(s.employee_email) = v_email)
      and (v_status is null or s.status = v_status)
      and (v_reason is null or s.close_reason = v_reason)
    order by s.opened_at desc
    limit v_limit
    offset v_offset
  ) q;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'from', v_from,
    'to', v_to
  );
end;
$$;

-- Staff emails that appear in shifts (filter dropdown). Admin read only.
create or replace function public.pos_list_work_shift_staff()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
begin
  if not public.tlkv_can_admin_read() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'email', q.employee_email,
        'name', q.employee_name
      ) order by q.employee_name)
      from (
        select distinct on (lower(s.employee_email))
          lower(s.employee_email) as employee_email,
          s.employee_name
        from public.pos_work_shifts s
        order by lower(s.employee_email), s.opened_at desc
      ) q
    ),
    '[]'::jsonb
  );
end;
$$;

-- Wire reconcile into require_pos_user so browser-closed shifts close at first RPC after 20:00.
-- Keep Future 3 OTP + Future 2 session + Future 1 work-hours order.
create or replace function pos_private.require_pos_user()
returns text
language plpgsql
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
  perform pos_private.reconcile_stale_work_shifts(auth.uid());
  perform pos_private.assert_session_fresh();
  perform pos_private.assert_work_hours_for_staff();
  return v_email;
end;
$$;

revoke all on function public.pos_open_work_shift() from public, anon;
revoke all on function public.pos_close_work_shift(text) from public, anon;
revoke all on function public.pos_work_shift_overview(date) from public, anon;
revoke all on function public.pos_list_work_shifts(date, date, text, text, text, int, int) from public, anon;
revoke all on function public.pos_list_work_shift_staff() from public, anon;

grant execute on function public.pos_open_work_shift() to authenticated, service_role;
grant execute on function public.pos_close_work_shift(text) to authenticated, service_role;
grant execute on function public.pos_work_shift_overview(date) to authenticated, service_role;
grant execute on function public.pos_list_work_shifts(date, date, text, text, text, int, int) to authenticated, service_role;
grant execute on function public.pos_list_work_shift_staff() to authenticated, service_role;
