-- ---------------------------------------------------------------------------
-- Return RPC
-- ---------------------------------------------------------------------------

create or replace function pos_private.complete_return(
  p_idempotency_key text,
  p_invoice_no text,
  p_reason text,
  p_item_condition text,
  p_refund_method text,
  p_note text,
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
  v_invoice public.pos_invoices%rowtype;
  v_sale public.pos_sales%rowtype;
  v_return_id uuid;
  v_return_no text;
  v_total bigint := 0;
  v_item jsonb;
  v_sale_item public.pos_sale_items%rowtype;
  v_returned integer;
  v_qty integer;
  v_line_total bigint;
  v_result jsonb;
begin
  v_actor := pos_private.require_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_return');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Trả hàng bắt buộc có lý do' using errcode = '22023';
    end if;
    if coalesce(p_refund_method, '') not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Hình thức hoàn tiền không hợp lệ' using errcode = '22023';
    end if;
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Chọn ít nhất một sản phẩm trả' using errcode = '22023';
    end if;

    select * into v_invoice
    from public.pos_invoices i
    where i.invoice_no = trim(p_invoice_no);
    if not found then
      raise exception 'Không tìm thấy hóa đơn %', trim(p_invoice_no) using errcode = 'P0001';
    end if;

    select * into v_sale from public.pos_sales s where s.id = v_invoice.sale_id;
    if v_sale.status <> 'COMPLETED' then
      raise exception 'Chỉ trả hàng trên sale đã hoàn tất' using errcode = 'P0001';
    end if;

    v_return_no := 'TH' || lpad(nextval('public.pos_return_seq')::text, 6, '0');

    insert into public.pos_returns(
      return_no, invoice_id, sale_id, status, reason, item_condition, refund_method,
      total_dong, note, idempotency_key, actor_email
    )
    values (
      v_return_no, v_invoice.id, v_sale.id, 'COMPLETED', trim(p_reason),
      coalesce(nullif(trim(p_item_condition), ''), 'NEW'),
      p_refund_method, 0, nullif(trim(coalesce(p_note, '')), ''), trim(p_idempotency_key), v_actor
    )
    returning id into v_return_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := (v_item ->> 'quantity')::integer;
      if v_qty <= 0 then
        raise exception 'Số lượng trả phải > 0' using errcode = '22023';
      end if;

      select * into v_sale_item
      from public.pos_sale_items si
      where si.id = (v_item ->> 'sale_item_id')::uuid
        and si.sale_id = v_sale.id;
      if not found then
        raise exception 'Dòng bán không thuộc hóa đơn này' using errcode = 'P0001';
      end if;

      select coalesce(sum(ri.quantity), 0) into v_returned
      from public.pos_return_items ri
      join public.pos_returns r on r.id = ri.return_id
      where ri.sale_item_id = v_sale_item.id and r.status = 'COMPLETED';

      if v_returned + v_qty > v_sale_item.quantity then
        raise exception 'Vượt số lượng có thể trả cho SKU %', v_sale_item.sku_id using errcode = 'P0001';
      end if;

      v_line_total := v_sale_item.unit_price_dong * v_qty;
      v_total := v_total + v_line_total;

      insert into public.pos_return_items(
        return_id, sale_item_id, sku_id, quantity, unit_price_dong, total_price_dong
      )
      values (
        v_return_id, v_sale_item.id, v_sale_item.sku_id, v_qty,
        v_sale_item.unit_price_dong, v_line_total
      );

      perform pos_private.apply_stock_change(
        v_sale_item.sku_id,
        v_qty,
        'CUSTOMER_RETURN',
        trim(p_reason),
        'RETURN',
        v_return_id,
        v_actor
      );
    end loop;

    update public.pos_returns set total_dong = v_total where id = v_return_id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'RETURN', 'return', v_return_id, trim(p_reason),
      jsonb_build_object(
        'return_no', v_return_no,
        'invoice_no', v_invoice.invoice_no,
        'total_dong', v_total,
        'refund_method', p_refund_method
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'return_id', v_return_id,
      'return_no', v_return_no,
      'invoice_no', v_invoice.invoice_no,
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

create or replace function public.pos_complete_return(
  p_idempotency_key text,
  p_invoice_no text,
  p_reason text,
  p_item_condition text,
  p_refund_method text,
  p_note text,
  p_items jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_return(
    p_idempotency_key, p_invoice_no, p_reason, p_item_condition,
    p_refund_method, p_note, p_items
  );
$$;

create or replace function public.pos_get_return_invoice(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice public.pos_invoices%rowtype;
  v_customer record;
  v_items jsonb;
begin
  perform pos_private.require_admin();
  select i.* into v_invoice
  from public.pos_invoices i
  left join public.pos_customers c on c.id = i.customer_id
  where i.invoice_no ilike trim(p_query)
     or c.phone ilike '%' || trim(p_query) || '%'
  order by i.issued_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select c.name, c.phone, c.customer_no, c.is_walk_in
  into v_customer
  from public.pos_customers c
  where c.id = v_invoice.customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sale_item_id', si.id,
      'sku_id', si.sku_id,
      'sku', sk.sku,
      'name', sk.name,
      'sold_qty', si.quantity,
      'returned_qty', coalesce((
        select sum(ri.quantity)
        from public.pos_return_items ri
        join public.pos_returns r on r.id = ri.return_id
        where ri.sale_item_id = si.id and r.status = 'COMPLETED'
      ), 0),
      'unit_price_dong', si.unit_price_dong,
      'weight_chi', si.weight_chi
    ) order by sk.name
  ), '[]'::jsonb)
  into v_items
  from public.pos_sale_items si
  join public.pos_skus sk on sk.id = si.sku_id
  where si.sale_id = v_invoice.sale_id;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'issued_at', v_invoice.issued_at,
    'total_dong', v_invoice.total_dong,
    'customer_name', v_customer.name,
    'customer_phone', v_customer.phone,
    'customer_no', v_customer.customer_no,
    'is_walk_in', v_customer.is_walk_in,
    'items', v_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Category RPCs
-- ---------------------------------------------------------------------------

create or replace function public.pos_list_categories()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform pos_private.require_admin();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'status', c.status,
      'display_order', c.display_order,
      'product_count', (
        select count(*) from public.pos_category_skus cs where cs.category_id = c.id
      ),
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ) order by c.display_order, c.name
  ), '[]'::jsonb)
  into v_items
  from public.pos_categories c;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.pos_get_category(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.pos_categories%rowtype;
  v_skus jsonb;
begin
  perform pos_private.require_admin();
  select * into v_row from public.pos_categories where id = p_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sku_id', s.id,
      'sku', s.sku,
      'name', s.name
    ) order by s.name
  ), '[]'::jsonb)
  into v_skus
  from public.pos_category_skus cs
  join public.pos_skus s on s.id = cs.sku_id
  where cs.category_id = p_id;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'description', v_row.description,
    'status', v_row.status,
    'display_order', v_row.display_order,
    'skus', v_skus
  );
