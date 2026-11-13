# Brand - Category mapping: danh sách chờ duyệt

Ngày: 13/11/2026. Nguồn: spec mục 2.2 (`spec/CATEGORY_PRODUCT_TYPE_RESTRUCTURE_SPEC.md`) và các quyết định ngày 12/11 (`README.md` mục 6).
Trạng thái: **đã chạy 13/11/2026 21:40** qua Supabase MCP (người dùng duyệt): 05 đạt (14/14 "co"), 06 thêm **17 cặp** = 14 cặp mục 1 + 3 cặp tạm C, D bên dưới. `brand_categories` = 17 dòng, mọi Brand đang dùng có ít nhất 1 Category, không sản phẩm nào bị sửa.

Quyết định 13/11 cho mục 2: **C** liên kết tạm Bạc → Bạc Tích Trữ và Bạc → BẠC TRANG SỨC; **D** liên kết tạm VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K; **E** không thêm (GRIF thuộc BTMH), 2 sản phẩm "TLKV Bông hoa 0.1 chỉ", "TLKV Bó Hoa 0.1 chỉ" xử lý ở Phase C/E; **F** V610 bỏ, ngừng dùng ở Phase C (3 món TLKVTS000004-006 còn tồn). Các mục còn lại theo kế hoạch Phase C.

**Đổi lúc 22:05 cùng ngày (người dùng quyết định lại):** GRIF là Category của **Thăng Long Kim Việt** (bỏ cặp BTMH → GRIF, thêm TLKV → GRIF); BTMH có Category mới **GIFT** chứa 18 sản phẩm Kim Gia Bảo / KGBG; Brand mới **Vàng Tây** có VÀNG 10K; Vàng thị trường chỉ có VÀNG 10K. Hiện có 19 cặp. Xem `supabase/catalog-restructure/07_vangtay_gift_grif_APPLIED.sql`.

File:

| Thứ tự | File | Loại |
|---|---|---|
| 1 | `supabase/catalog-restructure/05_mapping_preview_readonly.sql` | Chỉ đọc: kiểm tra ID/tên, cặp đã có chưa, số sản phẩm của từng cặp, và danh sách sản phẩm sẽ ở trạng thái legacy |
| 2 | `supabase/catalog-restructure/06_brand_category_mapping.sql` | Thêm 14 cặp đã xác nhận vào `brand_categories`. Dừng nếu ID không tồn tại hoặc tên đã đổi. `ON CONFLICT DO NOTHING` nên chạy lại vẫn an toàn |
| Hoàn tác | `supabase/catalog-restructure/98_mapping_rollback.sql` | Xóa đúng 14 cặp trên |

Các file chỉ chạm `brand_categories`. Không tạo Brand, không đổi Product, không chuyển Category thành Product Type, không gộp Category.

## 1. Đã xác nhận: có trong file 06 (14 cặp)

Cả Brand và Category đều đã tồn tại; chọn bằng ID.

### Bảo Tín Mạnh Hải (`c9809240-…`)

| Category | ID |
|---|---|
| GRIF KIM GIA BẢO 24K | `0fe8719a-242c-4577-8868-6f24bbfd0892` |
| VÀNG TÍCH TRỮ | `fd153a59-e922-480f-b1e1-7bdb99d09edf` |
| QUÀ TẶNG 24K | `b08e9ba3-0faf-4ece-9549-c1e96a891974` |
| VÀNG 24K | `b69243fd-8670-466e-bf1d-5cbe8f8107a2` |
| Nhẫn Trơn | `9f0c0c11-ac42-4383-8c14-0e4812843804` |

### Thăng Long Kim Việt (`0e7009db-…`)

| Category | ID |
|---|---|
| QUÀ TẶNG 24K | `b08e9ba3-0faf-4ece-9549-c1e96a891974` |
| VÀNG 24K | `b69243fd-8670-466e-bf1d-5cbe8f8107a2` |
| Nhẫn Trơn | `9f0c0c11-ac42-4383-8c14-0e4812843804` |
| PHỤ KIỆN | `bf055130-6172-429e-9d7d-6476a5e9db05` |
| BẠC TRANG SỨC | `109f0a7a-4361-4c54-9d3f-070f3a861b78` |
| VÀNG 10K | `68673b57-018a-460d-90a6-6d78c6a1e46b` |

