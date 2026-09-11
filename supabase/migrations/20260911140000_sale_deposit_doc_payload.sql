-- Staff-editable extras for 3 deposit documents + issue BBGN number
-- when remaining = 0 (before gold leaves stock). Check/Print stay independent.

alter table public.pos_sales
  add column if not exists deposit_doc_payload jsonb not null default '{}'::jsonb;

comment on column public.pos_sales.deposit_doc_payload is
  'Editable extras for Thỏa thuận / Phiếu đặt cọc / Biên bản giao nhận. Invoice money/items stay source of truth.';

create or replace function public.pos_save_deposit_doc_payload(
  p_sale_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_sale public.pos_sales%rowtype;
begin
  v_actor := pos_private.require_pos_user();
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Dữ liệu bổ sung không hợp lệ' using errcode = '22023';
  end if;

  select * into v_sale from public.pos_sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Không tìm thấy đơn' using errcode = 'P0002';
  end if;
  if v_sale.deposit_workflow_status is null then
    raise exception 'Đơn này không có chứng từ đặt cọc' using errcode = '22023';
  end if;
  if v_sale.deposit_workflow_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Không chỉnh chứng từ sau khi hoàn tất / hủy' using errcode = '22023';
  end if;

  update public.pos_sales
  set
    deposit_doc_payload = coalesce(deposit_doc_payload, '{}'::jsonb) || p_payload,
    deposit_delivery_place = coalesce(
      nullif(trim(coalesce(p_payload ->> 'delivery_place', '')), ''),
      deposit_delivery_place
    )
  where id = v_sale.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'DEPOSIT_DOC_SAVE', 'sale', v_sale.id, 'Lưu thông tin bổ sung chứng từ đặt cọc',
    jsonb_build_object('sale_id', v_sale.id)
  );

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale.id,
    'deposit_doc_payload', (select deposit_doc_payload from public.pos_sales where id = v_sale.id),
    'deposit_delivery_place', (select deposit_delivery_place from public.pos_sales where id = v_sale.id)
  );
end;
$$;

revoke all on function public.pos_save_deposit_doc_payload(uuid, jsonb) from public, anon;
grant execute on function public.pos_save_deposit_doc_payload(uuid, jsonb) to authenticated;

-- Remaining paid = 0 → open Biên bản giao nhận (number it) without stock out.
create or replace function public.pos_prepare_deposit_delivery(
  p_sale_id uuid,
  p_idempotency_key text
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
  v_no text;
  v_result jsonb;
  v_backorder integer := 0;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'prepare_deposit_delivery');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then
      raise exception 'Không tìm thấy đơn' using errcode = 'P0002';
    end if;
    if v_sale.transaction_type not in ('DEPOSIT', 'PREORDER') then
      raise exception 'Chỉ áp dụng cho đơn đặt cọc / đặt hàng' using errcode = '22023';
    end if;
    if v_sale.deposit_workflow_status is not null and v_sale.deposit_slip_no is null then
      raise exception 'Chưa có phiếu đặt cọc' using errcode = 'P0001';
    end if;
    if v_sale.remaining_dong > 0 or v_sale.payment_status <> 'PAID' then
      raise exception 'Phải thanh toán đủ trước khi lập biên bản giao nhận' using errcode = 'P0001';
    end if;
    if v_sale.fulfillment_status = 'FULFILLED' then
      raise exception 'Đơn đã giao vàng' using errcode = 'P0001';
    end if;
    if v_sale.fulfillment_status = 'CANCELLED' then
      raise exception 'Đơn đã hủy' using errcode = '22023';
    end if;

    perform pos_private.refresh_backorder_availability(null);

    select count(*) into v_backorder
    from public.pos_sale_items si
    where si.sale_id = v_sale.id
      and si.item_status = 'BACKORDER'
      and si.qty_delivered < si.quantity;
    if coalesce(v_backorder, 0) > 0 then
      raise exception 'Còn hàng đặt chưa đủ điều kiện giao. Không lập biên bản giao nhận.'
        using errcode = 'P0001';
    end if;

    if v_sale.delivery_receipt_no is null then
      v_no := 'BBGN/' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY')
        || '-' || lpad(nextval('public.pos_delivery_receipt_seq')::text, 4, '0');
    else
      v_no := v_sale.delivery_receipt_no;
    end if;

    update public.pos_sales
    set
      delivery_receipt_no = coalesce(delivery_receipt_no, v_no),
      deposit_workflow_status = 'AWAITING_DELIVERY'
    where id = v_sale.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'DEPOSIT_HANDOVER_PREPARE', 'sale', v_sale.id,
      'Lập biên bản giao nhận — chưa xuất kho',
      jsonb_build_object('delivery_receipt_no', v_no)
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale.id,
      'deposit_workflow_status', 'AWAITING_DELIVERY',
      'delivery_receipt_no', v_no,
      'remaining_dong', 0
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_prepare_deposit_delivery(uuid, text) from public, anon;
grant execute on function public.pos_prepare_deposit_delivery(uuid, text) to authenticated;
