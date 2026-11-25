-- P9.4: GOLD without price_row may use manual_sell_dong as gold_unit (ex-labor).
-- SILVER all-in unchanged. Linked GOLD (price_row_id set) unchanged.

do $bak$
begin
  create table if not exists tlkv_backup_20261110._routines_p94_gold_manual_sell (
    captured_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    definition text not null
  );
  insert into tlkv_backup_20261110._routines_p94_gold_manual_sell (schema_name, proname, definition)
  select n.nspname, p.proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('public', 'pos_set_sku_manual_sell'),
    ('pos_private', 'compute_gold_unit')
  );
end;
$bak$;

comment on column public.pos_skus.manual_sell_dong is
  'P9: SILVER = all-in unit price/piece. P9.4: GOLD without price_row = suggested sell base (ex-labor); display/sale add labor_fee_dong.';

create or replace function public.pos_set_sku_manual_sell(
  p_sku_id uuid,
  p_receive_metal_kind text,
  p_manual_sell_dong bigint default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kind text := upper(nullif(trim(coalesce(p_receive_metal_kind, '')), ''));
begin
  if p_sku_id is null then
    raise exception 'Thiếu sku_id' using errcode = 'P0001';
  end if;

  if v_kind is null or v_kind not in ('GOLD', 'SILVER') then
    raise exception 'receive_metal_kind phải là GOLD hoặc SILVER' using errcode = '22023';
  end if;

  if v_kind = 'SILVER' then
    if p_manual_sell_dong is null or p_manual_sell_dong <= 0 then
      raise exception 'Giá bán bạc thủ công phải là số nguyên VND > 0' using errcode = '22023';
    end if;
    update public.pos_skus
    set
      receive_metal_kind = 'SILVER',
      manual_sell_dong = p_manual_sell_dong
    where id = p_sku_id;
  else
    -- GOLD: persist suggested base only when > 0 (no-link receive). Else clear manual.
    update public.pos_skus
    set
      receive_metal_kind = 'GOLD',
      manual_sell_dong = case
        when p_manual_sell_dong is not null and p_manual_sell_dong > 0 then p_manual_sell_dong
        else null
      end
    where id = p_sku_id;
  end if;

  if not found then
    raise exception 'Không tìm thấy SKU' using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function public.pos_set_sku_manual_sell(uuid, text, bigint) from public, anon;
grant execute on function public.pos_set_sku_manual_sell(uuid, text, bigint)
  to authenticated, service_role;

create or replace function pos_private.compute_gold_unit(p_sku public.pos_skus)
returns table(gold_unit_dong bigint, gold_sell_dong bigint, price_row_id text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_sell numeric;
  v_row text;
  v_class text;
  v_board numeric := coalesce(nullif(p_sku.board_unit_chi, 0), 1);
  v_mode text := upper(coalesce(nullif(trim(p_sku.sell_pricing_mode), ''), 'LINK'));
  v_hl numeric := p_sku.sell_pricing_hl;
  v_mult numeric := p_sku.sell_pricing_multiplier;
  v_labor bigint := coalesce(p_sku.labor_fee_dong, 0);
  v_per_chi numeric;
  v_unit_no_stone bigint;
begin
  if upper(trim(coalesce(p_sku.receive_metal_kind, ''))) = 'SILVER' then
    if p_sku.manual_sell_dong is null or p_sku.manual_sell_dong <= 0 then
      raise exception 'SKU bạc % chưa có giá bán thủ công hợp lệ', p_sku.sku
        using errcode = 'P0001';
    end if;
    gold_unit_dong := p_sku.manual_sell_dong;
    gold_sell_dong := 0;
    price_row_id := coalesce(p_sku.price_row_id, '');
    return next;
    return;
  end if;

  -- P9.4: unlinked GOLD with manual suggested base (ex-labor).
  if not coalesce(p_sku.is_market_gold, false)
     and p_sku.price_row_id is null
     and p_sku.manual_sell_dong is not null
     and p_sku.manual_sell_dong > 0 then
    gold_unit_dong := p_sku.manual_sell_dong;
    gold_sell_dong := 0;
    price_row_id := '';
    return next;
    return;
  end if;

  if coalesce(p_sku.is_market_gold, false) then
    v_class := pos_private.market_gold_class(p_sku.id);
    select r.price_row_id, r.sell into v_row, v_sell from pos_private.market_gold_price_row(v_class) r;
    if v_row is null or v_sell is null or v_sell <= 0 then
      raise exception 'Nhóm vàng thị trường % chưa có giá bán trên bảng giá. Cập nhật giá bán trước khi bán.',
        case v_class when '9999' then '999.9' when '999' then '99.9' when '9' then '9 (vàng tây)' when 'SILVER' then 'Bạc' else v_class end
        using errcode = 'P0001';
    end if;
  else
    if p_sku.price_row_id is null then
      raise exception 'SKU % chưa gắn bảng giá và chưa có giá bán gợi ý thủ công', p_sku.sku
        using errcode = 'P0001';
    end if;
    v_row := p_sku.price_row_id;
    select r.sell into v_sell from public.gold_price_rows r where r.id = p_sku.price_row_id;
    if v_sell is null then
      raise exception 'Không tìm thấy dòng giá cho SKU %', p_sku.sku using errcode = 'P0001';
    end if;
    if v_sell <= 0 then
      raise exception 'Giá bán trên bảng giá không hợp lệ cho SKU %', p_sku.sku using errcode = 'P0001';
    end if;
  end if;

  gold_sell_dong := round(v_sell)::bigint;
  price_row_id := v_row;
  v_per_chi := v_sell / v_board;

  if v_mode = 'HESO'
     and not coalesce(p_sku.is_market_gold, false)
     and v_hl is not null and v_hl > 0 and v_hl <= 1
     and v_mult is not null and v_mult > 0 then
    v_unit_no_stone := round((v_per_chi * p_sku.weight_chi * v_hl + v_labor) * v_mult)::bigint;
    gold_unit_dong := v_unit_no_stone - v_labor;
  else
    gold_unit_dong := (round(v_sell * p_sku.weight_chi / v_board))::bigint;
  end if;

  return next;
end;
$function$;
