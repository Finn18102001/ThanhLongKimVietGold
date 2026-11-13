-- ============================================================================
-- 06 BRAND–CATEGORY MAPPING — ĐÃ DUYỆT 13/11/2026 (14 cặp spec 2.2 + 3 cặp tạm)
-- Chỉ chạy sau khi người dùng duyệt danh sách trong
-- docs/audit/category-restructure/BRAND_CATEGORY_MAPPING_REVIEW.md và đã chạy 05 (preview).
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run (một lần; chạy lại vẫn an toàn).
--
-- Phạm vi: CHỈ thêm dòng vào public.brand_categories cho 17 cặp: 14 cặp theo spec 2.2 và
-- 3 cặp tạm cho Brand cũ (Bạc → Bạc Tích Trữ, Bạc → BẠC TRANG SỨC,
-- VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K) để /admin vẫn tạo được hàng của hai Brand này tới
-- đợt đổi Brand. Dùng ID, không dùng tên để chọn bản ghi.
-- Không tạo Brand/Category, không đổi Product, không chuyển Category thành Product Type,
-- không gộp Category. Các cặp chưa xác nhận nằm ở cuối file dưới dạng chú thích, KHÔNG chạy.
--
-- Chống lặp: INSERT … ON CONFLICT (brand_id, category_id) DO NOTHING.
-- Dừng toàn bộ nếu một ID không tồn tại hoặc tên không còn khớp tên đã duyệt.
-- Hoàn tác: 98_mapping_rollback.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table _tlkv_mapping (
  brand_id uuid not null,
  brand_name text not null,
  category_id uuid not null,
  category_name text not null
) on commit drop;