end;
$$;

create or replace function public.pos_create_category(
  p_name text,
  p_description text default null,
  p_status text default 'ACTIVE',
  p_display_order integer default 0,
  p_sku_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_id uuid;
  v_sku uuid;
begin
  v_actor := pos_private.require_admin();
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Tên danh mục không được trống' using errcode = '22023';
  end if;

  insert into public.pos_categories(name, description, status, display_order)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(nullif(p_status, ''), 'ACTIVE'),
    coalesce(p_display_order, 0)
  )
  returning id into v_id;

  foreach v_sku in array coalesce(p_sku_ids, '{}')
  loop
    insert into public.pos_category_skus(category_id, sku_id)
    values (v_id, v_sku)
    on conflict do nothing;
  end loop;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (v_actor, 'CREATE', 'category', v_id, 'Tạo danh mục', jsonb_build_object('name', trim(p_name)));

  return public.pos_get_category(v_id);
end;
$$;

create or replace function public.pos_update_category(
  p_id uuid,
  p_name text,
  p_description text default null,
  p_status text default 'ACTIVE',
  p_display_order integer default 0,
  p_sku_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_sku uuid;
begin
  v_actor := pos_private.require_admin();
  update public.pos_categories
  set
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    status = coalesce(nullif(p_status, ''), 'ACTIVE'),
    display_order = coalesce(p_display_order, 0),
    updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Không tìm thấy danh mục' using errcode = 'P0001';
  end if;

  delete from public.pos_category_skus where category_id = p_id;
  foreach v_sku in array coalesce(p_sku_ids, '{}')
  loop
    insert into public.pos_category_skus(category_id, sku_id)
    values (p_id, v_sku)
    on conflict do nothing;
  end loop;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
  values (v_actor, 'UPDATE', 'category', p_id, 'Cập nhật danh mục');

  return public.pos_get_category(p_id);
end;
$$;

create or replace function public.pos_delete_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_name text;
begin
  v_actor := pos_private.require_admin();
  select name into v_name from public.pos_categories where id = p_id;
  if not found then
    raise exception 'Không tìm thấy danh mục' using errcode = 'P0001';
  end if;

  delete from public.pos_categories where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (v_actor, 'DELETE', 'category', p_id, 'Xóa danh mục', jsonb_build_object('name', v_name));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pos_list_assignable_skus(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
  v_items jsonb;
begin
  perform pos_private.require_admin();
  select coalesce(jsonb_agg(
    jsonb_build_object('sku_id', s.id, 'sku', s.sku, 'name', s.name)
    order by s.name
  ), '[]'::jsonb)
  into v_items
  from public.pos_skus s
  where s.is_active
    and (
      v_q = ''
      or s.sku ilike '%' || v_q || '%'
      or s.name ilike '%' || v_q || '%'
    )
  limit 100;

  return jsonb_build_object('items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit list
-- ---------------------------------------------------------------------------

create or replace function public.pos_list_audit_logs(
  p_query text default '',
  p_module text default null,
  p_from date default null,
  p_to date default null,
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
  v_items jsonb;
  v_total bigint;
  v_q text := trim(coalesce(p_query, ''));
begin
  perform pos_private.require_admin();

  select count(*) into v_total
  from public.pos_audit_log a
  where (v_q = '' or a.action ilike '%' || v_q || '%' or a.actor_email ilike '%' || v_q || '%' or a.entity_type ilike '%' || v_q || '%')
    and (p_module is null or a.entity_type = p_module or a.action = p_module)
    and (p_from is null or (timezone('Asia/Ho_Chi_Minh', a.created_at))::date >= p_from)
    and (p_to is null or (timezone('Asia/Ho_Chi_Minh', a.created_at))::date <= p_to);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'created_at', a.created_at,
      'actor_email', a.actor_email,
      'action', a.action,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'reason', a.reason,
      'payload', a.payload
    ) order by a.created_at desc
  ), '[]'::jsonb)
  into v_items
  from (
    select *
    from public.pos_audit_log a
    where (v_q = '' or a.action ilike '%' || v_q || '%' or a.actor_email ilike '%' || v_q || '%' or a.entity_type ilike '%' || v_q || '%')
      and (p_module is null or a.entity_type = p_module or a.action = p_module)
      and (p_from is null or (timezone('Asia/Ho_Chi_Minh', a.created_at))::date >= p_from)
      and (p_to is null or (timezone('Asia/Ho_Chi_Minh', a.created_at))::date <= p_to)
    order by a.created_at desc
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0)
  ) a;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', p_limit, 'offset', p_offset);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting snapshot
