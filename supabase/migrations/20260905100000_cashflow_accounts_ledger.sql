-- Cashflow module: store money accounts + immutable ledger.
-- Auto-posts from pos_sale_payments / pos_buy_payments (idempotent via source_row_id).
-- Manual admin RPCs: OTHER_INCOME, OTHER_EXPENSE, TRANSFER.

create table if not exists public.pos_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('CASH', 'BANK')),
  balance_dong bigint not null default 0 check (balance_dong >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_cash_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.pos_cash_accounts(id) on delete restrict,
  txn_type text not null check (txn_type in (
    'SALE_PAYMENT',
    'PURCHASE_PAYMENT',
    'RECEIVABLE_COLLECTION',
    'PAYABLE_PAYMENT',
    'OTHER_INCOME',
    'OTHER_EXPENSE',
    'TRANSFER'
  )),
  direction text not null check (direction in ('IN', 'OUT')),
  amount_dong bigint not null check (amount_dong > 0),
  balance_before_dong bigint not null check (balance_before_dong >= 0),
  balance_after_dong bigint not null check (balance_after_dong >= 0),
  content text not null check (length(trim(content)) > 0),
  reference_type text null,
  reference_id uuid null,
  reference_code text null,
  source_table text null,
  source_row_id uuid null,
  transfer_group_id uuid null,
  actor_email text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_cash_ledger_balance_math check (
    (direction = 'IN' and balance_after_dong = balance_before_dong + amount_dong)
    or (direction = 'OUT' and balance_after_dong = balance_before_dong - amount_dong)
  )
);

create unique index if not exists pos_cash_ledger_source_uidx
  on public.pos_cash_ledger (source_table, source_row_id)
  where source_table is not null and source_row_id is not null;

create index if not exists pos_cash_ledger_account_time_idx
  on public.pos_cash_ledger (account_id, occurred_at desc);

create index if not exists pos_cash_ledger_occurred_idx
  on public.pos_cash_ledger (occurred_at desc);

alter table public.pos_cash_accounts enable row level security;
alter table public.pos_cash_ledger enable row level security;

drop policy if exists pos_cash_accounts_admin_select on public.pos_cash_accounts;
create policy pos_cash_accounts_admin_select on public.pos_cash_accounts
  for select to authenticated
  using (public.tlkv_is_admin());

drop policy if exists pos_cash_ledger_admin_select on public.pos_cash_ledger;
create policy pos_cash_ledger_admin_select on public.pos_cash_ledger
  for select to authenticated
  using (public.tlkv_is_admin());

revoke all on table public.pos_cash_accounts from anon;
revoke all on table public.pos_cash_ledger from anon;
grant select on table public.pos_cash_accounts to authenticated;
grant select on table public.pos_cash_ledger to authenticated;

insert into public.pos_cash_accounts (code, name, account_type, balance_dong, sort_order)
values
  ('CASH-001', 'Tiền mặt', 'CASH', 0, 1),
  ('BANK-001', 'Ngân hàng công ty', 'BANK', 0, 2)
on conflict (code) do nothing;

