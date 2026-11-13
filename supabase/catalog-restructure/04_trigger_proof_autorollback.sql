-- ============================================================================
-- 04 TRIGGER PROOF (TỰ HOÀN TÁC) — chạy SAU 02_migration.sql, khi đã được duyệt
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
--
-- Câu hỏi cần chứng minh trên trigger thật trg_products_sync_pos_sku
-- (AFTER INSERT OR UPDATE OF name, weight, price_source_product, brand_id, is_active):
--   T1. UPDATE đổi THẬT category_id        → trigger KHÔNG chạy
--   T2. UPDATE đổi THẬT product_type_id    → trigger KHÔNG chạy
--   T3. UPDATE đổi THẬT name (đối chứng)   → trigger CÓ chạy
--   T4. UPDATE gán lại name bằng chính nó  → trigger CÓ chạy (lý do Admin chỉ gửi cột thay đổi)
--
-- Cách phát hiện (không dùng xmin):
--   Hàm tlkv_sync_pos_sku_from_product, khi chạy, luôn ghi pos_skus.name = products.name
--   cho SKU không phải vàng thị trường. Mỗi phép thử đặt pos_skus.name của SKU được chọn
--   thành giá trị mồi, chạy UPDATE trên products, rồi đọc lại pos_skus.name:
--     còn giá trị mồi  → trigger không chạy
--     bị thay          → trigger đã chạy
--
-- Cô lập và hoàn tác:
--   Mỗi phép thử nằm trong một khối BEGIN … EXCEPTION riêng (subtransaction) và kết thúc
--   bằng RAISE với mã ZT001, nên mọi thay đổi của phép thử đó (kể cả giá trị mồi, bản ghi
--   product_types tạm, và những gì trigger ghi) bị hoàn tác trước khi sang phép thử sau.
--   Đầu mỗi phép thử kiểm tra dữ liệu đã trở về đúng ảnh chụp ban đầu.
--   Cuối cùng so checksum trước/sau của sản phẩm, SKU, tồn kho của SKU, toàn bộ dòng giá
--   và bảng product_types; sau đó RAISE EXCEPTION để hoàn tác cả khối DO.
--
-- Kết quả hiển thị dưới dạng thông báo lỗi bắt đầu bằng "KET_QUA_TRIGGER_PROOF".
-- Đó là kết quả mong muốn; không dữ liệu nào được lưu, không phát sự kiện realtime.
-- Không sửa trigger, function hay dữ liệu thật.
-- ============================================================================
do $$
declare
  c_probe constant text := '__TLKV_TRIGGER_PROBE__';
  v_product   text;
  v_sku       uuid;
  v_cat_old   uuid;
  v_cat_new   uuid;
  v_type_old  uuid;
  v_type_tmp  uuid;
  v_name      text;
  v_seen      text;

  b_product text; b_sku text; b_stock text; b_rows text; b_types text;
  a_product text; a_sku text; a_stock text; a_rows text; a_types text;

  r1 text; r2 text; r3 text; r4 text;
  c1 text; c2 text; c3 text; c4 text;
