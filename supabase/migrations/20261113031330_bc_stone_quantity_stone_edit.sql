-- Big Change phần 4 / 4 (xem 20261113031055_bc_stone_quantity_columns.sql): sửa đá sau nấu + đá mặc định của SKU.
-- Production: áp ngày 2026-11-13 qua Supabase MCP. Các function có sẵn được vá từ bản đang chạy bằng khối DO có kiểm md5
-- (sai một ký tự thì cả khối rollback); md5(prosrc) trên production sau khi áp trùng với thân function trong file này:
--   public.pos_set_buy_stone 97a5cca54fe6c82125104bf24246c4fe · public.pos_set_sku_sale_components bc0507daa752d7140b7889667b17ea8c
--   public.pos_set_sku_sale_components_v2 246afeaa6c75e4dd2e3837351b98ab94

-- 5. Sửa trọng lượng đá + số lượng đá sau nấu, ở bước upload phiếu kiểm tra hàm lượng (BC-9, QD-4).
--    Đơn giá đá không sửa được. Thành tiền đá tính lại = đơn giá đá hiện tại × số lượng đá mới.
--    Không đụng trọng lượng vàng, tiền vàng, tồn kho (BC-8, BC-10).
create or replace function public.pos_set_buy_stone(p_buy_id uuid, p_items jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_row record;
  v_item public.pos_buy_items%rowtype;
  v_old_total bigint;
  v_total bigint := 0;
  v_gold bigint;
  v_stone_p bigint;
  v_line bigint;
  v_changes jsonb := '[]'::jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'set_buy_stone');
  if v_cached is not null then return v_cached; end if;

  begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách thông tin đá trống' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status <> 'WEIGHT_ENTERED' then
      raise exception 'Chỉ sửa trọng lượng / số lượng đá ở bước upload phiếu kiểm tra hàm lượng' using errcode = 'P0001';
    end if;
    v_old_total := v_buy.total_dong;

    for v_row in
      select * from jsonb_to_recordset(p_items) as x(
        item_id uuid,
        stone_weight_chi numeric,
        stone_quantity integer
      )
    loop
      if v_row.item_id is null then
        raise exception 'item_id bắt buộc' using errcode = '22023';
      end if;
      if v_row.stone_weight_chi is null or v_row.stone_weight_chi < 0 then
        raise exception 'Trọng lượng đá không hợp lệ' using errcode = '22023';
      end if;
      if v_row.stone_quantity is null or v_row.stone_quantity < 0 then
        raise exception 'Số lượng đá không hợp lệ' using errcode = '22023';
      end if;

      select * into v_item from public.pos_buy_items where id = v_row.item_id and buy_id = v_buy.id for update;
      if not found then
        raise exception 'Dòng hàng không thuộc giao dịch' using errcode = 'P0001';
      end if;

      if v_item.stone_quantity = 0 and v_item.stone_unit_price_dong = 0 and v_item.stone_price_dong > 0 then
        -- Dòng cũ: tiền đá nhập tay, không có đơn giá đá để tính lại.
        if v_row.stone_quantity <> 0 then
          raise exception 'Dòng % nhập tiền đá theo cách cũ (không có đơn giá đá): chỉ sửa được trọng lượng đá', v_item.product_name_snapshot
            using errcode = 'P0001';
        end if;
        v_stone_p := v_item.stone_price_dong;
      else
        v_stone_p := v_item.stone_unit_price_dong * v_row.stone_quantity;
      end if;

      if v_item.stone_weight_chi = v_row.stone_weight_chi and v_item.stone_quantity = v_row.stone_quantity then
        continue;
      end if;

      v_gold := coalesce(v_item.gold_amount_dong, v_item.total_price_dong - v_item.stone_price_dong * v_item.quantity);
      v_line := v_gold + v_stone_p * v_item.quantity;

      update public.pos_buy_items
      set stone_weight_chi = v_row.stone_weight_chi,
          stone_quantity = v_row.stone_quantity,
          stone_price_dong = v_stone_p,
          total_price_dong = v_line
      where id = v_item.id;

      if v_item.is_market_gold and v_item.sku_id is not null then
        update public.pos_skus
        set stone_weight_chi = v_row.stone_weight_chi,
            stone_quantity = v_row.stone_quantity,
            stone_unit_price_dong = v_item.stone_unit_price_dong,
            stone_price_dong = v_stone_p
        where id = v_item.sku_id and is_market_gold;
      end if;

      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'item_id', v_item.id,
        'product_name', v_item.product_name_snapshot,
        'stone_unit_price_dong', v_item.stone_unit_price_dong,
        'before', jsonb_build_object(
          'stone_weight_chi', v_item.stone_weight_chi,
          'stone_quantity', v_item.stone_quantity,
          'stone_price_dong', v_item.stone_price_dong,
          'total_price_dong', v_item.total_price_dong
        ),
        'after', jsonb_build_object(
          'stone_weight_chi', v_row.stone_weight_chi,
          'stone_quantity', v_row.stone_quantity,
          'stone_price_dong', v_stone_p,
          'total_price_dong', v_line
        )
      ));
    end loop;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    if jsonb_array_length(v_changes) > 0 then
      update public.pos_buys
      set total_dong = v_total,
          remaining_dong = v_total - paid_dong,
          -- Dự kiến trả đủ thì đi theo tổng mới; dự kiến trả một phần thì giữ, không vượt tổng mới.
          intended_paid_dong = case
            when intended_paid_dong is null or intended_paid_dong >= v_old_total then v_total
            else least(intended_paid_dong, v_total)
          end
      where id = v_buy.id;

      insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
      values (v_actor, 'BUY_STONE_EDIT', 'buy', v_buy.id, 'Sửa trọng lượng / số lượng đá ' || v_buy.buy_no,
        jsonb_build_object(
          'buy_no', v_buy.buy_no,
          'total_dong_before', v_old_total,
          'total_dong_after', v_total,
          'items', v_changes
        ));
    end if;

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'totalDong', v_total,
      'changed', jsonb_array_length(v_changes) > 0, 'workflowStatus', v_buy.workflow_status
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

