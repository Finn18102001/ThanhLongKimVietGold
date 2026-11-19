-- P10 Module 4 — Phiếu yêu cầu thu/chi (YC-THU / YC-CHI)
-- Snapshot trước khi áp: docs/pos-big-update/00-BACKUP-ROLLBACK.md → tlkv_backup_20261110
-- §32.1: GRANT tường minh trong cùng migration. RPC-only write cho authenticated.

create table if not exists public.pos_employee_cash_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null,
  status text not null default 'PENDING',
  amount_dong bigint not null,
  payment_method text not null default 'CASH',
  content text not null,
  note text,
  source_type text not null,
  source_id uuid not null,
  source_code text,
  customer_id uuid,
  customer_name text,
  customer_cccd text,
  related_gold_account_id uuid references public.pos_employee_gold_accounts (id) on delete set null,
  related_staff_id uuid references public.pos_staff (id) on delete set null,
  related_staff_name text,
  requested_by_email text not null,
  cash_account_id uuid references public.pos_employee_cash_accounts (id) on delete restrict,
  confirmed_by_email text,
  confirmed_at timestamptz,
  ledger_id uuid references public.pos_employee_cash_ledger (id) on delete set null,
  rejected_by_email text,
  rejected_at timestamptz,
  reject_reason text,
  lines_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_employee_cash_requests_code_nonempty check (char_length(trim(code)) > 0),
  constraint pos_employee_cash_requests_kind_chk check (kind in ('THU', 'CHI')),
  constraint pos_employee_cash_requests_status_chk check (status in ('PENDING', 'CONFIRMED', 'REJECTED')),
  constraint pos_employee_cash_requests_source_chk check (source_type in ('sale', 'buy')),
  constraint pos_employee_cash_requests_amount_chk check (amount_dong > 0),
  constraint pos_employee_cash_requests_method_chk check (payment_method in ('CASH', 'TRANSFER', 'CARD', 'MIXED')),
  constraint pos_employee_cash_requests_content_chk check (char_length(trim(content)) > 0)
);

create unique index if not exists pos_employee_cash_requests_code_uidx
  on public.pos_employee_cash_requests (code);

create index if not exists pos_employee_cash_requests_status_idx
  on public.pos_employee_cash_requests (status, created_at desc);

create index if not exists pos_employee_cash_requests_source_idx
  on public.pos_employee_cash_requests (source_type, source_id);

create index if not exists pos_employee_cash_requests_pending_idx
  on public.pos_employee_cash_requests (created_at desc)
  where status = 'PENDING';

comment on table public.pos_employee_cash_requests is
  'P10 YC thu/chi từ HĐ bán/mua. Số dư Quỹ tiền chỉ đổi khi CONFIRMED.';

create sequence if not exists public.pos_employee_cash_yc_thu_seq;
create sequence if not exists public.pos_employee_cash_yc_chi_seq;

alter table public.pos_employee_cash_requests enable row level security;

drop policy if exists pos_employee_cash_requests_select on public.pos_employee_cash_requests;
create policy pos_employee_cash_requests_select on public.pos_employee_cash_requests
  for select to authenticated
  using (
    public.tlkv_is_admin()
    or exists (
      select 1
      from public.pos_staff s
      join public.pos_employee_cash_accounts a on a.staff_id = s.id and a.kind = 'STAFF' and a.is_active
      where lower(s.email) = lower(public.tlkv_current_email()) and s.is_active
    )
  );

revoke all on table public.pos_employee_cash_requests from public, anon, authenticated;
grant select on table public.pos_employee_cash_requests to authenticated;
grant select, insert, update, delete on table public.pos_employee_cash_requests to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function pos_private.employee_fund_flag_on()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_on boolean;
begin
  select value_bool into v_on
  from public.pos_app_settings
  where key = 'pos_employee_fund_enabled';
  return coalesce(v_on, false);
end;
$$;

