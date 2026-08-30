-- POS held orders (parked unpaid carts). Not a sale, not an invoice, no stock change.
-- Visibility: pos_held_order_settings.visible_to_all
--   false (default) = only the saver's account can list/resume/cancel
--   true            = every POS account can list/resume/cancel (future req)

create sequence if not exists public.pos_held_order_seq;

create table if not exists public.pos_held_order_settings (
  singleton boolean primary key default true check (singleton),
  visible_to_all boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.pos_held_order_settings (singleton, visible_to_all)
values (true, false)
on conflict (singleton) do nothing;

create table if not exists public.pos_held_orders (
  id uuid primary key default gen_random_uuid(),
  hold_no text not null unique,
  status text not null default 'HELD',
  customer_id uuid references public.pos_customers (id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  customer_no text,
  is_walk_in boolean not null default false,
  payment_method text not null default 'CASH',
  note text,
  estimated_total_dong bigint not null,
  item_count integer not null,
  saved_by_user_id uuid,
  saved_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_sale_id uuid references public.pos_sales (id) on delete restrict,
  constraint pos_held_orders_status_check check (
    status in ('HELD', 'CANCELLED', 'COMPLETED')
  ),
  constraint pos_held_orders_payment_check check (
    payment_method in ('CASH', 'TRANSFER', 'CARD')
  ),
  constraint pos_held_orders_total_nonneg check (estimated_total_dong >= 0),
  constraint pos_held_orders_item_count_pos check (item_count > 0),
  constraint pos_held_orders_name_check check (length(trim(customer_name)) > 0)
);

create table if not exists public.pos_held_order_items (
  id uuid primary key default gen_random_uuid(),
  held_order_id uuid not null references public.pos_held_orders (id) on delete cascade,
  sku_id uuid not null references public.pos_skus (id) on delete restrict,
  sku text not null,
  name text not null,
  quantity integer not null,
  unit_price_dong bigint not null,
  line_total_dong bigint not null,
  sort_index integer not null default 0,
  constraint pos_held_order_items_qty_pos check (quantity > 0),
  constraint pos_held_order_items_price_nonneg check (unit_price_dong >= 0),
  constraint pos_held_order_items_line_nonneg check (line_total_dong >= 0)
);

create unique index if not exists pos_held_order_items_hold_sku_uidx
  on public.pos_held_order_items (held_order_id, sku_id);

create index if not exists pos_held_orders_status_saver_idx
  on public.pos_held_orders (status, saved_by_email, created_at desc);

create index if not exists pos_held_orders_status_created_idx
  on public.pos_held_orders (status, created_at desc);

alter table public.pos_held_order_settings enable row level security;
alter table public.pos_held_orders enable row level security;
alter table public.pos_held_order_items enable row level security;

revoke all on table public.pos_held_order_settings from anon, authenticated, public;
revoke all on table public.pos_held_orders from anon, authenticated, public;
revoke all on table public.pos_held_order_items from anon, authenticated, public;

create or replace function pos_private.held_orders_visible_to_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.visible_to_all
      from public.pos_held_order_settings s
      where s.singleton
      limit 1
    ),
    false
  );
$$;

