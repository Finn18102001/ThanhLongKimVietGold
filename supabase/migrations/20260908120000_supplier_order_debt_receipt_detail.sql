-- Warehouse order / supplier PN: independent goods vs payment vs debt.
-- Also exposes pos_get_purchase_receipt for invoice detail.
-- Does not change SALE complete behavior (supplier debt untouched on sell).

-- ---------------------------------------------------------------------------
-- 1) Suppliers (minimal master for NCC dropdown + debt)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text null,
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_suppliers_name_chk check (length(trim(name)) > 0)
);

create unique index if not exists pos_suppliers_name_uidx
  on public.pos_suppliers (lower(trim(name)));

alter table public.pos_suppliers enable row level security;

drop policy if exists pos_suppliers_admin_select on public.pos_suppliers;
create policy pos_suppliers_admin_select on public.pos_suppliers
  for select to authenticated
  using (public.tlkv_has_pos_access());

revoke all on table public.pos_suppliers from anon;
grant select on table public.pos_suppliers to authenticated;

insert into public.pos_suppliers (name)
select distinct trim(r.supplier_name)
from public.pos_purchase_receipts r
where length(trim(r.supplier_name)) > 0
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) Extend purchase receipts: document / goods / payment are independent
-- ---------------------------------------------------------------------------
alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_status_check;

alter table public.pos_purchase_receipts
  add column if not exists document_status text,
  add column if not exists goods_status text,
  add column if not exists supplier_id uuid references public.pos_suppliers(id) on delete restrict,
  add column if not exists payment_method text,
  add column if not exists expected_receive_at date,
  add column if not exists note text,
  add column if not exists stock_applied_at timestamptz,
  add column if not exists completed_at timestamptz;

update public.pos_purchase_receipts
set
  document_status = coalesce(document_status, 'COMPLETED'),
  goods_status = coalesce(goods_status, case when status = 'RECEIVED' then 'RECEIVED' else 'NOT_RECEIVED' end),
  payment_method = coalesce(payment_method, 'CASH'),
  completed_at = coalesce(completed_at, coalesce(received_at, created_at)),
  stock_applied_at = coalesce(
    stock_applied_at,
    case when status = 'RECEIVED' then coalesce(received_at, created_at) else null end
  )
where document_status is null
   or goods_status is null
   or payment_method is null;

update public.pos_purchase_receipts r
set supplier_id = s.id
from public.pos_suppliers s
where r.supplier_id is null
  and lower(trim(r.supplier_name)) = lower(trim(s.name));

alter table public.pos_purchase_receipts
  alter column document_status set default 'COMPLETED',
  alter column goods_status set default 'RECEIVED',
  alter column payment_method set default 'CASH';

alter table public.pos_purchase_receipts
  alter column document_status set not null,
  alter column goods_status set not null;

alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_document_status_chk;
alter table public.pos_purchase_receipts
  add constraint pos_purchase_document_status_chk
  check (document_status in ('DRAFT', 'COMPLETED', 'CANCELLED'));

alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_goods_status_chk;
alter table public.pos_purchase_receipts
  add constraint pos_purchase_goods_status_chk
  check (goods_status in ('NOT_RECEIVED', 'RECEIVED', 'SOLD', 'RETURNED', 'CANCELLED'));

alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_status_check;
alter table public.pos_purchase_receipts
  add constraint pos_purchase_status_check
  check (status in ('ORDERED', 'RECEIVED', 'CANCELLED', 'RETURNED'));

alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_payment_method_chk;
alter table public.pos_purchase_receipts
  add constraint pos_purchase_payment_method_chk
  check (payment_method is null or payment_method in ('CASH', 'TRANSFER', 'CARD'));

-- Weight snapshot on lines (optional; qty still drives stock pieces)
alter table public.pos_purchase_items
  add column if not exists weight_chi numeric(12, 4),
  add column if not exists unit_cost_dong_per_chi bigint;

-- ---------------------------------------------------------------------------
-- 3) Purchase payments (NCC) + cash ingest
-- ---------------------------------------------------------------------------
create table if not exists public.pos_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.pos_purchase_receipts(id) on delete restrict,
  amount_dong bigint not null check (amount_dong > 0),
  payment_method text not null check (payment_method in ('CASH', 'TRANSFER', 'CARD')),
  paid_at timestamptz not null default now(),
  actor_email text not null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists pos_purchase_payments_receipt_idx
  on public.pos_purchase_payments (receipt_id, paid_at);

