-- Staff / employee directory for TLKV POS (spec §25–26).
-- Reuses Auth users; profiles live in public.pos_staff.
-- Bootstrap ADMIN emails from tlkv_admin_emails() remain valid.

create table if not exists public.pos_staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  staff_no text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  role text not null default 'STAFF'
    check (role in ('ADMIN', 'STAFF')),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_staff_email_lower_chk check (email = lower(trim(email))),
  constraint pos_staff_email_unique unique (email)
);

create index if not exists idx_pos_staff_role_active
  on public.pos_staff (role, is_active);

create index if not exists idx_pos_staff_full_name
  on public.pos_staff (full_name);

alter table public.pos_staff enable row level security;

drop policy if exists pos_staff_admin_select on public.pos_staff;
create policy pos_staff_admin_select
  on public.pos_staff for select to authenticated
  using (public.tlkv_is_admin());

-- No direct insert/update/delete via Data API — only security-definer RPCs.
revoke all on table public.pos_staff from anon, authenticated;
grant select on table public.pos_staff to authenticated;

-- Keep bootstrap email list, and also honor active ADMIN rows in pos_staff.
-- Resolve email via JWT claim or auth.users (JWT may omit email).
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

grant execute on function public.tlkv_current_email() to authenticated, anon;
grant execute on function public.tlkv_is_admin() to authenticated, anon;
grant execute on function public.tlkv_staff_role() to authenticated, anon;