begin
  -- Chọn một sản phẩm có SKU thường (không phải vàng thị trường, không phải hàng order).
  select p.id, s.id, p.category_id, p.product_type_id, p.name
    into v_product, v_sku, v_cat_old, v_type_old, v_name
  from public.products p
  join public.pos_skus s on s.catalog_product_id = p.id
  where coalesce(s.is_market_gold, false) = false
    and coalesce(s.is_order_jewelry, false) = false
    and nullif(btrim(p.name), '') is not null
  order by p.id
  limit 1;
  if v_product is null then
    raise exception 'Khong tim duoc san pham phu hop de kiem tra.';
  end if;

  select c.id into v_cat_new
  from public.categories c
  where c.id is distinct from v_cat_old
  order by c.sort_order, c.name
  limit 1;
  if v_cat_new is null then
    raise exception 'Khong co danh muc khac de thu doi category_id.';
  end if;

  -- Ảnh chụp ban đầu.
  select md5(row(p.*)::text) into b_product from public.products p where p.id = v_product;
  select md5(row(s.*)::text) into b_sku from public.pos_skus s where s.id = v_sku;
  select coalesce(md5(row(i.*)::text), 'khong co dong ton') into b_stock from public.pos_inventory_stock i where i.sku_id = v_sku;
  select md5(coalesce(string_agg(row(g.*)::text, ',' order by g.id), '')) into b_rows from public.gold_price_rows g;
  select md5(coalesce(string_agg(row(t.*)::text, ',' order by t.id), '')) into b_types from public.product_types t;

  -- T1: đổi thật category_id ------------------------------------------------
  begin
    select case when md5(row(s.*)::text) = b_sku then 'sach' else 'KHONG SACH' end into c1
    from public.pos_skus s where s.id = v_sku;
    update public.pos_skus set name = c_probe where id = v_sku;
    update public.products set category_id = v_cat_new where id = v_product;
    select name into v_seen from public.pos_skus where id = v_sku;
    r1 := case when v_seen = c_probe then 'KHONG chay dong bo SKU' else 'CO chay dong bo SKU' end;
    raise exception using errcode = 'ZT001', message = 'hoan tac T1';
  exception
    when sqlstate 'ZT001' then null;
    when others then r1 := 'LOI: ' || sqlerrm;
  end;

  -- T2: đổi thật product_type_id (dùng một product_types tạm, bị hoàn tác cùng phép thử)
  begin
    select case when md5(row(s.*)::text) = b_sku then 'sach' else 'KHONG SACH' end into c2
    from public.pos_skus s where s.id = v_sku;
    insert into public.product_types (name, slug)
    values ('__trigger probe ' || gen_random_uuid(), 'trigger-probe-' || replace(gen_random_uuid()::text, '-', ''))
    returning id into v_type_tmp;
    update public.pos_skus set name = c_probe where id = v_sku;
    update public.products set product_type_id = v_type_tmp where id = v_product;
    select name into v_seen from public.pos_skus where id = v_sku;
    r2 := case when v_seen = c_probe then 'KHONG chay dong bo SKU' else 'CO chay dong bo SKU' end;
    raise exception using errcode = 'ZT001', message = 'hoan tac T2';
  exception
    when sqlstate 'ZT001' then null;
    when others then r2 := 'LOI: ' || sqlerrm;
  end;

  -- T3 (đối chứng): đổi thật name -------------------------------------------
  begin
    select case when md5(row(s.*)::text) = b_sku then 'sach' else 'KHONG SACH' end into c3
    from public.pos_skus s where s.id = v_sku;
    update public.pos_skus set name = c_probe where id = v_sku;
    update public.products set name = v_name || ' (probe)' where id = v_product;
    select name into v_seen from public.pos_skus where id = v_sku;
    r3 := case when v_seen = c_probe then 'KHONG chay dong bo SKU' else 'CO chay dong bo SKU' end;
    raise exception using errcode = 'ZT001', message = 'hoan tac T3';
  exception
    when sqlstate 'ZT001' then null;
    when others then r3 := 'LOI: ' || sqlerrm;
  end;

  -- T4 (thông tin): gán lại name bằng đúng giá trị cũ ------------------------
  begin
    select case when md5(row(s.*)::text) = b_sku then 'sach' else 'KHONG SACH' end into c4
    from public.pos_skus s where s.id = v_sku;
    update public.pos_skus set name = c_probe where id = v_sku;
    update public.products set name = name where id = v_product;
    select name into v_seen from public.pos_skus where id = v_sku;
    r4 := case when v_seen = c_probe then 'KHONG chay dong bo SKU' else 'CO chay dong bo SKU' end;
    raise exception using errcode = 'ZT001', message = 'hoan tac T4';
  exception
    when sqlstate 'ZT001' then null;
    when others then r4 := 'LOI: ' || sqlerrm;
  end;

  -- Ảnh chụp sau cùng (sau khi cả 4 phép thử đã hoàn tác).
  select md5(row(p.*)::text) into a_product from public.products p where p.id = v_product;
  select md5(row(s.*)::text) into a_sku from public.pos_skus s where s.id = v_sku;
  select coalesce(md5(row(i.*)::text), 'khong co dong ton') into a_stock from public.pos_inventory_stock i where i.sku_id = v_sku;
  select md5(coalesce(string_agg(row(g.*)::text, ',' order by g.id), '')) into a_rows from public.gold_price_rows g;
  select md5(coalesce(string_agg(row(t.*)::text, ',' order by t.id), '')) into a_types from public.product_types t;

  raise exception using errcode = 'ZT999', message = format(
    'KET_QUA_TRIGGER_PROOF (da hoan tac toan bo) | san_pham=%s sku=%s | '
    || 'T1 doi category_id: %s [truoc phep thu: %s] | '
    || 'T2 doi product_type_id: %s [truoc phep thu: %s] | '
    || 'T3 doi name (doi chung): %s [truoc phep thu: %s] | '
    || 'T4 gan lai name = name: %s [truoc phep thu: %s] | '
    || 'Du lieu sau hoan tac: san_pham=%s, sku=%s, ton_kho_sku=%s, dong_gia=%s, product_types=%s | '
    || 'Mong doi: T1, T2 = KHONG chay; T3, T4 = CO chay; tat ca "sach"; tat ca "khong doi".',
    v_product, v_sku,
    r1, c1, r2, c2, r3, c3, r4, c4,
    case when a_product = b_product then 'khong doi' else 'DA DOI' end,
    case when a_sku = b_sku then 'khong doi' else 'DA DOI' end,
    case when a_stock = b_stock then 'khong doi' else 'DA DOI' end,
    case when a_rows = b_rows then 'khong doi' else 'DA DOI' end,
    case when a_types = b_types then 'khong doi' else 'DA DOI' end
  );
end $$;
