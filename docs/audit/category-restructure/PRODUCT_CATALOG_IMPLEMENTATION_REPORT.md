# Báo cáo triển khai: Brand, Category, Product Type, Product trong /admin

Ngày: 13/11/2026. Nhánh `Finn/New/Category-Restructure-Future`, chưa commit, chưa push.
Audit và quyết định: `PRODUCT_CATALOG_PHASE0_AUDIT.md`. Migration: `supabase/catalog-restructure/` (người dùng đã chạy 01-03 ngày 13/11; 04 chưa chạy).

## 1. File đã thay đổi

| File | Thay đổi |
|---|---|
| `admin/index.html` | Thêm sub-tab "Loại sản phẩm" và panel của nó; ô Loại sản phẩm, dòng cảnh báo Category, nút "Hủy sửa" trong form Product; bộ lọc và cột "Loại" ở danh sách sản phẩm; ô chọn liên kết trong form Brand/Category; bỏ cột Mô tả, thêm cột liên kết ở bảng Brand/Category; nạp 2 file JS mới |
| `css/admin-catalog.css` | Thêm style cho ô chọn liên kết, chip, chữ phụ, dòng cảnh báo |
| `js/admin/catalog-admin.js` | Brand/Category/Product Type đọc ghi qua `TLKVTaxonomy`; bỏ xóa cứng, thay bằng Ngừng dùng/Kích hoạt có xác nhận; cột và bộ lọc Loại; xác nhận trước khi Sửa sản phẩm khác khi form đang có thay đổi; History ghi `before`, `changed_fields` và tên trường đổi trong `summary` |
| `js/admin/product-form-admin.js` | Lọc Category theo Brand; giữ Category legacy kèm cảnh báo; ô Product Type; không tự đoán Price Row; giữ Price Row đang lưu khi người dùng không chủ động đổi; theo dõi thay đổi chưa lưu; nút "Hủy sửa"; xác nhận khi "Mục mới" |
| `js/products-data.js` | Đọc/ghi `product_type_id`; khi sửa chỉ `update` các cột thay đổi; kiểm tra Brand-Category và Product Type ở tầng dữ liệu; không ghi lại dòng ảnh khi ảnh không đổi |
| `js/admin/taxonomy-data.js` (mới) | Tầng dữ liệu Brand/Category/Product Type: chặn trùng tên, slug tự sinh khi tạo và giữ khi sửa, quản lý liên kết, ngừng dùng |
| `js/products/product-save-rules.js` (mới) | Tính các cột được phép ghi khi sửa Product |
| `tests/product-catalog.test.js` (mới) | 12 test cho quy tắc trên |
| `supabase/catalog-restructure/*` (mới) | Gói migration đã duyệt |

Đã xóa (chưa từng commit): `admin/danh-muc.html`, `css/admin-catalog-v2.css`, `js/admin/catalog-v2/*`, `tests/catalog-v2.test.js`.

Không sửa: `js/admin-app.js`, `admin/admin.css` (chỉ khác bản gốc ở kiểu xuống dòng, có từ trước), `routes/*`, trigger, function, nhánh POS.

## 2. Chức năng đã hoàn thành

- **Brand:** danh sách (tên, slug, danh mục liên kết, trạng thái); tạo; sửa; Ngừng dùng/Kích hoạt; quản lý danh mục liên kết. Giữ các trường hiện có (mô tả, logo).
- **Category:** như Brand, phía ngược lại là thương hiệu sử dụng. Một Category liên kết được nhiều Brand.
- **Product Type:** danh sách, tạo, sửa, Ngừng dùng/Kích hoạt. Không liên kết Brand/Category.
- **Product:** form duy nhất phía trên danh sách cho cả tạo và sửa; Sửa điền đầy đủ dữ liệu; Lưu khi sửa cập nhật đúng ID; "Hủy sửa" về trạng thái tạo, hỏi xác nhận khi có thay đổi; giữ toàn bộ trường hiện có (ảnh, giá/ghi chú, định lượng, 3 cờ, hiển thị).

## 3. Validation đã bổ sung

