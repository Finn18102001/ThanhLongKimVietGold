-- Phase 4.3 — In tem từ hóa đơn mua vàng thị trường: cho tạo MSP với SKU MG còn tồn
-- (SKU MG inactive theo thiết kế). Không đổi tồn kho. P4-00 §5 / C11.

insert into tlkv_backup_20261110._routines__p4 (schema_name, proname, args, definition, saved_at)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid), now()
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'pos_mint_label_piece';

create or replace function public.pos_mint_label_piece(p_sku_id uuid, p_type_code text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_n bigint;
  v_serial text;
  v_type text;
  v_msp text;
  v_barcode text;
  v_id uuid;
  v_sku uuid;
begin
  if v_actor = '' then
    raise exception 'Chua dang nhap' using errcode = '42501';
  end if;

  select s.id into v_sku
  from public.pos_skus s
  where s.id = p_sku_id
    and (
      s.is_active = true
      or (
        coalesce(s.is_market_gold, false)
        and exists (select 1 from public.pos_inventory_stock st where st.sku_id = s.id and st.quantity > 0)
      )
    );
  if v_sku is null then
    raise exception 'SKU khong ton tai hoac da tat' using errcode = 'P0001';
  end if;

  v_type := upper(trim(coalesce(p_type_code, '')));
  if v_type ~ '\s' then
    raise exception 'Ma loai san pham khong duoc chua khoang trang' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Ma loai san pham toi da 24 ky tu' using errcode = '22023';
  end if;

  v_n := nextval('public.pos_label_msp_seq');
  v_serial := lpad(v_n::text, 6, '0');
  v_msp := v_type || v_serial;
  v_barcode := 'BC' || v_serial;

  insert into public.pos_label_pieces (msp, barcode, sku_id, created_by, type_code, serial_no)
  values (v_msp, v_barcode, p_sku_id, v_actor, v_type, v_serial)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'msp', v_msp,
    'barcode', v_barcode,
    'sku_id', p_sku_id,
    'type_code', v_type,
    'serial_no', v_serial
  );
exception
  when unique_violation then
    raise exception 'MSP hoac ma vach bi trung. Thu lai hoac doi ma loai.' using errcode = 'P0001';
end;
$function$;