create or replace function pos_private.can_access_held_order(p_saved_by_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' then
    return false;
  end if;
  if pos_private.held_orders_visible_to_all() then
    return true;
  end if;
  return lower(trim(p_saved_by_email)) = v_email;
end;
$$;

create or replace function pos_private.replace_held_order_items(
  p_hold_id uuid,
  p_items jsonb
)
returns table (item_count integer, estimated_total_dong bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_sku public.pos_skus%rowtype;
  v_price record;
  v_count integer := 0;
  v_total bigint := 0;
  v_sort integer := 0;
  v_line bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Chưa chọn sản phẩm để lưu đơn' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    group by x.sku_id
    having count(*) > 1
  ) then
    raise exception 'Giỏ hàng có mã trùng' using errcode = '22023';
  end if;

  delete from public.pos_held_order_items where held_order_id = p_hold_id;

  for v_item in
    select x.sku_id, x.quantity
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
  loop
    if v_item.sku_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Dòng hàng lưu đơn không hợp lệ' using errcode = '22023';
    end if;

    select * into v_sku from public.pos_skus s where s.id = v_item.sku_id;
    if not found or not v_sku.is_active then
      raise exception 'Sản phẩm không còn bán được' using errcode = 'P0001';
    end if;

    select * into v_price from pos_private.compute_unit_price(v_sku);
    v_line := v_price.unit_price_dong * v_item.quantity;
    v_sort := v_sort + 1;
    v_count := v_count + 1;
    v_total := v_total + v_line;

    insert into public.pos_held_order_items (
      held_order_id, sku_id, sku, name, quantity, unit_price_dong, line_total_dong, sort_index
    ) values (
      p_hold_id,
      v_sku.id,
      v_sku.sku,
      v_sku.name,
      v_item.quantity,
      v_price.unit_price_dong,
      v_line,
      v_sort
    );
  end loop;

  item_count := v_count;
  estimated_total_dong := v_total;
  return next;
end;
$$;

create or replace function public.pos_save_held_order(
  p_items jsonb,
  p_customer_id uuid default null,
  p_payment_method text default 'CASH',
  p_note text default null,
  p_held_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_totals record;
  v_customer public.pos_customers%rowtype;
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'CASH');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_hold_no text;
  v_items jsonb;
begin
  v_actor := pos_private.require_pos_user();

  if v_method not in ('CASH', 'TRANSFER', 'CARD') then
    raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
  end if;

  if p_customer_id is not null then
    select * into v_customer from public.pos_customers c where c.id = p_customer_id;
    if not found then
      raise exception 'Không tìm thấy khách hàng' using errcode = 'P0001';
    end if;
  else
    select * into v_customer from public.pos_customers c where c.is_walk_in limit 1;
    if not found then
      raise exception 'Chưa có khách lẻ' using errcode = 'P0001';
    end if;
  end if;

  if p_held_order_id is not null then
    select * into v_hold
    from public.pos_held_orders h
    where h.id = p_held_order_id
    for update;

    if not found then
      raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
    end if;
    if v_hold.status <> 'HELD' then
      raise exception 'Đơn đã lưu không còn mở' using errcode = 'P0001';
    end if;
    if not pos_private.can_access_held_order(v_hold.saved_by_email) then
      raise exception 'Không mở được đơn đã lưu của tài khoản khác' using errcode = '42501';
    end if;
  else
    v_hold_no := 'LD' || lpad(nextval('public.pos_held_order_seq')::text, 6, '0');
    insert into public.pos_held_orders (
      hold_no, status, customer_id, customer_name, customer_phone, customer_no, is_walk_in,
      payment_method, note, estimated_total_dong, item_count,
      saved_by_user_id, saved_by_email
    ) values (
      v_hold_no, 'HELD', v_customer.id, v_customer.name, v_customer.phone, v_customer.customer_no,
      coalesce(v_customer.is_walk_in, false),
      v_method, v_note, 0, 1,
      auth.uid(), v_actor
    )
    returning * into v_hold;
  end if;

  select * into v_totals from pos_private.replace_held_order_items(v_hold.id, p_items);

  update public.pos_held_orders
  set
    customer_id = v_customer.id,
    customer_name = v_customer.name,
    customer_phone = v_customer.phone,
    customer_no = v_customer.customer_no,
    is_walk_in = coalesce(v_customer.is_walk_in, false),
    payment_method = v_method,
    note = v_note,
    estimated_total_dong = v_totals.estimated_total_dong,
    item_count = v_totals.item_count,
    updated_at = now()
  where id = v_hold.id
  returning * into v_hold;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_id', i.sku_id,
        'sku', i.sku,
        'name', i.name,
        'quantity', i.quantity,
        'unit_price_dong', i.unit_price_dong,
        'line_total_dong', i.line_total_dong
      )
      order by i.sort_index
    ),
    '[]'::jsonb
  )
  into v_items
  from public.pos_held_order_items i
  where i.held_order_id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    case when p_held_order_id is null then 'HELD_ORDER_SAVE' else 'HELD_ORDER_UPDATE' end,
    'HELD_ORDER',
    v_hold.id,
    'Lưu đơn chưa thanh toán. Kho chưa trừ. Chưa phát hành hóa đơn.',
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'item_count', v_hold.item_count,
      'estimated_total_dong', v_hold.estimated_total_dong,
      'visible_to_all', pos_private.held_orders_visible_to_all()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_hold.id,
    'hold_no', v_hold.hold_no,
    'status', v_hold.status,
    'customer_id', v_hold.customer_id,
    'customer_name', v_hold.customer_name,
    'customer_phone', v_hold.customer_phone,
    'customer_no', v_hold.customer_no,
    'is_walk_in', v_hold.is_walk_in,
    'payment_method', v_hold.payment_method,
    'note', v_hold.note,
    'estimated_total_dong', v_hold.estimated_total_dong,
    'item_count', v_hold.item_count,
    'saved_by_email', v_hold.saved_by_email,
    'created_at', v_hold.created_at,
    'updated_at', v_hold.updated_at,
    'visible_to_all', pos_private.held_orders_visible_to_all(),
    'items', v_items
  );
