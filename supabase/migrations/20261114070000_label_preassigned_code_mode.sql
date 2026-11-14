-- Label print: mode "mã sản phẩm có sẵn" — user nhập type + số SP (được có chữ).
-- Không mint pos_label_msp_seq. Không đụng RPC mint / set type của mode MSP tự động.
-- Backup theo docs/pos-big-update/00-BACKUP-ROLLBACK.md §3.

create table if not exists tlkv_backup_20261110._routines__label_preassigned (
  schema_name text,
  proname text,
  args text,
  definition text,
  saved_at timestamptz default now()
);

-- Không thay hàm cũ; chỉ thêm RPC mới. Snapshot trống vẫn ghi dấu migration.

create or replace function public.pos_ensure_preassigned_label_piece(
  p_sku_id uuid,
  p_type_code text,
  p_product_number text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_type text;
  v_product text;
  v_msp text;
  v_barcode text;
  v_id uuid;
  v_sku uuid;
  v_existing public.pos_label_pieces%rowtype;
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
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
    raise exception 'SKU không tồn tại hoặc đã tắt' using errcode = 'P0001';
  end if;

  v_type := upper(trim(coalesce(p_type_code, '')));
  v_type := regexp_replace(v_type, '\s+', '', 'g');
  v_product := upper(trim(coalesce(p_product_number, '')));
  v_product := regexp_replace(v_product, '\s+', '', 'g');

  if v_type = '' then
    raise exception 'Mã loại sản phẩm không được trống' using errcode = '22023';
  end if;
  if v_product = '' then
    raise exception 'Số sản phẩm không được trống' using errcode = '22023';
  end if;
  if v_type !~ '^[A-Z0-9]+$' then
    raise exception 'Mã loại chỉ gồm chữ và số' using errcode = '22023';
  end if;
  if v_product !~ '^[A-Z0-9]+$' then
    raise exception 'Số sản phẩm chỉ gồm chữ và số (được có chữ)' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Mã loại sản phẩm tối đa 24 ký tự' using errcode = '22023';
  end if;
  if length(v_product) > 32 then
    raise exception 'Số sản phẩm tối đa 32 ký tự' using errcode = '22023';
  end if;

  -- Ghép mã dùng chung (vd CHARM + 766HHH → CHARM766HHH). Không hyphen, không sequence.
  v_msp := v_type || v_product;
  if length(v_msp) > 48 then
    raise exception 'Mã hoàn chỉnh tối đa 48 ký tự' using errcode = '22023';
  end if;
  v_barcode := v_msp;

  select * into v_existing
  from public.pos_label_pieces
  where msp = v_msp
  limit 1;

  if found then
    if v_existing.sku_id is distinct from p_sku_id then
      raise exception 'Mã % đã gắn SKU khác. Chọn đúng SKU hoặc dùng mã khác.', v_msp
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'ok', true,
      'id', v_existing.id,
      'msp', v_existing.msp,
      'barcode', v_existing.barcode,
      'sku_id', v_existing.sku_id,
      'type_code', v_existing.type_code,
      'serial_no', v_product,
      'created', false
    );
  end if;

  -- serial_no = full composed code (unique toàn cục; tránh đụng số SP trùng giữa 2 mã loại).
  insert into public.pos_label_pieces (msp, barcode, sku_id, created_by, type_code, serial_no)
  values (v_msp, v_barcode, p_sku_id, v_actor, v_type, v_msp)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'msp', v_msp,
    'barcode', v_barcode,
    'sku_id', p_sku_id,
    'type_code', v_type,
    'serial_no', v_product,
    'created', true
  );
exception
  when unique_violation then
    raise exception 'Mã hoặc số sản phẩm bị trùng. Đổi số sản phẩm hoặc dùng In lại từ lịch sử.'
      using errcode = 'P0001';
end;
$function$;

revoke all on function public.pos_ensure_preassigned_label_piece(uuid, text, text) from public, anon;
grant execute on function public.pos_ensure_preassigned_label_piece(uuid, text, text) to authenticated;
grant execute on function public.pos_ensure_preassigned_label_piece(uuid, text, text) to service_role;

comment on function public.pos_ensure_preassigned_label_piece(uuid, text, text) is
  'Label mode mã có sẵn: tạo/tái dùng piece theo type+product_number (chữ+số), không mint sequence.';
