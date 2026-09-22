-- Held orders: any authenticated POS user can list / resume / cancel every HELD order.
-- Removes per-saver visibility gate (visible_to_all / admin-only share).

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
  -- Still require a logged-in POS session; do not gate by who saved the hold.
  return v_email <> '';
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
  v_items jsonb;
begin
  perform pos_private.require_pos_user();

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
  where h.status = 'HELD';

  return jsonb_build_object(
    'ok', true,
    'visible_to_all', true,
    'sees_all', true,
    'items', v_items
  );
end;
$$;
