# Kế hoạch đưa Category mới lên main và cập nhật POS

Ngày: 13/11/2026, 21:30 (UTC+7). Nguồn: toàn bộ md thêm ngày 12-13/11 trong `docs/audit/category-restructure/` và `docs/audit/CATEGORY_RESTRUCTURE_AUDIT_REPORT.md`, git của 3 nhánh, truy vấn `SELECT` trên Supabase `yrdqnmsvwovwhepmhigv`.

## 1. Nhánh này thực sự làm gì

`Finn/New/Category-Restructure-Future` hơn `main` 3 commit, `main` không có commit nào mới hơn (fast-forward được):

| Commit | Nội dung | Loại |
|---|---|---|
| `0ed4cef` | Tab Vàng/Bạc, phân trang ở danh sách giá và sản phẩm `/admin` | Website admin |
| `6bdf83d` | Spec, audit, quyết định 12/11 | Docs |
| `c676628` | Quản lý Brand / Category / Product Type trong `/admin`; liên kết Brand-Category nhiều-nhiều; Product Type dùng chung; lưu Product chỉ gửi cột thay đổi; bỏ xóa cứng; gói SQL `supabase/catalog-restructure/01..06, 98, 99`; 12 test | Website admin + SQL |

Không có file POS (`src/`) nào trong nhánh. Mô hình mục tiêu: Brand → Category (nhiều-nhiều qua `brand_categories`) → Product Type (dùng chung) → Product → SKU.

## 2. Trạng thái thực tế (SELECT 13/11 21:25)

| Hạng mục | Giá trị |
|---|---|
| Schema mới trên production | Đã có: `product_types`, `brand_categories`, `products.product_type_id`, unique tên Brand/Category, RLS bật (01-03 đã chạy) |
| `product_types` / `brand_categories` / sản phẩm có Product Type | 0 / 0 / 0 |
| `04_trigger_proof`, `05_preview`, `06_mapping` | Chưa chạy |
| Products | 169 (153 active), thiếu Brand 1, thiếu `category_id` 3 |
| `products.category` (chữ) khác tên Category hiện tại | 12 sản phẩm |
| Categories | 20 (2 ẩn: VÀNG 10K LẮC TAY, VÀNG MIẾNG); có V610 mới, ngoài spec |
| POS SKU | 338 (201 active) |

## 3. Impact khi đẩy lên main

### 3.1. Nhánh Category → main

| Khu vực | Impact | Mức |
|---|---|---|
| Website public | Không đổi giao diện. `products-data.js` đọc thêm `product_types(...)`, lỗi join tự quay về câu cũ | Thấp |
| `/admin` sản phẩm | Form lọc Category theo Brand. Khi `brand_categories` rỗng **không tạo được sản phẩm mới** | **Cao nếu deploy trước mapping** |
| `/admin` sửa sản phẩm | Chỉ gửi cột thay đổi: đổi Category / Product Type không kích hoạt `trg_products_sync_pos_sku` (chờ 04 chứng minh) | Giảm rủi ro so với hiện tại |
| Brand / Category | Không còn xóa cứng; slug giữ khi đổi tên (URL không vỡ) | Giảm rủi ro |
| POS | Không đổi code POS. Nhưng dữ liệu admin sửa sau deploy (Category, ẩn Category) tác động POS ngay, xem 3.3 | Trung bình |
| Rollback | Revert merge commit; 98 xóa mapping; 99 gỡ schema (gỡ code trước) | Có sẵn |

### 3.2. Nhánh POS → main: **không merge thẳng**

`Finn/New/POS-Future` khác `main` 510 file, xóa 13 file website (gồm banner Bông Lúa Vàng mới), đổi `vercel.json` sang `framework: nextjs`. Merge vào `main` sẽ thay deploy website bằng app POS và đảo các commit website gần đây. Merge Category vào POS báo xung đột 4 file: `js/admin/catalog-admin.js`, `js/products-data.js`, `js/products/product-price-engine.js`, `vercel.json` (nhánh POS mang bản cũ của website/admin).

Hướng xử lý: POS giữ nhánh và deploy riêng. Chỉ đưa vào nhánh POS phần POS cần (code `src/` + migration), không kéo file website. Cần xác nhận POS đang deploy từ đâu (chưa xác minh được trong repo).

