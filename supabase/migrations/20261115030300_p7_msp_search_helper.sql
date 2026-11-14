-- P7: resolve SKU ids from MSP / shared product code for search filters.
-- Does NOT invent MSP links for historical rows without piece/unit relation.

create or replace function public.pos_find_sku_ids_by_msp(
  p_query text,
  p_limit integer default 100
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_q text := upper(trim(coalesce(p_query, '')));
  v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_ids uuid[];
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;
  if v_q = '' or length(v_q) < 2 then
    return array[]::uuid[];
  end if;

  select coalesce(array_agg(distinct z.sku_id), array[]::uuid[])
  into v_ids
  from (
    select p.sku_id
    from public.pos_label_pieces p
    where upper(p.msp) like '%' || v_q || '%'
       or upper(coalesce(p.barcode, '')) like '%' || v_q || '%'
    union
    select un.sku_id
    from public.pos_inventory_units un
    where un.shared_product_code is not null
      and upper(un.shared_product_code) like '%' || v_q || '%'
    limit v_lim
  ) z;

  return v_ids;
end;
$function$;

revoke all on function public.pos_find_sku_ids_by_msp(text, integer) from public, anon;
grant execute on function public.pos_find_sku_ids_by_msp(text, integer) to authenticated;
grant execute on function public.pos_find_sku_ids_by_msp(text, integer) to service_role;

comment on function public.pos_find_sku_ids_by_msp(text, integer) is
  'P7 search: SKU ids linked to MSP piece or unit shared_product_code. No invented history links.';