create or replace function pos_private.employee_cash_request_next_code(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text := upper(trim(coalesce(p_kind, '')));
  v_n bigint;
begin
  if v_kind = 'THU' then
    v_n := nextval('public.pos_employee_cash_yc_thu_seq');
    return 'YC-THU-' || lpad(v_n::text, 6, '0');
  elsif v_kind = 'CHI' then
    v_n := nextval('public.pos_employee_cash_yc_chi_seq');
    return 'YC-CHI-' || lpad(v_n::text, 6, '0');
  end if;
  raise exception 'EMP_CASH_YC_KIND_INVALID';
end;
$$;

create or replace function pos_private.employee_cash_my_staff_account_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_id uuid;
begin
  select s.id into v_staff_id
  from public.pos_staff s
  where lower(s.email) = lower(v_email) and s.is_active
  limit 1;
  if v_staff_id is null then
    return null;
  end if;
  select a.id into v_id
  from public.pos_employee_cash_accounts a
  where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
  limit 1;
  return v_id;
end;
$$;

create or replace function pos_private.employee_cash_request_create(
  p_kind text,
  p_amount_dong bigint,
  p_payment_method text,
  p_content text,
  p_source_type text,
  p_source_id uuid,
  p_source_code text,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_cccd text default null,
  p_related_staff_id uuid default null,
  p_related_staff_name text default null,
  p_related_gold_account_id uuid default null,
  p_note text default null,
  p_lines jsonb default '[]'::jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text := upper(trim(coalesce(p_kind, '')));
  v_method text := upper(trim(coalesce(p_payment_method, 'CASH')));
  v_source text := lower(trim(coalesce(p_source_type, '')));
  v_actor text := coalesce(nullif(trim(coalesce(p_actor_email, '')), ''), public.tlkv_current_email());
  v_code text;
  v_id uuid;
  v_content text;
begin
  if v_kind not in ('THU', 'CHI') then raise exception 'EMP_CASH_YC_KIND_INVALID'; end if;
  if p_amount_dong is null or p_amount_dong <= 0 then raise exception 'EMP_CASH_YC_AMOUNT_INVALID'; end if;
  if v_source not in ('sale', 'buy') then raise exception 'EMP_CASH_YC_SOURCE_INVALID'; end if;
  if p_source_id is null then raise exception 'EMP_CASH_YC_SOURCE_REQUIRED'; end if;
  if v_method not in ('CASH', 'TRANSFER', 'CARD', 'MIXED') then
    v_method := 'CASH';
  end if;
  v_content := nullif(trim(coalesce(p_content, '')), '');
  if v_content is null then
    v_content := case when v_kind = 'THU' then 'Yêu cầu thu tiền từ hóa đơn' else 'Yêu cầu chi tiền theo phiếu mua' end;
  end if;

  -- Không tạo YC trùng PENDING cùng nguồn + số tiền (tránh double F9)
  select id, code into v_id, v_code
  from public.pos_employee_cash_requests
  where source_type = v_source
    and source_id = p_source_id
    and amount_dong = p_amount_dong
    and status = 'PENDING'
  limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', true);
  end if;

  v_code := pos_private.employee_cash_request_next_code(v_kind);
  insert into public.pos_employee_cash_requests (
    code, kind, status, amount_dong, payment_method, content, note,
    source_type, source_id, source_code,
    customer_id, customer_name, customer_cccd,
    related_gold_account_id, related_staff_id, related_staff_name,
    requested_by_email, lines_json
  ) values (
    v_code, v_kind, 'PENDING', p_amount_dong, v_method, v_content,
    nullif(trim(coalesce(p_note, '')), ''),
    v_source, p_source_id, nullif(trim(coalesce(p_source_code, '')), ''),
    p_customer_id, nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_cccd, '')), ''),
    p_related_gold_account_id, p_related_staff_id,
    nullif(trim(coalesce(p_related_staff_name, '')), ''),
    v_actor, coalesce(p_lines, '[]'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', false);
end;
$$;