end;
$$;

create or replace function public.pos_list_held_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_all boolean;
  v_items jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_all := pos_private.held_orders_visible_to_all();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'hold_no', h.hold_no,
        'status', h.status,
        'customer_id', h.customer_id,
        'customer_name', h.customer_name,
        'customer_phone', h.customer_phone,
        'customer_no', h.customer_no,
        'is_walk_in', h.is_walk_in,
        'payment_method', h.payment_method,
        'note', h.note,
        'estimated_total_dong', h.estimated_total_dong,
        'item_count', h.item_count,
        'saved_by_email', h.saved_by_email,
        'created_at', h.created_at,
        'updated_at', h.updated_at
      )
      order by h.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.pos_held_orders h
  where h.status = 'HELD'
    and (v_all or h.saved_by_email = v_actor);

  return jsonb_build_object(
    'ok', true,
    'visible_to_all', v_all,
    'items', v_items
  );
end;
$$;

create or replace function public.pos_get_held_order(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_items jsonb;
begin
  v_actor := pos_private.require_pos_user();

  select * into v_hold from public.pos_held_orders h where h.id = p_id;
  if not found then
    raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
  end if;
  if v_hold.status <> 'HELD' then
    raise exception 'Đơn đã lưu không còn mở' using errcode = 'P0001';
  end if;
  if not pos_private.can_access_held_order(v_hold.saved_by_email) then
    raise exception 'Không mở được đơn đã lưu của tài khoản khác' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_id', i.sku_id,
        'sku', i.sku,
        'name', i.name,
        'quantity', i.quantity,
        'unit_price_dong', i.unit_price_dong,
        'line_total_dong', i.line_total_dong
      )
      order by i.sort_index
    ),
    '[]'::jsonb
  )
  into v_items
  from public.pos_held_order_items i
  where i.held_order_id = v_hold.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_hold.id,
    'hold_no', v_hold.hold_no,
    'status', v_hold.status,
    'customer_id', v_hold.customer_id,
    'customer_name', v_hold.customer_name,
    'customer_phone', v_hold.customer_phone,
    'customer_no', v_hold.customer_no,
    'is_walk_in', v_hold.is_walk_in,
    'payment_method', v_hold.payment_method,
    'note', v_hold.note,
    'estimated_total_dong', v_hold.estimated_total_dong,
    'item_count', v_hold.item_count,
    'saved_by_email', v_hold.saved_by_email,
    'created_at', v_hold.created_at,
    'updated_at', v_hold.updated_at,
    'visible_to_all', pos_private.held_orders_visible_to_all(),
    'items', v_items
  );
end;
$$;

