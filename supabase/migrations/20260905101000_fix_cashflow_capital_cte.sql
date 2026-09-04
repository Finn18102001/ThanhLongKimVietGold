-- Fix pos_cashflow_capital_by_group: CTE `grouped` was referenced after WITH scope ended.
create or replace function public.pos_cashflow_capital_by_group()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform pos_private.require_admin();

  with stock as (
    select
      s.quantity,
      coalesce(s.last_cost_dong, 0) as cost,
      sk.name,
      sk.is_market_gold,
      b.slug as brand_slug,
      b.name as brand_name
    from public.pos_inventory_stock s
    join public.pos_skus sk on sk.id = s.sku_id
    left join public.brands b on b.id = sk.brand_id
    where s.quantity > 0
  ),
  grouped as (
    select
      case
        when coalesce(is_market_gold, false) or brand_slug = 'vang-thi-truong'
          then 'Vàng thị trường'
        when brand_slug = 'bao-tin-minh-chau' or brand_name ilike '%minh châu%'
          then 'BTMC'
        when lower(name) ~ '(bông lúa|hạt gạo|nhẫn tròn)'
          then 'Bông lúa / Hạt gạo / Nhẫn tròn'
        when lower(name) ~ '(nhẫn|dây|lắc|bông tai|trang sức)'
          then 'Trang sức'
        else 'Khác'
      end as group_name,
      sum(quantity::bigint * cost) as capital_dong
    from stock
    group by 1
  ),
  totals as (
    select coalesce(sum(capital_dong), 0) as total_dong from grouped
  )
  select
    t.total_dong,
    coalesce(jsonb_agg(jsonb_build_object(
      'groupName', g.group_name,
      'capitalDong', g.capital_dong,
      'sharePercent', case when t.total_dong > 0
        then round((g.capital_dong::numeric * 100) / t.total_dong, 1)
        else 0 end
    ) order by g.capital_dong desc) filter (where g.group_name is not null), '[]'::jsonb)
  into v_total, v_rows
  from totals t
  left join grouped g on true
  group by t.total_dong;

  return jsonb_build_object(
    'totalDong', coalesce(v_total, 0),
    'groups', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;
