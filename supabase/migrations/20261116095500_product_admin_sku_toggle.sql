create or replace function public.pos_set_product_admin_sku_active(
  p_sku_id uuid,
  p_is_active boolean,
  p_reason text default null,
  p_write_audit boolean default false
)
returns public.pos_skus
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku public.pos_skus;
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.email(), ''));
begin
  if not public.tlkv_is_admin() then
    raise exception 'Không đủ quyền thực hiện.' using errcode = '42501';
  end if;

  select *
  into v_sku
  from public.pos_skus
  where id = p_sku_id;

  if not found then
    raise exception 'Không tìm thấy mã hàng.' using errcode = 'P0002';
  end if;

  if coalesce(v_sku.is_market_gold, false) then
    raise exception 'Mã vàng thị trường không quản lý ở màn Sản phẩm.' using errcode = '22023';
  end if;

  update public.pos_skus
  set is_active = coalesce(p_is_active, false)
  where id = p_sku_id
  returning * into v_sku;

  if coalesce(p_write_audit, false) then
    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      coalesce(nullif(v_actor, ''), 'unknown'),
      'SKU_STATUS_UPDATE',
      'pos_skus',
      v_sku.id::text,
      nullif(trim(coalesce(p_reason, '')), ''),
      jsonb_build_object(
        'sku', v_sku.sku,
        'name', v_sku.name,
        'is_active', v_sku.is_active,
        'catalog_product_id', v_sku.catalog_product_id
      )
    );
  end if;

  return v_sku;
end;
$$;

revoke all on function public.pos_set_product_admin_sku_active(uuid, boolean, text, boolean)
from public, anon;
grant execute on function public.pos_set_product_admin_sku_active(uuid, boolean, text, boolean)
to authenticated;
grant execute on function public.pos_set_product_admin_sku_active(uuid, boolean, text, boolean)
to service_role;