create or replace function pos_private.next_staff_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  select coalesce(max((regexp_match(staff_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_n
  from public.pos_staff;
  return 'NV-' || lpad(v_n::text, 4, '0');
end;
$$;

create or replace function pos_private.staff_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.pos_staff%rowtype;
begin
  select * into v_row from public.pos_staff where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'auth_user_id', v_row.auth_user_id,
    'staff_no', v_row.staff_no,
    'full_name', v_row.full_name,
    'email', v_row.email,
    'phone', v_row.phone,
    'role', v_row.role,
    'is_active', v_row.is_active,
    'note', v_row.note,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function pos_private.list_staff(
  p_query text default '',
  p_role text default null,
  p_active boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_admin();

  select count(*)::integer into v_total
  from public.pos_staff s
  where (v_q = ''
      or s.full_name ilike '%' || v_q || '%'
      or s.email ilike '%' || v_q || '%'
      or coalesce(s.phone, '') ilike '%' || v_q || '%'
      or s.staff_no ilike '%' || v_q || '%')
    and (p_role is null or s.role = p_role)
    and (p_active is null or s.is_active = p_active);

  select coalesce(jsonb_agg(pos_private.staff_json(x.id) order by x.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select s.id, s.created_at
    from public.pos_staff s
    where (v_q = ''
        or s.full_name ilike '%' || v_q || '%'
        or s.email ilike '%' || v_q || '%'
        or coalesce(s.phone, '') ilike '%' || v_q || '%'
        or s.staff_no ilike '%' || v_q || '%')
      and (p_role is null or s.role = p_role)
      and (p_active is null or s.is_active = p_active)
    order by s.created_at desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function pos_private.get_staff(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff jsonb;
begin
  perform pos_private.require_admin();
  v_staff := pos_private.staff_json(p_id);
  if v_staff is null then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'staff', v_staff);
end;
$$;

create or replace function pos_private.create_staff(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_role text default 'STAFF',
  p_note text default null,
  p_auth_user_id uuid default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_full_name, ''));
  v_role text := upper(trim(coalesce(p_role, 'STAFF')));
  v_id uuid;
begin
  v_actor := pos_private.require_admin();

  if v_name = '' then
    raise exception 'Họ tên bắt buộc' using errcode = 'P0001';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Email không hợp lệ' using errcode = 'P0001';
  end if;
  if v_role not in ('ADMIN', 'STAFF') then
    raise exception 'Vai trò không hợp lệ' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pos_staff where email = v_email) then
    raise exception 'Email nhân viên đã tồn tại' using errcode = '23505';
  end if;

  insert into public.pos_staff (
    auth_user_id, staff_no, full_name, email, phone, role, is_active, note
  ) values (
    p_auth_user_id,
    pos_private.next_staff_no(),
    v_name,
    v_email,
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role,
    coalesce(p_is_active, true),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STAFF_CREATE', 'staff', v_id, 'Tạo nhân viên',
    jsonb_build_object('email', v_email, 'role', v_role)
  );

  return jsonb_build_object('ok', true, 'staff', pos_private.staff_json(v_id));
end;
$$;

create or replace function pos_private.update_staff(
  p_id uuid,
  p_full_name text,
  p_phone text default null,
  p_role text default null,
  p_note text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_name text := trim(coalesce(p_full_name, ''));
  v_role text;
begin
  v_actor := pos_private.require_admin();

  if not exists (select 1 from public.pos_staff where id = p_id) then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;
  if v_name = '' then
    raise exception 'Họ tên bắt buộc' using errcode = 'P0001';
  end if;

  if p_role is not null then
    v_role := upper(trim(p_role));
    if v_role not in ('ADMIN', 'STAFF') then
      raise exception 'Vai trò không hợp lệ' using errcode = 'P0001';
    end if;
  end if;

  update public.pos_staff
  set
    full_name = v_name,
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    role = coalesce(v_role, role),
    note = nullif(trim(coalesce(p_note, '')), ''),
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
  values (v_actor, 'STAFF_UPDATE', 'staff', p_id, 'Cập nhật nhân viên');

  return jsonb_build_object('ok', true, 'staff', pos_private.staff_json(p_id));
end;
$$;

create or replace function pos_private.set_staff_active(p_id uuid, p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  v_actor := pos_private.require_admin();

  if not exists (select 1 from public.pos_staff where id = p_id) then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;

  update public.pos_staff
  set is_active = p_is_active, updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    case when p_is_active then 'STAFF_ENABLE' else 'STAFF_DISABLE' end,
    'staff', p_id,
    case when p_is_active then 'Bật nhân viên' else 'Tắt nhân viên' end,
    jsonb_build_object('is_active', p_is_active)
  );

  return jsonb_build_object('ok', true, 'staff', pos_private.staff_json(p_id));
end;
$$;

create or replace function pos_private.link_staff_auth(p_id uuid, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  v_actor := pos_private.require_admin();

  if not exists (select 1 from public.pos_staff where id = p_id) then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;
  if p_auth_user_id is null then
    raise exception 'auth_user_id bắt buộc' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.pos_staff
    where auth_user_id = p_auth_user_id and id <> p_id
  ) then
    raise exception 'Tài khoản Auth đã gắn nhân viên khác' using errcode = '23505';
  end if;

  update public.pos_staff
  set auth_user_id = p_auth_user_id, updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STAFF_LINK_AUTH', 'staff', p_id, 'Gắn tài khoản đăng nhập',
    jsonb_build_object('auth_user_id', p_auth_user_id)
  );

  return jsonb_build_object('ok', true, 'staff', pos_private.staff_json(p_id));
end;
$$;

create or replace function pos_private.delete_staff(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_email text;
  v_auth uuid;
  v_self text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  v_actor := pos_private.require_admin();

  select email, auth_user_id into v_email, v_auth
  from public.pos_staff where id = p_id;
  if not found then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;
  if v_email = v_self then
    raise exception 'Không thể xóa tài khoản đang đăng nhập' using errcode = 'P0001';
  end if;

  delete from public.pos_staff where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STAFF_DELETE', 'staff', p_id, 'Xóa hồ sơ nhân viên',
    jsonb_build_object('email', v_email, 'auth_user_id', v_auth)
  );

  return jsonb_build_object('ok', true, 'auth_user_id', v_auth, 'email', v_email);
end;
$$;

-- Seed bootstrap admins (profile only; auth_user_id linked later / on next create).
insert into public.pos_staff (staff_no, full_name, email, role, is_active, note)
select
  'NV-' || lpad(gs.ord::text, 4, '0'),
  split_part(gs.email, '@', 1),
  lower(trim(gs.email)),
  'ADMIN',
  true,
  'Seed từ danh sách admin bootstrap'
from unnest(public.tlkv_admin_emails()) with ordinality as gs(email, ord)
on conflict (email) do nothing;

-- Public wrappers
create or replace function public.pos_list_staff(
  p_query text default '',
  p_role text default null,
  p_active boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.list_staff(p_query, p_role, p_active, p_limit, p_offset);
$$;

create or replace function public.pos_get_staff(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.get_staff(p_id);
$$;

create or replace function public.pos_create_staff(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_role text default 'STAFF',
  p_note text default null,
  p_auth_user_id uuid default null,
  p_is_active boolean default true
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.create_staff(
    p_full_name, p_email, p_phone, p_role, p_note, p_auth_user_id, p_is_active
  );
$$;

create or replace function public.pos_update_staff(
  p_id uuid,
  p_full_name text,
  p_phone text default null,
  p_role text default null,
  p_note text default null,
  p_is_active boolean default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.update_staff(p_id, p_full_name, p_phone, p_role, p_note, p_is_active);
$$;

create or replace function public.pos_set_staff_active(p_id uuid, p_is_active boolean)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.set_staff_active(p_id, p_is_active);
$$;

create or replace function public.pos_link_staff_auth(p_id uuid, p_auth_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.link_staff_auth(p_id, p_auth_user_id);
$$;

create or replace function public.pos_delete_staff(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select pos_private.delete_staff(p_id);
$$;

grant execute on function public.pos_list_staff(text, text, boolean, integer, integer) to authenticated;
grant execute on function public.pos_get_staff(uuid) to authenticated;
grant execute on function public.pos_create_staff(text, text, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.pos_update_staff(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.pos_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.pos_link_staff_auth(uuid, uuid) to authenticated;
grant execute on function public.pos_delete_staff(uuid) to authenticated;
