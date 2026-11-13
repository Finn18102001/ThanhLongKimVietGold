# TLKV – Category & Product Type Restructure: ghi chú khởi động audit

Cập nhật: 12/11/2026, 18:45 (UTC+7).

Giai đoạn hiện tại là **STRICT AUDIT ONLY**. Chưa có thay đổi nào về schema, dữ liệu, API hay logic cho việc tái cấu trúc. Chưa có tài liệu nào trong bộ 11 deliverable được viết; file này ghi lại những gì đã kiểm tra, các quyết định đã chốt và việc còn mở, để tiếp tục trên thiết bị khác.

## 1. Nội dung nhánh này

Nhánh `Finn/New/Category-Restructure-Future` tách từ `main` tại commit `f5e7092`.

| Nội dung | Vị trí | Ghi chú |
|---|---|---|
| Round 1: tab Vàng/Bạc và phân trang ở `/admin` | `admin/index.html`, `admin/admin.css`, `js/admin-app.js`, `js/admin/catalog-admin.js` | Không thuộc phần tái cấu trúc. Chưa bấm thử lại trên trình duyệt sau khi khôi phục; mới kiểm tra diff và cú pháp |
| Yêu cầu audit ban đầu | `spec/SYSTEM_IMPACT_AUDIT_CATEGORY_RESTRUCTURE.md` | Bản gốc |
| Yêu cầu tái cấu trúc đầy đủ | `spec/CATEGORY_PRODUCT_TYPE_RESTRUCTURE_SPEC.md` | Bản gốc, chưa sửa mục 2.4 (xem mục 6) |
| Báo cáo audit lần đầu | `../CATEGORY_RESTRUCTURE_AUDIT_REPORT.md` | Đã bị thay thế, có chỗ sai về source POS |
| Ghi chú này | `README.md` | |

Thư mục `.next/` (bản build POS cũ ngày 22/10) không được commit.

## 2. Môi trường đã xác minh

- **Repo:** `Finn18102001/ThanhLongKimVietGold`. Nhánh `main` chứa website và `/admin` (HTML/JS tĩnh, Express, gọi Supabase trực tiếp từ trình duyệt).
- **Source POS:** nằm ở nhánh `origin/Finn/New/POS-Future`, commit `9b65fa5` (12/11/2026 02:06). Nhánh có 260 file trong `src/`, gồm các module `pos`, `purchase`, `inventory`, `label-print`, `reporting`, `category`, `pricing`, `product`. Có 9 file trong `src/` tham chiếu `category_id`, `pos_categories` hoặc `brand_id`. `main` và nhánh POS đã tách xa: 23 commit chỉ có ở `main`, 52 commit chỉ có ở nhánh POS.
- **Database:** một project Supabase duy nhất, ref `yrdqnmsvwovwhepmhigv` (`WebsiteThangLongKimViet`). Đây là production: 343 đơn POS trong 7 ngày gần nhất, đơn gần nhất lúc 18:16 ngày 12/11. Website và POS dùng chung database này.
- **Staging:** không có. Đã chốt dùng Supabase local để diễn tập migration.
- **Migration:** database ghi nhận 177 migration, nhánh `main` chỉ có 5 file trong `supabase/migrations/`. Lịch sử migration trong repo `main` không đầy đủ.

## 3. Dữ liệu hiện tại (truy vấn read-only ngày 12/11/2026)

### 3.1. Brand

| Brand | Slug | Sản phẩm | Active | POS SKU |
|---|---|---:|---:|---:|
| VÀNG TRANG SỨC TLKV | `vang-trang-suc-tlkv` | 41 | 40 | 41 |
| Thăng Long Kim Việt | `thang-long-kim-viet` | 48 | 47 | 52 |
| Bảo Tín Minh Châu | `bao-tin-minh-chau` | 11 | 11 | 13 |
| Bảo Tín Mạnh Hải | `bao-tin-manh-hai` | 33 | 33 | 36 |
| Vàng thị trường | `vang-thi-truong` | 3 | 3 | 127 |
| Bạc | `bac` | 10 | 10 | 10 |
| (không có Brand) | | 1 | 1 | |

