-- Order jewelry created inside a warehouse receipt.
-- SKU is prefix + 6-digit sequence, fixed after insert.
-- Website visibility stays off unless the slip asks to show it.
-- POS SKU becomes active when the receipt actually receives stock.

alter table public.pos_skus
  add column if not exists is_order_jewelry boolean not null default false;

create index if not exists idx_pos_skus_order_jewelry
  on public.pos_skus (is_order_jewelry)
  where is_order_jewelry;

-- Keep the generated catalog code from rewriting an order SKU.
create or replace function public.tlkv_sync_pos_sku_from_product(p public.products)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku_id uuid;
  v_price_row_id text;
  v_board_unit numeric(12, 4);
  v_sku_code text;
  v_weight numeric;
  v_lookup text;
  v_name_l text;
  v_source_l text;
begin
  if p.id is null or nullif(trim(p.name), '') is null then
    return;
  end if;

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = p.id
  limit 1;

  if v_sku_id is not null and exists (
    select 1 from public.pos_skus s
    where s.id = v_sku_id and s.is_order_jewelry
  ) then
    update public.pos_skus s
    set
      name = p.name,
      brand_id = coalesce(p.brand_id, s.brand_id),
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi)
    where s.id = v_sku_id;
    return;
  end if;

  v_name_l := lower(replace(replace(trim(p.name), E'\n', ' '), '  ', ' '));
  v_source_l := lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '));

  v_lookup := nullif(trim(coalesce(p.price_source_product, '')), '');
  if v_lookup is null then
    if v_name_l ~ 'đồng[[:space:]]*xu' and (v_name_l ~ 'vrtl' or v_name_l ~ 'vàng[[:space:]]*rồng') then
      v_lookup := 'Đồng Xu Vàng Rồng Thăng Long';
    elsif v_name_l ~ 'nhẫn[[:space:]]*vàng[[:space:]]*rồng' then
      v_lookup := 'Nhẫn Vàng Rồng Thăng Long';
    end if;
  end if;

  select
    g.id,
    case
      when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1
      else 1.0
    end
  into v_price_row_id, v_board_unit
  from public.gold_price_rows g
  where g.sell > 0
    and length(trim(g.product)) > 0
    and (
      (
        v_lookup is not null
        and (
          lower(trim(g.product)) = lower(trim(v_lookup))
          or lower(trim(v_lookup)) like '%' || lower(trim(g.product)) || '%'
          or lower(trim(g.product)) like '%' || lower(trim(v_lookup)) || '%'
        )
      )
      or (
        v_lookup is null
        and (
          v_source_l like '%' || lower(trim(g.product)) || '%'
          or v_name_l like '%' || lower(trim(g.product)) || '%'
        )
      )
    )
  order by
    case when lower(trim(g.product)) = lower(trim(coalesce(v_lookup, ''))) then 0 else 1 end,
    length(trim(g.product)) desc
  limit 1;

  v_weight := coalesce(nullif(p.weight, 0), 1);
  v_sku_code := public.tlkv_build_pos_sku_code(p.name, p.brand_id, v_weight, v_sku_id);

  if v_sku_id is null then
    insert into public.pos_skus (
      sku, name, catalog_product_id, price_row_id, weight_chi, board_unit_chi,
      labor_fee_dong, brand_id, is_active
    ) values (
      v_sku_code,
      p.name,
      p.id,
      v_price_row_id,
      v_weight,
      coalesce(v_board_unit, 1),
      0,
      p.brand_id,
      coalesce(p.is_active, true)
    )
    returning id into v_sku_id;
  else
    update public.pos_skus s
    set
      sku = v_sku_code,
      name = p.name,
      price_row_id = case when v_price_row_id is not null then v_price_row_id else s.price_row_id end,
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi),
      board_unit_chi = case when v_board_unit is not null then v_board_unit else s.board_unit_chi end,
      brand_id = coalesce(p.brand_id, s.brand_id),
      is_active = coalesce(p.is_active, true)
    where s.id = v_sku_id
      and coalesce(s.is_market_gold, false) is not true;
  end if;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict (sku_id) do nothing;
end;
$$;

