-- P7: nhận kho từ đúng 1 draft (received_qty=1). Tạo Unit + gắn MSP sau khi nhập thành công.
-- Không ghi sell_price vào labor_fee_dong / unit_price (chờ nguồn giá bán chính thức).
-- Doc: docs/pos-big-update/P7-00-PRERECEIPT-LABELING.md

create or replace function public.pos_receive_label_draft(
  p_draft_id uuid,
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_brand_id uuid,
  p_category_id uuid,
  p_cost_price_dong bigint,
  p_sell_price_dong bigint default null,
  p_payment_method text default 'CASH',
  p_note text default null,
  p_order jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_draft public.pos_label_drafts%rowtype;
  v_method text := upper(trim(coalesce(p_payment_method, 'CASH')));
  v_item jsonb;
  v_order jsonb;
  v_result jsonb;
  v_receipt uuid;
  v_item_id uuid;
  v_sku_id uuid;
  v_sku_code text;
  v_unit_id uuid;
  v_piece_id uuid;
  v_barcode text;
  v_name text;
  v_weight numeric;
  v_prefix text;
  v_replay boolean := false;
begin
  v_actor := pos_private.require_admin();

  if p_draft_id is null then
    raise exception 'Thiếu draft_id' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Thiếu idempotency_key' using errcode = '22023';
  end if;
  if p_brand_id is null then
    raise exception 'Phải chọn Brand hợp lệ khi nhập kho' using errcode = '22023';
  end if;
  if p_category_id is null then
    raise exception 'Phải chọn Category hợp lệ khi nhập kho' using errcode = '22023';
  end if;
  if p_cost_price_dong is null or p_cost_price_dong < 0 then
    raise exception 'Giá vốn phải là số nguyên VND không âm' using errcode = '22023';
  end if;
  if p_sell_price_dong is not null and p_sell_price_dong < 0 then
    raise exception 'Giá bán phải là số nguyên VND không âm' using errcode = '22023';
  end if;
  if v_method not in ('CASH', 'TRANSFER') then
    raise exception 'Hình thức thanh toán chỉ nhận Tiền mặt hoặc Chuyển khoản' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brands b where b.id = p_brand_id and coalesce(b.is_active, true)) then
    raise exception 'Brand không tồn tại hoặc đã tắt' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.categories c where c.id = p_category_id) then
    raise exception 'Category không tồn tại' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.brand_categories bc
    where bc.brand_id = p_brand_id and bc.category_id = p_category_id
  ) then
    raise exception 'Brand và Category không liên kết hợp lệ' using errcode = '22023';
  end if;

  select * into v_draft
  from public.pos_label_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Draft không tồn tại' using errcode = 'P0001';
  end if;

  -- Anti-dup / retry: đã nhận → trả kết quả gắn draft (không nhận lần 2)
  if v_draft.status = 'RECEIVED' then
    v_replay := true;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'draft_id', v_draft.id,
      'receipt_id', v_draft.receipt_id,
      'receipt_item_id', v_draft.receipt_item_id,
      'sku_id', v_draft.sku_id,
      'unit_id', v_draft.unit_id,
      'piece_id', v_draft.piece_id,
      'printable_code', v_draft.printable_code,
      'code_mode', v_draft.code_mode,
      'sell_price_dong', p_sell_price_dong,
      'sell_price_applied_to_sku', false,
      'note', 'Draft đã nhập kho trước đó — không tạo Unit/MSP mới'
    );
  end if;

  if v_draft.status = 'CANCELLED' then
    raise exception 'Draft đã hủy' using errcode = 'P0001';
  end if;
  if v_draft.status not in ('PRINTED', 'DRAFT') then
    raise exception 'Trạng thái draft không hợp lệ để nhập kho: %', v_draft.status
      using errcode = 'P0001';
  end if;
  -- Chỉ nhận draft đã in (đã dán tem)
  if v_draft.status <> 'PRINTED' then
    raise exception 'Chỉ nhập kho draft đã in tem (status PRINTED)' using errcode = 'P0001';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_order ->> 'name', '')), ''), v_draft.product_name);
  v_weight := coalesce(
    nullif(p_order ->> 'weight_chi', '')::numeric,
    v_draft.weight_chi,
    1
  );
  v_prefix := upper(trim(coalesce(nullif(p_order ->> 'sku_prefix', ''), 'TLKVTS')));

  v_order := jsonb_build_object(
    'name', v_name,
    'brand_id', p_brand_id,
    'category_id', p_category_id,
    'price_row_id', coalesce(nullif(p_order ->> 'price_row_id', ''), v_draft.price_row_id),
    'price_note', coalesce(p_order ->> 'price_note', v_draft.price_note),
    'weight_chi', v_weight,
    'sku_prefix', v_prefix,
    'visible', coalesce((p_order ->> 'visible')::boolean, false),
    'product_type_id', nullif(p_order ->> 'product_type_id', ''),
    'gold_age', coalesce(nullif(p_order ->> 'gold_age', ''), v_draft.gold_age_text)
  );

  -- received_qty = 1 cứng (P7)
  v_item := jsonb_build_object(
    'expected_qty', 1,
    'received_qty', 1,
    'cost_price_dong', p_cost_price_dong,
    'weight_chi', v_weight,
    'order_product', v_order
  );

  v_result := public.pos_receive_order_purchase(
    p_idempotency_key,
    p_supplier_name,
    coalesce(nullif(trim(p_reason), ''), 'Nhập hàng từ draft tem'),
    jsonb_build_array(v_item),
    p_cost_price_dong, -- paid for FULL cash equal cost*1 when method set; caller may use UNPAID via paid=0 path — use cost as paid for CASH/TRANSFER full
    v_method,
    'RECEIVED',
    null,
    coalesce(p_note, '') || ' [P7 draft=' || v_draft.id::text || ']'
  );

  v_receipt := nullif(v_result ->> 'receipt_id', '')::uuid;
  if v_receipt is null then
    raise exception 'Nhập kho thất bại: thiếu receipt_id' using errcode = 'P0001';
  end if;

  select i.id, i.sku_id, s.sku
  into v_item_id, v_sku_id, v_sku_code
  from public.pos_purchase_items i
  join public.pos_skus s on s.id = i.sku_id
  where i.receipt_id = v_receipt
  order by i.id
  limit 1;

  if v_sku_id is null then
    raise exception 'Không tìm thấy dòng phiếu nhập vừa tạo' using errcode = 'P0001';
  end if;

  -- Hybrid U1: tạo Unit chỉ sau nhập thành công
  insert into public.pos_inventory_units (
    sku_id, status, origin, origin_receipt_item_id, origin_note,
    shared_product_code, created_by
  ) values (
    v_sku_id,
    'IN_STOCK',
    'RECEIPT',
    v_item_id,
    'P7 receive draft ' || v_draft.id::text,
    case when v_draft.code_mode = 'PRE_ASSIGNED' then v_draft.printable_code else null end,
    v_actor
  )
  returning id into v_unit_id;

  if v_draft.code_mode = 'AUTO_MSP' then
    if nullif(trim(coalesce(v_draft.reserved_msp, '')), '') is null
       or nullif(trim(coalesce(v_draft.reserved_serial_no, '')), '') is null then
      raise exception 'Draft AUTO thiếu reserved MSP/serial' using errcode = 'P0001';
    end if;
    v_barcode := 'BC' || v_draft.reserved_serial_no;

    insert into public.pos_label_pieces (
      msp, barcode, sku_id, created_by, type_code, serial_no, unit_id
    ) values (
      v_draft.reserved_msp,
      v_barcode,
      v_sku_id,
      v_actor,
      coalesce(v_draft.type_code, ''),
      v_draft.reserved_serial_no,
      v_unit_id
    )
    returning id into v_piece_id;
  else
    -- PRE_ASSIGNED: không ép mã dùng chung vào unique MSP piece; mã trên unit.shared_product_code
    v_piece_id := null;
  end if;

  update public.pos_label_drafts
  set status = 'RECEIVED',
      received_at = now(),
      receipt_id = v_receipt,
      receipt_item_id = v_item_id,
      unit_id = v_unit_id,
      piece_id = v_piece_id,
      sku_id = v_sku_id,
      -- keep snapshot_json immutable; optional live cost/sell reflect confirmed receive values
      cost_price_dong = p_cost_price_dong,
      sell_price_dong = coalesce(p_sell_price_dong, sell_price_dong),
      updated_at = now()
  where id = v_draft.id;

  insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    'LABEL_DRAFT_RECEIVE',
    'pos_label_draft',
    v_draft.id,
    'Nhập kho từ draft tem',
    jsonb_build_object(
      'draft_id', v_draft.id,
      'receipt_id', v_receipt,
      'receipt_item_id', v_item_id,
      'sku_id', v_sku_id,
      'sku_code', v_sku_code,
      'unit_id', v_unit_id,
      'piece_id', v_piece_id,
      'code_mode', v_draft.code_mode,
      'printable_code', v_draft.printable_code,
      'cost_price_dong', p_cost_price_dong,
      'sell_price_dong', p_sell_price_dong,
      'sell_price_applied_to_sku', false,
      'snapshot_preserved', true
    )
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'replayed', false,
    'draft_id', v_draft.id,
    'receipt_id', v_receipt,
    'receipt_item_id', v_item_id,
    'sku_id', v_sku_id,
    'sku_code', v_sku_code,
    'unit_id', v_unit_id,
    'piece_id', v_piece_id,
    'printable_code', v_draft.printable_code,
    'code_mode', v_draft.code_mode,
    'received_qty', 1,
    'sell_price_dong', p_sell_price_dong,
    'sell_price_applied_to_sku', false
  );
exception
  when unique_violation then
    raise exception 'MSP/serial đã tồn tại — không mint lại. Kiểm tra draft hoặc piece lịch sử.'
      using errcode = 'P0001';
end;
$function$;

revoke all on function public.pos_receive_label_draft(uuid, text, text, text, uuid, uuid, bigint, bigint, text, text, jsonb) from public, anon;
grant execute on function public.pos_receive_label_draft(uuid, text, text, text, uuid, uuid, bigint, bigint, text, text, jsonb) to authenticated;
grant execute on function public.pos_receive_label_draft(uuid, text, text, text, uuid, uuid, bigint, bigint, text, text, jsonb) to service_role;

comment on function public.pos_receive_label_draft(uuid, text, text, text, uuid, uuid, bigint, bigint, text, text, jsonb) is
  'P7: nhận đúng 1 draft PRINTED → phiếu nhập qty=1 → Unit → MSP (AUTO) hoặc shared code (PRE). Không ghi giá bán vào labor_fee.';
