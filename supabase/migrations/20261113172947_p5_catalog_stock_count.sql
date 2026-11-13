-- P5 (docs/pos-big-update/P5-00-CATALOG-POS.md §1 Q3): kiểm kê phạm vi CATEGORY dùng danh mục mới
-- (public.categories qua products.category_id) thay vì pos_category_skus (0 dòng).
-- Trước khi áp: 168 phiên kiểm kê đều scope ALL, 0 phiên CATEGORY; pos_category_skus 0 dòng.
--
-- md5 guard: pos_private.create_stock_count md5(prosrc) b10fe544bb713bb8d0eb3638d3427d5c (đọc 13/11/2026).
-- Không đổi bảng; không cần GRANT (§32.1).
-- ROLLBACK: chạy lại def dòng 'pos_private.create_stock_count' trong tlkv_backup_20261110._routines__p5.

do $patch$
declare
  v_oid oid := 'pos_private.create_stock_count(text, text, text, text)'::regprocedure;
  v_def text;
  v_new text;
begin
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> 'b10fe544bb713bb8d0eb3638d3427d5c' then
    raise exception 'DUNG: create_stock_count tren production da khac ban da doc.';
  end if;

  v_def := pg_get_functiondef(v_oid);
  insert into tlkv_backup_20261110._routines__p5 (name, def, md5)
  select 'pos_private.create_stock_count', v_def, md5(prosrc) from pg_proc where oid = v_oid;

  v_new := replace(
    v_def,
    E'        from public.pos_category_skus cs\n        where cs.sku_id = s.id\n          and cs.category_id = p_scope_value::uuid',
    E'        from public.products p\n        where p.id = s.catalog_product_id\n          and p.category_id = p_scope_value::uuid'
  );
  if v_new = v_def then
    raise exception 'DUNG: khong tim thay doan loc pos_category_skus trong create_stock_count.';
  end if;
  execute v_new;
end $patch$;