### 3.3. POS phụ thuộc Category ở đâu (nhánh POS, đã đọc source)

| Chỗ | Đọc / ghi | Ảnh hưởng khi tái cấu trúc |
|---|---|---|
| Lưới Bán hàng / Mua vào (`pos/query.ts` `browseGroupFromProduct`, `PurchaseCatalogPanel`) | Chữ `products.category`, cộng luật theo tên (Nhẫn, Bông lúa, Rồng...) | Gộp V24K * vào VÀNG 24K làm nút nhóm đổi ngay; không lọc được theo Product Type |
| Kho (`inventory/StockTable.tsx`) | Chữ `products.category` | Bộ lọc nhóm đổi theo |
| Nhập hàng (`inventory/ReceiveForm.tsx`), Nhập hàng tab In tem (`label-print/LabelReceiveSection.tsx`) | Đọc `categories` `is_active`, ghi `category_id` qua `pos_receive_label_order_purchase` / `create_order_jewelry_sku` | Không lọc theo Brand, không có Product Type; Category bị ẩn biến mất khỏi dropdown |
| In tem (`label-print`) | `product_type` trên lịch sử tem = chữ category của SKU | Trùng tên với Product Type mới, dễ hiểu nhầm |
| Kiểm kê (`CountPage`), `/categories` POS | `pos_categories` (0 dòng) | Hệ riêng, không ảnh hưởng |
| Giá | `price_row_id`, `compute_gold_unit` | Không đọc Category; chỉ đổi khi đổi `brand_id` (trigger dựng lại mã SKU và dò lại `price_row_id`) |

## 4. Kế hoạch theo phase (đường găng ngắn nhất)

Thời lượng là ước lượng. Mỗi phase có cổng kiểm; không qua cổng thì dừng.

### Phase A. Chốt quyết định + chứng minh trigger (0,5 ngày, chỉ đọc + tự hoàn tác)

1. Quyết định A-K trong `BRAND_CATEGORY_MAPPING_REVIEW.md` (thêm V610).
2. Chạy `05_mapping_preview_readonly.sql`; mọi `brand_ok`/`category_ok` = "co".
3. Chạy `04_trigger_proof_autorollback.sql`. Cổng: T1, T2 = KHONG chay; T3, T4 = CO chay; dữ liệu sau hoàn tác không đổi.

### Phase B. Website/admin lên main (0,5 ngày)

1. Chạy `06_brand_category_mapping.sql` (14 cặp + cặp duyệt thêm). Cổng: `brand_categories` khác rỗng cho mọi Brand đang dùng.
2. Fast-forward `main` lên nhánh Category, deploy.
3. Smoke: tạo 1 sản phẩm test, sửa chỉ Category, sửa chỉ tên; kiểm `pos_skus` theo 04; website trang chủ, danh mục, thương hiệu, giá.
4. Rollback: revert merge; `98_mapping_rollback.sql`.

### Phase C. Dữ liệu danh mục mới, không đổi Brand (1 ngày)

1. Tạo Product Type: Dây Chuyền, Lắc Tay, Nhẫn, Charm, Khuyên Tai.
2. Chuyển sản phẩm (script có preview, backup bảng `products` vào schema backup, chỉ ghi `category_id`, `category`, `product_type_id`): V24K DÂY CHUYỀN / LẮC TAY / NHẪN / CHARM → VÀNG 24K + Type; V10K KHUYÊN TAI → VÀNG 10K + Khuyên Tai; VÀNG 10K LẮC TAY → VÀNG 10K + Lắc Tay; Vàng Thị Trường → VÀNG 10K (sau khi kiểm hàm lượng 3 sản phẩm).
3. Ẩn (không xóa) Category đã gộp; redirect `/sanpham/danh-muc/<slug cũ>` sang Category mới.
4. Cổng: trigger SKU không chạy (đếm `xmin` `pos_skus` trước/sau), `price_row_id` không đổi, website hiển thị đúng.
5. Làm cùng đợt deploy POS Phase D1 để nút nhóm POS đổi một lần.

### Phase D. Cập nhật POS (2-3 ngày, nhánh POS, song song với B-C)

