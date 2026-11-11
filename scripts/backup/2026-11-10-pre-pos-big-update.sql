-- Snapshot toàn bộ dữ liệu + định nghĩa DB trước POS big update (Giai đoạn 1–7).
-- Schema backup KHÔNG nằm trong exposed schemas của Data API; revoke mọi role client.
-- Chỉ thêm object mới, không sửa/xóa dữ liệu đang chạy.
-- Rollback dữ liệu 1 bảng: xem docs/pos-big-update/00-BACKUP-ROLLBACK.md

create schema if not exists tlkv_backup_20261110;
revoke all on schema tlkv_backup_20261110 from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    order by 1
  loop
    execute format('drop table if exists tlkv_backup_20261110.%I', r.relname);
    execute format('create table tlkv_backup_20261110.%I as table public.%I', r.relname, r.relname);
  end loop;
end $$;

create table tlkv_backup_20261110._row_counts as
select c.relname as table_name,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as source_rows,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from tlkv_backup_20261110.%I', c.relname), false, true, '')))[1]::text::bigint as backup_rows,
       now() as captured_at
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';

create table tlkv_backup_20261110._columns as
select table_name, ordinal_position, column_name, data_type, udt_name,
       numeric_precision, numeric_scale, is_nullable, column_default
from information_schema.columns
where table_schema = 'public';

create table tlkv_backup_20261110._constraints as
select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace;

create table tlkv_backup_20261110._indexes as
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public';

create table tlkv_backup_20261110._routines as
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'pos_private') and p.prokind in ('f', 'p');

create table tlkv_backup_20261110._triggers as
select tgrelid::regclass::text as table_name, tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where not tgisinternal and tgrelid::regclass::text not like '%.%';

create table tlkv_backup_20261110._policies as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public';

create table tlkv_backup_20261110._table_grants as
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
group by 1, 2;

create table tlkv_backup_20261110._routine_grants as
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema in ('public', 'pos_private');

create table tlkv_backup_20261110._migrations as
select version, name from supabase_migrations.schema_migrations;

do $$
declare
  r record;
begin
  for r in select relname from pg_class where relnamespace = 'tlkv_backup_20261110'::regnamespace and relkind = 'r'
  loop
    execute format('revoke all on tlkv_backup_20261110.%I from public, anon, authenticated', r.relname);
    execute format('alter table tlkv_backup_20261110.%I enable row level security', r.relname);
  end loop;
end $$;
