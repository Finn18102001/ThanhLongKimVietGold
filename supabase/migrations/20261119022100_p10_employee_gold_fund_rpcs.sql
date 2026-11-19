-- P10 Module 3a RPCs: Quỹ vàng

create or replace function pos_private.employee_gold_admin_pool_id()
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.pos_employee_gold_accounts where kind = 'ADMIN_POOL' limit 1;
  if v_id is null then
    insert into public.pos_employee_gold_accounts (code, name, kind, staff_id, created_by)
    values ('QV-ADMIN', 'Quỹ vàng Admin', 'ADMIN_POOL', null, 'system:seed')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function pos_private.employee_gold_owns_account(p_account_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
begin
  if public.tlkv_is_admin() then
    return true;
  end if;
  select s.id into v_staff_id from public.pos_staff s
  where lower(s.email) = lower(v_email) and s.is_active limit 1;
  if v_staff_id is null or p_account_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.pos_employee_gold_accounts a
    where a.id = p_account_id and a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
  );
end;
$$;

create or replace function pos_private.employee_gold_post(
  p_account_id uuid,
  p_sku_id uuid,
  p_txn_type text,
  p_direction text,
  p_quantity integer,
  p_content text,
  p_actor_email text,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_code text default null,
  p_source_table text default null,
  p_source_row_id uuid default null,
  p_transfer_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_before integer;
  v_after integer;
  v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'EMP_GOLD_QTY_INVALID';
  end if;
  if p_sku_id is null then
    raise exception 'EMP_GOLD_SKU_REQUIRED';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'EMP_GOLD_CONTENT_REQUIRED';
  end if;
  if not exists (select 1 from public.pos_skus where id = p_sku_id) then
    raise exception 'EMP_GOLD_SKU_NOT_FOUND';
  end if;
  if not exists (select 1 from public.pos_employee_gold_accounts where id = p_account_id and is_active) then
    raise exception 'EMP_GOLD_ACCOUNT_NOT_FOUND';
  end if;

  if p_source_table is not null and p_source_row_id is not null then
    select id into v_id from public.pos_employee_gold_ledger
    where source_table = p_source_table and source_row_id = p_source_row_id limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.pos_employee_gold_stock (account_id, sku_id, quantity, updated_at)
  values (p_account_id, p_sku_id, 0, now())
  on conflict (account_id, sku_id) do nothing;

  select quantity into v_before
  from public.pos_employee_gold_stock
  where account_id = p_account_id and sku_id = p_sku_id
  for update;

  v_before := coalesce(v_before, 0);

  if p_direction = 'IN' then
    v_after := v_before + p_quantity;
  elsif p_direction = 'OUT' then
    if v_before < p_quantity then
      raise exception 'EMP_GOLD_INSUFFICIENT_QTY';
    end if;
    v_after := v_before - p_quantity;
  else
    raise exception 'EMP_GOLD_DIRECTION_INVALID';
  end if;

  insert into public.pos_employee_gold_ledger (
    account_id, sku_id, txn_type, direction, quantity,
    qty_before, qty_after, content, reason,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_sku_id, p_txn_type, p_direction, p_quantity,
    v_before, v_after, trim(p_content), nullif(trim(coalesce(p_reason, '')), ''),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  update public.pos_employee_gold_stock
  set quantity = v_after, updated_at = now()
  where account_id = p_account_id and sku_id = p_sku_id;

  update public.pos_employee_gold_accounts
  set updated_at = now()
  where id = p_account_id;

  return v_id;
end;
$$;

create or replace function public.pos_employee_gold_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_account_id uuid;
begin
  perform pos_private.require_pos_user();
  if v_is_admin then
    return jsonb_build_object('canAccess', true, 'isAdmin', true, 'staffAccountId', null);
  end if;
  select s.id into v_staff_id from public.pos_staff s
  where lower(s.email) = lower(v_email) and s.is_active limit 1;
  select a.id into v_account_id from public.pos_employee_gold_accounts a
  where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active limit 1;
  return jsonb_build_object(
    'canAccess', v_account_id is not null,
    'isAdmin', false,
    'staffAccountId', v_account_id
  );
end;
$$;

create or replace function public.pos_employee_gold_list_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_is_admin boolean := public.tlkv_is_admin();
  v_staff_id uuid;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    select s.id into v_staff_id from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active limit 1;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sort_key, t.code), '[]'::jsonb)
  into v_items
  from (
    select
      a.id, a.code, a.name, a.kind,
      a.staff_id as "staffId",
      s.full_name as "staffName",
      s.email as "staffEmail",
      a.is_active as "isActive",
      a.updated_at as "updatedAt",
      case when a.kind = 'ADMIN_POOL' then 0 else 1 end as sort_key
    from public.pos_employee_gold_accounts a
    left join public.pos_staff s on s.id = a.staff_id
    where a.is_active
      and (v_is_admin or (a.kind = 'STAFF' and a.staff_id = v_staff_id))
  ) t;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_employee_gold_create_staff_account(
  p_staff_id uuid,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_staff public.pos_staff%rowtype;
  v_code text;
  v_name text;
  v_id uuid;
begin
  v_actor := pos_private.require_admin();
  if p_staff_id is null then raise exception 'EMP_GOLD_STAFF_REQUIRED'; end if;
  select * into v_staff from public.pos_staff where id = p_staff_id;
  if not found then raise exception 'EMP_GOLD_STAFF_NOT_FOUND'; end if;
  if not v_staff.is_active then raise exception 'EMP_GOLD_STAFF_INACTIVE'; end if;
  if exists (select 1 from public.pos_employee_gold_accounts where kind = 'STAFF' and staff_id = p_staff_id) then
    raise exception 'EMP_GOLD_STAFF_ALREADY_HAS_ACCOUNT';
  end if;
  v_code := 'QV-' || lpad(nextval('public.pos_employee_gold_account_code_seq')::text, 6, '0');
  v_name := coalesce(nullif(trim(p_name), ''), 'Quỹ vàng ' || v_staff.full_name);
  insert into public.pos_employee_gold_accounts (code, name, kind, staff_id, created_by)
  values (v_code, v_name, 'STAFF', p_staff_id, v_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'name', v_name, 'staffId', p_staff_id);
end;
$$;

create or replace function public.pos_employee_gold_list_stock(p_account_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    select s.id into v_staff_id from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active limit 1;
  end if;

  if p_account_id is not null and not pos_private.employee_gold_owns_account(p_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      st.account_id as "accountId",
      a.code as "accountCode",
      a.name as "accountName",
      st.sku_id as "skuId",
      sk.sku as "skuCode",
      sk.name as "skuName",
      st.quantity,
      coalesce(inv.quantity, 0) as "storeQuantity",
      st.updated_at as "updatedAt"
    from public.pos_employee_gold_stock st
    join public.pos_employee_gold_accounts a on a.id = st.account_id
    join public.pos_skus sk on sk.id = st.sku_id
    left join public.pos_inventory_stock inv on inv.sku_id = st.sku_id
    where st.quantity > 0
      and (p_account_id is null or st.account_id = p_account_id)
      and (
        v_is_admin
        or (a.kind = 'STAFF' and a.staff_id = v_staff_id)
      )
    order by a.code, sk.sku
  ) t;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_employee_gold_admin_capital(
  p_idempotency_key text,
  p_sku_id uuid,
  p_direction text,
  p_quantity integer,
  p_content text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_pool uuid;
  v_dir text;
  v_txn text;
  v_source uuid;
  v_ledger uuid;
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  if v_dir not in ('IN', 'OUT') then raise exception 'EMP_GOLD_DIRECTION_INVALID'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'EMP_GOLD_QTY_INVALID'; end if;
  v_pool := pos_private.employee_gold_admin_pool_id();
  v_txn := case when v_dir = 'IN' then 'ADMIN_CAPITAL_IN' else 'ADMIN_CAPITAL_OUT' end;
  v_source := (
    '00000000-0000-4000-8000-' || substr(md5('emp-gold-capital:' || coalesce(p_idempotency_key, gen_random_uuid()::text)), 1, 12)
  )::uuid;
  v_ledger := pos_private.employee_gold_post(
    v_pool, p_sku_id, v_txn, v_dir, p_quantity,
    coalesce(nullif(trim(p_content), ''), case when v_dir = 'IN' then 'Nạp vàng Quỹ Admin' else 'Rút vàng Quỹ Admin' end),
    v_actor, now(), p_reason, 'admin_capital', v_pool, null, 'emp_gold_capital', v_source, null
  );
  return jsonb_build_object('ok', true, 'ledgerId', v_ledger, 'poolAccountId', v_pool, 'direction', v_dir);
end;
$$;

create or replace function public.pos_employee_gold_admin_allocate(
  p_idempotency_key text,
  p_staff_account_id uuid,
  p_sku_id uuid,
  p_direction text,
  p_quantity integer,
  p_content text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor text;
  v_pool uuid;
  v_staff public.pos_employee_gold_accounts%rowtype;
  v_dir text;
  v_group uuid := gen_random_uuid();
  v_source_a uuid;
  v_source_b uuid;
  v_ledger_pool uuid;
  v_ledger_staff uuid;
  v_content text;
begin
  v_actor := pos_private.require_admin();
  v_dir := upper(trim(coalesce(p_direction, '')));
  if v_dir not in ('IN', 'OUT') then raise exception 'EMP_GOLD_DIRECTION_INVALID'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'EMP_GOLD_QTY_INVALID'; end if;

  select * into v_staff from public.pos_employee_gold_accounts where id = p_staff_account_id for update;
  if not found or v_staff.kind <> 'STAFF' or not v_staff.is_active then
    raise exception 'EMP_GOLD_STAFF_ACCOUNT_INVALID';
  end if;

  v_pool := pos_private.employee_gold_admin_pool_id();
  perform 1 from public.pos_employee_gold_accounts where id = v_pool for update;

  v_content := coalesce(
    nullif(trim(p_content), ''),
    case when v_dir = 'IN' then 'Admin phân bổ vàng cho nhân viên' else 'Admin thu hồi vàng từ nhân viên' end
  );
  v_source_a := ('00000000-0000-4000-8000-' || substr(md5('emp-gold-alloc-a:' || coalesce(p_idempotency_key, v_group::text)), 1, 12))::uuid;
  v_source_b := ('00000000-0000-4000-8000-' || substr(md5('emp-gold-alloc-b:' || coalesce(p_idempotency_key, v_group::text)), 1, 12))::uuid;

  if v_dir = 'IN' then
    v_ledger_pool := pos_private.employee_gold_post(
      v_pool, p_sku_id, 'ADMIN_ALLOCATE', 'OUT', p_quantity, v_content, v_actor, now(), p_reason,
      'employee_gold_account', p_staff_account_id, v_staff.code, 'emp_gold_allocate', v_source_a, v_group
    );
    v_ledger_staff := pos_private.employee_gold_post(
      p_staff_account_id, p_sku_id, 'ADMIN_ALLOCATE', 'IN', p_quantity, v_content, v_actor, now(), p_reason,
      'employee_gold_account', v_pool, 'QV-ADMIN', 'emp_gold_allocate', v_source_b, v_group
    );
  else
    v_ledger_staff := pos_private.employee_gold_post(
      p_staff_account_id, p_sku_id, 'ADMIN_ALLOCATE', 'OUT', p_quantity, v_content, v_actor, now(), p_reason,
      'employee_gold_account', v_pool, 'QV-ADMIN', 'emp_gold_allocate', v_source_a, v_group
    );
    v_ledger_pool := pos_private.employee_gold_post(
      v_pool, p_sku_id, 'ADMIN_ALLOCATE', 'IN', p_quantity, v_content, v_actor, now(), p_reason,
      'employee_gold_account', p_staff_account_id, v_staff.code, 'emp_gold_allocate', v_source_b, v_group
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'transferGroupId', v_group,
    'poolLedgerId', v_ledger_pool, 'staffLedgerId', v_ledger_staff,
    'direction', v_dir, 'quantity', p_quantity
  );
end;
$$;

create or replace function public.pos_employee_gold_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_sku_id uuid,
  p_quantity integer,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_from public.pos_employee_gold_accounts%rowtype;
  v_to public.pos_employee_gold_accounts%rowtype;
  v_code text;
  v_id uuid;
  v_group uuid := gen_random_uuid();
  v_content text;
  v_ledger_from uuid;
  v_ledger_to uuid;
  v_source_a uuid;
  v_source_b uuid;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();
  if p_quantity is null or p_quantity <= 0 then raise exception 'EMP_GOLD_QTY_INVALID'; end if;
  if p_from_account_id = p_to_account_id then raise exception 'EMP_GOLD_TRANSFER_SAME_ACCOUNT'; end if;
  v_content := nullif(trim(coalesce(p_content, '')), '');
  if v_content is null then raise exception 'EMP_GOLD_CONTENT_REQUIRED'; end if;

  select * into v_from from public.pos_employee_gold_accounts where id = p_from_account_id for update;
  select * into v_to from public.pos_employee_gold_accounts where id = p_to_account_id for update;
  if v_from.id is null or v_to.id is null or v_from.kind <> 'STAFF' or v_to.kind <> 'STAFF'
     or not v_from.is_active or not v_to.is_active then
    raise exception 'EMP_GOLD_TRANSFER_ACCOUNT_INVALID';
  end if;
  if not pos_private.employee_gold_owns_account(p_from_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_code := 'CTCV-' || lpad(nextval('public.pos_employee_gold_transfer_code_seq')::text, 6, '0');
  v_source_a := ('00000000-0000-4000-8000-' || substr(md5('emp-gold-xfer-from:' || v_group::text), 1, 12))::uuid;
  v_source_b := ('00000000-0000-4000-8000-' || substr(md5('emp-gold-xfer-to:' || v_group::text), 1, 12))::uuid;

  v_ledger_from := pos_private.employee_gold_post(
    p_from_account_id, p_sku_id, 'TRANSFER', 'OUT', p_quantity,
    'Chuyển vàng ' || v_code || ' · ' || v_content, v_email, now(), null,
    'employee_gold_transfer', null, v_code, 'emp_gold_transfer', v_source_a, v_group
  );
  v_ledger_to := pos_private.employee_gold_post(
    p_to_account_id, p_sku_id, 'TRANSFER', 'IN', p_quantity,
    'Chuyển vàng ' || v_code || ' · ' || v_content, v_email, now(), null,
    'employee_gold_transfer', null, v_code, 'emp_gold_transfer', v_source_b, v_group
  );

  insert into public.pos_employee_gold_transfers (
    code, from_account_id, to_account_id, sku_id, quantity, content, transfer_group_id, created_by_email
  ) values (
    v_code, p_from_account_id, p_to_account_id, p_sku_id, p_quantity, v_content, v_group, v_email
  )
  returning id into v_id;

  update public.pos_employee_gold_ledger
  set reference_id = v_id
  where id in (v_ledger_from, v_ledger_to);

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'code', v_code, 'transferGroupId', v_group,
    'fromLedgerId', v_ledger_from, 'toLedgerId', v_ledger_to
  );
end;
$$;

create or replace function public.pos_employee_gold_list_ledger(
  p_account_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    select s.id into v_staff_id from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active limit 1;
    if p_account_id is not null and not exists (
      select 1 from public.pos_employee_gold_accounts a
      where a.id = p_account_id and a.kind = 'STAFF' and a.staff_id = v_staff_id
    ) then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  select count(*)::integer into v_total
  from public.pos_employee_gold_ledger l
  join public.pos_employee_gold_accounts a on a.id = l.account_id
  where (p_account_id is null or l.account_id = p_account_id)
    and (v_is_admin or (a.kind = 'STAFF' and a.staff_id = v_staff_id));

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      l.id,
      l.account_id as "accountId",
      a.code as "accountCode",
      l.sku_id as "skuId",
      sk.sku as "skuCode",
      sk.name as "skuName",
      l.txn_type as "txnType",
      l.direction,
      l.quantity,
      l.qty_before as "qtyBefore",
      l.qty_after as "qtyAfter",
      l.content,
      l.reason,
      l.reference_code as "referenceCode",
      l.transfer_group_id as "transferGroupId",
      l.actor_email as "actorEmail",
      l.occurred_at as "occurredAt"
    from public.pos_employee_gold_ledger l
    join public.pos_employee_gold_accounts a on a.id = l.account_id
    join public.pos_skus sk on sk.id = l.sku_id
    where (p_account_id is null or l.account_id = p_account_id)
      and (v_is_admin or (a.kind = 'STAFF' and a.staff_id = v_staff_id))
    order by l.occurred_at desc, l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('items', v_items, 'total', v_total,
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0)));
end;
$$;

create or replace function public.pos_employee_gold_submit_count(
  p_account_id uuid,
  p_note text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_code text;
  v_id uuid;
  v_line jsonb;
  v_sku uuid;
  v_counted integer;
  v_system integer;
  v_line_note text;
begin
  perform pos_private.require_pos_user();
  v_email := public.tlkv_current_email();
  if not pos_private.employee_gold_owns_account(p_account_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMP_GOLD_COUNT_LINES_REQUIRED';
  end if;

  v_code := 'KKV-' || lpad(nextval('public.pos_employee_gold_count_code_seq')::text, 6, '0');
  insert into public.pos_employee_gold_counts (code, account_id, note, counted_by_email)
  values (v_code, p_account_id, nullif(trim(coalesce(p_note, '')), ''), v_email)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := nullif(v_line ->> 'skuId', '')::uuid;
    v_counted := coalesce((v_line ->> 'countedQty')::integer, -1);
    v_line_note := nullif(trim(coalesce(v_line ->> 'note', '')), '');
    if v_sku is null or v_counted < 0 then
      raise exception 'EMP_GOLD_COUNT_LINE_INVALID';
    end if;
    select coalesce(quantity, 0) into v_system
    from public.pos_employee_gold_stock
    where account_id = p_account_id and sku_id = v_sku;
    v_system := coalesce(v_system, 0);

    insert into public.pos_employee_gold_count_lines (count_id, sku_id, system_qty, counted_qty, note)
    values (v_id, v_sku, v_system, v_counted, v_line_note);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end;
$$;

create or replace function public.pos_employee_gold_list_counts(
  p_account_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not v_is_admin then
    select s.id into v_staff_id from public.pos_staff s
    where lower(s.email) = lower(v_email) and s.is_active limit 1;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      c.id, c.code,
      c.account_id as "accountId",
      a.code as "accountCode",
      c.note,
      c.counted_by_email as "countedByEmail",
      c.counted_at as "countedAt",
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skuId', l.sku_id,
          'skuCode', sk.sku,
          'skuName', sk.name,
          'systemQty', l.system_qty,
          'countedQty', l.counted_qty,
          'diffQty', l.counted_qty - l.system_qty,
          'note', l.note
        )), '[]'::jsonb)
        from public.pos_employee_gold_count_lines l
        join public.pos_skus sk on sk.id = l.sku_id
        where l.count_id = c.id
      ) as lines
    from public.pos_employee_gold_counts c
    join public.pos_employee_gold_accounts a on a.id = c.account_id
    where (p_account_id is null or c.account_id = p_account_id)
      and (v_is_admin or (a.kind = 'STAFF' and a.staff_id = v_staff_id))
    order by c.counted_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) t;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_employee_gold_search_skus(
  p_query text default '',
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      sk.id as "skuId",
      sk.sku as "skuCode",
      sk.name as "skuName",
      coalesce(inv.quantity, 0) as "storeQuantity"
    from public.pos_skus sk
    left join public.pos_inventory_stock inv on inv.sku_id = sk.id
    where sk.is_active
      and (
        v_q = ''
        or sk.sku ilike '%' || v_q || '%'
        or sk.name ilike '%' || v_q || '%'
      )
    order by sk.sku
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) t;
  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.pos_employee_gold_my_access() from public, anon;
revoke all on function public.pos_employee_gold_list_accounts() from public, anon;
revoke all on function public.pos_employee_gold_create_staff_account(uuid, text) from public, anon;
revoke all on function public.pos_employee_gold_list_stock(uuid) from public, anon;
revoke all on function public.pos_employee_gold_admin_capital(text, uuid, text, integer, text, text) from public, anon;
revoke all on function public.pos_employee_gold_admin_allocate(text, uuid, uuid, text, integer, text, text) from public, anon;
revoke all on function public.pos_employee_gold_transfer(uuid, uuid, uuid, integer, text) from public, anon;
revoke all on function public.pos_employee_gold_list_ledger(uuid, integer, integer) from public, anon;
revoke all on function public.pos_employee_gold_submit_count(uuid, text, jsonb) from public, anon;
revoke all on function public.pos_employee_gold_list_counts(uuid, integer) from public, anon;
revoke all on function public.pos_employee_gold_search_skus(text, integer) from public, anon;

grant execute on function public.pos_employee_gold_my_access() to authenticated, service_role;
grant execute on function public.pos_employee_gold_list_accounts() to authenticated, service_role;
grant execute on function public.pos_employee_gold_create_staff_account(uuid, text) to authenticated, service_role;
grant execute on function public.pos_employee_gold_list_stock(uuid) to authenticated, service_role;
grant execute on function public.pos_employee_gold_admin_capital(text, uuid, text, integer, text, text) to authenticated, service_role;
grant execute on function public.pos_employee_gold_admin_allocate(text, uuid, uuid, text, integer, text, text) to authenticated, service_role;
grant execute on function public.pos_employee_gold_transfer(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.pos_employee_gold_list_ledger(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.pos_employee_gold_submit_count(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.pos_employee_gold_list_counts(uuid, integer) to authenticated, service_role;
grant execute on function public.pos_employee_gold_search_skus(text, integer) to authenticated, service_role;