-- ---------------------------------------------------------------------------

create or replace function public.pos_get_reporting(
  p_from date,
  p_to date,
  p_actor_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total_revenue bigint;
  v_invoice_count integer;
  v_avg_invoice bigint;
  v_daily jsonb;
  v_top jsonb;
  v_returns_total bigint;
begin
  perform pos_private.require_admin();

  if p_from is null or p_to is null then
    raise exception 'Cần chọn khoảng thời gian' using errcode = '22023';
  end if;
  if p_from > p_to then
    raise exception 'Từ ngày phải <= đến ngày' using errcode = '22023';
  end if;

  select coalesce(sum(s.total_dong), 0), count(*)
  into v_total_revenue, v_invoice_count
  from public.pos_sales s
  where s.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date between p_from and p_to
    and (p_actor_email is null or lower(s.actor_email) = lower(p_actor_email));

  v_avg_invoice := case when v_invoice_count = 0 then 0 else v_total_revenue / v_invoice_count end;

  select coalesce(sum(r.total_dong), 0) into v_returns_total
  from public.pos_returns r
  where r.status = 'COMPLETED'
    and (timezone('Asia/Ho_Chi_Minh', r.created_at))::date between p_from and p_to
    and (p_actor_email is null or lower(r.actor_email) = lower(p_actor_email));

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day,
      'revenue_dong', d.revenue_dong,
      'invoice_count', d.invoice_count
    ) order by d.day
  ), '[]'::jsonb)
  into v_daily
  from (
    select
      (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date as day,
      coalesce(sum(s.total_dong), 0) as revenue_dong,
      count(*) as invoice_count
    from public.pos_sales s
    where s.status = 'COMPLETED'
      and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date between p_from and p_to
      and (p_actor_email is null or lower(s.actor_email) = lower(p_actor_email))
    group by 1
  ) d;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sku', x.sku,
      'name', x.name,
      'quantity_sold', x.quantity_sold,
      'revenue_dong', x.revenue_dong
    ) order by x.quantity_sold desc
  ), '[]'::jsonb)
  into v_top
  from (
    select sk.sku, sk.name,
      sum(i.quantity) as quantity_sold,
      sum(i.total_price_dong) as revenue_dong
    from public.pos_sale_items i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_skus sk on sk.id = i.sku_id
    where s.status = 'COMPLETED'
      and (timezone('Asia/Ho_Chi_Minh', s.completed_at))::date between p_from and p_to
      and (p_actor_email is null or lower(s.actor_email) = lower(p_actor_email))
    group by sk.sku, sk.name
    order by sum(i.quantity) desc
    limit 10
  ) x;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'total_revenue_dong', v_total_revenue,
    'invoice_count', v_invoice_count,
    'avg_invoice_dong', v_avg_invoice,
    'returns_total_dong', v_returns_total,
    'net_revenue_dong', v_total_revenue - v_returns_total,
    'daily', v_daily,
    'top_products', v_top
  );