create or replace function pos_private.create_order_jewelry_sku(
  p_name text,
  p_brand_id uuid,
  p_category_id uuid,
  p_price_row_id text,
  p_price_note text,
  p_weight_chi numeric,
  p_sku_prefix text,
  p_visible boolean
)
returns table (sku_id uuid, sku_code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_prefix text;
  v_next integer;
  v_code text;
  v_slug text;
  v_category text := '';
  v_board numeric := 1;
  v_row_id text := nullif(trim(coalesce(p_price_row_id, '')), '');
  v_weight numeric := p_weight_chi;
  v_sku_id uuid;
  v_visible boolean := coalesce(p_visible, false);
begin
  if v_name is null then
    raise exception 'Tên sản phẩm là bắt buộc' using errcode = '22023';
  end if;
  if p_brand_id is null or not exists (select 1 from public.brands b where b.id = p_brand_id) then
    raise exception 'Thương hiệu là bắt buộc' using errcode = '22023';
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_sku_prefix), ''), 'TLKVTS'), '[^A-Za-z0-9]', '', 'g'));
  if v_prefix is null or length(v_prefix) < 2 or length(v_prefix) > 12 then
    raise exception 'Mã đầu sản phẩm Order phải từ 2 đến 12 ký tự chữ hoặc số' using errcode = '22023';
  end if;

  if v_row_id is not null and not exists (select 1 from public.gold_price_rows g where g.id = v_row_id) then
    raise exception 'Dòng bảng giá không tồn tại' using errcode = '22023';
  end if;

  if p_category_id is not null then
    select c.name into v_category
    from public.categories c
    where c.id = p_category_id;
    if v_category is null then
      raise exception 'Danh mục không tồn tại' using errcode = '22023';
    end if;
  end if;

  if v_weight is not null and v_weight < 0 then
    raise exception 'Định lượng không hợp lệ' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('tlkv-order-jewelry-' || v_prefix)::bigint);

  select coalesce(max(substring(code from length(v_prefix) + 1)::integer), 0) + 1
  into v_next
  from (
    select s.sku as code
    from public.pos_skus s
    where s.sku ~ ('^' || v_prefix || '[0-9]{6}$')
    union all
    select p.id as code
    from public.products p
    where p.id ~ ('^' || v_prefix || '[0-9]{6}$')
  ) codes;

  v_code := v_prefix || lpad(v_next::text, 6, '0');
  v_slug := lower(v_code);

  if v_row_id is not null then
    select case when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1 else 1 end
    into v_board
    from public.gold_price_rows g
    where g.id = v_row_id;
  end if;

  insert into public.products (
    id, name, slug, brand_id, category_id, category,
    price_text, price_row_id, weight, image, is_active,
    is_featured, is_best_seller, is_hot
  ) values (
    v_code,
    v_name,
    v_slug,
    p_brand_id,
    p_category_id,
    coalesce(v_category, ''),
    left(coalesce(p_price_note, ''), 500),
    v_row_id,
    case when v_weight is null or v_weight <= 0 then null else v_weight end,
    '',
    v_visible,
    false,
    false,
    false
  );

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = v_code
  limit 1;

  if v_sku_id is null then
    raise exception 'Không tạo được mã kho cho sản phẩm Order' using errcode = 'P0001';
  end if;

  update public.pos_skus s
  set
    sku = v_code,
    name = v_name,
    brand_id = p_brand_id,
    price_row_id = v_row_id,
    weight_chi = coalesce(nullif(v_weight, 0), 1),
    board_unit_chi = coalesce(v_board, 1),
    is_active = v_visible,
    is_order_jewelry = true,
    is_market_gold = false
  where s.id = v_sku_id;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict on constraint pos_inventory_stock_pkey do nothing;

  return query select v_sku_id, v_code;
end;
$$;

create or replace function pos_private.activate_order_jewelry_sku()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'PURCHASE_RECEIVED' and coalesce(new.quantity, 0) > 0 then
    update public.pos_skus s
    set is_active = true
    where s.id = new.sku_id
      and s.is_order_jewelry
      and s.is_active = false;
  end if;
  return new;
end;
$$;

drop trigger if exists pos_inventory_tx_activate_order_jewelry on public.pos_inventory_transactions;
create trigger pos_inventory_tx_activate_order_jewelry
after insert on public.pos_inventory_transactions
for each row
execute function pos_private.activate_order_jewelry_sku();

create or replace function public.pos_receive_order_purchase(
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
  v_existing jsonb;
  v_item jsonb;
  v_order jsonb;
  v_out jsonb := '[]'::jsonb;
  v_codes jsonb := '[]'::jsonb;
  v_sku uuid;
  v_code text;
  v_weight numeric;
  v_result jsonb;
begin
  perform pos_private.require_admin();

  select k.response into v_existing
  from public.pos_idempotency_keys k
  where k.key = trim(p_idempotency_key);

  if v_existing is not null
     and coalesce(v_existing ->> 'status', '') <> 'pending'
     and v_existing ? 'receipt_id' then
    return v_existing;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Danh sách hàng trống' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_order := v_item -> 'order_product';
    if v_order is not null and jsonb_typeof(v_order) = 'object' then
      v_weight := nullif(v_item ->> 'weight_chi', '')::numeric;
      select created.sku_id, created.sku_code
      into v_sku, v_code
      from pos_private.create_order_jewelry_sku(
        v_order ->> 'name',
        nullif(v_order ->> 'brand_id', '')::uuid,
        nullif(v_order ->> 'category_id', '')::uuid,
        nullif(v_order ->> 'price_row_id', ''),
        v_order ->> 'price_note',
        coalesce(nullif(v_order ->> 'weight_chi', '')::numeric, v_weight),
        v_order ->> 'sku_prefix',
        coalesce((v_order ->> 'visible')::boolean, false)
      ) as created;

      v_item := (v_item - 'order_product') || jsonb_build_object('sku_id', v_sku);
      v_codes := v_codes || jsonb_build_array(v_code);
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;

  v_result := pos_private.receive_purchase(
    p_idempotency_key,
    p_supplier_name,
    p_reason,
    v_out,
    p_paid_dong,
    p_payment_method,
    p_goods_status,
    p_expected_receive_at,
    p_note
  );

  return v_result || jsonb_build_object('orderSkus', v_codes);
end;
$$;

revoke all on function public.pos_receive_order_purchase(text, text, text, jsonb, bigint, text, text, date, text) from public, anon;
grant execute on function public.pos_receive_order_purchase(text, text, text, jsonb, bigint, text, text, date, text) to authenticated;
