-- ============================================================================
-- 05 MAPPING PREVIEW (CHỈ ĐỌC) — chạy trước 06_brand_category_mapping.sql
-- Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- Không có câu lệnh ghi. Mỗi dòng là một cặp (Brand, Category) dự kiến thêm ở 06.
--
-- Cột cần xem:
--   brand_ok / category_ok   : ID tồn tại và tên khớp tên mong đợi (phải là "co")
--   da_lien_ket              : cặp đã có trong brand_categories chưa (06 sẽ bỏ qua nếu đã có)
--   san_pham_cua_cap         : số sản phẩm đang dùng đúng cặp này
-- Dòng cuối "SAN PHAM LEGACY" liệt kê các cặp sản phẩm đang dùng nhưng KHÔNG có trong
-- danh sách 06: sau khi chạy 06, khi sửa các sản phẩm này form sẽ giữ Category và hiện
-- cảnh báo "chưa liên kết".
-- ============================================================================
with planned(brand_id, brand_name, category_id, category_name) as (
  values
    ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'Bảo Tín Mạnh Hải',    '0fe8719a-242c-4577-8868-6f24bbfd0892'::uuid, 'GRIF KIM GIA BẢO 24K'),
    ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'Bảo Tín Mạnh Hải',    'fd153a59-e922-480f-b1e1-7bdb99d09edf'::uuid, 'VÀNG TÍCH TRỮ'),
    ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'Bảo Tín Mạnh Hải',    'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid, 'QUÀ TẶNG 24K'),
    ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'Bảo Tín Mạnh Hải',    'b69243fd-8670-466e-bf1d-5cbe8f8107a2'::uuid, 'VÀNG 24K'),
    ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'Bảo Tín Mạnh Hải',    '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid, 'Nhẫn Trơn'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', 'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid, 'QUÀ TẶNG 24K'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', 'b69243fd-8670-466e-bf1d-5cbe8f8107a2'::uuid, 'VÀNG 24K'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid, 'Nhẫn Trơn'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', 'bf055130-6172-429e-9d7d-6476a5e9db05'::uuid, 'PHỤ KIỆN'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', '109f0a7a-4361-4c54-9d3f-070f3a861b78'::uuid, 'BẠC TRANG SỨC'),
    ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'Thăng Long Kim Việt', '68673b57-018a-460d-90a6-6d78c6a1e46b'::uuid, 'VÀNG 10K'),
    ('d493346b-ccaf-43ed-a4e4-4954c2fa743e'::uuid, 'Bảo Tín Minh Châu',   '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid, 'Nhẫn Trơn'),
    ('d493346b-ccaf-43ed-a4e4-4954c2fa743e'::uuid, 'Bảo Tín Minh Châu',   'd2befea6-3a9d-43ce-9a0d-79036b36e6d5'::uuid, 'Bạc Tích Trữ'),
    ('31592599-befe-423e-9eca-276fdcc9023d'::uuid, 'Vàng thị trường',     '68673b57-018a-460d-90a6-6d78c6a1e46b'::uuid, 'VÀNG 10K'),
    ('6161b4b4-f68f-4163-8a19-566612c091f5'::uuid, 'Bạc',                 'd2befea6-3a9d-43ce-9a0d-79036b36e6d5'::uuid, 'Bạc Tích Trữ'),
    ('6161b4b4-f68f-4163-8a19-566612c091f5'::uuid, 'Bạc',                 '109f0a7a-4361-4c54-9d3f-070f3a861b78'::uuid, 'BẠC TRANG SỨC'),
    ('40c4876d-6232-40f8-811f-28caaa875ed3'::uuid, 'VÀNG TRANG SỨC TLKV', 'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid, 'QUÀ TẶNG 24K')
),
k as (
  select pl.*,
         lower(normalize(regexp_replace(btrim(b.name), '\s+', ' ', 'g'), NFC)) = lower(normalize(pl.brand_name, NFC)) as brand_ok,
         lower(normalize(regexp_replace(btrim(c.name), '\s+', ' ', 'g'), NFC)) = lower(normalize(pl.category_name, NFC)) as category_ok,
         exists (select 1 from public.brand_categories bc
                 where bc.brand_id = pl.brand_id and bc.category_id = pl.category_id) as da_lien_ket,
         (select count(*) from public.products p
          where p.brand_id = pl.brand_id and p.category_id = pl.category_id) as san_pham_cua_cap
  from planned pl
  left join public.brands b on b.id = pl.brand_id
  left join public.categories c on c.id = pl.category_id
)
select brand_name as brand,
       category_name as category,
       case when brand_ok then 'co' else 'KHONG KHOP' end as brand_ok,
       case when category_ok then 'co' else 'KHONG KHOP' end as category_ok,
       case when da_lien_ket then 'da co' else 'chua' end as da_lien_ket,
       san_pham_cua_cap::text as san_pham_cua_cap
from k
union all
select 'SAN PHAM LEGACY (cap khong co trong 06)',
       coalesce(b.name, '(khong co brand)') || ' / ' || coalesce(c.name, '(khong co category)'),
       '', '', '',
       count(*)::text
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.categories c on c.id = p.category_id
where not exists (select 1 from planned pl where pl.brand_id = p.brand_id and pl.category_id = p.category_id)
group by b.name, c.name;