Tổng 147 sản phẩm, 311 POS SKU. Phú Quý chưa có trong bảng `brands`.

### 3.2. Category theo từng Brand

| Category | Slug | Category đang hiện | Brand | Sản phẩm | Chưa gắn dòng giá |
|---|---|---|---|---:|---:|
| GRIF KIM GIA BẢO 24K | `grif-kim-gia-bao-24k` | Có | Bảo Tín Mạnh Hải | 8 | 0 |
| | | | Thăng Long Kim Việt | 2 | 0 |
| QUÀ TẶNG 24K | `qua-tang-24k` | Có | VÀNG TRANG SỨC TLKV | 40 | 40 |
| | | | Thăng Long Kim Việt | 1 | 0 |
| | | | Bảo Tín Mạnh Hải | 1 | 0 |
| VÀNG 24K | `vang-24k` | Có | Thăng Long Kim Việt | 19 | 0 |
| | | | Bảo Tín Mạnh Hải | 11 | 0 |
| Nhẫn Trơn | `nhan-tron` | Có | Thăng Long Kim Việt | 10 | 0 |
| | | | Bảo Tín Minh Châu | 10 | 0 |
| | | | Bảo Tín Mạnh Hải | 8 | 2 |
| VÀNG TÍCH TRỮ | `vang-tich-tru` | Có | Bảo Tín Mạnh Hải | 5 | 0 |
| VÀNG 10K | `vang-10k` | Có | Thăng Long Kim Việt | 6 | 0 |
| | | | (không có Brand) | 1 | 1 |
| VÀNG 10K LẮC TAY | `vang-10k-lac-tay` | Không | Thăng Long Kim Việt | 5 | 0 |
| Vàng Thị Trường | `vang-thi-truong` | Có | Vàng thị trường | 3 | 0 |
| Bạc Tích Trữ | `bac-tich-tru` | Có | Bạc | 10 | 5 |
| V24K DÂY CHUYỀN | `v24k-day-chuyen` | Có | Thăng Long Kim Việt | 1 | 0 |
| V24K LẮC TAY | `v24k-lac-tay` | Có | Thăng Long Kim Việt | 2 | 0 |
| V10K KHUYÊN TAI | `v10k-khuyen-tai` | Có | Thăng Long Kim Việt | 1 | 1 |
| V24K NHẪN | `v24k-nhan` | Có | (không có sản phẩm) | 0 | |
| V24K CHARM | `v24k-charm` | Có | (không có sản phẩm) | 0 | |
| PHỤ KIỆN | `phu-kien` | Có | (không có sản phẩm) | 0 | |
| BẠC TRANG SỨC | `bac-trang-suc` | Có | (không có sản phẩm) | 0 | |
| Tranh | `tranh` | Có | (không có sản phẩm) | 0 | |
| Trang Sức | `trang-suc` | Có | (không có sản phẩm) | 0 | |
| VÀNG MIẾNG | `vang-mieng` | Không | (không có sản phẩm) | 0 | |

Tổng 19 Category, không Category nào có `parent_id`. Có 3 sản phẩm không có `category_id` (không nằm trong bảng trên).

## 4. Lệch giữa spec và database

| Spec | Database |
|---|---|
| Quà Tặng 24K thuộc BTMH, TLKV | 40/42 sản phẩm thuộc Brand `VÀNG TRANG SỨC TLKV`, không có trong mapping |
| Bạc Tích Trữ thuộc BTMC, Phú Quý | Cả 10 sản phẩm thuộc Brand `Bạc`; Phú Quý chưa tồn tại |
| GRIF Kim Gia Bảo 24K chỉ thuộc BTMH | 8 sản phẩm BTMH, 2 sản phẩm TLKV |
| Vàng 10K thuộc TLKV, Vàng Thị Trường | 6 sản phẩm TLKV, 1 sản phẩm không có Brand, 0 sản phẩm Vàng Thị Trường |
| Bỏ Category "Bạc" (mục 2.4) | Không có Category tên "Bạc"; `Bạc` là Brand |
| 5 Category chuyển thành Product Type | Tổng cộng 4 sản phẩm: Dây Chuyền 1, Lắc Tay 2, Khuyên Tai 1, Nhẫn 0, Charm 0 |
| Không nhắc tới | `VÀNG 10K LẮC TAY`, Category `Vàng Thị Trường`, `VÀNG MIẾNG` |