- **D1 (đọc, deploy cùng C):** lưới Bán / Mua / Kho nhóm theo Category, thêm lọc Product Type (chip) đọc `products.product_type_id`; giữ luật theo tên cho nhóm thương hiệu (Rồng, Bông lúa, Kim Gia Bảo) nếu chủ cửa hàng muốn giữ nút đó. Không đổi giá, kho, chứng từ.
- **D2 (ghi):** Nhập hàng và Nhập hàng tab In tem lọc Category theo Brand qua `brand_categories`, thêm ô Product Type; migration thêm `product_type` vào payload `pos_receive_label_order_purchase` và `create_order_jewelry_sku` (backup function, md5 guard, chữ ký cũ vẫn chạy).
- **D3:** đổi nhãn "Loại SP" trên lịch sử tem thành "Nhóm hàng" để không nhầm với Product Type (không đổi dữ liệu cũ).
- Cổng: hard-test Mua vào, Bán, Đặt cọc, Nhập hàng, In tem, Kho như round 13/11; báo cáo / chứng từ không đổi số.

### Phase E. Đổi Brand (sau, rủi ro cao nhất, 2 ngày + audit)

VÀNG TRANG SỨC TLKV → Thăng Long Kim Việt (41 sản phẩm), Brand Bạc / Phú Quý. Đổi `brand_id` kích hoạt dựng lại mã SKU và dò lại `price_row_id`. Cần trước: dry-run mã SKU mới và dòng giá cho từng sản phẩm, kiểm tem / MSP / mã vạch đã in, và quyết định có tách cột `brand_id` khỏi trigger hay không.

### Phase F. Dọn dẹp

Category Tranh, Trang Sức, VÀNG MIẾNG ẩn; đánh giá xóa khi không còn tham chiếu; cập nhật docs.

## 5. Việc tồn đọng từ round POS 13/11 (làm song song, không chặn)

- Lỗi L-VOID-DEPOSIT (hủy đơn Đặt cọc đã giao không hoàn kho, 8 đơn thật): nhánh POS, `P4-04` §7.
- Hủy BUY-000446, ẩn SKU TLKVTS000018, xác nhận HD000446.

## 6. Đã xác nhận (13/11/2026 21:30)

1. POS deploy từ nhánh `Finn/New/POS-Future`.
2. V610 bỏ khỏi mapping; còn 3 món tồn nên ngừng dùng ở Phase C thay vì xóa. Mapping: thêm tạm Bạc → Bạc Tích Trữ, BẠC TRANG SỨC; VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K. GRIF thuộc BTMH, không thêm cặp TLKV.
3. Nút nhóm POS theo tên (Vàng Rồng, Bông lúa, Bông Sen, Kim Gia Bảo, Nhẫn): theo repo, đây là luật `browseGroupFromProduct` nhân viên đang dùng, nên D1 giữ nguyên và chỉ thêm lọc Category + Product Type.
4. Đang ngoài giờ bán, được triển khai.

## 7. Tiến độ

| Thời điểm | Phase | Kết quả |
|---|---|---|
| 13/11 21:35 | A: 05 preview | Đạt, 14/14 cặp "co" |
| 13/11 21:38 | A: 04 trigger proof | Đạt: T1, T2 KHONG chay; T3, T4 CO chay; dữ liệu không đổi |
| 13/11 21:40 | B1: 06 mapping | 17 cặp; 0 sản phẩm bị sửa |
| 13/11 21:50 | B: smoke local (cổng 5190, database production, chỉ đọc) | Form sản phẩm lọc Category đúng 17 cặp; danh sách có cột Loại; `/`, `/sanpham`, danh mục, thương hiệu, `/api/public/brands` 200; test 12/12 |
| 13/11 21:55 | B2: fast-forward `origin/main` → `142f402` | Xong (người dùng duyệt) |
| 13/11 21:58 | B3: smoke production `www.thanglongkimviet.vn` | Trang public 200; `js/admin/taxonomy-data.js`, `js/products/product-save-rules.js` đã phục vụ (bản mới đã deploy) |
| | C + D1 | Chờ: Product Type, chuyển sản phẩm, ngừng dùng V610 / Category đã gộp; POS lọc Category + Type |
