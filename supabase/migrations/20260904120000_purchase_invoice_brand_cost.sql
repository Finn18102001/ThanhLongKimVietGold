-- Purchase-from-customer voucher snapshots, brand on inventory, cost on inbound,
-- ledger/document list+export. Integer VND. No hard-delete of completed txs.

-- ---------------------------------------------------------------------------
-- 1. Brand master extras + sku/item snapshots
-- ---------------------------------------------------------------------------
insert into public.brands (name, slug, description, sort_order, is_active)
values
  ('Vàng thị trường', 'vang-thi-truong', 'Vàng thương hiệu khác / thị trường', 80, true),
  ('Bạc', 'bac', 'Bạc', 90, true)
on conflict (slug) do nothing;

alter table public.pos_skus
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

alter table public.pos_inventory_stock
  add column if not exists last_cost_dong bigint;

alter table public.pos_inventory_transactions
  add column if not exists cost_price_dong bigint,
  add column if not exists brand_name text;

alter table public.pos_buy_items
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists brand_name text;

alter table public.pos_buys
  add column if not exists customer_name_snapshot text,
  add column if not exists customer_phone_snapshot text,
  add column if not exists customer_citizen_id_snapshot text,
  add column if not exists customer_address_snapshot text,
  add column if not exists customer_bank_account_snapshot text,
  add column if not exists customer_bank_holder_snapshot text;

alter table public.pos_customers
  add column if not exists bank_account text,
  add column if not exists bank_account_holder text;

alter table public.pos_purchase_items
  add column if not exists cost_price_dong bigint,
  add column if not exists cost_amount_dong bigint;

alter table public.pos_purchase_receipts
  add column if not exists total_dong bigint not null default 0,
  add column if not exists paid_dong bigint not null default 0,
  add column if not exists remaining_dong bigint not null default 0,
  add column if not exists payment_status text not null default 'UNPAID';

create index if not exists pos_skus_brand_id_idx on public.pos_skus (brand_id);

update public.pos_skus s
set brand_id = b.id
from public.gold_price_rows g
join public.brands b on b.slug = case
  when upper(g.brand) like '%THĂNG LONG%' or upper(g.brand) like '%THANG LONG%' then 'thang-long-kim-viet'
  when upper(g.brand) like '%MINH CHÂU%' or upper(g.brand) like '%MINH CHAU%' then 'bao-tin-minh-chau'
  when upper(g.brand) like '%MẠNH HẢI%' or upper(g.brand) like '%MANH HAI%' then 'bao-tin-manh-hai'
  when upper(g.brand) like '%THỊ TRƯỜNG%' or upper(g.brand) like '%THI TRUONG%' then 'vang-thi-truong'
  when upper(g.brand) like '%BẠC%' or upper(g.brand) = 'BẠC' then 'bac'
  else null
end
where s.price_row_id = g.id
  and s.brand_id is null;

update public.pos_skus s
set brand_id = b.id
from public.brands b
where s.is_market_gold
  and s.brand_id is null
  and b.slug = 'vang-thi-truong';

update public.pos_buys b
set
  customer_name_snapshot = coalesce(b.customer_name_snapshot, c.name),
  customer_phone_snapshot = coalesce(b.customer_phone_snapshot, c.phone),
  customer_citizen_id_snapshot = coalesce(b.customer_citizen_id_snapshot, c.citizen_id),
  customer_address_snapshot = coalesce(b.customer_address_snapshot, c.address)
from public.pos_customers c
where c.id = b.customer_id
  and b.customer_name_snapshot is null;

update public.pos_buy_items i
set
  brand_id = coalesce(i.brand_id, s.brand_id),
  brand_name = coalesce(i.brand_name, br.name)
from public.pos_skus s
left join public.brands br on br.id = s.brand_id
where s.id = i.sku_id
  and i.brand_name is null;

alter table public.pos_inventory_stock
  drop constraint if exists pos_inventory_stock_last_cost_dong_chk;
alter table public.pos_inventory_stock
  add constraint pos_inventory_stock_last_cost_dong_chk
  check (last_cost_dong is null or last_cost_dong >= 0);

alter table public.pos_inventory_transactions
  drop constraint if exists pos_inventory_transactions_cost_price_dong_chk;
alter table public.pos_inventory_transactions
  add constraint pos_inventory_transactions_cost_price_dong_chk
  check (cost_price_dong is null or cost_price_dong >= 0);

alter table public.pos_purchase_items
  drop constraint if exists pos_purchase_items_cost_price_dong_chk;
alter table public.pos_purchase_items
  add constraint pos_purchase_items_cost_price_dong_chk
  check (cost_price_dong is null or cost_price_dong >= 0);

alter table public.pos_purchase_receipts
  drop constraint if exists pos_purchase_receipts_money_chk;
alter table public.pos_purchase_receipts
  add constraint pos_purchase_receipts_money_chk
  check (
    total_dong >= 0
    and paid_dong >= 0
    and remaining_dong >= 0
    and paid_dong <= total_dong
    and payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')
  );

-- ---------------------------------------------------------------------------
-- 2. Stock change: optional cost + brand snapshot
-- ---------------------------------------------------------------------------
drop function if exists pos_private.apply_stock_change(uuid, integer, text, text, text, uuid, text);

