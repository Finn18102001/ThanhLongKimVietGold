-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function pos_private.stock_count_line_status(p_system integer, p_actual integer)
returns text
language sql
immutable
as $$
  select case
    when p_actual is null then 'PENDING'
    when p_actual = p_system then 'MATCH'
    when p_actual > p_system then 'EXCESS'
    else 'LACK'
  end;
$$;

create or replace function pos_private.stock_count_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.pos_stock_counts%rowtype;
  v_items jsonb;
  v_summary jsonb;
begin
  select * into v_row from public.pos_stock_counts where id = p_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'sku_id', i.sku_id,
      'sku', s.sku,
      'name', s.name,
      'system_qty', i.system_qty,
      'actual_qty', i.actual_qty,
      'difference', case when i.actual_qty is null then null else i.actual_qty - i.system_qty end,
      'line_status', pos_private.stock_count_line_status(i.system_qty, i.actual_qty)
    ) order by s.name
  ), '[]'::jsonb)
  into v_items
  from public.pos_stock_count_items i
  join public.pos_skus s on s.id = i.sku_id
  where i.count_id = p_id;

  select jsonb_build_object(
    'total_lines', count(*),
    'match_count', count(*) filter (where pos_private.stock_count_line_status(i.system_qty, i.actual_qty) = 'MATCH'),
    'excess_count', count(*) filter (where pos_private.stock_count_line_status(i.system_qty, i.actual_qty) = 'EXCESS'),
    'lack_count', count(*) filter (where pos_private.stock_count_line_status(i.system_qty, i.actual_qty) = 'LACK'),
    'pending_count', count(*) filter (where i.actual_qty is null)
  )
  into v_summary
  from public.pos_stock_count_items i
  where i.count_id = p_id;

  return jsonb_build_object(
    'id', v_row.id,
    'count_no', v_row.count_no,
    'warehouse', v_row.warehouse,
    'scope_type', v_row.scope_type,
    'scope_value', v_row.scope_value,
    'status', v_row.status,
    'note', v_row.note,
    'actor_email', v_row.actor_email,
    'approved_by', v_row.approved_by,
    'rejected_reason', v_row.rejected_reason,
    'created_at', v_row.created_at,
    'submitted_at', v_row.submitted_at,
    'approved_at', v_row.approved_at,
    'completed_at', v_row.completed_at,
    'summary', v_summary,
    'items', v_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock count RPCs
-- ---------------------------------------------------------------------------

create or replace function pos_private.create_stock_count(
  p_warehouse text,
  p_scope_type text,
  p_scope_value text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_id uuid;
  v_no text;
begin
  v_actor := pos_private.require_admin();
  if coalesce(p_scope_type, '') not in ('ALL', 'CATEGORY') then
    raise exception 'scope_type không hợp lệ' using errcode = '22023';
  end if;
  if p_scope_type = 'CATEGORY' and coalesce(trim(p_scope_value), '') = '' then
    raise exception 'Kiểm kê theo danh mục cần chọn danh mục' using errcode = '22023';
  end if;

  v_no := 'KK' || lpad(nextval('public.pos_stock_count_seq')::text, 6, '0');

  insert into public.pos_stock_counts(
    count_no, warehouse, scope_type, scope_value, status, note, actor_email
  )
  values (
    v_no,
    coalesce(nullif(trim(p_warehouse), ''), 'MAIN'),
    p_scope_type,
    nullif(trim(coalesce(p_scope_value, '')), ''),
    'COUNTING',
    nullif(trim(coalesce(p_note, '')), ''),
    v_actor
  )
  returning id into v_id;

  insert into public.pos_stock_count_items(count_id, sku_id, system_qty)
  select v_id, s.id, coalesce(st.quantity, 0)
  from public.pos_skus s
  join public.pos_inventory_stock st on st.sku_id = s.id
  where s.is_active
    and (
      p_scope_type = 'ALL'
      or exists (
        select 1
        from public.pos_category_skus cs
        where cs.sku_id = s.id
          and cs.category_id = p_scope_value::uuid
      )
    );

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STOCK_COUNT_CREATE', 'stock_count', v_id, 'Tạo phiên kiểm kê',
    jsonb_build_object('count_no', v_no, 'scope_type', p_scope_type, 'scope_value', p_scope_value)
  );

  return pos_private.stock_count_json(v_id);
end;
$$;

create or replace function pos_private.update_stock_count_item(
  p_count_id uuid,
  p_sku_id uuid,
  p_actual_qty integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_status text;
begin
  v_actor := pos_private.require_admin();
  if p_actual_qty < 0 then
    raise exception 'Số lượng thực tế không được âm' using errcode = '22023';
  end if;

  select status into v_status from public.pos_stock_counts where id = p_count_id for update;
  if not found then
    raise exception 'Không tìm thấy phiên kiểm kê' using errcode = 'P0001';
  end if;
  if v_status not in ('COUNTING', 'DRAFT') then
    raise exception 'Phiên kiểm kê không còn ở trạng thái nhập số liệu' using errcode = 'P0001';
  end if;

  update public.pos_stock_count_items
  set actual_qty = p_actual_qty
  where count_id = p_count_id and sku_id = p_sku_id;

  if not found then
    raise exception 'SKU không thuộc phiên kiểm kê' using errcode = 'P0001';
  end if;

  return pos_private.stock_count_json(p_count_id);
end;
$$;

create or replace function pos_private.submit_stock_count(p_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_status text;
  v_pending integer;
begin
  v_actor := pos_private.require_admin();
  select status into v_status from public.pos_stock_counts where id = p_count_id for update;
  if v_status not in ('COUNTING', 'DRAFT') then
    raise exception 'Không thể gửi duyệt ở trạng thái hiện tại' using errcode = 'P0001';
  end if;

  select count(*) into v_pending
  from public.pos_stock_count_items
  where count_id = p_count_id and actual_qty is null;
  if v_pending > 0 then
    raise exception 'Còn % dòng chưa nhập số lượng thực tế', v_pending using errcode = 'P0001';
  end if;

  update public.pos_stock_counts
  set status = 'PENDING_APPROVAL', submitted_at = now()
  where id = p_count_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
  values (v_actor, 'STOCK_COUNT_SUBMIT', 'stock_count', p_count_id, 'Gửi duyệt kiểm kê');

  return pos_private.stock_count_json(p_count_id);
end;
$$;

create or replace function pos_private.approve_stock_count(p_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_row public.pos_stock_counts%rowtype;
  v_item record;
  v_diff integer;
  v_adj_id uuid;
  v_type text;
  v_reason text;
begin
  v_actor := pos_private.require_admin();

  select * into v_row from public.pos_stock_counts where id = p_count_id for update;
  if v_row.status <> 'PENDING_APPROVAL' then
    raise exception 'Phiên kiểm kê chưa ở trạng thái chờ duyệt' using errcode = 'P0001';
  end if;

  update public.pos_stock_counts
  set status = 'APPROVED', approved_by = v_actor, approved_at = now()
  where id = p_count_id;

  for v_item in
    select i.sku_id, i.system_qty, i.actual_qty
    from public.pos_stock_count_items i
    where i.count_id = p_count_id and i.actual_qty is not null and i.actual_qty <> i.system_qty
  loop
    v_diff := v_item.actual_qty - v_item.system_qty;
    v_type := case when v_diff > 0 then 'STOCK_ADJUSTMENT_IN' else 'STOCK_ADJUSTMENT_OUT' end;
    v_reason := format('Kiểm kê %s: hệ thống %s → thực tế %s', v_row.count_no, v_item.system_qty, v_item.actual_qty);

    insert into public.pos_stock_adjustments(sku_id, quantity, reason, idempotency_key, actor_email)
    values (
      v_item.sku_id,
      v_diff,
      v_reason,
      'count-' || p_count_id::text || '-' || v_item.sku_id::text,
      v_actor
    )
    returning id into v_adj_id;

    perform pos_private.apply_stock_change(
      v_item.sku_id, v_diff, v_type, v_reason, 'STOCK_COUNT', p_count_id, v_actor
    );

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, v_type, 'stock_adjustment', v_adj_id, v_reason,
      jsonb_build_object('count_id', p_count_id, 'count_no', v_row.count_no, 'delta', v_diff)
    );
  end loop;

  update public.pos_stock_counts
  set status = 'COMPLETED', completed_at = now()
  where id = p_count_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STOCK_COUNT_APPROVE', 'stock_count', p_count_id, 'Duyệt kiểm kê và cập nhật kho',
    jsonb_build_object('count_no', v_row.count_no)
  );

  return pos_private.stock_count_json(p_count_id);
end;
$$;

create or replace function pos_private.reject_stock_count(p_count_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  v_actor := pos_private.require_admin();
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Từ chối kiểm kê cần lý do' using errcode = '22023';
  end if;

  update public.pos_stock_counts
  set
    status = 'REJECTED',
    rejected_reason = trim(p_reason),
    approved_by = v_actor,
    approved_at = now()
  where id = p_count_id and status = 'PENDING_APPROVAL';

  if not found then
    raise exception 'Phiên kiểm kê không ở trạng thái chờ duyệt' using errcode = 'P0001';
  end if;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
  values (v_actor, 'STOCK_COUNT_REJECT', 'stock_count', p_count_id, trim(p_reason));

  return pos_private.stock_count_json(p_count_id);
end;
$$;

create or replace function public.pos_list_stock_counts(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_total bigint;
begin
  perform pos_private.require_admin();
  select count(*) into v_total from public.pos_stock_counts;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'count_no', c.count_no,
      'warehouse', c.warehouse,
      'scope_type', c.scope_type,
      'scope_value', c.scope_value,
      'status', c.status,
      'actor_email', c.actor_email,
      'created_at', c.created_at,
      'completed_at', c.completed_at
    ) order by c.created_at desc
  ), '[]'::jsonb)
  into v_items
  from (
    select * from public.pos_stock_counts
    order by created_at desc
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0)
  ) c;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', p_limit, 'offset', p_offset);
end;
$$;

create or replace function public.pos_get_stock_count(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.stock_count_json(p_id);
$$;

create or replace function public.pos_create_stock_count(
  p_warehouse text default 'MAIN',
  p_scope_type text default 'ALL',
  p_scope_value text default null,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.create_stock_count(p_warehouse, p_scope_type, p_scope_value, p_note);
$$;

create or replace function public.pos_update_stock_count_item(
  p_count_id uuid,
  p_sku_id uuid,
  p_actual_qty integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.update_stock_count_item(p_count_id, p_sku_id, p_actual_qty);
$$;

create or replace function public.pos_submit_stock_count(p_count_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.submit_stock_count(p_count_id);
$$;

create or replace function public.pos_approve_stock_count(p_count_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.approve_stock_count(p_count_id);
$$;

create or replace function public.pos_reject_stock_count(p_count_id uuid, p_reason text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.reject_stock_count(p_count_id, p_reason);
$$;
