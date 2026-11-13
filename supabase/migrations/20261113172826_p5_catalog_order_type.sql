-- P5 (docs/pos-big-update/P5-00-CATALOG-POS.md §4): Nhập hàng Order trên POS ghi Loại sản phẩm và
-- chặn cặp Thương hiệu - Danh mục chưa liên kết (R1, R2).
--
-- md5 guard: dừng nếu mã nguồn trên production khác bản đã đọc ngày 13/11/2026.
--   pos_private.create_order_jewelry_sku(8 tham số)  md5(prosrc) bd095b1018477efbdae2bb00d9fd324d
--   public.pos_receive_order_purchase                md5(prosrc) f7efd8ac4a22ce052f93e721060a690c
-- Không đổi bảng nghiệp vụ nào; không cần GRANT bảng (§32.1).
--
-- ROLLBACK: chạy lại cột def của 2 dòng trong tlkv_backup_20261110._routines__p5, rồi
--   drop function pos_private.create_order_jewelry_sku(text, uuid, uuid, text, text, numeric, text, boolean, uuid);

create table if not exists tlkv_backup_20261110._routines__p5 (
  name text not null,
  def text not null,
  md5 text not null,
  backed_at timestamptz not null default now()
);
alter table tlkv_backup_20261110._routines__p5 enable row level security;

do $guard$
declare
  v_old_oid oid := 'pos_private.create_order_jewelry_sku(text, uuid, uuid, text, text, numeric, text, boolean)'::regprocedure;
  v_recv_oid oid := 'public.pos_receive_order_purchase(text, text, text, jsonb, bigint, text, text, date, text)'::regprocedure;
begin
  if (select md5(prosrc) from pg_proc where oid = v_old_oid) <> 'bd095b1018477efbdae2bb00d9fd324d' then
    raise exception 'DUNG: create_order_jewelry_sku tren production da khac ban da doc.';
  end if;
  if (select md5(prosrc) from pg_proc where oid = v_recv_oid) <> 'f7efd8ac4a22ce052f93e721060a690c' then
    raise exception 'DUNG: pos_receive_order_purchase tren production da khac ban da doc.';
  end if;
  if to_regprocedure('pos_private.create_order_jewelry_sku(text, uuid, uuid, text, text, numeric, text, boolean, uuid)') is not null then
    raise exception 'DUNG: ban 9 tham so da ton tai.';
  end if;

  insert into tlkv_backup_20261110._routines__p5 (name, def, md5)
  select 'pos_private.create_order_jewelry_sku(8)', pg_get_functiondef(v_old_oid), md5(prosrc) from pg_proc where oid = v_old_oid
  union all
  select 'public.pos_receive_order_purchase', pg_get_functiondef(v_recv_oid), md5(prosrc) from pg_proc where oid = v_recv_oid;
end $guard$;