revoke all on function public.pos_set_buy_stone(uuid, jsonb, text) from public, anon;
grant execute on function public.pos_set_buy_stone(uuid, jsonb, text) to authenticated, service_role;

-- 6. SKU: tiền công + đá mặc định khi bán, nhập từ tab In tem.
--    Bản cũ (4 tham số, client cũ còn gọi): nếu sửa tay tiền đá / chiếc thì bỏ số lượng + đơn giá đá
--    để không vi phạm pos_skus_stone_qty_chk. Bản v2 nhận số lượng đá + đơn giá đá.
create or replace function public.pos_set_sku_sale_components(
  p_sku_id uuid,
  p_labor_fee_dong bigint,
  p_stone_weight_chi numeric,
  p_stone_price_dong bigint
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_old public.pos_skus%rowtype;
  v_qty integer;
  v_unit bigint;
begin
  v_actor := pos_private.require_pos_user();

  if p_labor_fee_dong is null or p_labor_fee_dong < 0 then
    raise exception 'Tiền công không hợp lệ' using errcode = '22023';
  end if;
  if p_stone_weight_chi is null or p_stone_weight_chi < 0 then
    raise exception 'Trọng lượng đá không hợp lệ' using errcode = '22023';
  end if;
  if p_stone_price_dong is null or p_stone_price_dong < 0 then
    raise exception 'Giá đá không hợp lệ' using errcode = '22023';
  end if;

  select * into v_old from public.pos_skus where id = p_sku_id for update;
  if not found then
    raise exception 'SKU không tồn tại' using errcode = 'P0001';
  end if;

  if v_old.labor_fee_dong = p_labor_fee_dong
     and v_old.stone_weight_chi = p_stone_weight_chi
     and v_old.stone_price_dong = p_stone_price_dong then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  if v_old.stone_price_dong = p_stone_price_dong then
    v_qty := v_old.stone_quantity;
    v_unit := v_old.stone_unit_price_dong;
  else
    v_qty := 0;
    v_unit := 0;
  end if;

  update public.pos_skus
  set labor_fee_dong = p_labor_fee_dong,
      stone_weight_chi = p_stone_weight_chi,
      stone_price_dong = p_stone_price_dong,
      stone_quantity = v_qty,
      stone_unit_price_dong = v_unit
  where id = p_sku_id;

  insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'SKU_SALE_COMPONENTS', 'pos_sku', p_sku_id,
    'Cập nhật tiền công / đá mặc định từ In tem ' || v_old.sku,
    jsonb_build_object(
      'sku', v_old.sku,
      'before', jsonb_build_object(
        'labor_fee_dong', v_old.labor_fee_dong,
        'stone_weight_chi', v_old.stone_weight_chi,
        'stone_quantity', v_old.stone_quantity,
        'stone_unit_price_dong', v_old.stone_unit_price_dong,
        'stone_price_dong', v_old.stone_price_dong
      ),
      'after', jsonb_build_object(
        'labor_fee_dong', p_labor_fee_dong,
        'stone_weight_chi', p_stone_weight_chi,
        'stone_quantity', v_qty,
        'stone_unit_price_dong', v_unit,
        'stone_price_dong', p_stone_price_dong
      )
    )
  );

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