### Bảo Tín Minh Châu (`d493346b-…`)

| Category | ID |
|---|---|
| Nhẫn Trơn | `9f0c0c11-ac42-4383-8c14-0e4812843804` |
| Bạc Tích Trữ | `d2befea6-3a9d-43ce-9a0d-79036b36e6d5` |

### Vàng thị trường (`31592599-…`)

| Category | ID |
|---|---|
| VÀNG 10K | `68673b57-018a-460d-90a6-6d78c6a1e46b` |

## 2. Chưa xác nhận hoặc cần quyết định: không có trong file 06

| # | Cặp hoặc trường hợp | Lý do chưa đưa vào | Ảnh hưởng nếu không liên kết |
|---|---|---|---|
| A | Thăng Long Kim Việt → V24K DÂY CHUYỀN, V24K LẮC TAY, V24K NHẪN, V24K CHARM, V10K KHUYÊN TAI | Spec ghi "dự kiến chuyển thành Product Type". Không tự chuyển | 4 sản phẩm TLKV (Dây Chuyền 1, Lắc Tay 2, Khuyên Tai 1, số liệu 12/11) sẽ hiện cảnh báo legacy khi sửa; sản phẩm mới không chọn được các Category này |
| B | Phú Quý → Bạc Tích Trữ | Brand Phú Quý chưa tồn tại; không tự tạo | Không có |
| C | Bạc (Brand) → Bạc Tích Trữ | Không có trong spec 2.2. Quyết định 12/11: giữ Brand "Bạc", tìm Brand thay thế trước đợt POS | 10 sản phẩm của Brand "Bạc" hiện cảnh báo legacy khi sửa |
| D | VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K | Không có trong spec 2.2. Quyết định 12/11: Brand cũ, chuyển sang TLKV ở đợt POS | Khoảng 40 sản phẩm hiện cảnh báo legacy khi sửa; Brand hiện có 45 sản phẩm |
| E | Thăng Long Kim Việt → GRIF KIM GIA BẢO 24K | Spec 2.2 chỉ ghi Bảo Tín Mạnh Hải | 2 sản phẩm TLKV trong GRIF (số liệu 12/11) hiện cảnh báo legacy khi sửa |
| F | Category V610 | Tạo ngày 13/11, không có trong spec, hiện có 3 sản phẩm | Chưa biết Brand nào dùng |
| G | Category Vàng Thị Trường | Quyết định 12/11: chuyển 3 sản phẩm sang VÀNG 10K (bước dữ liệu sản phẩm riêng) | 3 sản phẩm hiện cảnh báo legacy khi sửa cho tới khi chuyển |
| H | Category VÀNG 10K LẮC TAY (đang ẩn) | Quyết định 12/11: gộp vào VÀNG 10K kèm Product Type Lắc Tay (bước dữ liệu riêng) | 5 sản phẩm TLKV hiện cảnh báo legacy khi sửa |
| I | Category Tranh, Trang Sức | Ứng viên loại bỏ, 0 sản phẩm | Không có |
| J | Category VÀNG MIẾNG (đang ẩn) | Không có trong spec, 0 sản phẩm | Không có |
| K | 1 sản phẩm VÀNG 10K không có Brand | Không tự gán | Phải chọn Brand khi sửa |

"Cảnh báo legacy" nghĩa là: khi mở Sửa, form giữ nguyên Category đang lưu và hiện ghi chú "chưa liên kết với thương hiệu". Lưu lại sản phẩm mà không đổi Brand/Category thì dữ liệu giữ nguyên. Không có sản phẩm nào bị tự đổi.

Số sản phẩm theo từng cặp ở bảng trên lấy từ dữ liệu ngày 12/11. File 05 trả về số mới nhất tại thời điểm chạy, gồm dòng "SAN PHAM LEGACY" cho mọi cặp đang dùng mà không có trong file 06.

## 3. Thứ tự đề xuất khi được duyệt

1. Bạn duyệt mục 1 và quyết định từng dòng ở mục 2.
2. Nếu bổ sung cặp từ mục 2, tôi thêm vào cả 3 file (05, 06, 98) và giữ danh sách giống hệt nhau.
3. Bạn chạy 05 (chỉ đọc) và gửi kết quả; mọi dòng brand_ok/category_ok phải là "co".
4. Bạn chạy 06 trên Dashboard.
