create or replace function pos_private.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Inventory ledger, invoices, and audit rows cannot be updated or deleted'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists pos_inventory_tx_no_update on public.pos_inventory_transactions;
create trigger pos_inventory_tx_no_update
  before update or delete on public.pos_inventory_transactions
  for each row execute function pos_private.forbid_ledger_mutation();

drop trigger if exists pos_audit_no_update on public.pos_audit_log;
create trigger pos_audit_no_update
  before update or delete on public.pos_audit_log
  for each row execute function pos_private.forbid_ledger_mutation();

create or replace function pos_private.require_admin()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_email = '' or not public.tlkv_is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function pos_private.compute_unit_price(p_sku public.pos_skus)
returns table (unit_price_dong bigint, gold_sell_dong bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sell numeric;
begin
  if p_sku.price_row_id is null then
    raise exception 'SKU % chưa gắn bảng giá', p_sku.sku using errcode = 'P0001';
  end if;

  select r.sell into v_sell
  from public.gold_price_rows r
  where r.id = p_sku.price_row_id;

  if v_sell is null then
    raise exception 'Không tìm thấy dòng giá cho SKU %', p_sku.sku using errcode = 'P0001';
  end if;
  if v_sell <= 0 then
    raise exception 'Giá bán trên bảng giá không hợp lệ cho SKU %', p_sku.sku using errcode = 'P0001';
  end if;

  unit_price_dong := (round(v_sell * p_sku.weight_chi / p_sku.board_unit_chi))::bigint
    + p_sku.labor_fee_dong;
  gold_sell_dong := round(v_sell)::bigint;
  return next;
end;
$$;

create or replace function pos_private.apply_stock_change(
  p_sku_id uuid,
  p_delta integer,
  p_type text,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
begin
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

  insert into public.pos_inventory_transactions (
    sku_id, type, quantity, before_quantity, after_quantity,
    reason, reference_type, reference_id, actor_email, created_at
  ) values (
    p_sku_id, p_type, p_delta, v_before, v_after,
    p_reason, p_reference_type, p_reference_id, p_actor_email, now()
  );

  update public.pos_inventory_stock
  set quantity = v_after, updated_at = now()
  where sku_id = p_sku_id;
end;
$$;

create or replace function pos_private.begin_idempotency(p_key text, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed text;
  v_existing jsonb;
begin
  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'idempotency_key không hợp lệ' using errcode = '22023';
  end if;

  insert into public.pos_idempotency_keys(key, operation, response)
  values (trim(p_key), p_operation, jsonb_build_object('status', 'pending'))
  on conflict (key) do nothing
  returning key into v_claimed;

  if v_claimed is not null then
    return null;
  end if;

  select response into v_existing
  from public.pos_idempotency_keys
  where key = trim(p_key);

  if coalesce(v_existing ->> 'status', '') = 'pending' then
    raise exception 'Giao dịch đang được xử lý, thử lại sau' using errcode = 'P0001';
  end if;

  return v_existing;
end;
$$;

create or replace function pos_private.finish_idempotency(p_key text, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pos_idempotency_keys
  set response = p_response
  where key = trim(p_key);
  return p_response;
end;
$$;

create or replace function pos_private.clear_pending_idempotency(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pos_idempotency_keys
  where key = trim(p_key)
    and response ->> 'status' = 'pending';
end;
$$;

create or replace function pos_private.upsert_customer(p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := trim(p_name);
  v_phone text := trim(p_phone);
begin
  if v_name = '' or v_phone = '' then
    raise exception 'Khách hàng cần tên và số điện thoại' using errcode = '22023';
  end if;

  select c.id into v_id
  from public.pos_customers c
  where c.phone = v_phone;

  if v_id is null then
    insert into public.pos_customers(name, phone)
    values (v_name, v_phone)
    returning id into v_id;
  else
    update public.pos_customers
    set name = v_name, updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function pos_private.receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb
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
    from jsonb_to_recordset(p_items) as x(sku_id uuid, expected_qty integer, received_qty integer);

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = any(v_sku_ids)
    order by s.sku_id
    for update;

    v_receipt_no := 'PN' || lpad(nextval('public.pos_purchase_seq')::text, 6, '0');
    insert into public.pos_purchase_receipts (
      receipt_no, status, supplier_name, reason, idempotency_key, actor_email, received_at
    ) values (
      v_receipt_no, 'RECEIVED', trim(p_supplier_name),
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      trim(p_idempotency_key), v_actor, now()
    )
    returning id into v_receipt_id;

    for v_item in
      select * from jsonb_to_recordset(p_items)
        as x(sku_id uuid, expected_qty integer, received_qty integer)
    loop
      if v_item.received_qty is null or v_item.received_qty <= 0 then
        raise exception 'Số lượng nhận phải > 0' using errcode = '22023';
      end if;
      if v_item.expected_qty is null or v_item.expected_qty < 0 then
        raise exception 'Số lượng dự kiến không hợp lệ' using errcode = '22023';
      end if;

      insert into public.pos_purchase_items(receipt_id, sku_id, expected_qty, received_qty)
      values (v_receipt_id, v_item.sku_id, v_item.expected_qty, v_item.received_qty);

      perform pos_private.apply_stock_change(
        v_item.sku_id,
        v_item.received_qty,
        'PURCHASE_RECEIVED',
        coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
        'PURCHASE',
        v_receipt_id,
        v_actor
      );
    end loop;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'PURCHASE', 'purchase_receipt', v_receipt_id,
      coalesce(nullif(trim(p_reason), ''), 'Nhập hàng'),
      jsonb_build_object('receipt_no', v_receipt_no, 'items', p_items)
    );

    v_result := jsonb_build_object(
      'ok', true,
      'receipt_id', v_receipt_id,
      'receipt_no', v_receipt_no
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function pos_private.complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb
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
  v_result jsonb;
begin
  v_actor := pos_private.require_admin();
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
        raise exception 'Không đủ tồn kho' using errcode = 'P0001';
      end if;
    end loop;

    v_customer_id := pos_private.upsert_customer(p_customer_name, p_customer_phone);
    v_sale_no := 'SALE-' || lpad(nextval('public.pos_sale_seq')::text, 6, '0');
    v_invoice_no := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');

    insert into public.pos_sales (
      sale_no, customer_id, status, payment_method, total_dong,
      idempotency_key, actor_email, completed_at
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now()
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

    update public.pos_sales
    set total_dong = v_total
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

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
        'total_dong', v_total
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale_id,
      'sale_no', v_sale_no,
      'invoice_id', v_invoice_id,
      'invoice_no', v_invoice_no,
      'total_dong', v_total,
      'status', 'COMPLETED'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function pos_private.adjust_stock(
  p_idempotency_key text,
  p_sku_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_adj_id uuid;
  v_type text;
  v_result jsonb;
begin
  v_actor := pos_private.require_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'adjust_stock');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_quantity = 0 then
      raise exception 'Số lượng điều chỉnh phải khác 0' using errcode = '22023';
    end if;
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Điều chỉnh kho bắt buộc có lý do' using errcode = '22023';
    end if;

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = p_sku_id
    for update;

    v_type := case when p_quantity > 0 then 'STOCK_ADJUSTMENT_IN' else 'STOCK_ADJUSTMENT_OUT' end;

    insert into public.pos_stock_adjustments(sku_id, quantity, reason, idempotency_key, actor_email)
    values (p_sku_id, p_quantity, trim(p_reason), trim(p_idempotency_key), v_actor)
    returning id into v_adj_id;

    perform pos_private.apply_stock_change(
      p_sku_id, p_quantity, v_type, trim(p_reason), 'ADJUSTMENT', v_adj_id, v_actor
    );

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
    values (v_actor, v_type, 'stock_adjustment', v_adj_id, trim(p_reason));

    v_result := jsonb_build_object('ok', true, 'adjustment_id', v_adj_id);
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function pos_private.get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_yesterday date;
  v_rev_today bigint;
  v_rev_yesterday bigint;
  v_sold_today integer;
  v_sold_yesterday integer;
  v_invoices_today integer;
  v_invoices_yesterday integer;
  v_stock_qty integer;
begin
  perform pos_private.require_admin();
  v_today := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_yesterday := v_today - 1;

  select coalesce(sum(s.total_dong), 0), count(*)
  into v_rev_today, v_invoices_today
  from public.pos_sales s
  where s.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date = v_today;

  select coalesce(sum(s.total_dong), 0), count(*)
  into v_rev_yesterday, v_invoices_yesterday
  from public.pos_sales s
  where s.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date = v_yesterday;

  select coalesce(sum(i.quantity), 0)
  into v_sold_today
  from public.pos_sale_items i
  join public.pos_sales s on s.id = i.sale_id
  where s.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date = v_today;

  select coalesce(sum(i.quantity), 0)
  into v_sold_yesterday
  from public.pos_sale_items i
  join public.pos_sales s on s.id = i.sale_id
  where s.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date = v_yesterday;

  select coalesce(sum(quantity), 0) into v_stock_qty from public.pos_inventory_stock;

  return jsonb_build_object(
    'isPreview', false,
    'businessDate', v_today,
    'kpis', jsonb_build_object(
      'revenueToday', v_rev_today,
      'revenueYesterday', v_rev_yesterday,
      'soldToday', v_sold_today,
      'soldYesterday', v_sold_yesterday,
      'stockQty', v_stock_qty,
      'invoicesToday', v_invoices_today,
      'invoicesYesterday', v_invoices_yesterday
    )
  );
end;
$$;

create or replace function public.pos_receive_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_items jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.receive_purchase(p_idempotency_key, p_supplier_name, p_reason, p_items);
$$;

create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method, p_items
  );
$$;

create or replace function public.pos_adjust_stock(
  p_idempotency_key text,
  p_sku_id uuid,
  p_quantity integer,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.adjust_stock(p_idempotency_key, p_sku_id, p_quantity, p_reason);
$$;

create or replace function public.pos_get_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.get_dashboard();
$$;

revoke all on function public.pos_receive_purchase(text, text, text, jsonb) from public, anon;
revoke all on function public.pos_complete_sale(text, text, text, text, jsonb) from public, anon;
revoke all on function public.pos_adjust_stock(text, uuid, integer, text) from public, anon;
revoke all on function public.pos_get_dashboard() from public, anon;

grant execute on function public.pos_receive_purchase(text, text, text, jsonb) to authenticated;
grant execute on function public.pos_complete_sale(text, text, text, text, jsonb) to authenticated;
grant execute on function public.pos_adjust_stock(text, uuid, integer, text) to authenticated;
grant execute on function public.pos_get_dashboard() to authenticated;