alter table public.pos_purchase_payments enable row level security;

drop policy if exists pos_purchase_payments_admin_select on public.pos_purchase_payments;
create policy pos_purchase_payments_admin_select on public.pos_purchase_payments
  for select to authenticated
  using (public.tlkv_has_pos_access());

revoke all on table public.pos_purchase_payments from anon;
grant select on table public.pos_purchase_payments to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Supplier debt ledger (immutable; net = sum amount_change)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_supplier_debt_ledger (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid null references public.pos_suppliers(id) on delete restrict,
  supplier_name text not null,
  transaction_type text not null check (transaction_type in (
    'PURCHASE_DEBT',
    'PURCHASE_PAYMENT',
    'PURCHASE_RETURN',
    'ADJUSTMENT'
  )),
  amount_before_dong bigint not null,
  amount_change_dong bigint not null,
  amount_after_dong bigint not null,
  reference_type text not null,
  reference_id uuid not null,
  description text not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint pos_supplier_debt_math_chk check (
    amount_after_dong = amount_before_dong + amount_change_dong
  ),
  constraint pos_supplier_debt_desc_chk check (length(trim(description)) > 0)
);

create unique index if not exists pos_supplier_debt_ref_uidx
  on public.pos_supplier_debt_ledger (transaction_type, reference_type, reference_id);

create index if not exists pos_supplier_debt_supplier_time_idx
  on public.pos_supplier_debt_ledger (supplier_id, created_at desc);

alter table public.pos_supplier_debt_ledger enable row level security;

drop policy if exists pos_supplier_debt_admin_select on public.pos_supplier_debt_ledger;
create policy pos_supplier_debt_admin_select on public.pos_supplier_debt_ledger
  for select to authenticated
  using (public.tlkv_has_pos_access());

revoke all on table public.pos_supplier_debt_ledger from anon;
grant select on table public.pos_supplier_debt_ledger to authenticated;