Nhẫn Trơn, Vàng 24K và Vàng Tích Trữ khớp mapping.

## 5. Phát hiện ảnh hưởng tới thứ tự triển khai

**Đổi `products.brand_id` tác động tới POS ngay lập tức.** Đã đối chiếu với hàm đang chạy trên database:

- Trigger `trg_products_sync_pos_sku` chạy `AFTER INSERT OR UPDATE OF name, weight, price_source_product, brand_id, is_active` trên `public.products`.
- Hàm `public.tlkv_sync_pos_sku_from_product` khi đó gán lại `pos_skus.sku` bằng `tlkv_build_pos_sku_code(name, brand_id, weight)`. Mã này ghép từ mã Brand, mã sản phẩm và trọng lượng.
- Cùng hàm đó dò lại `pos_skus.price_row_id` bằng cách so khớp tên với `gold_price_rows.product`, và ghi đè nếu tìm thấy.
- `category_id` không nằm trong danh sách cột của trigger và hàm không đọc Category. Đổi Category của sản phẩm không kích hoạt đồng bộ sang POS.

Bản trong repo: `supabase/migrations/20261013120000_products_weight_five_decimals.sql`.

**Phụ thuộc vào tên Category trong code round 1.** `resolveProductMetalKind` trong `js/admin/catalog-admin.js` phân loại Vàng/Bạc theo thứ tự: `gold_price_rows.metal` của dòng giá liên kết, rồi slug hoặc tên Category có chứa "bạc", rồi tên sản phẩm. Khi đổi tên hoặc gộp Category cần kiểm tra lại nhánh thứ hai.

## 6. Quyết định đã chốt (12/11/2026)

| Chủ đề | Quyết định | Đợt |
|---|---|---|
| Thứ tự | Website trước, POS sau | |
| Phạm vi đợt Website | Chỉ chuẩn hóa cấu trúc Category và website; không đổi `products.brand_id` | Website |
| Đổi Brand của sản phẩm | Làm sau khi kiểm thử đầy đủ tác động tới SKU, dòng giá và POS | POS |
| `VÀNG TRANG SỨC TLKV` | Brand cũ, không thuộc mô hình mục tiêu. Map sang TLKV cho cả 41 sản phẩm. Đợt Website chỉ ghi mapping. Không xóa Brand cũ | Ghi ở Website, đổi ở POS |
| Brand `Bạc` | Giữ nguyên Brand và 10 sản phẩm. Xác minh Brand thay thế trước khi mapping | POS |
| Mục 2.4 của spec | "Bạc" bị nhầm giữa Brand và Category. Danh sách Category loại bỏ chỉ còn `Tranh` và `Trang Sức` | Sửa tài liệu |
| `VÀNG 10K LẮC TAY` | Gộp vào Vàng 10K, Product Type Lắc Tay cho 5 sản phẩm. Giữ trạng thái ẩn của Category, không tự bật hiển thị | Website |
| Category `Vàng Thị Trường` | Chuyển 3 sản phẩm sang Vàng 10K, giữ Brand Vàng Thị Trường. Không gộp Brand vào TLKV | Website |
| Product Type | Dùng chung toàn hệ thống, không theo Brand hay Category, không nhân bản. Sản phẩm chưa đủ thông tin được để trống | Website |
| Staging | Supabase local trên máy, diễn tập migration tại đó | Cả hai |
| Source POS | `Finn/New/POS-Future` là bản cần audit, làm sau khi xong `/admin` | POS |

