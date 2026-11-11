-- Phase 4.3 — Tiền công / TL đá / giá đá mặc định trên SKU, nhập từ tab In tem (P4-00 C6).
-- Không đổi tồn kho. Chỉ cập nhật cột trên pos_skus + audit before/after.

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

  update public.pos_skus
  set labor_fee_dong = p_labor_fee_dong,
      stone_weight_chi = p_stone_weight_chi,
      stone_price_dong = p_stone_price_dong
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
        'stone_price_dong', v_old.stone_price_dong
      ),
      'after', jsonb_build_object(
        'labor_fee_dong', p_labor_fee_dong,
        'stone_weight_chi', p_stone_weight_chi,
        'stone_price_dong', p_stone_price_dong
      )
    )
  );

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

revoke all on function public.pos_set_sku_sale_components(uuid, bigint, numeric, bigint) from public, anon;
grant execute on function public.pos_set_sku_sale_components(uuid, bigint, numeric, bigint) to authenticated, service_role;
