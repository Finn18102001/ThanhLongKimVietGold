-- ============================================================================
-- 98 MAPPING ROLLBACK — hoàn tác 06_brand_category_mapping.sql
-- Chỉ xóa đúng 17 cặp do 06 thêm. Không chạm Brand, Category, Product.
-- Lưu ý: nếu sau khi chạy 06, admin tự thêm lại đúng một trong 17 cặp này qua giao diện,
-- cặp đó cũng bị xóa. Các cặp khác không bị ảnh hưởng.
-- Trước khi chạy, có thể xem các cặp sẽ bị xóa bằng câu SELECT ở cuối file (chạy riêng).
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

delete from public.brand_categories bc
using (values
  ('c9809240-ab07-468b-9d88-214583defb06'::uuid, '0fe8719a-242c-4577-8868-6f24bbfd0892'::uuid),
  ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'fd153a59-e922-480f-b1e1-7bdb99d09edf'::uuid),
  ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid),
  ('c9809240-ab07-468b-9d88-214583defb06'::uuid, 'b69243fd-8670-466e-bf1d-5cbe8f8107a2'::uuid),
  ('c9809240-ab07-468b-9d88-214583defb06'::uuid, '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'b69243fd-8670-466e-bf1d-5cbe8f8107a2'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, 'bf055130-6172-429e-9d7d-6476a5e9db05'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, '109f0a7a-4361-4c54-9d3f-070f3a861b78'::uuid),
  ('0e7009db-1fbe-4177-8b38-ed5368e1bc0b'::uuid, '68673b57-018a-460d-90a6-6d78c6a1e46b'::uuid),
  ('d493346b-ccaf-43ed-a4e4-4954c2fa743e'::uuid, '9f0c0c11-ac42-4383-8c14-0e4812843804'::uuid),
  ('d493346b-ccaf-43ed-a4e4-4954c2fa743e'::uuid, 'd2befea6-3a9d-43ce-9a0d-79036b36e6d5'::uuid),
  ('31592599-befe-423e-9eca-276fdcc9023d'::uuid, '68673b57-018a-460d-90a6-6d78c6a1e46b'::uuid),
  ('6161b4b4-f68f-4163-8a19-566612c091f5'::uuid, 'd2befea6-3a9d-43ce-9a0d-79036b36e6d5'::uuid),
  ('6161b4b4-f68f-4163-8a19-566612c091f5'::uuid, '109f0a7a-4361-4c54-9d3f-070f3a861b78'::uuid),
  ('40c4876d-6232-40f8-811f-28caaa875ed3'::uuid, 'b08e9ba3-0faf-4ece-9549-c1e96a891974'::uuid)
) as m(brand_id, category_id)
where bc.brand_id = m.brand_id and bc.category_id = m.category_id;

commit;

-- Xem trước (chạy riêng, chỉ đọc):
-- select b.name as brand, c.name as category
-- from public.brand_categories bc
-- join public.brands b on b.id = bc.brand_id
-- join public.categories c on c.id = bc.category_id
-- order by 1, 2;