insert into _tlkv_mapping (brand_id, brand_name, category_id, category_name) values
  ('c9809240-ab07-468b-9d88-214583defb06', 'Bảo Tín Mạnh Hải',    '0fe8719a-242c-4577-8868-6f24bbfd0892', 'GRIF KIM GIA BẢO 24K'),
  ('c9809240-ab07-468b-9d88-214583defb06', 'Bảo Tín Mạnh Hải',    'fd153a59-e922-480f-b1e1-7bdb99d09edf', 'VÀNG TÍCH TRỮ'),
  ('c9809240-ab07-468b-9d88-214583defb06', 'Bảo Tín Mạnh Hải',    'b08e9ba3-0faf-4ece-9549-c1e96a891974', 'QUÀ TẶNG 24K'),
  ('c9809240-ab07-468b-9d88-214583defb06', 'Bảo Tín Mạnh Hải',    'b69243fd-8670-466e-bf1d-5cbe8f8107a2', 'VÀNG 24K'),
  ('c9809240-ab07-468b-9d88-214583defb06', 'Bảo Tín Mạnh Hải',    '9f0c0c11-ac42-4383-8c14-0e4812843804', 'Nhẫn Trơn'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', 'b08e9ba3-0faf-4ece-9549-c1e96a891974', 'QUÀ TẶNG 24K'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', 'b69243fd-8670-466e-bf1d-5cbe8f8107a2', 'VÀNG 24K'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', '9f0c0c11-ac42-4383-8c14-0e4812843804', 'Nhẫn Trơn'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', 'bf055130-6172-429e-9d7d-6476a5e9db05', 'PHỤ KIỆN'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', '109f0a7a-4361-4c54-9d3f-070f3a861b78', 'BẠC TRANG SỨC'),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'Thăng Long Kim Việt', '68673b57-018a-460d-90a6-6d78c6a1e46b', 'VÀNG 10K'),
  ('d493346b-ccaf-43ed-a4e4-4954c2fa743e', 'Bảo Tín Minh Châu',   '9f0c0c11-ac42-4383-8c14-0e4812843804', 'Nhẫn Trơn'),
  ('d493346b-ccaf-43ed-a4e4-4954c2fa743e', 'Bảo Tín Minh Châu',   'd2befea6-3a9d-43ce-9a0d-79036b36e6d5', 'Bạc Tích Trữ'),
  ('31592599-befe-423e-9eca-276fdcc9023d', 'Vàng thị trường',     '68673b57-018a-460d-90a6-6d78c6a1e46b', 'VÀNG 10K'),
  ('6161b4b4-f68f-4163-8a19-566612c091f5', 'Bạc',                 'd2befea6-3a9d-43ce-9a0d-79036b36e6d5', 'Bạc Tích Trữ'),
  ('6161b4b4-f68f-4163-8a19-566612c091f5', 'Bạc',                 '109f0a7a-4361-4c54-9d3f-070f3a861b78', 'BẠC TRANG SỨC'),
  ('40c4876d-6232-40f8-811f-28caaa875ed3', 'VÀNG TRANG SỨC TLKV', 'b08e9ba3-0faf-4ece-9549-c1e96a891974', 'QUÀ TẶNG 24K');

-- Điều kiện dừng ---------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  if to_regclass('public.brand_categories') is null then
    raise exception 'DUNG: chua co bang public.brand_categories (chay 02_migration.sql truoc).';
  end if;

  if (select count(*) from (select distinct brand_id, category_id from _tlkv_mapping) d) <> 17 then
    raise exception 'DUNG: danh sach mapping khong dung 17 cap duy nhat.';
  end if;

  select string_agg(m.brand_name || ' [' || m.brand_id || ']', ', ') into v_bad
  from _tlkv_mapping m
  left join public.brands b on b.id = m.brand_id
  where b.id is null
     or lower(normalize(regexp_replace(btrim(b.name), '\s+', ' ', 'g'), NFC)) <> lower(normalize(m.brand_name, NFC));
  if v_bad is not null then
    raise exception 'DUNG: Brand khong ton tai hoac ten da doi: %', v_bad;
  end if;

  select string_agg(m.category_name || ' [' || m.category_id || ']', ', ') into v_bad
  from _tlkv_mapping m
  left join public.categories c on c.id = m.category_id
  where c.id is null
     or lower(normalize(regexp_replace(btrim(c.name), '\s+', ' ', 'g'), NFC)) <> lower(normalize(m.category_name, NFC));
  if v_bad is not null then
    raise exception 'DUNG: Category khong ton tai hoac ten da doi: %', v_bad;
  end if;
end $$;

-- Thêm liên kết (bỏ qua cặp đã có) ---------------------------------------------
insert into public.brand_categories (brand_id, category_id)
select brand_id, category_id from _tlkv_mapping
on conflict (brand_id, category_id) do nothing;

-- Báo cáo: trạng thái 17 cặp sau khi chạy (đọc trước khi commit) -------------
select m.brand_name as brand,
       m.category_name as category,
       case when bc.brand_id is not null then 'co lien ket' else 'THIEU' end as trang_thai
from _tlkv_mapping m
left join public.brand_categories bc on bc.brand_id = m.brand_id and bc.category_id = m.category_id
order by m.brand_name, m.category_name;

commit;

-- ============================================================================
-- CHƯA XÁC NHẬN / CẦN QUYẾT ĐỊNH — KHÔNG CHẠY (để tham khảo khi duyệt)
-- Xem lý do từng dòng trong BRAND_CATEGORY_MAPPING_REVIEW.md.
--
-- Spec ghi "dự kiến chuyển thành Product Type" (Thăng Long Kim Việt):
--   ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', '1794f6a6-4cc8-455f-91e6-b45b7b6396be')  -- V24K DÂY CHUYỀN
--   ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', 'f1af289d-5515-4715-94c4-395d49df8d34')  -- V24K LẮC TAY
--   ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', '4263ee66-a8e1-45f6-84e8-b19bcd8849c1')  -- V24K NHẪN
--   ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', '0c7cbe88-76a6-41c6-ab6a-63737586c5e8')  -- V24K CHARM
--   ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b', '2266b0ab-2a62-4b52-92ad-b873e5ae634f')  -- V10K KHUYÊN TAI
--
-- Brand chưa tồn tại (không tự tạo):
--   Phú Quý → Bạc Tích Trữ ('d2befea6-3a9d-43ce-9a0d-79036b36e6d5')
--
-- Thăng Long Kim Việt → GRIF KIM GIA BẢO 24K: KHÔNG thêm (13/11: GRIF thuộc BTMH).
--   2 sản phẩm TLKV đang ở GRIF xử lý ở Phase C/E.
--
-- Category có sản phẩm nhưng không có trong spec 2.2:
--   V610 ('89e7f393-facc-4f59-b176-25043e2d7aec'): bỏ, ngừng dùng ở Phase C (3 món còn tồn)
--   Vàng Thị Trường ('69c5674b-5e0a-43f5-85cc-87a9c80c7179')
--   VÀNG 10K LẮC TAY ('9d3528bb-8420-4d63-b251-ac36b566c6c7', đang ẩn)
-- ============================================================================