create or replace function pos_private.supplier_debt_balance(
  p_supplier_id uuid,
  p_supplier_name text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal bigint;
begin
  if p_supplier_id is not null then
    select coalesce(sum(amount_change_dong), 0) into v_bal
    from public.pos_supplier_debt_ledger
    where supplier_id = p_supplier_id;
  else
    select coalesce(sum(amount_change_dong), 0) into v_bal
    from public.pos_supplier_debt_ledger
    where supplier_id is null
      and lower(trim(supplier_name)) = lower(trim(p_supplier_name));
  end if;
  return coalesce(v_bal, 0);
end;
$$;

create or replace function pos_private.apply_supplier_debt_change(
  p_supplier_id uuid,
  p_supplier_name text,
  p_transaction_type text,
  p_amount_change_dong bigint,
  p_reference_type text,
  p_reference_id uuid,
  p_description text,
  p_actor_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before bigint;
  v_after bigint;
  v_id uuid;
begin
  if p_amount_change_dong = 0 then
    return null;
  end if;

  select id into v_id
  from public.pos_supplier_debt_ledger
  where transaction_type = p_transaction_type
    and reference_type = p_reference_type
    and reference_id = p_reference_id
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  v_before := pos_private.supplier_debt_balance(p_supplier_id, p_supplier_name);
  v_after := v_before + p_amount_change_dong;

  insert into public.pos_supplier_debt_ledger (
    supplier_id, supplier_name, transaction_type,
    amount_before_dong, amount_change_dong, amount_after_dong,
    reference_type, reference_id, description, actor_email
  ) values (
    p_supplier_id, trim(p_supplier_name), p_transaction_type,
    v_before, p_amount_change_dong, v_after,
    p_reference_type, p_reference_id, trim(p_description),
    coalesce(nullif(trim(p_actor_email), ''), 'system')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Cash ingest for NCC purchase payments
-- ---------------------------------------------------------------------------
create or replace function pos_private.cash_ingest_purchase_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new public.pos_purchase_payments%rowtype;
  v_account uuid;
  v_txn text;
  v_prior integer;
  v_receipt_no text;
begin
  select * into new from public.pos_purchase_payments where id = p_payment_id;
  if not found or new.amount_dong is null or new.amount_dong <= 0 then
    return;
  end if;

  select count(*) into v_prior
  from public.pos_purchase_payments p
  where p.receipt_id = new.receipt_id
    and p.id is distinct from new.id
    and coalesce(p.paid_at, p.created_at) < coalesce(new.paid_at, new.created_at);

  v_txn := case when coalesce(v_prior, 0) = 0 then 'PURCHASE_PAYMENT' else 'PAYABLE_PAYMENT' end;

  select r.receipt_no into v_receipt_no
  from public.pos_purchase_receipts r
  where r.id = new.receipt_id
  limit 1;

  v_account := pos_private.cash_account_for_method(new.payment_method);

  perform pos_private.cash_post(
    v_account, v_txn, 'OUT', new.amount_dong,
    case when v_txn = 'PURCHASE_PAYMENT'
      then 'Thanh toán nguồn hàng' || coalesce(' ' || v_receipt_no, '')
      else 'Trả công nợ nguồn hàng' || coalesce(' ' || v_receipt_no, '')
    end,
    coalesce(new.actor_email, 'system'),
    coalesce(new.paid_at, new.created_at, now()),
    'purchase_receipt', new.receipt_id, v_receipt_no,
    'pos_purchase_payments', new.id, null
  );
end;
$$;

create or replace function pos_private.cash_trg_purchase_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.cash_ingest_purchase_payment(new.id);
  return new;
end;
$$;

drop trigger if exists trg_cash_post_purchase_payment on public.pos_purchase_payments;
create trigger trg_cash_post_purchase_payment
  after insert on public.pos_purchase_payments
  for each row execute function pos_private.cash_trg_purchase_payment();

-- ---------------------------------------------------------------------------
-- 6) Helper: ensure supplier row
-- ---------------------------------------------------------------------------
create or replace function pos_private.ensure_supplier(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := trim(p_name);
begin
  if length(v_name) = 0 then
    raise exception 'Tên nguồn hàng không được trống' using errcode = '22023';
  end if;
  select id into v_id
  from public.pos_suppliers
  where lower(trim(name)) = lower(v_name)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.pos_suppliers (name)
  values (v_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Rewrite receive_purchase: stock / cash / debt independent + idempotent stock
-- ---------------------------------------------------------------------------
drop function if exists pos_private.receive_purchase(text, text, text, jsonb, bigint);

create or replace function pos_private.receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb,
  p_paid_dong bigint default null,
  p_payment_method text default 'CASH',
  p_goods_status text default 'RECEIVED',
  p_expected_receive_at date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_receipt_id uuid;
  v_receipt_no text;
  v_item record;
  v_total bigint := 0;
  v_paid bigint := 0;
  v_remaining bigint := 0;
  v_pay_status text;
  v_cost bigint;
  v_amount bigint;
  v_brand text;
  v_result jsonb;
  v_supplier_id uuid;
  v_goods text := coalesce(nullif(trim(p_goods_status), ''), 'RECEIVED');
  v_pay_method text := coalesce(nullif(trim(p_payment_method), ''), 'CASH');
  v_status text;
  v_payment_id uuid;
  v_existing uuid;
begin
  v_actor := pos_private.require_admin();

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key bắt buộc' using errcode = '22023';
  end if;

  v_result := pos_private.begin_idempotency(p_idempotency_key, 'receive_purchase');
  if v_result is not null then
    return v_result;
  end if;

  begin
    if v_goods not in ('NOT_RECEIVED', 'RECEIVED') then
      raise exception 'Trạng thái nhận hàng khi tạo phiếu chỉ hỗ trợ Chưa nhận / Đã nhận' using errcode = '22023';
    end if;
    if v_pay_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Hình thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách hàng trống' using errcode = '22023';
    end if;

    v_supplier_id := pos_private.ensure_supplier(p_supplier_name);

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        expected_qty integer,
        received_qty integer,
        cost_price_dong bigint,
        weight_chi numeric,
        unit_cost_dong_per_chi bigint
      )
    loop
      if v_item.sku_id is null then
        raise exception 'sku_id bắt buộc' using errcode = '22023';
      end if;
      if v_item.received_qty is null or v_item.received_qty <= 0 then
        raise exception 'Số lượng nhận phải > 0' using errcode = '22023';
      end if;
      if v_item.cost_price_dong is null or v_item.cost_price_dong < 0 then
        raise exception 'Giá vốn phải là số nguyên VND không âm' using errcode = '22023';
      end if;
      perform 1 from public.pos_skus where id = v_item.sku_id for update;
      if not found then
        raise exception 'SKU không tồn tại' using errcode = 'P0001';
      end if;
      v_total := v_total + (v_item.cost_price_dong * v_item.received_qty);
    end loop;

    if p_paid_dong is null then
      v_paid := 0;
    else
      v_paid := p_paid_dong;
    end if;
    if v_paid < 0 or v_paid > v_total then
      raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_total - v_paid;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_total, null);

    v_status := case when v_goods = 'RECEIVED' then 'RECEIVED' else 'ORDERED' end;
    v_receipt_no := 'PN' || lpad(nextval('public.pos_purchase_seq')::text, 6, '0');

    insert into public.pos_purchase_receipts (
      receipt_no, status, document_status, goods_status,
      supplier_id, supplier_name, reason, idempotency_key, actor_email,
      received_at, stock_applied_at, completed_at,
      total_dong, paid_dong, remaining_dong, payment_status, payment_method,
      expected_receive_at, note
    ) values (
      v_receipt_no, v_status, 'COMPLETED', v_goods,
      v_supplier_id, trim(p_supplier_name),
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      trim(p_idempotency_key), v_actor,
      case when v_goods = 'RECEIVED' then now() else null end,
      case when v_goods = 'RECEIVED' then now() else null end,
      now(),
      v_total, v_paid, v_remaining, v_pay_status, v_pay_method,
      p_expected_receive_at, nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into v_receipt_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        expected_qty integer,
        received_qty integer,
        cost_price_dong bigint,
        weight_chi numeric,
        unit_cost_dong_per_chi bigint
      )
    loop
      v_cost := v_item.cost_price_dong;
      v_amount := v_cost * v_item.received_qty;
      insert into public.pos_purchase_items(
        receipt_id, sku_id, expected_qty, received_qty,
        cost_price_dong, cost_amount_dong, weight_chi, unit_cost_dong_per_chi
      ) values (
        v_receipt_id, v_item.sku_id,
        coalesce(v_item.expected_qty, v_item.received_qty),
        v_item.received_qty,
        v_cost, v_amount, v_item.weight_chi, v_item.unit_cost_dong_per_chi
      );

      if v_goods = 'RECEIVED' then
        select b.name into v_brand
        from public.pos_skus s
        left join public.brands b on b.id = s.brand_id
        where s.id = v_item.sku_id;

        -- Idempotent: skip if ledger already has PURCHASE_RECEIVED for this receipt+sku
        select t.id into v_existing
        from public.pos_inventory_transactions t
        where t.reference_type = 'PURCHASE'
          and t.reference_id = v_receipt_id
          and t.sku_id = v_item.sku_id
          and t.type = 'PURCHASE_RECEIVED'
        limit 1;

        if v_existing is null then
          perform pos_private.apply_stock_change(
            v_item.sku_id,
            v_item.received_qty,
            'PURCHASE_RECEIVED',
            coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
            'PURCHASE',
            v_receipt_id,
            v_actor,
            v_cost,
            v_brand
          );
        end if;
      end if;
    end loop;

    -- Goods received unpaid portion → supplier debt (+)
    -- Payment before/with receive → debt (-paid) so net = remaining when received,
    -- or negative prepaid when not yet received.
    if v_goods = 'RECEIVED' and v_total > 0 then
      perform pos_private.apply_supplier_debt_change(
        v_supplier_id, trim(p_supplier_name),
        'PURCHASE_DEBT', v_total,
        'purchase_receipt', v_receipt_id,
        'Phát sinh công nợ nguồn hàng ' || v_receipt_no,
        v_actor
      );
    end if;

    if v_paid > 0 then
      insert into public.pos_purchase_payments (
        receipt_id, amount_dong, payment_method, actor_email, note
      ) values (
        v_receipt_id, v_paid, v_pay_method, v_actor, 'Thanh toán kèm phiếu nhập'
      )
      returning id into v_payment_id;

      perform pos_private.apply_supplier_debt_change(
        v_supplier_id, trim(p_supplier_name),
        'PURCHASE_PAYMENT', -v_paid,
        'purchase_payment', v_payment_id,
        'Thanh toán nguồn hàng ' || v_receipt_no,
        v_actor
      );
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PURCHASE', 'purchase_receipt', v_receipt_id,
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      jsonb_build_object(
        'receipt_no', v_receipt_no,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'payment_status', v_pay_status,
        'goods_status', v_goods,
        'document_status', 'COMPLETED'
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'receipt_id', v_receipt_id,
      'receipt_no', v_receipt_no,
      'totalDong', v_total,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'goodsStatus', v_goods,
      'documentStatus', 'COMPLETED'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

drop function if exists public.pos_receive_purchase(text, text, text, jsonb, bigint);

create function public.pos_receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb,
  p_paid_dong bigint default null,
  p_payment_method text default 'CASH',
  p_goods_status text default 'RECEIVED',
  p_expected_receive_at date default null,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.receive_purchase(
    p_idempotency_key, p_supplier_name, p_reason, p_items, p_paid_dong,
    p_payment_method, p_goods_status, p_expected_receive_at, p_note
  );
$$;

revoke all on function public.pos_receive_purchase(text, text, text, jsonb, bigint, text, text, date, text)
  from public, anon;
grant execute on function public.pos_receive_purchase(text, text, text, jsonb, bigint, text, text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Mark goods received on an ORDERED completed receipt (no double stock)
-- ---------------------------------------------------------------------------
create or replace function public.pos_receive_ordered_purchase(
  p_receipt_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_r public.pos_purchase_receipts%rowtype;
  v_item record;
  v_brand text;
  v_existing uuid;
  v_result jsonb;
begin
  v_actor := pos_private.require_admin();

  v_result := pos_private.begin_idempotency(p_idempotency_key, 'receive_ordered_purchase');
  if v_result is not null then
    return v_result;
  end if;

  begin
    select * into v_r from public.pos_purchase_receipts where id = p_receipt_id for update;
    if not found then
      raise exception 'Phiếu nhập không tồn tại' using errcode = 'P0001';
    end if;
    if v_r.document_status <> 'COMPLETED' then
      raise exception 'Chỉ nhận hàng trên phiếu đã hoàn thành' using errcode = 'P0001';
    end if;
    if v_r.goods_status = 'RECEIVED' and v_r.stock_applied_at is not null then
      v_result := jsonb_build_object('ok', true, 'receipt_id', v_r.id, 'receipt_no', v_r.receipt_no, 'already', true);
      return pos_private.finish_idempotency(p_idempotency_key, v_result);
    end if;
    if v_r.goods_status <> 'NOT_RECEIVED' and v_r.status <> 'ORDERED' then
      raise exception 'Phiếu không ở trạng thái chờ nhận hàng' using errcode = 'P0001';
    end if;

    for v_item in
      select * from public.pos_purchase_items where receipt_id = v_r.id
    loop
      select t.id into v_existing
      from public.pos_inventory_transactions t
      where t.reference_type = 'PURCHASE'
        and t.reference_id = v_r.id
        and t.sku_id = v_item.sku_id
        and t.type = 'PURCHASE_RECEIVED'
      limit 1;
      if v_existing is not null then
        continue;
      end if;

      select b.name into v_brand
      from public.pos_skus s
      left join public.brands b on b.id = s.brand_id
      where s.id = v_item.sku_id;

      perform pos_private.apply_stock_change(
        v_item.sku_id,
        v_item.received_qty,
        'PURCHASE_RECEIVED',
        coalesce(v_r.reason, 'Nhận hàng đặt kho'),
        'PURCHASE',
        v_r.id,
        v_actor,
        v_item.cost_price_dong,
        v_brand
      );
    end loop;

    -- Debt increases by total when goods arrive (prepaid already reduced debt)
    if v_r.total_dong > 0 then
      perform pos_private.apply_supplier_debt_change(
        v_r.supplier_id, v_r.supplier_name,
        'PURCHASE_DEBT', v_r.total_dong,
        'purchase_receipt', v_r.id,
        'Phát sinh công nợ nguồn hàng ' || v_r.receipt_no,
        v_actor
      );
    end if;

    update public.pos_purchase_receipts
    set
      goods_status = 'RECEIVED',
      status = 'RECEIVED',
      received_at = now(),
      stock_applied_at = now()
    where id = v_r.id;

    v_result := jsonb_build_object(
      'ok', true,
      'receipt_id', v_r.id,
      'receipt_no', v_r.receipt_no,
      'goodsStatus', 'RECEIVED'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_receive_ordered_purchase(uuid, text) from public, anon;
grant execute on function public.pos_receive_ordered_purchase(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Collect later payment on a purchase receipt
-- ---------------------------------------------------------------------------
create or replace function public.pos_collect_purchase_payment(
  p_receipt_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_r public.pos_purchase_receipts%rowtype;
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text);
  v_result jsonb;
  v_payment_id uuid;
  v_paid bigint;
  v_remaining bigint;
  v_status text;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'CASH');
begin
  v_actor := pos_private.require_admin();

  v_result := pos_private.begin_idempotency(v_key, 'collect_purchase_payment');
  if v_result is not null then
    return v_result;
  end if;

  begin
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền phải là số nguyên VND > 0' using errcode = '22023';
    end if;
    if v_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Hình thức thanh toán không hợp lệ' using errcode = '22023';
    end if;

    select * into v_r from public.pos_purchase_receipts where id = p_receipt_id for update;
    if not found then
      raise exception 'Phiếu nhập không tồn tại' using errcode = 'P0001';
    end if;
    if v_r.document_status <> 'COMPLETED' then
      raise exception 'Phiếu chưa hoàn thành' using errcode = 'P0001';
    end if;
    if p_amount_dong > v_r.remaining_dong then
      raise exception 'Không vượt số còn lại' using errcode = '22023';
    end if;

    insert into public.pos_purchase_payments (
      receipt_id, amount_dong, payment_method, actor_email, note
    ) values (
      v_r.id, p_amount_dong, v_method, v_actor, nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into v_payment_id;

    perform pos_private.apply_supplier_debt_change(
      v_r.supplier_id, v_r.supplier_name,
      'PURCHASE_PAYMENT', -p_amount_dong,
      'purchase_payment', v_payment_id,
      'Thanh toán nguồn hàng ' || v_r.receipt_no,
      v_actor
    );

    v_paid := v_r.paid_dong + p_amount_dong;
    v_remaining := v_r.total_dong - v_paid;
    v_status := pos_private.derive_sale_payment_status(v_paid, v_r.total_dong, null);

    update public.pos_purchase_receipts
    set paid_dong = v_paid, remaining_dong = v_remaining, payment_status = v_status
    where id = v_r.id;

    v_result := jsonb_build_object(
      'ok', true,
      'receiptId', v_r.id,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_status
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(v_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_collect_purchase_payment(uuid, bigint, text, text, text)
  from public, anon;
grant execute on function public.pos_collect_purchase_payment(uuid, bigint, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Get purchase receipt detail
-- ---------------------------------------------------------------------------
create or replace function public.pos_get_purchase_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt jsonb;
  v_items jsonb;
  v_payments jsonb;
begin
  perform pos_private.require_pos_user();

  select jsonb_build_object(
    'id', r.id,
    'receiptNo', r.receipt_no,
    'status', r.status,
    'documentStatus', r.document_status,
    'goodsStatus', r.goods_status,
    'supplierId', r.supplier_id,
    'supplierName', r.supplier_name,
    'reason', r.reason,
    'note', r.note,
    'totalDong', r.total_dong,
    'paidDong', r.paid_dong,
    'remainingDong', r.remaining_dong,
    'paymentStatus', r.payment_status,
    'paymentMethod', coalesce(r.payment_method, 'CASH'),
    'expectedReceiveAt', r.expected_receive_at,
    'actorEmail', r.actor_email,
    'receivedAt', r.received_at,
    'completedAt', r.completed_at,
    'stockAppliedAt', r.stock_applied_at,
    'createdAt', r.created_at
  )
  into v_receipt
  from public.pos_purchase_receipts r
  where r.id = p_receipt_id;

  if v_receipt is null then
    raise exception 'Phiếu nhập không tồn tại' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'skuId', i.sku_id,
    'sku', s.sku,
    'name', s.name,
    'brandName', b.name,
    'expectedQty', i.expected_qty,
    'receivedQty', i.received_qty,
    'costPriceDong', i.cost_price_dong,
    'costAmountDong', i.cost_amount_dong,
    'weightChi', i.weight_chi,
    'unitCostDongPerChi', i.unit_cost_dong_per_chi,
    'skuWeightChi', s.weight_chi
  ) order by i.id), '[]'::jsonb)
  into v_items
  from public.pos_purchase_items i
  join public.pos_skus s on s.id = i.sku_id
  left join public.brands b on b.id = s.brand_id
  where i.receipt_id = p_receipt_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amountDong', p.amount_dong,
    'paymentMethod', p.payment_method,
    'paidAt', p.paid_at,
    'actorEmail', p.actor_email,
    'note', p.note
  ) order by p.paid_at), '[]'::jsonb)
  into v_payments
  from public.pos_purchase_payments p
  where p.receipt_id = p_receipt_id;

  return v_receipt || jsonb_build_object('items', v_items, 'payments', v_payments);
end;
$$;

revoke all on function public.pos_get_purchase_receipt(uuid) from public, anon;
grant execute on function public.pos_get_purchase_receipt(uuid) to authenticated;

create or replace function public.pos_list_suppliers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pos_private.require_pos_user();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'phone', s.phone,
      'isActive', s.is_active
    ) order by s.name)
    from public.pos_suppliers s
    where s.is_active
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_list_suppliers() from public, anon;
grant execute on function public.pos_list_suppliers() to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Document list: include completed PN (ORDERED or RECEIVED); keep sale/buy filters
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
  v_total int;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loại chứng từ không hợp lệ' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trạng thái thanh toán không hợp lệ' using errcode = '22023';
  end if;

  with docs as (
    select
      i.id,
      i.invoice_no as document_no,
      'SALE_TO_CUSTOMER'::text as document_type,
      i.issued_at,
      c.name as party_name,
      c.phone as party_phone,
      s.total_dong,
      s.paid_dong,
      s.remaining_dong,
      s.payment_status,
      s.payment_method,
      s.sale_no as ref_no
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(i.invoice_no) like '%' || v_q || '%'
        or lower(s.sale_no) like '%' || v_q || '%'
        or lower(c.name) like '%' || v_q || '%'
        or lower(c.phone) like '%' || v_q || '%'
      )

    union all

    select
      b.id,
      b.buy_no,
      'PURCHASE_FROM_CUSTOMER',
      coalesce(b.completed_at, b.created_at),
      coalesce(b.customer_name_snapshot, c.name),
      coalesce(b.customer_phone_snapshot, c.phone),
      b.total_dong,
      b.paid_dong,
      b.remaining_dong,
      b.payment_status,
      b.payment_method,
      b.buy_no
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where b.status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(b.buy_no) like '%' || v_q || '%'
        or lower(coalesce(b.customer_name_snapshot, c.name)) like '%' || v_q || '%'
        or lower(coalesce(b.customer_phone_snapshot, c.phone)) like '%' || v_q || '%'
      )

    union all

    select
      r.id,
      r.receipt_no,
      'STOCK_RECEIPT',
      coalesce(r.completed_at, r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      r.payment_method,
      r.receipt_no
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  paged as (
    select
      d.id,
      d.document_no as "documentNo",
      d.document_type as "documentType",
      d.issued_at as "issuedAt",
      d.party_name as "partyName",
      d.party_phone as "partyPhone",
      d.total_dong as "totalDong",
      d.paid_dong as "paidDong",
      d.remaining_dong as "remainingDong",
      d.payment_status as "paymentStatus",
      d.payment_method as "paymentMethod",
      d.ref_no as "refNo"
    from docs d
    order by d.issued_at desc
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  to authenticated;

create or replace function public.pos_export_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.pos_list_documents(p_document_type, p_payment_status, p_from, p_to, p_q, 10000, 0);
$$;

revoke all on function public.pos_export_documents(text, text, date, date, text)
  from public, anon;
grant execute on function public.pos_export_documents(text, text, date, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 12) Opening debt snapshot for historical unpaid received PNs (no cash backfill)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select *
    from public.pos_purchase_receipts
    where document_status = 'COMPLETED'
      and goods_status = 'RECEIVED'
      and remaining_dong > 0
  loop
    begin
      perform pos_private.apply_supplier_debt_change(
        r.supplier_id, r.supplier_name,
        'PURCHASE_DEBT', r.remaining_dong,
        'purchase_receipt_opening', r.id,
        'Số dư công nợ mở đầu ' || r.receipt_no,
        coalesce(r.actor_email, 'system')
      );
    exception when others then
      raise notice 'supplier debt backfill skip %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;
