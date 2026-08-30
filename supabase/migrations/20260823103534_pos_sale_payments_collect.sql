-- Cluster 1a: SELL payment history + partial/collect remaining (spec §13–16).
-- Transaction status stays COMPLETED; payment_status is independent.

create table if not exists public.pos_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pos_sales (id),
  amount_dong bigint not null,
  payment_method text not null,
  paid_at timestamptz not null default now(),
  actor_email text not null,
  note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint pos_sale_payments_amount_pos check (amount_dong > 0),
  constraint pos_sale_payments_method_check check (payment_method in ('CASH', 'TRANSFER', 'CARD'))
);

create unique index if not exists pos_sale_payments_idempotency_uidx
  on public.pos_sale_payments (idempotency_key)
  where idempotency_key is not null;

create index if not exists pos_sale_payments_sale_id_idx
  on public.pos_sale_payments (sale_id, paid_at);

alter table public.pos_sale_payments enable row level security;

drop policy if exists pos_sale_payments_select_authenticated on public.pos_sale_payments;
create policy pos_sale_payments_select_authenticated
  on public.pos_sale_payments
  for select
  to authenticated
  using (true);

revoke all on table public.pos_sale_payments from anon;
grant select on table public.pos_sale_payments to authenticated;

create or replace function pos_private.derive_sale_payment_status(
  p_paid_dong bigint,
  p_total_dong bigint,
  p_due_date date
)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_total_dong is null or p_total_dong < 0 then
    raise exception 'Tổng tiền không hợp lệ' using errcode = '22023';
  end if;
  if p_paid_dong is null or p_paid_dong < 0 then
    raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
  end if;
  if p_paid_dong > p_total_dong then
    raise exception 'Số tiền đã trả vượt tổng hóa đơn' using errcode = '22023';
  end if;
  if p_paid_dong >= p_total_dong then
    return 'PAID';
  end if;
  if p_due_date is not null and p_due_date < (timezone('Asia/Ho_Chi_Minh', now()))::date then
    return 'OVERDUE';
  end if;
  if p_paid_dong = 0 then
    return 'UNPAID';
  end if;
  return 'PARTIALLY_PAID';
end;
$$;

