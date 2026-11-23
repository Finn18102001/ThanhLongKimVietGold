-- Expose receive_account_* on pos_list_sale_payments (Phase C detail reload).

create or replace function public.pos_list_sale_payments(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_items jsonb;
begin
  perform pos_private.require_pos_user();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'sale_id', p.sale_id, 'amount_dong', p.amount_dong, 'payment_method', p.payment_method,
    'paid_at', p.paid_at, 'actor_email', p.actor_email, 'note', p.note,
    'received_by_staff_id', p.received_by_staff_id,
    'received_by_name', pos_private.staff_display_name(p.received_by_staff_id, p.actor_email),
    'receive_account_kind', p.receive_account_kind,
    'receive_account_note', p.receive_account_note
  ) order by p.paid_at asc, p.created_at asc), '[]'::jsonb)
  into v_items from public.pos_sale_payments p where p.sale_id = p_sale_id;
  return jsonb_build_object('items', v_items);
end; $function$;

revoke all on function public.pos_list_sale_payments(uuid) from public, anon;
grant execute on function public.pos_list_sale_payments(uuid) to authenticated, service_role;