| Quy tắc | Nơi kiểm tra |
|---|---|
| Tên Brand/Category/Product Type bắt buộc | Tầng dữ liệu (`taxonomy-data.js`) |
| Chặn trùng tên (bỏ khoảng trắng thừa, không phân biệt hoa/thường), khi tạo và khi đổi tên; không coi chính bản ghi là trùng; thông báo đúng spec | Tầng dữ liệu, và unique index `*_name_norm_key` ở database |
| Slug tự sinh khi tạo, không có ô nhập, không thêm hậu tố; nếu tên tạo ra slug trùng thì chặn và yêu cầu kiểm tra tên | Tầng dữ liệu |
| Slug giữ nguyên khi sửa tên | Tầng dữ liệu (không gửi cột `slug` khi sửa) |
| Category phải được liên kết với Brand, khi tạo mới hoặc khi đổi Brand/Category | Form (lọc lựa chọn) và tầng dữ liệu (`saveProduct`) |
| Category legacy không liên kết được giữ nguyên nếu Brand và Category không đổi | Form và tầng dữ liệu |
| Product Type đã chọn phải tồn tại và đang dùng, khi chọn mới | Tầng dữ liệu |
| Không tự gán Price Row; giữ dòng đang lưu nếu người dùng không đổi | Form |

Chưa đổi quy tắc trùng tên Product: tạo mới vẫn tự thêm hậu tố slug như hiện tại, tên Product được phép trùng.

## 4. Schema / API

- Schema: theo `02_migration.sql` đã duyệt và người dùng đã chạy. Không có thay đổi schema nào khác.
- API: không thêm hay sửa endpoint Express. Admin dùng Supabase như trước, thêm bảng `product_types`, `brand_categories` và cột `products.product_type_id`.
- Danh sách sản phẩm (`PRODUCT_ADMIN_SELECT`) và `getProductById` đọc thêm `product_types(id, name, slug)`. Nếu join lỗi thì tự quay về câu truy vấn cũ.

## 5. Kết quả kiểm thử

**Tự động:** `node --test tests/product-catalog.test.js` đạt 12/12. Các trường hợp được kiểm:

- Chỉ đổi Category hoặc chỉ đổi Product Type thì câu UPDATE không chứa cột nào kích hoạt đồng bộ SKU.
- Đổi tên dòng giá, đổi chữ Category legacy hay đổi giá đã parse không lọt vào UPDATE.
- Các trường nghiệp vụ (tên, định lượng, Brand, trạng thái, dòng giá) vẫn được gửi như trước.
- Không ghi lại `slug`, `id`, `sort_order` khi sửa.
- Quy tắc tên trùng hoạt động đúng, kể cả khi sửa chính bản ghi; ánh xạ đúng thông báo lỗi từ database.

**Trình duyệt** (`/admin` local, tài khoản admin được cung cấp). Chỉ thao tác không ghi dữ liệu, và có ghi lại mọi request ghi để đối chiếu:

- Hiển thị 4 sub-tab; 6 Brand và 20 Category hiện "Chưa liên kết"; danh sách Loại rỗng; cột và bộ lọc Loại.
- Chặn tên rỗng; chặn trùng khi tạo Brand ("  bảo tín   MINH châu "), khi đổi tên Brand "Bạc" thành "thăng long kim việt", và khi tạo Category (" NHẪN   trơn "); chặn tên Product Type rỗng. Không request ghi nào được gửi.
- Sửa sản phẩm "Vàng Rồng Thăng Long 0.5 chỉ":
  - form điền đủ dữ liệu, ở trạng thái Sửa;
  - Category "Nhẫn Trơn" giữ nguyên kèm cảnh báo chưa liên kết;
  - Loại để trống; dòng giá `r5` khớp database;
  - không bị coi là có thay đổi;
  - diff khi lưu ngay là `{}` (không ghi cột nào).
