-- P9/SRS: remember LINK|HESO sell pricing on SKU for POS (live board × mode).
-- Backup snapshot: tlkv_backup_20261110.pos_skus_before_sell_pricing_20261124
-- Does NOT write list_price / sell_price onto SKU. Null mode = LINK (legacy).

-- 1) SKU metadata
alter table public.pos_skus
  add column if not exists sell_pricing_mode text,
  add column if not exists sell_pricing_hl numeric(12, 6),
  add column if not exists sell_pricing_multiplier numeric(12, 6);

alter table public.pos_skus
  drop constraint if exists pos_skus_sell_pricing_mode_check;

alter table public.pos_skus
  add constraint pos_skus_sell_pricing_mode_check
  check (
    sell_pricing_mode is null
    or sell_pricing_mode in ('LINK', 'HESO')
  );

comment on column public.pos_skus.sell_pricing_mode is
  'Sell formula: LINK (default/null) or HESO. Not a fixed sell price.';
comment on column public.pos_skus.sell_pricing_hl is
  'Purity decimal used when sell_pricing_mode=HESO (e.g. 0.63).';
comment on column public.pos_skus.sell_pricing_multiplier is
  'Final multiplier when sell_pricing_mode=HESO (e.g. 1.5).';

-- Existing table: keep current Data API grants (ALTER columns does not strip GRANT).
-- Explicit re-assert for checklist §32.1 / reset safety (no anon on POS table).
grant select, insert, update, delete on public.pos_skus to authenticated;
grant select, insert, update, delete on public.pos_skus to service_role;

-- 2) Draft optional columns (FR-04) — nullable; legacy drafts stay LINK on receive form default
alter table public.pos_label_drafts
  add column if not exists sell_pricing_mode text,
  add column if not exists sell_pricing_hl numeric(12, 6),
  add column if not exists sell_pricing_multiplier numeric(12, 6);

alter table public.pos_label_drafts
  drop constraint if exists pos_label_drafts_sell_pricing_mode_check;

alter table public.pos_label_drafts
  add constraint pos_label_drafts_sell_pricing_mode_check
  check (
    sell_pricing_mode is null
    or sell_pricing_mode in ('LINK', 'HESO')
  );

grant select, insert, update, delete on public.pos_label_drafts to authenticated;
grant select, insert, update, delete on public.pos_label_drafts to service_role;

-- 3) Writer RPC — authenticated staff; no fixed sell price
create or replace function public.pos_set_sku_sell_pricing(
  p_sku_id uuid,
  p_mode text,
  p_hl numeric default null,
  p_multiplier numeric default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_mode text := upper(nullif(trim(coalesce(p_mode, '')), ''));
begin
  if p_sku_id is null then
    raise exception 'Thiếu sku_id' using errcode = 'P0001';
  end if;

  if v_mode is null or v_mode = 'LINK' then
    update public.pos_skus
    set
      sell_pricing_mode = 'LINK',
      sell_pricing_hl = null,
      sell_pricing_multiplier = null
    where id = p_sku_id;
    if not found then
      raise exception 'Không tìm thấy SKU' using errcode = 'P0001';
    end if;
    return;
  end if;

  if v_mode <> 'HESO' then
    raise exception 'sell_pricing_mode phải là LINK hoặc HESO' using errcode = 'P0001';
  end if;

  if p_hl is null or p_hl <= 0 or p_hl > 1 then
    raise exception 'HESO cần HL thập phân trong (0, 1]' using errcode = 'P0001';
  end if;
  if p_multiplier is null or p_multiplier <= 0 then
    raise exception 'HESO cần hệ số > 0' using errcode = 'P0001';
  end if;

  update public.pos_skus
  set
    sell_pricing_mode = 'HESO',
    sell_pricing_hl = p_hl,
    sell_pricing_multiplier = p_multiplier
  where id = p_sku_id;

  if not found then
    raise exception 'Không tìm thấy SKU' using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function public.pos_set_sku_sell_pricing(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.pos_set_sku_sell_pricing(uuid, text, numeric, numeric)
  to authenticated, service_role;

-- 4) POS server price: HESO uses (TL×HL×board_per_chi + labor)×heso ; gold_unit = that − labor
--    so existing unit = gold + labor + stone stays valid. Null/LINK = AS-IS.
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
      raise exception 'SKU % chưa gắn bảng giá', p_sku.sku using errcode = 'P0001';
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