create function pos_private.apply_stock_change(
  p_sku_id uuid,
  p_delta integer,
  p_type text,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_email text,
  p_cost_price_dong bigint default null,
  p_brand_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
  v_cost bigint;
  v_brand text;
begin
  if p_cost_price_dong is not null and p_cost_price_dong < 0 then
    raise exception 'Giá vốn không được âm' using errcode = '22023';
  end if;

  select s.quantity into v_before
  from public.pos_inventory_stock s
  where s.sku_id = p_sku_id
  for update;

  if v_before is null then
    raise exception 'SKU chưa có sổ tồn kho' using errcode = 'P0001';
  end if;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'Không đủ tồn kho' using errcode = 'P0001';
  end if;

  v_cost := p_cost_price_dong;
  v_brand := nullif(trim(coalesce(p_brand_name, '')), '');
  if v_brand is null then
    select b.name into v_brand
    from public.pos_skus s
    left join public.brands b on b.id = s.brand_id
    where s.id = p_sku_id;
  end if;

  insert into public.pos_inventory_transactions (
    sku_id, type, quantity, before_quantity, after_quantity,
    reason, reference_type, reference_id, actor_email, created_at,
    cost_price_dong, brand_name
  ) values (
    p_sku_id, p_type, p_delta, v_before, v_after,
    p_reason, p_reference_type, p_reference_id, p_actor_email, now(),
    v_cost, v_brand
  );

  update public.pos_inventory_stock
  set
    quantity = v_after,
    updated_at = now(),
    last_cost_dong = case
      when p_delta > 0 and v_cost is not null then v_cost
      else last_cost_dong
    end
  where sku_id = p_sku_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Receive purchase: cost required, payment derived on backend
-- ---------------------------------------------------------------------------
drop function if exists public.pos_receive_purchase(text, text, text, jsonb);
drop function if exists pos_private.receive_purchase(text, text, text, jsonb);

create function pos_private.receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb,
  p_paid_dong bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_receipt_id uuid;
  v_receipt_no text;
  v_item record;
  v_sku_ids uuid[];
  v_result jsonb;
  v_cost bigint;
  v_amount bigint;
  v_total bigint := 0;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_brand text;
begin
  v_actor := pos_private.require_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'receive_purchase');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách nhập hàng trống' using errcode = '22023';
    end if;
    if length(trim(coalesce(p_supplier_name, ''))) = 0 then
      raise exception 'Thiếu nhà cung cấp' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id)
    into v_sku_ids
    from jsonb_to_recordset(p_items) as x(
      sku_id uuid, expected_qty integer, received_qty integer, cost_price_dong bigint
    );

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = any(v_sku_ids)
    order by s.sku_id
    for update;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid, expected_qty integer, received_qty integer, cost_price_dong bigint
      )
    loop
      if v_item.received_qty is null or v_item.received_qty <= 0 then
        raise exception 'Số lượng nhận phải > 0' using errcode = '22023';
      end if;
      if v_item.expected_qty is null or v_item.expected_qty < 0 then
        raise exception 'Số lượng dự kiến không hợp lệ' using errcode = '22023';
      end if;
      if v_item.cost_price_dong is null then
        raise exception 'Giá vốn bắt buộc khi nhập kho' using errcode = '22023';
      end if;
      if v_item.cost_price_dong < 0 then
        raise exception 'Giá vốn không được âm' using errcode = '22023';
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

    v_receipt_no := 'PN' || lpad(nextval('public.pos_purchase_seq')::text, 6, '0');
    insert into public.pos_purchase_receipts (
      receipt_no, status, supplier_name, reason, idempotency_key, actor_email, received_at,
      total_dong, paid_dong, remaining_dong, payment_status
    ) values (
      v_receipt_no, 'RECEIVED', trim(p_supplier_name),
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      trim(p_idempotency_key), v_actor, now(),
      v_total, v_paid, v_remaining, v_pay_status
    )
    returning id into v_receipt_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid, expected_qty integer, received_qty integer, cost_price_dong bigint
      )
    loop
      v_cost := v_item.cost_price_dong;
      v_amount := v_cost * v_item.received_qty;
      insert into public.pos_purchase_items(
        receipt_id, sku_id, expected_qty, received_qty, cost_price_dong, cost_amount_dong
      ) values (
        v_receipt_id, v_item.sku_id, v_item.expected_qty, v_item.received_qty, v_cost, v_amount
      );

      select b.name into v_brand
      from public.pos_skus s
      left join public.brands b on b.id = s.brand_id
      where s.id = v_item.sku_id;

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
    end loop;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PURCHASE', 'purchase_receipt', v_receipt_id,
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      jsonb_build_object(
        'receipt_no', v_receipt_no,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'payment_status', v_pay_status
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'receipt_id', v_receipt_id,
      'receipt_no', v_receipt_no,
      'totalDong', v_total,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create function public.pos_receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb,
  p_paid_dong bigint default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.receive_purchase(
    p_idempotency_key, p_supplier_name, p_reason, p_items, p_paid_dong
  );
$$;

revoke all on function public.pos_receive_purchase(text, text, text, jsonb, bigint) from public, anon;
grant execute on function public.pos_receive_purchase(text, text, text, jsonb, bigint) to authenticated;
