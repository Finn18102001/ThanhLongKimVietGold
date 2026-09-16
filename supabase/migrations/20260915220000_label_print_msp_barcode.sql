-- Product label print (In tem): MSP + barcode registry + print history.
-- Print does NOT mutate inventory / money / invoices.

create sequence if not exists public.pos_label_msp_seq;

create table if not exists public.pos_label_pieces (
  id uuid primary key default gen_random_uuid(),
  msp text not null,
  barcode text not null,
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  constraint pos_label_pieces_msp_unique unique (msp),
  constraint pos_label_pieces_barcode_unique unique (barcode),
  constraint pos_label_pieces_msp_nonempty check (length(trim(msp)) > 0),
  constraint pos_label_pieces_barcode_nonempty check (length(trim(barcode)) > 0)
);

create index if not exists pos_label_pieces_sku_idx
  on public.pos_label_pieces (sku_id, created_at desc);

create table if not exists public.pos_label_print_log (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pos_label_pieces(id) on delete restrict,
  sku_id uuid not null references public.pos_skus(id) on delete restrict,
  printed_at timestamptz not null default now(),
  actor_email text not null,
  action_type text not null,
  print_qty integer not null,
  stock_size text not null,
  -- Snapshot of what was printed (immutable history)
  msp text not null,
  barcode text not null,
  product_name text not null,
  product_type text not null default '',
  brand_name text not null default '',
  company_name text not null,
  address_line text not null,
  klt_chi numeric(18, 4) not null,
  klv_chi numeric(18, 4) not null,
  labor_fee_dong bigint not null,
  price_dong bigint not null,
  constraint pos_label_print_action_chk check (action_type in ('FIRST_PRINT', 'REPRINT')),
  constraint pos_label_print_stock_chk check (stock_size in ('21x10', '21x12')),
  constraint pos_label_print_qty_chk check (print_qty > 0 and print_qty <= 500)
);

create index if not exists pos_label_print_log_printed_idx
  on public.pos_label_print_log (printed_at desc);

create index if not exists pos_label_print_log_msp_idx
  on public.pos_label_print_log (msp);

create index if not exists pos_label_print_log_barcode_idx
  on public.pos_label_print_log (barcode);

create index if not exists pos_label_print_log_actor_idx
  on public.pos_label_print_log (actor_email, printed_at desc);

alter table public.pos_label_pieces enable row level security;
alter table public.pos_label_print_log enable row level security;

drop policy if exists pos_label_pieces_auth_all on public.pos_label_pieces;
create policy pos_label_pieces_auth_all on public.pos_label_pieces
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists pos_label_print_log_auth_all on public.pos_label_print_log;
create policy pos_label_print_log_auth_all on public.pos_label_print_log
  for all to authenticated
  using (true)
  with check (true);

revoke all on table public.pos_label_pieces from anon;
revoke all on table public.pos_label_print_log from anon;
grant select, insert, update on table public.pos_label_pieces to authenticated;
grant select, insert on table public.pos_label_print_log to authenticated;
grant usage, select on sequence public.pos_label_msp_seq to authenticated;

-- Mint MSP + barcode for a SKU (unique enforced by DB).
create or replace function public.pos_mint_label_piece(
  p_sku_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_n bigint;
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

  v_n := nextval('public.pos_label_msp_seq');
  v_msp := lpad(v_n::text, 6, '0');
  v_barcode := 'BC' || v_msp;

  insert into public.pos_label_pieces (msp, barcode, sku_id, created_by)
  values (v_msp, v_barcode, p_sku_id, v_actor)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'msp', v_msp,
    'barcode', v_barcode,
    'sku_id', p_sku_id
  );
exception
  when unique_violation then
    raise exception 'MSP hoặc mã vạch bị trùng. Thử lại.' using errcode = 'P0001';
end;
$$;

revoke all on function public.pos_mint_label_piece(uuid) from public, anon;
grant execute on function public.pos_mint_label_piece(uuid) to authenticated;

-- Record a print / reprint. Does not touch inventory.
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
  if v_stock not in ('21x10', '21x12') then
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
    coalesce(nullif(trim(p_company_name), ''), 'Công ty TNHH Vàng Bạc Thăng Long Kim Việt'),
    coalesce(nullif(trim(p_address_line), ''), 'Đc: 322 Nguyễn Trãi, P. Đại Mỗ'),
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

revoke all on function public.pos_record_label_print(
  uuid, integer, text, text, text, text, numeric, numeric, bigint, bigint
) from public, anon;
grant execute on function public.pos_record_label_print(
  uuid, integer, text, text, text, text, numeric, numeric, bigint, bigint
) to authenticated;
