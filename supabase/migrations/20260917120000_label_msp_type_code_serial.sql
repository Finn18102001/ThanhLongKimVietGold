-- Label MSP = type_code || serial_no. Serial from sequence (immutable).
-- Type code editable by staff; uniqueness on full msp. Barcode stays BC + serial.

alter table public.pos_label_pieces
  add column if not exists type_code text not null default '',
  add column if not exists serial_no text;

-- Backfill existing numeric MSPs (000001 …) as serial-only pieces.
update public.pos_label_pieces
set
  serial_no = coalesce(nullif(trim(serial_no), ''), trim(msp)),
  type_code = coalesce(type_code, '')
where serial_no is null or trim(serial_no) = '';

alter table public.pos_label_pieces
  alter column serial_no set not null;

alter table public.pos_label_pieces
  drop constraint if exists pos_label_pieces_serial_nonempty;

alter table public.pos_label_pieces
  add constraint pos_label_pieces_serial_nonempty check (length(trim(serial_no)) > 0);

create unique index if not exists pos_label_pieces_serial_uidx
  on public.pos_label_pieces (serial_no);

drop function if exists public.pos_mint_label_piece(uuid);

-- Mint: optional type code; serial from sequence; barcode = BC + serial (unchanged by type).
create or replace function public.pos_mint_label_piece(
  p_sku_id uuid,
  p_type_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;

  select id into v_sku from public.pos_skus where id = p_sku_id and is_active = true;
  if v_sku is null then
    raise exception 'SKU không tồn tại hoặc đã tắt' using errcode = 'P0001';
  end if;

  v_type := upper(trim(coalesce(p_type_code, '')));
  if v_type ~ '\s' then
    raise exception 'Mã loại sản phẩm không được chứa khoảng trắng' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Mã loại sản phẩm tối đa 24 ký tự' using errcode = '22023';
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
    raise exception 'MSP hoặc mã vạch bị trùng. Thử lại hoặc đổi mã loại.' using errcode = 'P0001';
end;
$$;

revoke all on function public.pos_mint_label_piece(uuid, text) from public, anon;
grant execute on function public.pos_mint_label_piece(uuid, text) to authenticated;

-- Update type code only; serial immutable; recompute msp; uniqueness enforced.
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
  if v_type ~ '\s' then
    raise exception 'Mã loại sản phẩm không được chứa khoảng trắng' using errcode = '22023';
  end if;
  if length(v_type) > 24 then
    raise exception 'Mã loại sản phẩm tối đa 24 ký tự' using errcode = '22023';
  end if;

  v_msp := v_type || v_piece.serial_no;

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

revoke all on function public.pos_set_label_piece_type_code(uuid, text) from public, anon;
grant execute on function public.pos_set_label_piece_type_code(uuid, text) to authenticated;