- Đổi Brand khi đang sửa: Category bị xóa kèm thông báo yêu cầu chọn lại, không tự gán Category khác.
- "Hủy sửa" và "Mục mới": hỏi xác nhận khi có thay đổi; chọn Không thì giữ dữ liệu, chọn Có thì về form tạo trống.
- Lỗi tìm thấy khi test và đã sửa: "Mục mới" không hỏi xác nhận nếu bấm ngay sau một lần reset. Nguyên nhân là mốc so sánh được tính sau bước bất đồng bộ.

**Lưu thật qua form, có chặn ghi** (`saveProduct` và hook lịch sử chạy thật; mọi lệnh insert/update/upsert/delete bị chặn trong trình duyệt và ghi lại payload; liên kết Brand-Category và 1 Product Type được giả lập trong bộ nhớ; 0 request ghi ra mạng):

| Trường hợp | Lệnh gửi tới `products` |
|---|---|
| Lưu không đổi gì | Không có lệnh nào |
| Chỉ đổi Loại | `update {product_type_id}` |
| Chỉ đổi Danh mục | `update {category_id, category}` |
| Chỉ đổi tên | `update {name}` |
| Đổi dòng giá r5 → r6 | `update {price_row_id, price_source_product}` |
| Tạo mới | `upsert` đủ cột, `product_type_id = null` |

- Lịch sử (bật tạm trong bộ nhớ, vì `js/admin-audit.js` vốn bỏ qua log cho tài khoản `tuananh18101@gmail.com`): payload có `before` và `changed_fields`. Summary ví dụ: "Cập nhật sản phẩm (catalog): Danh mục, Loại sản phẩm, Danh mục (chữ)"; lưu không đổi gì ghi "không có trường nào thay đổi".
- Lỗi tìm thấy và đã sửa: mỗi lần lưu đều update `product_images` với `storage_path = null`, vì không suy ra được đường dẫn từ URL CDN. Lỗi này có từ trước (code cũ luôn update). Nay nếu URL ảnh không đổi thì không ghi.

## 6. Vấn đề còn tồn tại hoặc cần xác nhận

1. **Chưa kiểm thử các thao tác ghi thật.** Gồm tạo/sửa Brand, Category, Product Type, lưu liên kết, lưu Product. Payload lưu Product đã được kiểm qua chặn ghi (mục 5); phản hồi thật của database (RLS, constraint, trigger) thì chưa. Lý do là môi trường local đang nối database production và mapping Brand-Category là bước dữ liệu riêng chưa được duyệt.
2. **Chưa chạy `04_trigger_proof_autorollback.sql`** để chứng minh trên trigger thật. Theo yêu cầu, phần "chỉ gửi cột thay đổi" chỉ được coi là xong sau bước này.
3. **Chưa có mapping Brand - Category.** Khi chưa có, form Product không có Category nào để chọn và không tạo được sản phẩm mới (Category đang bắt buộc theo quy tắc hiện có). Sản phẩm cũ vẫn sửa được và giữ nguyên Category. Không triển khai code này lên production trước khi có mapping.
4. **Liên kết Brand-Category được lưu bằng 2 lệnh** (thêm rồi bỏ). Nếu lệnh thứ hai lỗi, bản ghi vẫn lưu, liên kết mới đã thêm nhưng liên kết cũ chưa bỏ, và màn hình báo rõ lỗi. Không ảnh hưởng dữ liệu sản phẩm.
5. **Quyền mặc định của Supabase.** Supabase tự cấp toàn quyền trên 2 bảng mới cho `anon`/`authenticated`, giống `brands`/`categories` hiện có. RLS chỉ cho admin ghi. Có thể thu hẹp quyền sau nếu muốn.
6. **Ngừng dùng Category làm nó biến mất khỏi dropdown POS** (nhập hàng, in tem), vì POS lọc `is_active`. Đây là hành vi hiện có; hộp xác nhận có nêu.
7. **Sản phẩm thiếu dữ liệu không lưu được nếu chưa bổ sung.** Hiện có 4 sản phẩm thiếu Category và 1 thiếu Brand. Brand và Category đang bắt buộc theo quy tắc hiện có, nên khi sửa các sản phẩm này phải chọn bổ sung mới lưu được. Hệ thống không tự gán.
