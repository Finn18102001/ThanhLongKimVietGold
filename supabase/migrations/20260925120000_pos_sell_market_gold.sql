-- POS: allow selling market gold/silver (soft-inactive SKUs).
-- 1) Price market SKUs from last_cost when no board price row.
-- 2) complete_sale accepts is_market_gold even when is_active = false.
-- 3) Skip ±300k board assert for market (negotiated vs cost).

create or replace function pos_private.compute_unit_price(p_sku public.pos_skus)
returns table (unit_price_dong bigint, gold_sell_dong bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sell numeric;
  v_last_cost numeric;
  v_board numeric;
  v_weight numeric;
begin
  -- Market gold/silver: usually no gold_price_rows — use last inbound unit cost.
  if coalesce(p_sku.is_market_gold, false) then
    select s.last_cost_dong::numeric
    into v_last_cost
    from public.pos_inventory_stock s
    where s.sku_id = p_sku.id;

    if v_last_cost is not null and v_last_cost > 0 then
      v_board := nullif(p_sku.board_unit_chi, 0);
      v_weight := nullif(p_sku.weight_chi, 0);
      unit_price_dong := round(v_last_cost)::bigint;
      if v_board is not null and v_weight is not null and v_weight > 0 then
        gold_sell_dong := round(v_last_cost * v_board / v_weight)::bigint;
      else
        gold_sell_dong := round(v_last_cost)::bigint;
      end if;
      return next;
      return;
    end if;
    -- Fall through to board price if market SKU somehow has a price_row.
  end if;

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

-- Saleable = active catalog OR market gold/silver (may be soft-inactive).
create or replace function pos_private.require_saleable_sku(p_sku_id uuid)
returns public.pos_skus
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sku public.pos_skus%rowtype;
begin
  select * into v_sku
  from public.pos_skus s
  where s.id = p_sku_id
    and (s.is_active or coalesce(s.is_market_gold, false));
  if not found then
    raise exception 'SKU không hoạt động' using errcode = 'P0001';
  end if;
  return v_sku;
end;
$$;


DO $patch$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'pos_private'
    AND p.proname = 'complete_sale'
    AND pg_get_function_identity_arguments(p.oid) LIKE '%p_payment_splits%';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'complete_sale not found';
  END IF;

  v_def := replace(
    v_def,
    $old$select * into v_sku from public.pos_skus where id = v_item.sku_id and is_active;
      if v_sku.id is null then
        raise exception 'SKU không hoạt động' using errcode = 'P0001';
      end if;$old$,
    $new$v_sku := pos_private.require_saleable_sku(v_item.sku_id);$new$
  );

  IF position('require_saleable_sku' in v_def) = 0 THEN
    RAISE EXCEPTION 'Failed to patch SKU lookup in complete_sale';
  END IF;

  v_def := replace(
    v_def,
    $old$perform pos_private.assert_price_within_or_exception(
        round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
        round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
        false, false, null
      );$old$,
    $new$if not coalesce(v_sku.is_market_gold, false) then
        perform pos_private.assert_price_within_or_exception(
          round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          false, false, null
        );
      end if;$new$
  );

  -- pg_get_functiondef returns $function$ ... $function$; keep as-is for EXECUTE
  EXECUTE v_def;
END;
$patch$;