end;
$$;

-- Grants
revoke all on function public.pos_list_stock_counts(integer, integer) from public, anon;
revoke all on function public.pos_get_stock_count(uuid) from public, anon;
revoke all on function public.pos_create_stock_count(text, text, text, text) from public, anon;
revoke all on function public.pos_update_stock_count_item(uuid, uuid, integer) from public, anon;
revoke all on function public.pos_submit_stock_count(uuid) from public, anon;
revoke all on function public.pos_approve_stock_count(uuid) from public, anon;
revoke all on function public.pos_reject_stock_count(uuid, text) from public, anon;
revoke all on function public.pos_complete_return(text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.pos_get_return_invoice(text) from public, anon;
revoke all on function public.pos_list_categories() from public, anon;
revoke all on function public.pos_get_category(uuid) from public, anon;
revoke all on function public.pos_create_category(text, text, text, integer, uuid[]) from public, anon;
revoke all on function public.pos_update_category(uuid, text, text, text, integer, uuid[]) from public, anon;
revoke all on function public.pos_delete_category(uuid) from public, anon;
revoke all on function public.pos_list_assignable_skus(text) from public, anon;
revoke all on function public.pos_list_audit_logs(text, text, date, date, integer, integer) from public, anon;
revoke all on function public.pos_get_reporting(date, date, text) from public, anon;

grant execute on function public.pos_list_stock_counts(integer, integer) to authenticated;
grant execute on function public.pos_get_stock_count(uuid) to authenticated;
grant execute on function public.pos_create_stock_count(text, text, text, text) to authenticated;
grant execute on function public.pos_update_stock_count_item(uuid, uuid, integer) to authenticated;
grant execute on function public.pos_submit_stock_count(uuid) to authenticated;
grant execute on function public.pos_approve_stock_count(uuid) to authenticated;
grant execute on function public.pos_reject_stock_count(uuid, text) to authenticated;
grant execute on function public.pos_complete_return(text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.pos_get_return_invoice(text) to authenticated;
grant execute on function public.pos_list_categories() to authenticated;
grant execute on function public.pos_get_category(uuid) to authenticated;
grant execute on function public.pos_create_category(text, text, text, integer, uuid[]) to authenticated;
grant execute on function public.pos_update_category(uuid, text, text, text, integer, uuid[]) to authenticated;
grant execute on function public.pos_delete_category(uuid) to authenticated;
grant execute on function public.pos_list_assignable_skus(text) to authenticated;
grant execute on function public.pos_list_audit_logs(text, text, date, date, integer, integer) to authenticated;
grant execute on function public.pos_get_reporting(date, date, text) to authenticated;
