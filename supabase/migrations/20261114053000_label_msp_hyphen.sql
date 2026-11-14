-- P6: MSP mới = PREFIX-###### (dấu gạch). Không rewrite MSP cũ đã mint.
-- Backup + md5 guard theo POS hard-test / SYSTEM rules.

create table if not exists tlkv_backup_20261110._routines__p6 (
  schema_name text,
  proname text,
  args text,
  definition text,
  saved_at timestamptz default now()
);

insert into tlkv_backup_20261110._routines__p6 (schema_name, proname, args, definition, saved_at)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid), now()
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('pos_mint_label_piece', 'pos_set_label_piece_type_code');

do $$
declare
  v_mint text;
  v_set text;
begin
  select md5(p.prosrc) into v_mint
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'pos_mint_label_piece'
    and pg_get_function_identity_arguments(p.oid) = 'p_sku_id uuid, p_type_code text';
  if v_mint is distinct from 'b25a648d28b109f2d8b4c109f9a21a3d' then
    raise exception 'pos_mint_label_piece md5 mismatch: % (expected b25a648d28b109f2d8b4c109f9a21a3d)', v_mint;
  end if;

  select md5(p.prosrc) into v_set
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'pos_set_label_piece_type_code'
    and pg_get_function_identity_arguments(p.oid) = 'p_piece_id uuid, p_type_code text';
  if v_set is distinct from 'a9e46dc0ab64a8b2c0ef5bd312806d2f' then
    raise exception 'pos_set_label_piece_type_code md5 mismatch: % (expected a9e46dc0ab64a8b2c0ef5bd312806d2f)', v_set;
  end if;
end $$;

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
  v_type := regexp_replace(v_type, '-+$', '');
  if v_type ~ '\s' then
    raise exception 'Ma loai san pham khong duoc chua khoang trang' using errcode = '22023';
  end if;
  if v_type ~ '-' then
    raise exception 'Ma loai san pham khong duoc chua dau gach (he thong tu chen PREFIX-######)' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Ma loai san pham toi da 24 ky tu' using errcode = '22023';
  end if;

  v_n := nextval('public.pos_label_msp_seq');
  v_serial := lpad(v_n::text, 6, '0');
  if v_type = '' then
    v_msp := v_serial;
  else
    v_msp := v_type || '-' || v_serial;
  end if;
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

create or replace function public.pos_set_label_piece_type_code(
  p_piece_id uuid,
  p_type_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_piece public.pos_label_pieces%rowtype;
  v_type text;
  v_msp text;
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;

  select * into v_piece
  from public.pos_label_pieces
  where id = p_piece_id
  for update;

  if not found then
    raise exception 'Không tìm thấy MSP' using errcode = 'P0002';
  end if;

  v_type := upper(trim(coalesce(p_type_code, '')));
  v_type := regexp_replace(v_type, '-+$', '');
  if v_type ~ '\s' then
    raise exception 'Mã loại sản phẩm không được chứa khoảng trắng' using errcode = '22023';
  end if;
  if v_type ~ '-' then
    raise exception 'Mã loại sản phẩm không được chứa dấu gạch (hệ thống tự chèn PREFIX-######)' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Mã loại sản phẩm tối đa 24 ký tự' using errcode = '22023';
  end if;

  if v_type = '' then
    v_msp := v_piece.serial_no;
  else
    v_msp := v_type || '-' || v_piece.serial_no;
  end if;

  if exists (
    select 1
    from public.pos_label_pieces p
    where p.msp = v_msp
      and p.id is distinct from v_piece.id
  ) then
    raise exception 'MSP % đã tồn tại. Đổi mã loại khác.', v_msp using errcode = 'P0001';
  end if;

  update public.pos_label_pieces
  set
    type_code = v_type,
    msp = v_msp
  where id = v_piece.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_piece.id,
    'msp', v_msp,
    'barcode', v_piece.barcode,
    'type_code', v_type,
    'serial_no', v_piece.serial_no
  );
exception
  when unique_violation then
    raise exception 'MSP bị trùng. Đổi mã loại sản phẩm.' using errcode = 'P0001';
end;
$$;

revoke all on function public.pos_mint_label_piece(uuid, text) from public, anon;
grant execute on function public.pos_mint_label_piece(uuid, text) to authenticated;
revoke all on function public.pos_set_label_piece_type_code(uuid, text) from public, anon;
grant execute on function public.pos_set_label_piece_type_code(uuid, text) to authenticated;