create or replace function public.pos_set_sku_sale_components_v2(
  p_sku_id uuid,
  p_labor_fee_dong bigint,
  p_stone_weight_chi numeric,
  p_stone_quantity integer,
  p_stone_unit_price_dong bigint
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_old public.pos_skus%rowtype;
  v_amount bigint;
begin
  v_actor := pos_private.require_pos_user();

  if p_labor_fee_dong is null or p_labor_fee_dong < 0 then
    raise exception 'Tiền công không hợp lệ' using errcode = '22023';
  end if;
  if p_stone_weight_chi is null or p_stone_weight_chi < 0 then
    raise exception 'Trọng lượng đá không hợp lệ' using errcode = '22023';
  end if;
  if p_stone_quantity is null or p_stone_quantity < 0 then
    raise exception 'Số lượng đá không hợp lệ' using errcode = '22023';
  end if;
  if p_stone_unit_price_dong is null or p_stone_unit_price_dong < 0 then
    raise exception 'Đơn giá đá không hợp lệ' using errcode = '22023';
  end if;

  select * into v_old from public.pos_skus where id = p_sku_id for update;
  if not found then
    raise exception 'SKU không tồn tại' using errcode = 'P0001';
  end if;

  -- BC-3: thành tiền đá = đơn giá đá × số lượng đá.
  v_amount := p_stone_unit_price_dong * p_stone_quantity;

  if v_old.labor_fee_dong = p_labor_fee_dong
     and v_old.stone_weight_chi = p_stone_weight_chi
     and v_old.stone_quantity = p_stone_quantity
     and v_old.stone_unit_price_dong = p_stone_unit_price_dong
     and v_old.stone_price_dong = v_amount then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.pos_skus
  set labor_fee_dong = p_labor_fee_dong,
      stone_weight_chi = p_stone_weight_chi,
      stone_quantity = p_stone_quantity,
      stone_unit_price_dong = p_stone_unit_price_dong,
      stone_price_dong = v_amount
  where id = p_sku_id;

  insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'SKU_SALE_COMPONENTS', 'pos_sku', p_sku_id,
    'Cập nhật tiền công / đá mặc định từ In tem ' || v_old.sku,
    jsonb_build_object(
      'sku', v_old.sku,
      'before', jsonb_build_object(
        'labor_fee_dong', v_old.labor_fee_dong,
        'stone_weight_chi', v_old.stone_weight_chi,
        'stone_quantity', v_old.stone_quantity,
        'stone_unit_price_dong', v_old.stone_unit_price_dong,
        'stone_price_dong', v_old.stone_price_dong
      ),
      'after', jsonb_build_object(
        'labor_fee_dong', p_labor_fee_dong,
        'stone_weight_chi', p_stone_weight_chi,
        'stone_quantity', p_stone_quantity,
        'stone_unit_price_dong', p_stone_unit_price_dong,
        'stone_price_dong', v_amount
      )
    )
  );

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

revoke all on function public.pos_set_sku_sale_components_v2(uuid, bigint, numeric, integer, bigint) from public, anon;
grant execute on function public.pos_set_sku_sale_components_v2(uuid, bigint, numeric, integer, bigint) to authenticated, service_role;

-- ROLLBACK (chỉ chạy bằng migration mới, không sửa tay trên production):
--   1. Khôi phục 5 function từ tlkv_backup_20261110._routines__bc (cột definition), chạy lại nguyên văn.
--   2. drop function public.pos_set_buy_stone(uuid, jsonb, text);
--      drop function public.pos_set_sku_sale_components_v2(uuid, bigint, numeric, integer, bigint);
--   3. Drop 3 constraint *_stone_qty_chk (pos_buy_items, pos_skus, pos_sale_items) trong cùng migration rollback:
--      function cũ sửa stone_price_dong mà không biết stone_quantity, nên SKU đã có stone_quantity > 0 sẽ vi phạm check.
--   4. Cột mới có default 0 và không function cũ nào đọc → để nguyên là an toàn, không drop cột
--      (giữ số lượng / đơn giá đá đã nhập để đối soát).
