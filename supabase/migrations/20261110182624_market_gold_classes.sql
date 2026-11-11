-- Phase 1 · Section 6 — Vàng thị trường: 3 card 999.9 / 99.9 / 9 + Bạc ở tab Mua / Bán
-- (docs/pos-big-update/P1-06-MARKET-GOLD.md). Additive: 1 cột, helper, 3 RPC, ẩn 7 SKU cũ (tồn 0) có audit.
-- Không đổi giá / kho / hóa đơn: bán vẫn theo sku_id MG thật + last_cost_dong như cũ.

alter table public.pos_skus
  add column if not exists market_purity_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pos_skus'::regclass and conname = 'pos_skus_market_purity_class_chk'
  ) then
    alter table public.pos_skus
      add constraint pos_skus_market_purity_class_chk
      check (market_purity_class is null or market_purity_class in ('9999', '999', '9', 'SILVER'));
  end if;
end $$;

comment on column public.pos_skus.market_purity_class is
  'Nhóm vàng thị trường chọn lúc mua: 9999 (999.9) / 999 (99.9) / 9 (vàng tây) / SILVER. Null = suy từ tuổi vàng dòng mua.';

-- D2–D4: Bạc → SILVER; tuổi vàng đổi về % (9999 → 99.99, 999 → 99.9, 980 → 98, 24K → 100);
-- ≥ 99.95 → 9999, ≥ 99.0 → 999, còn lại → 9; trống: loại vàng có "9999" → 9999, còn lại → 999.
create or replace function pos_private.market_gold_class_from(p_gold_type text, p_gold_age text)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_type text := coalesce(p_gold_type, '');
  v_age text := trim(coalesce(p_gold_age, ''));
  v_num text;
  v numeric;
begin
  if lower(v_type) like '%bạc%' or upper(v_type) like '%BẠC%' or lower(v_type) like '%bac%' then
    return 'SILVER';
  end if;

  -- (?:…) because substring(… from pattern) returns the first capture group when one exists.
  v_num := substring(replace(v_age, ',', '.') from '[0-9]+(?:\.[0-9]+)?');
  if v_num is null or v_num = '' then
    return case when v_type like '%9999%' then '9999' else '999' end;
  end if;

  v := v_num::numeric;
  if v_age ~* 'k' then
    v := v * 100 / 24;
  end if;
  while v > 100 loop
    v := v / 10;
  end loop;

  if v >= 99.95 then
    return '9999';
  elsif v >= 99.0 then
    return '999';
  end if;
  return '9';
end;
$function$;

create or replace function pos_private.market_gold_class(p_sku_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    s.market_purity_class,
    (
      select pos_private.market_gold_class_from(bi.gold_type, bi.gold_age)
      from public.pos_buy_items bi
      where bi.sku_id = s.id
      limit 1
    ),
    '999'
  )
  from public.pos_skus s
  where s.id = p_sku_id and s.is_market_gold;
$function$;

revoke all on function pos_private.market_gold_class_from(text, text) from public, anon, authenticated;
revoke all on function pos_private.market_gold_class(uuid) from public, anon, authenticated;

-- Món vàng/bạc thị trường còn tồn + nhóm, cho danh sách chọn món ở tab Bán.
create or replace function public.pos_list_market_gold_stock()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform pos_private.require_pos_user();
  return coalesce(
    (
      select jsonb_agg(row_data order by bought_at nulls last, sku)
      from (
        select
          jsonb_build_object(
            'skuId', s.id,
            'sku', s.sku,
            'name', s.name,
            'goldType', bi.gold_type,
            'goldAge', bi.gold_age,
            'weightChi', s.weight_chi,
            'quantity', st.quantity,
            'lastCostDong', st.last_cost_dong,
            'boughtAt', coalesce(b.completed_at, b.created_at),
            'marketClass', pos_private.market_gold_class(s.id)
          ) as row_data,
          coalesce(b.completed_at, b.created_at) as bought_at,
          s.sku
        from public.pos_skus s
        join public.pos_inventory_stock st on st.sku_id = s.id and st.quantity > 0
        left join lateral (
          select i.gold_type, i.gold_age, i.buy_id
          from public.pos_buy_items i
          where i.sku_id = s.id
          limit 1
        ) bi on true
        left join public.pos_buys b on b.id = bi.buy_id
        where s.is_market_gold
      ) x
    ),
    '[]'::jsonb
  );
