-- POS v1.1: collect/fulfill/cancel, session, staff shared, customer history.

-- ---------------------------------------------------------------------------
-- Collect remaining: record receiver, never rewrite sale operator
-- ---------------------------------------------------------------------------
drop function if exists public.pos_collect_sale_payment(uuid, bigint, text, text, text, date);
drop function if exists pos_private.collect_sale_payment(uuid, bigint, text, text, text, date);

create or replace function pos_private.collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_operator_staff_id uuid default null
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
  v_receiver uuid;
begin
  v_actor := pos_private.require_pos_user();
  v_receiver := pos_private.resolve_operator_staff_id(p_operator_staff_id);
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
    if v_sale.fulfillment_status = 'CANCELLED' then
      raise exception 'Đơn đã hủy, không thu thêm' using errcode = '22023';
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
      sale_id, amount_dong, payment_method, paid_at, actor_email, note,
      idempotency_key, received_by_staff_id
    ) values (
      v_sale.id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key, v_receiver
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
        'due_date', v_due,
        'received_by_staff_id', v_receiver,
        'sale_operator_staff_id', v_sale.operator_staff_id
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
      'due_date', v_due,
      'received_by_staff_id', v_receiver
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
  p_due_date date default null,
  p_operator_staff_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.collect_sale_payment(
    p_sale_id, p_amount_dong, p_payment_method, p_note, p_idempotency_key, p_due_date, p_operator_staff_id
  );
$$;

revoke all on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid)
  from public, anon;
grant execute on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Preorder fulfill / cancel
-- ---------------------------------------------------------------------------
create or replace function public.pos_fulfill_preorder(
  p_sale_id uuid,
  p_idempotency_key text,
  p_operator_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_sale public.pos_sales%rowtype;
  v_operator uuid;
  v_item record;
  v_stock integer;
  v_result jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_operator := pos_private.resolve_operator_staff_id(p_operator_staff_id);
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'fulfill_preorder');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then
      raise exception 'Không tìm thấy đơn' using errcode = 'P0002';
    end if;
    if v_sale.transaction_type <> 'PREORDER' then
      raise exception 'Chỉ xác nhận trả hàng trên đơn đặt hàng' using errcode = '22023';
    end if;
    if v_sale.fulfillment_status = 'CANCELLED' then
      raise exception 'Đơn đặt hàng đã hủy' using errcode = '22023';
    end if;
    if v_sale.fulfillment_status = 'FULFILLED' then
      v_result := jsonb_build_object(
        'ok', true, 'sale_id', v_sale.id, 'sale_no', v_sale.sale_no,
        'fulfillment_status', 'FULFILLED'
      );
      return pos_private.finish_idempotency(p_idempotency_key, v_result);
    end if;

    perform s.sku_id
    from public.pos_sale_items si
    join public.pos_inventory_stock s on s.sku_id = si.sku_id
    where si.sale_id = v_sale.id
    order by s.sku_id
    for update of s;

    for v_item in
      select sku_id, quantity, product_name_snapshot
      from public.pos_sale_items
      where sale_id = v_sale.id
    loop
      select quantity into v_stock from public.pos_inventory_stock where sku_id = v_item.sku_id;
      if v_stock is null or v_stock < v_item.quantity then
        raise exception 'Chưa đủ hàng để giao % (tồn %)', v_item.product_name_snapshot, coalesce(v_stock, 0)
          using errcode = 'P0001';
      end if;
    end loop;

    if exists (
      select 1 from public.pos_inventory_transactions t
      where t.reference_id = v_sale.id and t.type = 'PREORDER_FULFILL'
    ) then
      raise exception 'Đơn này đã trừ kho khi giao, không trừ lần hai' using errcode = 'P0001';
    end if;

    for v_item in
      select sku_id, quantity from public.pos_sale_items where sale_id = v_sale.id
    loop
      perform pos_private.apply_stock_change(
        v_item.sku_id, - v_item.quantity,
        'PREORDER_FULFILL', 'Giao hàng đặt trước',
        'SALE', v_sale.id, v_actor
      );
    end loop;

    update public.pos_sales
    set fulfillment_status = 'FULFILLED'
    where id = v_sale.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PREORDER_FULFILL', 'sale', v_sale.id, 'Xác nhận trả hàng',
      jsonb_build_object(
        'sale_no', v_sale.sale_no,
        'operator_staff_id', v_operator,
        'sale_operator_staff_id', v_sale.operator_staff_id
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale.id,
      'sale_no', v_sale.sale_no,
      'fulfillment_status', 'FULFILLED',
      'payment_status', v_sale.payment_status,
      'remaining_dong', v_sale.remaining_dong
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function public.pos_cancel_preorder(
  p_sale_id uuid,
  p_idempotency_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_sale public.pos_sales%rowtype;
  v_result jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'cancel_preorder');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then
      raise exception 'Không tìm thấy đơn' using errcode = 'P0002';
    end if;
    if v_sale.transaction_type <> 'PREORDER' then
      raise exception 'Chỉ hủy đơn đặt hàng' using errcode = '22023';
    end if;
    if v_sale.fulfillment_status = 'FULFILLED' then
      raise exception 'Đơn đã giao, không hủy tại phase này' using errcode = '22023';
    end if;
    if v_sale.fulfillment_status = 'CANCELLED' then
      v_result := jsonb_build_object(
        'ok', true, 'sale_id', v_sale.id, 'fulfillment_status', 'CANCELLED'
      );
      return pos_private.finish_idempotency(p_idempotency_key, v_result);
    end if;

    update public.pos_sales
    set fulfillment_status = 'CANCELLED'
    where id = v_sale.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PREORDER_CANCEL', 'sale', v_sale.id,
      coalesce(v_reason, 'Hủy đơn đặt hàng'),
      jsonb_build_object(
        'sale_no', v_sale.sale_no,
        'paid_dong', v_sale.paid_dong,
        'remaining_dong', v_sale.remaining_dong
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale.id,
      'sale_no', v_sale.sale_no,
      'fulfillment_status', 'CANCELLED',
      'paid_dong', v_sale.paid_dong,
      'remaining_dong', v_sale.remaining_dong
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_fulfill_preorder(uuid, text, uuid) from public, anon;
revoke all on function public.pos_cancel_preorder(uuid, text, text) from public, anon;
grant execute on function public.pos_fulfill_preorder(uuid, text, uuid) to authenticated;
grant execute on function public.pos_cancel_preorder(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Operators + session
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_sale_operators()
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
      'id', s.id,
      'staff_no', s.staff_no,
      'full_name', s.full_name
    )
    order by s.full_name
  ), '[]'::jsonb)
  into v_items
  from public.pos_staff s
  where s.is_active and not coalesce(s.is_shared, false);
  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.pos_list_sale_operators() from public, anon;
