-- Admin (tlkv_is_admin) can list / resume / cancel every HELD order system-wide.
-- Staff still follow pos_held_order_settings.visible_to_all (default: own holds only).

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
  if public.tlkv_is_admin() then
    return true;
  end if;
  if pos_private.held_orders_visible_to_all() then
    return true;
  end if;
  return lower(trim(p_saved_by_email)) = v_email;
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
  v_setting_all boolean;
  v_is_admin boolean;
  v_sees_all boolean;
  v_items jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_setting_all := pos_private.held_orders_visible_to_all();
  v_is_admin := public.tlkv_is_admin();
  v_sees_all := v_setting_all or v_is_admin;

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
    and (v_sees_all or h.saved_by_email = v_actor);

  return jsonb_build_object(
    'ok', true,
    'visible_to_all', v_setting_all,
    'sees_all', v_sees_all,
    'items', v_items
  );
end;
$$;
