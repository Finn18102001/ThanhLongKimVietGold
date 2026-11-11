-- Phase 1 · Section 4 — nguồn "Hàm lượng" cho file xuất (docs/pos-big-update/P1-04-EXPORT-PURITY.md).
-- Additive only: 2 helper nội bộ + 1 RPC đọc. Giá trị giữ nguyên như đã ghi (không chuẩn hóa).

create or replace function pos_private.price_row_purity(p_price_row_id text)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select nullif(trim(g.purity), '')
  from public.gold_price_rows g
  where g.id = nullif(trim(coalesce(p_price_row_id, '')), '');
$function$;

-- Hàm lượng hiện tại của 1 mã hàng: tuổi vàng SP → (vàng thị trường) tuổi vàng dòng mua → dòng giá đang gắn.
create or replace function pos_private.sku_purity(p_sku_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select rtrim(rtrim(to_char(p.gold_age, 'FM9990.000'), '0'), '.')
      from public.pos_skus s
      join public.products p on p.id = s.catalog_product_id
      where s.id = p_sku_id and p.gold_age is not null
    ),
    (
      select nullif(trim(bi.gold_age), '')
      from public.pos_buy_items bi
      join public.pos_skus s on s.id = bi.sku_id and s.is_market_gold
      where bi.sku_id = p_sku_id and nullif(trim(bi.gold_age), '') is not null
      limit 1
    ),
    (
      select pos_private.price_row_purity(s.price_row_id)
      from public.pos_skus s
      where s.id = p_sku_id
    )
  );
$function$;

revoke all on function pos_private.price_row_purity(text) from public, anon, authenticated;
revoke all on function pos_private.sku_purity(uuid) from public, anon, authenticated;

-- {"<sku_id>": "<hàm lượng>"} cho các màn đọc trực tiếp bảng (tồn kho, kiểm kê, quản lý vàng).
create or replace function public.pos_list_sku_purity(p_sku_ids uuid[])
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
      select jsonb_object_agg(x.id::text, pos_private.sku_purity(x.id))
      from (select distinct unnest(coalesce(p_sku_ids, '{}'::uuid[])) as id) x
      where pos_private.sku_purity(x.id) is not null
    ),
    '{}'::jsonb
  );
end;
$function$;

revoke all on function public.pos_list_sku_purity(uuid[]) from public, anon;
grant execute on function public.pos_list_sku_purity(uuid[]) to authenticated;
grant execute on function public.pos_list_sku_purity(uuid[]) to service_role;