end;
$function$;

-- Giá hiển thị theo nhóm từ dòng giá vàng thị trường (pos_list_market_gold_refs). Chỉ để hiển thị.
create or replace function public.pos_market_gold_class_prices()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform pos_private.require_pos_user();
  return coalesce(
    (
      select jsonb_object_agg(cls, jsonb_build_object('priceRowId', id, 'buyDong', buy, 'sellDong', sell))
      from (
        select distinct on (pos_private.market_gold_class_from(null, g.purity))
          pos_private.market_gold_class_from(null, g.purity) as cls,
          g.id,
          round(g.buy)::bigint as buy,
          round(g.sell)::bigint as sell
        from public.gold_price_rows g
        where (
            upper(coalesce(g.brand, '')) like '%THỊ TRƯỜNG%'
            or upper(coalesce(g.brand, '')) like '%THI TRUONG%'
            or upper(coalesce(g.product, '')) like '%THỊ TRƯỜNG%'
          )
          and nullif(trim(coalesce(g.purity, '')), '') is not null
        order by pos_private.market_gold_class_from(null, g.purity), g.sort_order
      ) p
    ),
    '{}'::jsonb
  );
end;
$function$;

-- Ghi nhóm theo card NV đã bấm lúc mua (chỉ điền khi còn trống). Lỗi ở đây không ảnh hưởng phiếu mua.
create or replace function public.pos_set_market_gold_class(p_buy_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_line jsonb;
  v_class text;
  v_sku uuid;
  v_count integer := 0;
begin
  perform pos_private.require_pos_user();
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return 0;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_class := v_line ->> 'market_class';
    if v_class is null or v_class not in ('9999', '999', '9', 'SILVER') then
      continue;
    end if;

    select bi.sku_id into v_sku
    from public.pos_buy_items bi
    join public.pos_skus s on s.id = bi.sku_id
    where bi.buy_id = p_buy_id
      and bi.is_market_gold
      and s.market_purity_class is null
      and trim(bi.product_name_snapshot) = trim(coalesce(v_line ->> 'product_name', ''))
      and abs(bi.weight_chi - coalesce(nullif(v_line ->> 'weight_chi', '')::numeric, -1)) < 0.0001
      and coalesce(trim(bi.gold_age), '') = coalesce(trim(v_line ->> 'gold_age'), '')
    limit 1;

    if v_sku is not null then
      update public.pos_skus set market_purity_class = v_class where id = v_sku;
      v_count := v_count + 1;
    end if;
    v_sku := null;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.pos_list_market_gold_stock() from public, anon;
revoke all on function public.pos_market_gold_class_prices() from public, anon;
revoke all on function public.pos_set_market_gold_class(uuid, jsonb) from public, anon;
grant execute on function public.pos_list_market_gold_stock() to authenticated, service_role;
grant execute on function public.pos_market_gold_class_prices() to authenticated, service_role;
grant execute on function public.pos_set_market_gold_class(uuid, jsonb) to authenticated, service_role;

-- D8: ẩn 7 SKU "Vàng Thị Trường" cũ (tồn 0, không dòng giá) để gộp nhóm. Không xóa, có audit.
with target as (
  select s.id, s.sku
  from public.pos_skus s
  join public.pos_inventory_stock st on st.sku_id = s.id
  where s.sku in ('vtt-vtt9-1-4', 'vtt-vtt9-1', 'vtt-vtt9-1-2', 'tlkv-vtt9-1', 'tlkv-v9-1', 'tlkv-v9-1-2', 'tlkv-v9-1-3')
    and s.is_active
    and not s.is_market_gold
    and st.quantity = 0
), upd as (
  update public.pos_skus s set is_active = false
  from target t
  where s.id = t.id
  returning s.id
)
insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
select
  'tuananh18101@gmail.com',
  'SKU_DEACTIVATE',
  'pos_sku',
  t.id,
  'Gộp nhóm Vàng thị trường thành 3 card 999.9 / 99.9 / 9 (P1-06 D8)',
  jsonb_build_object('sku', t.sku, 'before_is_active', true, 'after_is_active', false, 'stock', 0)
from target t
where t.id in (select id from upd);