Các ràng buộc từ spec vẫn giữ: không tự tạo Brand, không xóa Category sau backfill, không đổi lịch sử giao dịch, không tạo lại SKU, không re-sync toàn bộ SKU vì đổi Category.

## 7. Việc còn mở

### Chờ phản hồi

1. Trong đợt Website vẫn audit POS ở tầng database và đọc 9 file POS có tham chiếu `category_id`, `pos_categories`, `brand_id`. Lý do: đợt Website có đổi `category_id` của sản phẩm, nếu màn hình POS lọc theo Category thì bị ảnh hưởng ngay.
2. Kiểm tra hàm lượng và dòng giá của 3 sản phẩm Category `Vàng Thị Trường` trước khi ghi mapping sang Vàng 10K. Sản phẩm nào không phải 10K thì đưa vào danh sách chờ duyệt.
3. Supabase local cần Docker và Supabase CLI trên máy, và cần connection string của database production để dump schema và dữ liệu.

### Cần quyết định sau khi có số liệu chi tiết

- 2 sản phẩm TLKV trong GRIF Kim Gia Bảo 24K (mapping chỉ có BTMH).
- 1 sản phẩm Vàng 10K không có Brand.
- 3 sản phẩm không có `category_id`.
- `VÀNG MIẾNG`: Category đang ẩn, 0 sản phẩm, không có trong spec.
- Brand thay thế cho 10 sản phẩm của Brand `Bạc`, và việc duyệt tạo Brand Phú Quý.
- URL cũ `/sanpham/danh-muc/:slug` của các Category bị gộp.
- Nhẫn Trơn, GRIF Kim Gia Bảo 24K, Quà Tặng 24K, Vàng Tích Trữ, Bạc Tích Trữ, Bạc Trang Sức: các mục phải audit riêng theo mục 2.3 của spec, chưa làm.

### Existing Issue (ghi nhận, không sửa trong phạm vi này)

- 40 sản phẩm Quà Tặng 24K của Brand `VÀNG TRANG SỨC TLKV` chưa gắn dòng giá.
- Có POS SKU còn bán được nhưng `price_row_id` là NULL. Số liệu chi tiết sẽ chạy lại ở Phase 1.

## Tiến độ

| Ngày | Hạng mục | Trạng thái | Tài liệu |
|---|---|---|---|
| 12/11/2026 | Ghi chú khởi động audit, chốt quyết định | Xong | File này |
| 13/11/2026 | Module quản lý Brand, Category, Product Type mới trên dữ liệu thử nghiệm (`/admin/danh-muc.html`), chưa nối database | Xong, chờ review | `CATEGORY_MODULE_PRE_IMPLEMENTATION_AUDIT.md`, `CATEGORY_MODULE_IMPLEMENTATION_REPORT.md` |
| 13/11/2026 | Phase 0 tích hợp Brand/Category/Product Type/Product vào `/admin`; gói migration schema | Người dùng đã chạy 01-03; 04 chưa chạy | `PRODUCT_CATALOG_PHASE0_AUDIT.md`, `supabase/catalog-restructure/` |
| 13/11/2026 | Phase 1-3: CRUD Brand/Category/Product Type, form Product trong `/admin`; xóa trang thử nghiệm `/admin/danh-muc.html` | Xong phần không ghi dữ liệu; chờ duyệt test ghi, chạy 04 và mapping Brand-Category | `PRODUCT_CATALOG_IMPLEMENTATION_REPORT.md` |
| 13/11/2026 | Viết lại 04 (trigger proof, tự hoàn tác); chuẩn bị mapping 05/06/98; test lưu Product qua form có chặn ghi; sửa lỗi ghi đè `storage_path` ảnh | 04, 05, 06 chưa chạy; chờ quyết định A-K | `BRAND_CATEGORY_MAPPING_REVIEW.md`, `PRODUCT_CATALOG_IMPLEMENTATION_REPORT.md` |
| 13/11/2026 | Đánh giá impact đưa nhánh lên `main`, phụ thuộc Category của POS, kế hoạch phase A-F | Chờ xác nhận mục 6 của plan | `ROLLOUT_PLAN_MAIN_AND_POS.md` |
| | Bộ 11 deliverable audit cho Migration | Chưa bắt đầu | Mục 8 |