create or replace function pos_private.complete_sale(
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
  v_cached jsonb;
  v_customer_id uuid;
  v_sale_id uuid;
  v_sale_no text;
  v_invoice_id uuid;
  v_invoice_no text;
  v_item record;
  v_sku public.pos_skus%rowtype;
  v_price record;
  v_total bigint := 0;
  v_sku_ids uuid[];
  v_stock integer;
  v_sku_label text;
  v_result jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Giỏ hàng trống' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id)
    into v_sku_ids
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer);

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
      group by x.sku_id having count(*) > 1
    ) then
      raise exception 'SKU trùng trong giỏ hàng' using errcode = '22023';
    end if;

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = any(v_sku_ids)
    order by s.sku_id
    for update;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng bán phải > 0' using errcode = '22023';
      end if;
      select quantity into v_stock
      from public.pos_inventory_stock
      where sku_id = v_item.sku_id;
      if v_stock is null then
        raise exception 'SKU không tồn tại trên sổ kho' using errcode = 'P0001';
      end if;
      if v_stock < v_item.quantity then
        select coalesce(sku || ' - ' || name, sku_id::text)
        into v_sku_label
        from public.pos_skus
        where id = v_item.sku_id;
        raise exception
          'Không đủ tồn kho cho % (tồn %, cần %)',
          coalesce(v_sku_label, v_item.sku_id::text),
          v_stock,
          v_item.quantity
          using errcode = 'P0001';
      end if;
    end loop;

    if p_customer_id is not null then
      select c.id into v_customer_id
      from public.pos_customers c
      where c.id = p_customer_id;
      if v_customer_id is null then
        raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
      end if;
    else
      v_customer_id := pos_private.upsert_customer(p_customer_name, p_customer_phone);
    end if;

    v_sale_no := 'SALE-' || lpad(nextval('public.pos_sale_seq')::text, 6, '0');
    v_invoice_no := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');

    insert into public.pos_sales (
      sale_no, customer_id, status, payment_method, total_dong,
      idempotency_key, actor_email, completed_at, note
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now(), v_note
    )
    returning id into v_sale_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      select * into v_sku from public.pos_skus where id = v_item.sku_id and is_active;
      if v_sku.id is null then
        raise exception 'SKU không hoạt động' using errcode = 'P0001';
      end if;

      select * into v_price from pos_private.compute_unit_price(v_sku);

      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_price.unit_price_dong,
        v_price.unit_price_dong * v_item.quantity,
        v_price.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_sku.labor_fee_dong, v_sku.price_row_id
      );

      v_total := v_total + (v_price.unit_price_dong * v_item.quantity);
    end loop;

    v_paid := coalesce(p_paid_dong, v_total);
    if v_paid < 0 then
      raise exception 'Số tiền thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if v_paid > v_total then
      raise exception 'Số tiền thanh toán vượt tổng đơn' using errcode = '22023';
    end if;
    v_remaining := v_total - v_paid;
    if v_remaining > 0 and v_due is null then
      raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023';
    end if;
    if v_remaining = 0 then
      v_due := null;
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_total, v_due);

    update public.pos_sales
    set
      total_dong = v_total,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

    if v_paid > 0 then
      insert into public.pos_sale_payments (
        sale_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key
      ) values (
        v_sale_id, v_paid, p_payment_method, now(), v_actor,
        'Thanh toán lúc bán',
        'sale-open:' || trim(p_idempotency_key)
      );
    end if;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      perform pos_private.apply_stock_change(
        v_item.sku_id,
        - v_item.quantity,
        'SALE',
        'Bán hàng',
        'SALE',
        v_sale_id,
        v_actor
      );
    end loop;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'SALE', 'sale', v_sale_id, 'Bán hàng',
      jsonb_build_object(
        'sale_no', v_sale_no,
        'invoice_no', v_invoice_no,
        'invoice_id', v_invoice_id,
        'customer_id', v_customer_id,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'remaining_dong', v_remaining,
        'payment_status', v_pay_status,
        'due_date', v_due
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale_id,
      'sale_no', v_sale_no,
      'invoice_id', v_invoice_id,
      'invoice_no', v_invoice_no,
      'customer_id', v_customer_id,
      'total_dong', v_total,
      'paid_dong', v_paid,
      'remaining_dong', v_remaining,
      'payment_status', v_pay_status,
      'due_date', v_due,
      'status', 'COMPLETED'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

drop function if exists public.pos_complete_sale(text, text, text, text, jsonb, uuid, text);

create or replace function public.pos_complete_sale(
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
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date
  );
$$;

revoke all on function public.pos_complete_sale(text, text, text, text, jsonb, uuid, text, bigint, date)
  from public, anon;
grant execute on function public.pos_complete_sale(text, text, text, text, jsonb, uuid, text, bigint, date)
  to authenticated;

create or replace function pos_private.collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_key text;
  v_sale public.pos_sales%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_payment_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'collect:' || p_sale_id::text || ':' || gen_random_uuid()::text;
  end if;

  v_cached := pos_private.begin_idempotency(v_key, 'collect_sale_payment');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền thu phải > 0' using errcode = '22023';
    end if;

    select * into v_sale
    from public.pos_sales
    where id = p_sale_id
    for update;
    if v_sale.id is null then
      raise exception 'Không tìm thấy đơn bán' using errcode = 'P0002';
    end if;
    if v_sale.status <> 'COMPLETED' then
      raise exception 'Chỉ thu tiền trên đơn đã hoàn tất' using errcode = '22023';
    end if;
    if coalesce(v_sale.remaining_dong, 0) <= 0 then
      raise exception 'Đơn đã thanh toán đủ' using errcode = '22023';
    end if;
    if p_amount_dong > v_sale.remaining_dong then
      raise exception 'Số tiền thu vượt số còn lại (% đ)', v_sale.remaining_dong
        using errcode = '22023';
    end if;

    v_paid := v_sale.paid_dong + p_amount_dong;
    v_remaining := v_sale.total_dong - v_paid;
    v_due := case
      when v_remaining = 0 then null
      else coalesce(p_due_date, v_sale.due_date)
    end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_sale.total_dong, v_due);

    insert into public.pos_sale_payments (
      sale_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key
    ) values (
      v_sale.id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key
    )
    returning id into v_payment_id;

    update public.pos_sales
    set
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = v_sale.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PAYMENT_COLLECT', 'sale', v_sale.id, 'Thu tiền còn lại',
      jsonb_build_object(
        'sale_no', v_sale.sale_no,
        'payment_id', v_payment_id,
        'amount_dong', p_amount_dong,
        'paid_dong', v_paid,
        'remaining_dong', v_remaining,
        'payment_status', v_pay_status,
        'due_date', v_due
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale.id,
      'sale_no', v_sale.sale_no,
      'payment_id', v_payment_id,
      'amount_dong', p_amount_dong,
      'paid_dong', v_paid,
      'remaining_dong', v_remaining,
      'payment_status', v_pay_status,
      'due_date', v_due
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(v_key);
    raise;
  end;
end;
$$;

create or replace function public.pos_collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.collect_sale_payment(
    p_sale_id, p_amount_dong, p_payment_method, p_note, p_idempotency_key, p_due_date
  );
$$;

create or replace function public.pos_list_sale_payments(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'sale_id', p.sale_id,
      'amount_dong', p.amount_dong,
      'payment_method', p.payment_method,
      'paid_at', p.paid_at,
      'actor_email', p.actor_email,
      'note', p.note
    )
    order by p.paid_at asc, p.created_at asc
  ), '[]'::jsonb)
  into v_items
  from public.pos_sale_payments p
  where p.sale_id = p_sale_id;
  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_list_sku_stock(p_sku_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sku_id', s.sku_id,
      'quantity', s.quantity
    )
    order by s.sku_id
  ), '[]'::jsonb)
  into v_items
  from public.pos_inventory_stock s
  where p_sku_ids is null or s.sku_id = any(p_sku_ids);
  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date)
  from public, anon;
revoke all on function public.pos_list_sale_payments(uuid) from public, anon;
revoke all on function public.pos_list_sku_stock(uuid[]) from public, anon;

grant execute on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date)
  to authenticated;
grant execute on function public.pos_list_sale_payments(uuid) to authenticated;
grant execute on function public.pos_list_sku_stock(uuid[]) to authenticated;

comment on table public.pos_sale_payments is
  'Immutable payment history for SELL. Adjust via new rows only.';