create or replace function pos_private.cash_account_for_method(p_method text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text;
begin
  v_type := case
    when upper(coalesce(p_method, 'CASH')) = 'CASH' then 'CASH'
    else 'BANK'
  end;

  select a.id into v_id
  from public.pos_cash_accounts a
  where a.account_type = v_type and a.is_active
  order by a.sort_order
  limit 1;

  if v_id is null then
    raise exception 'CASHFLOW_ACCOUNT_MISSING';
  end if;
  return v_id;
end;
$$;

create or replace function pos_private.cash_post(
  p_account_id uuid,
  p_txn_type text,
  p_direction text,
  p_amount_dong bigint,
  p_content text,
  p_actor_email text,
  p_occurred_at timestamptz default now(),
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
as $$
declare
  v_bal bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'CASHFLOW_AMOUNT_INVALID';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'CASHFLOW_CONTENT_REQUIRED';
  end if;

  if p_source_table is not null and p_source_row_id is not null then
    select id into v_id
    from public.pos_cash_ledger
    where source_table = p_source_table and source_row_id = p_source_row_id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select balance_dong into v_bal
  from public.pos_cash_accounts
  where id = p_account_id
  for update;

  if v_bal is null then
    raise exception 'CASHFLOW_ACCOUNT_NOT_FOUND';
  end if;

  if p_direction = 'IN' then
    v_after := v_bal + p_amount_dong;
  elsif p_direction = 'OUT' then
    if v_bal < p_amount_dong then
      raise exception 'CASHFLOW_INSUFFICIENT_BALANCE';
    end if;
    v_after := v_bal - p_amount_dong;
  else
    raise exception 'CASHFLOW_DIRECTION_INVALID';
  end if;

  insert into public.pos_cash_ledger (
    account_id, txn_type, direction, amount_dong,
    balance_before_dong, balance_after_dong, content,
    reference_type, reference_id, reference_code,
    source_table, source_row_id, transfer_group_id,
    actor_email, occurred_at
  ) values (
    p_account_id, p_txn_type, p_direction, p_amount_dong,
    v_bal, v_after, trim(p_content),
    p_reference_type, p_reference_id, p_reference_code,
    p_source_table, p_source_row_id, p_transfer_group_id,
    coalesce(nullif(trim(p_actor_email), ''), 'system'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  update public.pos_cash_accounts
  set balance_dong = v_after, updated_at = now()
  where id = p_account_id;

  return v_id;
end;
$$;

create or replace function pos_private.cash_ingest_sale_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new public.pos_sale_payments%rowtype;
  v_account uuid;
  v_txn text;
  v_prior integer;
  v_invoice text;
begin
  select * into new from public.pos_sale_payments where id = p_payment_id;
  if not found or new.amount_dong is null or new.amount_dong <= 0 then
    return;
  end if;

  select count(*) into v_prior
  from public.pos_sale_payments p
  where p.sale_id = new.sale_id
    and p.id is distinct from new.id
    and coalesce(p.paid_at, p.created_at) < coalesce(new.paid_at, new.created_at);

  v_txn := case when coalesce(v_prior, 0) = 0 then 'SALE_PAYMENT' else 'RECEIVABLE_COLLECTION' end;

  select i.invoice_no into v_invoice
  from public.pos_invoices i
  where i.sale_id = new.sale_id
  limit 1;

  v_account := pos_private.cash_account_for_method(new.payment_method);

  perform pos_private.cash_post(
    v_account, v_txn, 'IN', new.amount_dong,
    case when v_txn = 'SALE_PAYMENT'
      then 'Thanh toán bán hàng' || coalesce(' ' || v_invoice, '')
      else 'Thu công nợ' || coalesce(' ' || v_invoice, '')
    end,
    coalesce(new.actor_email, 'system'),
    coalesce(new.paid_at, new.created_at, now()),
    'sale', new.sale_id, v_invoice,
    'pos_sale_payments', new.id, null
  );
end;
$$;

create or replace function pos_private.cash_ingest_buy_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new public.pos_buy_payments%rowtype;
  v_account uuid;
  v_txn text;
  v_prior integer;
  v_buy_no text;
begin
  select * into new from public.pos_buy_payments where id = p_payment_id;
  if not found or new.amount_dong is null or new.amount_dong <= 0 then
    return;
  end if;

  select count(*) into v_prior
  from public.pos_buy_payments p
  where p.buy_id = new.buy_id
    and p.id is distinct from new.id
    and coalesce(p.paid_at, p.created_at) < coalesce(new.paid_at, new.created_at);

  v_txn := case when coalesce(v_prior, 0) = 0 then 'PURCHASE_PAYMENT' else 'PAYABLE_PAYMENT' end;

  select b.buy_no into v_buy_no from public.pos_buys b where b.id = new.buy_id limit 1;

  v_account := pos_private.cash_account_for_method(new.payment_method);

  perform pos_private.cash_post(
    v_account, v_txn, 'OUT', new.amount_dong,
    case when v_txn = 'PURCHASE_PAYMENT'
      then 'Thanh toán mua hàng' || coalesce(' ' || v_buy_no, '')
      else 'Trả công nợ' || coalesce(' ' || v_buy_no, '')
    end,
    coalesce(new.actor_email, 'system'),
    coalesce(new.paid_at, new.created_at, now()),
    'buy', new.buy_id, v_buy_no,
    'pos_buy_payments', new.id, null
  );
end;
$$;

create or replace function pos_private.cash_trg_sale_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.cash_ingest_sale_payment(new.id);
  return new;
end;
$$;

create or replace function pos_private.cash_trg_buy_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.cash_ingest_buy_payment(new.id);
  return new;
end;
$$;

drop trigger if exists trg_cash_post_sale_payment on public.pos_sale_payments;
create trigger trg_cash_post_sale_payment
  after insert on public.pos_sale_payments
  for each row execute function pos_private.cash_trg_sale_payment();

drop trigger if exists trg_cash_post_buy_payment on public.pos_buy_payments;
create trigger trg_cash_post_buy_payment
  after insert on public.pos_buy_payments
  for each row execute function pos_private.cash_trg_buy_payment();

-- Backfill: credit (sale) first, then debit (buy), chronological within each.
do $$
declare
  r record;
begin
  for r in
    select id, coalesce(paid_at, created_at) as ts
    from public.pos_sale_payments where amount_dong > 0
    order by ts, id
  loop
    begin
      perform pos_private.cash_ingest_sale_payment(r.id);
    exception when others then
      raise notice 'cashflow backfill sale skip %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in
    select id, coalesce(paid_at, created_at) as ts
    from public.pos_buy_payments where amount_dong > 0
    order by ts, id
  loop
    begin
      perform pos_private.cash_ingest_buy_payment(r.id);
    exception when others then
      raise notice 'cashflow backfill buy skip %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- ===== Public admin RPCs =====

create or replace function public.pos_cashflow_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date;
  v_from7 date;
  v_cash jsonb;
  v_bank jsonb;
  v_total bigint;
  v_in7 bigint;
  v_out7 bigint;
  v_recv bigint;
  v_pay bigint;
  v_stock_capital bigint;
begin
  perform pos_private.require_admin();
  v_today := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_from7 := v_today - 6;

  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'accountType', a.account_type,
    'balanceDong', a.balance_dong,
    'inTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'IN' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'outTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'OUT' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'txnToday', coalesce((
      select count(*) from public.pos_cash_ledger l
      where l.account_id = a.id
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0)
  ) into v_cash
  from public.pos_cash_accounts a where a.code = 'CASH-001';

  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'accountType', a.account_type,
    'balanceDong', a.balance_dong,
    'inTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'IN' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'outTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'OUT' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'txnToday', coalesce((
      select count(*) from public.pos_cash_ledger l
      where l.account_id = a.id
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0)
  ) into v_bank
  from public.pos_cash_accounts a where a.code = 'BANK-001';

  v_total := coalesce((v_cash->>'balanceDong')::bigint, 0)
           + coalesce((v_bank->>'balanceDong')::bigint, 0);

  select coalesce(sum(case when direction = 'IN' then amount_dong else 0 end), 0),
         coalesce(sum(case when direction = 'OUT' then amount_dong else 0 end), 0)
  into v_in7, v_out7
  from public.pos_cash_ledger
  where txn_type <> 'TRANSFER'
    and (timezone('Asia/Ho_Chi_Minh', occurred_at))::date between v_from7 and v_today;

  select coalesce(sum(remaining_dong), 0) into v_recv
  from public.pos_receivables where remaining_dong > 0 and status <> 'CLOSED';

  select coalesce(sum(remaining_dong), 0) into v_pay
  from public.pos_payables where remaining_dong > 0 and status <> 'CLOSED';

  select coalesce(sum(s.quantity::bigint * coalesce(s.last_cost_dong, 0)), 0)
  into v_stock_capital
  from public.pos_inventory_stock s
  where s.quantity > 0;

  return jsonb_build_object(
    'businessDate', v_today,
    'cash', v_cash,
    'bank', v_bank,
    'availableDong', v_total,
    'sevenDay', jsonb_build_object(
      'inDong', v_in7,
      'outDong', v_out7,
      'netDong', v_in7 - v_out7
    ),
    'receivableDong', v_recv,
    'payableDong', v_pay,
    'stockCapitalDong', v_stock_capital
  );
end;
$$;

create or replace function public.pos_cashflow_list(
  p_from date,
  p_to date,
  p_account_id uuid default null,
  p_txn_type text default null,
  p_direction text default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_total integer;
  v_in bigint;
  v_out bigint;
begin
  perform pos_private.require_admin();

  select count(*),
         coalesce(sum(case when l.direction = 'IN' and l.txn_type <> 'TRANSFER' then l.amount_dong else 0 end), 0),
         coalesce(sum(case when l.direction = 'OUT' and l.txn_type <> 'TRANSFER' then l.amount_dong else 0 end), 0)
  into v_total, v_in, v_out
  from public.pos_cash_ledger l
  join public.pos_cash_accounts a on a.id = l.account_id
  where (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date between p_from and p_to
    and (p_account_id is null or l.account_id = p_account_id)
    and (p_txn_type is null or p_txn_type = '' or l.txn_type = p_txn_type)
    and (p_direction is null or p_direction = '' or l.direction = p_direction)
    and (
      p_q is null or trim(p_q) = ''
      or l.content ilike '%' || trim(p_q) || '%'
      or coalesce(l.reference_code, '') ilike '%' || trim(p_q) || '%'
      or l.actor_email ilike '%' || trim(p_q) || '%'
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      l.id,
      l.occurred_at as "occurredAt",
      l.txn_type as "txnType",
      l.direction,
      l.amount_dong as "amountDong",
      l.balance_after_dong as "balanceAfterDong",
      l.content,
      a.code as "accountCode",
      a.name as "accountName",
      l.reference_code as "referenceCode",
      l.actor_email as "actorEmail"
    from public.pos_cash_ledger l
    join public.pos_cash_accounts a on a.id = l.account_id
    where (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date between p_from and p_to
      and (p_account_id is null or l.account_id = p_account_id)
      and (p_txn_type is null or p_txn_type = '' or l.txn_type = p_txn_type)
      and (p_direction is null or p_direction = '' or l.direction = p_direction)
      and (
        p_q is null or trim(p_q) = ''
        or l.content ilike '%' || trim(p_q) || '%'
        or coalesce(l.reference_code, '') ilike '%' || trim(p_q) || '%'
        or l.actor_email ilike '%' || trim(p_q) || '%'
      )
    order by l.occurred_at desc, l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'sumInDong', v_in,
    'sumOutDong', v_out,
    'netDong', v_in - v_out
  );
end;
$$;

create or replace function public.pos_cashflow_deposit(
  p_idempotency_key text,
  p_account_id uuid,
  p_amount_dong bigint,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id uuid;
  v_source uuid;
begin
  perform pos_private.require_admin();
  v_actor := coalesce(auth.jwt() ->> 'email', 'admin');

  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'CASHFLOW_AMOUNT_INVALID';
  end if;

  v_source := (
    '00000000-0000-4000-8000-' || substr(md5('deposit:' || coalesce(p_idempotency_key, gen_random_uuid()::text)), 1, 12)
  )::uuid;

  v_id := pos_private.cash_post(
    p_account_id, 'OTHER_INCOME', 'IN', p_amount_dong,
    coalesce(nullif(trim(p_content), ''), 'Thu khác'),
    v_actor, now(), 'manual', null, null,
    'manual_deposit', v_source, null
  );

  return jsonb_build_object('ok', true, 'ledgerId', v_id);
end;
$$;

create or replace function public.pos_cashflow_withdraw(
  p_idempotency_key text,
  p_account_id uuid,
  p_amount_dong bigint,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id uuid;
  v_source uuid;
begin
  perform pos_private.require_admin();
  v_actor := coalesce(auth.jwt() ->> 'email', 'admin');

  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'CASHFLOW_AMOUNT_INVALID';
  end if;

  v_source := (
    '00000000-0000-4000-8000-' || substr(md5('withdraw:' || coalesce(p_idempotency_key, gen_random_uuid()::text)), 1, 12)
  )::uuid;

  v_id := pos_private.cash_post(
    p_account_id, 'OTHER_EXPENSE', 'OUT', p_amount_dong,
    coalesce(nullif(trim(p_content), ''), 'Chi khác'),
    v_actor, now(), 'manual', null, null,
    'manual_withdraw', v_source, null
  );

  return jsonb_build_object('ok', true, 'ledgerId', v_id);
end;
$$;

create or replace function public.pos_cashflow_transfer(
  p_idempotency_key text,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_dong bigint,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_group uuid;
  v_out uuid;
  v_in uuid;
  v_content text;
  v_out_src uuid;
  v_in_src uuid;
begin
  perform pos_private.require_admin();
  v_actor := coalesce(auth.jwt() ->> 'email', 'admin');

  if p_from_account_id is null or p_to_account_id is null or p_from_account_id = p_to_account_id then
    raise exception 'CASHFLOW_TRANSFER_ACCOUNTS_INVALID';
  end if;
  if p_amount_dong is null or p_amount_dong <= 0 then
    raise exception 'CASHFLOW_AMOUNT_INVALID';
  end if;

  v_group := (
    '00000000-0000-4000-8000-' || substr(md5('transfer:' || coalesce(p_idempotency_key, gen_random_uuid()::text)), 1, 12)
  )::uuid;
  v_out_src := (
    '00000000-0000-4000-8000-' || substr(md5('transfer-out:' || coalesce(p_idempotency_key, v_group::text)), 1, 12)
  )::uuid;
  v_in_src := (
    '00000000-0000-4000-8000-' || substr(md5('transfer-in:' || coalesce(p_idempotency_key, v_group::text)), 1, 12)
  )::uuid;

  v_content := coalesce(nullif(trim(p_content), ''), 'Chuyển tiền nội bộ');

  if exists (
    select 1 from public.pos_cash_ledger
    where source_table = 'manual_transfer_out' and source_row_id = v_out_src
  ) then
    return jsonb_build_object('ok', true, 'transferGroupId', v_group, 'idempotent', true);
  end if;

  v_out := pos_private.cash_post(
    p_from_account_id, 'TRANSFER', 'OUT', p_amount_dong, v_content,
    v_actor, now(), 'transfer', null, null,
    'manual_transfer_out', v_out_src, v_group
  );
  v_in := pos_private.cash_post(
    p_to_account_id, 'TRANSFER', 'IN', p_amount_dong, v_content,
    v_actor, now(), 'transfer', null, null,
    'manual_transfer_in', v_in_src, v_group
  );

  return jsonb_build_object(
    'ok', true,
    'transferGroupId', v_group,
    'outLedgerId', v_out,
    'inLedgerId', v_in
  );
end;
$$;

create or replace function public.pos_cashflow_capital_by_group()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform pos_private.require_admin();

  with stock as (
    select
      s.quantity,
      coalesce(s.last_cost_dong, 0) as cost,
      sk.name,
      sk.is_market_gold,
      b.slug as brand_slug,
      b.name as brand_name
    from public.pos_inventory_stock s
    join public.pos_skus sk on sk.id = s.sku_id
    left join public.brands b on b.id = sk.brand_id
    where s.quantity > 0
  ),
  grouped as (
    select
      case
        when coalesce(is_market_gold, false) or brand_slug = 'vang-thi-truong'
          then 'Vàng thị trường'
        when brand_slug = 'bao-tin-minh-chau' or brand_name ilike '%minh châu%'
          then 'BTMC'
        when lower(name) ~ '(bông lúa|hạt gạo|nhẫn tròn)'
          then 'Bông lúa / Hạt gạo / Nhẫn tròn'
        when lower(name) ~ '(nhẫn|dây|lắc|bông tai|trang sức)'
          then 'Trang sức'
        else 'Khác'
      end as group_name,
      sum(quantity::bigint * cost) as capital_dong
    from stock
    group by 1
  ),
  totals as (
    select coalesce(sum(capital_dong), 0) as total_dong from grouped
  )
  select
    t.total_dong,
    coalesce(jsonb_agg(jsonb_build_object(
      'groupName', g.group_name,
      'capitalDong', g.capital_dong,
      'sharePercent', case when t.total_dong > 0
        then round((g.capital_dong::numeric * 100) / t.total_dong, 1)
        else 0 end
    ) order by g.capital_dong desc) filter (where g.group_name is not null), '[]'::jsonb)
  into v_total, v_rows
  from totals t
  left join grouped g on true
  group by t.total_dong;

  return jsonb_build_object(
    'totalDong', coalesce(v_total, 0),
    'groups', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pos_cashflow_overview() from public, anon;
revoke all on function public.pos_cashflow_list(date, date, uuid, text, text, text, integer, integer) from public, anon;
revoke all on function public.pos_cashflow_deposit(text, uuid, bigint, text) from public, anon;
revoke all on function public.pos_cashflow_withdraw(text, uuid, bigint, text) from public, anon;
revoke all on function public.pos_cashflow_transfer(text, uuid, uuid, bigint, text) from public, anon;
revoke all on function public.pos_cashflow_capital_by_group() from public, anon;

grant execute on function public.pos_cashflow_overview() to authenticated;
grant execute on function public.pos_cashflow_list(date, date, uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.pos_cashflow_deposit(text, uuid, bigint, text) to authenticated;
grant execute on function public.pos_cashflow_withdraw(text, uuid, bigint, text) to authenticated;
grant execute on function public.pos_cashflow_transfer(text, uuid, uuid, bigint, text) to authenticated;
grant execute on function public.pos_cashflow_capital_by_group() to authenticated;
