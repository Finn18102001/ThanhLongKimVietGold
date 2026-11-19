-- P10 Module 1: Feature Flag Quỹ nhân viên (pos_employee_fund_enabled).
-- Default OFF. Admin toggles via RPC; ENV TLKV_EMPLOYEE_FUND_FORCE_OFF=1 ép tắt (app layer).
-- Backup: bảng mới — ghi nhận vào tlkv_backup catalog nếu schema backup còn.

-- Snapshot meta (không đụng bảng giao dịch)
do $$
begin
  if to_regclass('tlkv_backup_20261110._routines') is not null then
    create table if not exists tlkv_backup_20261110._p10_m1_feature_flag_note (
      note text primary key,
      created_at timestamptz not null default now()
    );
    insert into tlkv_backup_20261110._p10_m1_feature_flag_note (note)
    values ('20261119010000_p10_employee_fund_feature_flag: create public.pos_app_settings + get/set bool RPCs')
    on conflict do nothing;
  end if;
end $$;

create table if not exists public.pos_app_settings (
  key text primary key check (char_length(trim(key)) > 0),
  value_bool boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text null
);

comment on table public.pos_app_settings is
  'Cấu hình app POS (key-value bool). P10: pos_employee_fund_enabled mặc định false.';

alter table public.pos_app_settings enable row level security;

drop policy if exists pos_app_settings_select_pos on public.pos_app_settings;
create policy pos_app_settings_select_pos on public.pos_app_settings
  for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_app_settings_admin_write on public.pos_app_settings;
create policy pos_app_settings_admin_write on public.pos_app_settings
  for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

revoke all on table public.pos_app_settings from public, anon, authenticated;
grant select on table public.pos_app_settings to authenticated;
grant select, insert, update, delete on table public.pos_app_settings to service_role;

insert into public.pos_app_settings (key, value_bool, updated_by)
values ('pos_employee_fund_enabled', false, 'migration:20261119010000')
on conflict (key) do nothing;

create or replace function public.pos_get_app_setting_bool(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_val boolean;
begin
  perform pos_private.require_pos_user();
  if p_key is null or trim(p_key) = '' then
    raise exception 'APP_SETTING_KEY_REQUIRED';
  end if;

  select s.value_bool into v_val
  from public.pos_app_settings s
  where s.key = trim(p_key);

  return coalesce(v_val, false);
end;
$$;

create or replace function public.pos_set_app_setting_bool(p_key text, p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_key text;
begin
  v_actor := pos_private.require_admin();
  v_key := trim(coalesce(p_key, ''));
  if v_key = '' then
    raise exception 'APP_SETTING_KEY_REQUIRED';
  end if;
  if p_value is null then
    raise exception 'APP_SETTING_VALUE_REQUIRED';
  end if;

  insert into public.pos_app_settings (key, value_bool, updated_at, updated_by)
  values (v_key, p_value, now(), v_actor)
  on conflict (key) do update
    set value_bool = excluded.value_bool,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return p_value;
end;
$$;

revoke all on function public.pos_get_app_setting_bool(text) from public, anon;
revoke all on function public.pos_set_app_setting_bool(text, boolean) from public, anon;
grant execute on function public.pos_get_app_setting_bool(text) to authenticated;
grant execute on function public.pos_set_app_setting_bool(text, boolean) to authenticated;
grant execute on function public.pos_get_app_setting_bool(text) to service_role;
grant execute on function public.pos_set_app_setting_bool(text, boolean) to service_role;