grant execute on function public.pos_list_sale_operators() to authenticated;

create or replace function pos_private.get_session()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text := public.tlkv_current_email();
  v_role text;
  v_name text;
  v_staff_id uuid;
  v_shared boolean := false;
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_role := public.tlkv_staff_role();
  if v_role is null then
    v_role := 'ADMIN';
  end if;

  select s.id, s.full_name, coalesce(s.is_shared, false)
  into v_staff_id, v_name, v_shared
  from public.pos_staff s
  where s.email = v_email
  limit 1;

  if v_name is null or v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'role', v_role,
    'full_name', v_name,
    'staff_id', v_staff_id,
    'is_shared', v_shared,
    'business_date', (timezone('Asia/Ho_Chi_Minh', now()))::date::text
  );
end;
$$;

create or replace function pos_private.staff_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.pos_staff%rowtype;
begin
  select * into v_row from public.pos_staff where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'auth_user_id', v_row.auth_user_id,
    'staff_no', v_row.staff_no,
    'full_name', v_row.full_name,
    'email', v_row.email,
    'phone', v_row.phone,
    'role', v_row.role,
    'is_active', v_row.is_active,
    'is_shared', coalesce(v_row.is_shared, false),
    'note', v_row.note,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.pos_set_staff_shared(p_id uuid, p_is_shared boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_role text;
begin
  v_actor := pos_private.require_admin();
  select s.role into v_role from public.pos_staff s where s.id = p_id;
  if v_role is null then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;
  if coalesce(p_is_shared, false) and v_role = 'ADMIN' then
    raise exception 'Tài khoản quản trị không đặt làm POS dùng chung' using errcode = '22023';
  end if;

  update public.pos_staff
  set is_shared = coalesce(p_is_shared, false), updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STAFF_SHARED_POS', 'staff', p_id, 'Cập nhật tài khoản POS dùng chung',
    jsonb_build_object('is_shared', coalesce(p_is_shared, false))
  );

  return jsonb_build_object('ok', true, 'staff', pos_private.staff_json(p_id));
end;
$$;

revoke all on function public.pos_set_staff_shared(uuid, boolean) from public, anon;
grant execute on function public.pos_set_staff_shared(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer history: payment + order fields (BUG-001 / REQ-NEW-004)
-- ---------------------------------------------------------------------------
create or replace function pos_private.get_customer(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer jsonb;
  v_history jsonb;
begin
  perform pos_private.require_pos_user();
  v_customer := pos_private.customer_json(p_id);
  if v_customer is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'invoice_id', h.invoice_id,
        'invoice_no', h.invoice_no,
        'sale_no', h.sale_no,
        'issued_at', h.issued_at,
        'total_dong', h.total_dong,
        'paid_dong', h.paid_dong,
        'remaining_dong', h.remaining_dong,
        'payment_status', h.payment_status,
        'status', h.status,
        'payment_method', h.payment_method,
        'transaction_type', h.transaction_type,
        'fulfillment_status', h.fulfillment_status
      )
      order by h.issued_at desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      i.id as invoice_id,
      i.invoice_no,
      s.sale_no,
      i.issued_at,
      i.total_dong,
      s.paid_dong,
      s.remaining_dong,
      s.payment_status,
      s.status,
      s.payment_method,
      s.transaction_type,
      s.fulfillment_status
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    where i.customer_id = p_id
      and s.status = 'COMPLETED'
    order by i.issued_at desc
    limit 20
  ) h;

  return jsonb_build_object(
    'ok', true,
    'customer', v_customer,
    'history', v_history
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Held sale passes new complete_sale fields
-- ---------------------------------------------------------------------------
drop function if exists public.pos_complete_held_sale(uuid, text, text, text, text, jsonb, uuid, text, bigint, date);

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
  p_due_date date default null,
  p_charges jsonb default '[]'::jsonb,
  p_operator_staff_id uuid default null,
  p_pickup_due_at timestamptz default null
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
      'transaction_type', s.transaction_type,
      'fulfillment_status', s.fulfillment_status,
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
    p_due_date,
    p_charges,
    p_operator_staff_id,
    p_pickup_due_at
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

revoke all on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) from public, anon;
grant execute on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) to authenticated;

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
      'note', p.note,
      'received_by_staff_id', p.received_by_staff_id,
      'received_by_name', pos_private.staff_display_name(p.received_by_staff_id, p.actor_email)
    )
    order by p.paid_at asc, p.created_at asc
  ), '[]'::jsonb)
  into v_items
  from public.pos_sale_payments p
  where p.sale_id = p_sale_id;
  return jsonb_build_object('items', v_items);
end;
$$;