## 8. Flow và bước tiếp theo

1. Phase 0: `PRE_AUDIT_READINESS_REPORT.md`, xác nhận blocker.
2. `CURRENT_SCHEMA_AND_DATA_AUDIT.md`: toàn bộ schema kể cả `pos_private`, view, RLS, realtime, lịch sử migration.
3. `PRICE_MAPPING_IMPACT_AUDIT.md`, rồi `WEBSITE_ADMIN_DEPENDENCY_AUDIT.md` (nhánh `main`), rồi `POS_INVENTORY_IMPACT_AUDIT.md`.
4. `BRAND_CATEGORY_MAPPING_MATRIX.md` và `PRODUCT_TYPE_CLASSIFICATION_MATRIX.md` theo từng sản phẩm, chờ duyệt.
5. `TARGET_ARCHITECTURE_PROPOSAL.md` so sánh Option A/B/C, chờ duyệt.
6. `MIGRATION_ROLLBACK_PLAN.md` và `REGRESSION_TEST_PLAN.md`, mỗi file chia đợt Website và đợt POS.
7. `OPEN_QUESTIONS_AND_DECISIONS.md` cập nhật xuyên suốt. Hết mục treo mới qua Implementation Gate.

Bước tiếp theo: viết `PRE_AUDIT_READINESS_REPORT.md` sau khi có xác nhận bắt đầu.

## 9. Trạng thái hiện tại

**Cập nhật 13/11/2026 21:45:** 05 đạt; 04 đạt (T1, T2 không chạy đồng bộ SKU; T3, T4 có; dữ liệu không đổi); 06 đã chạy, `brand_categories` = 17 cặp. Bước tiếp theo: Phase B (đưa nhánh lên `main`, deploy, smoke test) theo `ROLLOUT_PLAN_MAIN_AND_POS.md`.

### Ghi chú cũ (13/11/2026, cuối ngày)

Production đã có schema mới (01-03 đã chạy, checksum dữ liệu cũ không đổi). Code `/admin` mới chỉ nằm trên nhánh này, chưa deploy. `brand_categories` và `product_types` đang trống.

Việc tiếp theo, theo thứ tự:

1. Chạy `supabase/catalog-restructure/05_mapping_preview_readonly.sql` (chỉ đọc), đối chiếu 14 cặp.
2. Chạy `04_trigger_proof_autorollback.sql` (tự hoàn tác). Mong đợi: T1, T2 = KHONG chay; T3, T4 = CO chay; dữ liệu sau hoàn tác không đổi.
3. Quyết định các điểm A-K trong `BRAND_CATEGORY_MAPPING_REVIEW.md`.
4. Chạy `06_brand_category_mapping.sql` (gỡ bằng `98_mapping_rollback.sql`).
5. Merge, deploy, kiểm tra bằng 1 sản phẩm thử. Không deploy khi `brand_categories` còn trống: form tạo sản phẩm sẽ không có Category để chọn.

Ghi chú khi làm trên máy khác:

- Test: `node --test tests/product-catalog.test.js` (12 test). Repo không có script lint/build.
- `admin/admin.css`, `js/admin-app.js` trên máy cũ bị đổi line ending CRLF sang LF (nội dung không đổi), không commit.
- `node_modules` ở thư mục gốc trên máy cũ đã mất các package của POS; khi chuyển sang nhánh POS cần `npm install`.
- `js/admin-audit.js` bỏ qua ghi lịch sử sản phẩm cho tài khoản `tuananh18101@gmail.com` (hành vi có sẵn).