-- Bản 9 tham số: như bản cũ + R1 (cặp Thương hiệu - Danh mục phải liên kết), R2 (Loại tồn tại, đang dùng),
-- ghi products.product_type_id.
create function pos_private.create_order_jewelry_sku(
  p_name text, p_brand_id uuid, p_category_id uuid, p_price_row_id text, p_price_note text,
  p_weight_chi numeric, p_sku_prefix text, p_visible boolean, p_product_type_id uuid
)
 returns table(sku_id uuid, sku_code text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_prefix text;
  v_next integer;
  v_code text;
  v_slug text;
  v_category text := '';
  v_board numeric := 1;
  v_row_id text := nullif(trim(coalesce(p_price_row_id, '')), '');
  v_weight numeric := p_weight_chi;
  v_sku_id uuid;
  v_visible boolean := coalesce(p_visible, false);
begin
  if v_name is null then
    raise exception 'Tên sản phẩm là bắt buộc' using errcode = '22023';
  end if;
  if p_brand_id is null or not exists (select 1 from public.brands b where b.id = p_brand_id) then
    raise exception 'Thương hiệu là bắt buộc' using errcode = '22023';
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_sku_prefix), ''), 'TLKVTS'), '[^A-Za-z0-9]', '', 'g'));
  if v_prefix is null or length(v_prefix) < 2 or length(v_prefix) > 12 then
    raise exception 'Mã đầu sản phẩm Order phải từ 2 đến 12 ký tự chữ hoặc số' using errcode = '22023';
  end if;

  if v_row_id is not null and not exists (select 1 from public.gold_price_rows g where g.id = v_row_id) then
    raise exception 'Dòng bảng giá không tồn tại' using errcode = '22023';
  end if;

  if p_category_id is not null then
    select c.name into v_category
    from public.categories c
    where c.id = p_category_id;
    if v_category is null then
      raise exception 'Danh mục không tồn tại' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.brand_categories bc
      where bc.brand_id = p_brand_id and bc.category_id = p_category_id
    ) then
      raise exception 'Danh mục "%" chưa được liên kết với thương hiệu này. Liên kết ở /admin website trước khi nhập.', v_category
        using errcode = '22023';
    end if;
  end if;

  if p_product_type_id is not null and not exists (
    select 1 from public.product_types t where t.id = p_product_type_id and t.is_active
  ) then
    raise exception 'Loại sản phẩm không tồn tại hoặc đã ngừng dùng' using errcode = '22023';
  end if;

  if v_weight is not null and v_weight < 0 then
    raise exception 'Định lượng không hợp lệ' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('tlkv-order-jewelry-' || v_prefix)::bigint);

  select coalesce(max(substring(code from length(v_prefix) + 1)::integer), 0) + 1
  into v_next
  from (
    select s.sku as code
    from public.pos_skus s
    where s.sku ~ ('^' || v_prefix || '[0-9]{6}$')
    union all
    select p.id as code
    from public.products p
    where p.id ~ ('^' || v_prefix || '[0-9]{6}$')
  ) codes;

  v_code := v_prefix || lpad(v_next::text, 6, '0');
  v_slug := lower(v_code);

  if v_row_id is not null then
    select case when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1 else 1 end
    into v_board
    from public.gold_price_rows g
    where g.id = v_row_id;
  end if;

  insert into public.products (
    id, name, slug, brand_id, category_id, category, product_type_id,
    price_text, price_row_id, weight, image, is_active,
    is_featured, is_best_seller, is_hot
  ) values (
    v_code, v_name, v_slug, p_brand_id, p_category_id, coalesce(v_category, ''), p_product_type_id,
    left(coalesce(p_price_note, ''), 500), v_row_id,
    case when v_weight is null or v_weight <= 0 then null else v_weight end,
    '', v_visible, false, false, false
  );

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = v_code
  limit 1;

  if v_sku_id is null then
    raise exception 'Không tạo được mã kho cho sản phẩm Order' using errcode = 'P0001';
  end if;

  update public.pos_skus s
  set sku = v_code, name = v_name, brand_id = p_brand_id, price_row_id = v_row_id,
      weight_chi = coalesce(nullif(v_weight, 0), 1), board_unit_chi = coalesce(v_board, 1),
      is_active = v_visible, is_order_jewelry = true, is_market_gold = false
  where s.id = v_sku_id;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict on constraint pos_inventory_stock_pkey do nothing;

  return query select v_sku_id, v_code;
end;
$function$;

revoke all on function pos_private.create_order_jewelry_sku(text, uuid, uuid, text, text, numeric, text, boolean, uuid)
  from public, anon, authenticated;

-- Bản 8 tham số giữ chữ ký, chuyển sang bản mới (Loại = null) để mọi lời gọi cũ cùng áp R1.
create or replace function pos_private.create_order_jewelry_sku(
  p_name text, p_brand_id uuid, p_category_id uuid, p_price_row_id text, p_price_note text,
  p_weight_chi numeric, p_sku_prefix text, p_visible boolean
)
 returns table(sku_id uuid, sku_code text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  return query
  select created.sku_id, created.sku_code
  from pos_private.create_order_jewelry_sku(
    p_name, p_brand_id, p_category_id, p_price_row_id, p_price_note,
    p_weight_chi, p_sku_prefix, p_visible, null::uuid
  ) as created;
end;
$function$;

-- pos_receive_order_purchase: truyền thêm order_product.product_type_id (tham số thứ 9).
do $patch$
declare
  v_oid oid := 'public.pos_receive_order_purchase(text, text, text, jsonb, bigint, text, text, date, text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_new text;
begin
  v_new := replace(
    v_def,
    E'        coalesce((v_order ->> ''visible'')::boolean, false)\n      ) as created;',
    E'        coalesce((v_order ->> ''visible'')::boolean, false),\n        nullif(v_order ->> ''product_type_id'', '''')::uuid\n      ) as created;'
  );
  if v_new = v_def then
    raise exception 'DUNG: khong tim thay doan goi create_order_jewelry_sku trong pos_receive_order_purchase.';
  end if;
  execute v_new;
  if position('product_type_id' in (select prosrc from pg_proc where oid = v_oid)) = 0 then
    raise exception 'DUNG: va pos_receive_order_purchase khong thanh cong.';
  end if;
end $patch$;