create or replace function public.pos_cancel_held_order(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
begin
  v_actor := pos_private.require_pos_user();

  select * into v_hold
  from public.pos_held_orders h
  where h.id = p_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
  end if;
  if v_hold.status <> 'HELD' then
    raise exception 'Đơn đã lưu không còn mở' using errcode = 'P0001';
  end if;
  if not pos_private.can_access_held_order(v_hold.saved_by_email) then
    raise exception 'Không hủy được đơn đã lưu của tài khoản khác' using errcode = '42501';
  end if;

  update public.pos_held_orders
  set status = 'CANCELLED', updated_at = now()
  where id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    'HELD_ORDER_CANCEL',
    'HELD_ORDER',
    v_hold.id,
    'Hủy đơn đã lưu. Kho không đổi.',
    jsonb_build_object('hold_no', v_hold.hold_no)
  );

  return jsonb_build_object('ok', true, 'id' , v_hold.id, 'hold_no', v_hold.hold_no, 'status', 'CANCELLED');
end;
$$;

create or replace function public.pos_complete_held_sale(
  p_held_order_id uuid,
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_result jsonb;
  v_sale_id uuid;
begin
  v_actor := pos_private.require_pos_user();

  select * into v_hold
  from public.pos_held_orders h
  where h.id = p_held_order_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
  end if;
  if not pos_private.can_access_held_order(v_hold.saved_by_email) then
    raise exception 'Không thanh toán được đơn đã lưu của tài khoản khác' using errcode = '42501';
  end if;
  if v_hold.status = 'COMPLETED' then
    select jsonb_build_object(
      'ok', true,
      'sale_id', s.id,
      'sale_no', s.sale_no,
      'invoice_no', i.invoice_no,
      'total_dong', s.total_dong,
      'paid_dong', s.paid_dong,
      'remaining_dong', s.remaining_dong,
      'payment_status', s.payment_status,
      'due_date', s.due_date,
      'status', s.status,
      'held_order_id', v_hold.id,
      'hold_no', v_hold.hold_no
    )
    into v_result
    from public.pos_sales s
    left join public.pos_invoices i on i.sale_id = s.id
    where s.id = v_hold.completed_sale_id
    limit 1;
    if v_result is null then
      raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
    end if;
    return v_result;
  end if;
  if v_hold.status <> 'HELD' then
    raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
  end if;

  v_result := pos_private.complete_sale(
    p_idempotency_key,
    p_customer_name,
    p_customer_phone,
    p_payment_method,
    p_items,
    p_customer_id,
    p_note,
    p_paid_dong,
    p_due_date
  );

  select s.id into v_sale_id
  from public.pos_sales s
  where s.sale_no = v_result ->> 'sale_no'
  limit 1;

  update public.pos_held_orders
  set
    status = 'COMPLETED',
    completed_sale_id = v_sale_id,
    updated_at = now()
  where id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    'HELD_ORDER_COMPLETE',
    'HELD_ORDER',
    v_hold.id,
    'Thanh toán đơn đã lưu. Đơn lưu đóng, hóa đơn phát hành theo giao dịch bán.',
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'sale_no', v_result ->> 'sale_no',
      'invoice_no', v_result ->> 'invoice_no'
    )
  );

  return v_result || jsonb_build_object('held_order_id', v_hold.id, 'hold_no', v_hold.hold_no);
end;
$$;

revoke all on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) from public, anon;
revoke all on function public.pos_list_held_orders() from public, anon;
revoke all on function public.pos_get_held_order(uuid) from public, anon;
revoke all on function public.pos_cancel_held_order(uuid) from public, anon;
revoke all on function public.pos_complete_held_sale(uuid, text, text, text, text, jsonb, uuid, text, bigint, date) from public, anon;

grant execute on function public.pos_save_held_order(jsonb, uuid, text, text, uuid) to authenticated;
grant execute on function public.pos_list_held_orders() to authenticated;
grant execute on function public.pos_get_held_order(uuid) to authenticated;
grant execute on function public.pos_cancel_held_order(uuid) to authenticated;
grant execute on function public.pos_complete_held_sale(uuid, text, text, text, text, jsonb, uuid, text, bigint, date) to authenticated;
