-- Allow SRS stock size 90×14 mm for label print history / RPC.

alter table public.pos_label_print_log
  drop constraint if exists pos_label_print_stock_chk;

alter table public.pos_label_print_log
  add constraint pos_label_print_stock_chk
  check (stock_size in ('90x14', '21x10', '21x12'));

create or replace function public.pos_record_label_print(
  p_piece_id uuid,
  p_print_qty integer,
  p_stock_size text,
  p_action_type text,
  p_company_name text,
  p_address_line text,
  p_klt_chi numeric,
  p_klv_chi numeric,
  p_labor_fee_dong bigint,
  p_price_dong bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_piece public.pos_label_pieces%rowtype;
  v_sku public.pos_skus%rowtype;
  v_brand text := '';
  v_category text := '';
  v_log_id uuid;
  v_action text := upper(trim(coalesce(p_action_type, '')));
  v_stock text := lower(trim(coalesce(p_stock_size, '')));
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;
  if p_print_qty is null or p_print_qty <= 0 or p_print_qty > 500 then
    raise exception 'Số lượng tem không hợp lệ' using errcode = 'P0001';
  end if;
  if v_action not in ('FIRST_PRINT', 'REPRINT') then
    raise exception 'Loại thao tác in không hợp lệ' using errcode = 'P0001';
  end if;
  if v_stock not in ('90x14', '21x10', '21x12') then
    raise exception 'Khổ tem không hỗ trợ' using errcode = 'P0001';
  end if;
  if p_klt_chi is null or p_klv_chi is null or p_klt_chi < 0 or p_klv_chi < 0 then
    raise exception 'KLT/KLV không hợp lệ' using errcode = 'P0001';
  end if;
  if p_labor_fee_dong is null or p_labor_fee_dong < 0 or p_price_dong is null or p_price_dong < 0 then
    raise exception 'Công/Giá không hợp lệ' using errcode = 'P0001';
  end if;

  select * into v_piece from public.pos_label_pieces where id = p_piece_id;
  if not found then
    raise exception 'Không tìm thấy MSP/Barcode' using errcode = 'P0001';
  end if;

  select * into v_sku from public.pos_skus where id = v_piece.sku_id;
  if not found then
    raise exception 'SKU nguồn không tồn tại' using errcode = 'P0001';
  end if;

  select coalesce(b.name, '') into v_brand
  from public.brands b
  where b.id = v_sku.brand_id;

  select coalesce(p.category, '') into v_category
  from public.products p
  where p.id = v_sku.catalog_product_id;

  insert into public.pos_label_print_log (
    piece_id, sku_id, actor_email, action_type, print_qty, stock_size,
    msp, barcode, product_name, product_type, brand_name,
    company_name, address_line, klt_chi, klv_chi, labor_fee_dong, price_dong
  ) values (
    v_piece.id, v_piece.sku_id, v_actor, v_action, p_print_qty, v_stock,
    v_piece.msp, v_piece.barcode, v_sku.name, coalesce(v_category, ''), coalesce(v_brand, ''),
    coalesce(nullif(trim(p_company_name), ''), 'Vàng Thăng Long Kim Việt'),
    coalesce(nullif(trim(p_address_line), ''), ''),
    p_klt_chi, p_klv_chi, p_labor_fee_dong, p_price_dong
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'ok', true,
    'log_id', v_log_id,
    'msp', v_piece.msp,
    'barcode', v_piece.barcode,
    'action_type', v_action,
    'print_qty', p_print_qty,
    'actor_email', v_actor
  );
end;
$$;
