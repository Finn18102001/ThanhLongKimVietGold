# Category Module: Pre-implementation Audit (Bước 0)

> **Đã bị thay thế (13/11/2026).** Trang thử nghiệm `/admin/danh-muc.html` và repository mock đã bị xóa; quy tắc được đưa vào `/admin`. Xem `PRODUCT_CATALOG_PHASE0_AUDIT.md` và `PRODUCT_CATALOG_IMPLEMENTATION_REPORT.md`.

Ngày: 13/11/2026. Phạm vi: xây module quản lý Brand, Category, Product Type mới trên data source độc lập, chưa Migration.

Nguồn bằng chứng: source nhánh `Finn/New/Category-Restructure-Future`, nhánh POS `origin/Finn/New/POS-Future` (đọc bằng `git show`/`git grep`, không checkout), truy vấn `SELECT` trên Supabase `yrdqnmsvwovwhepmhigv`.

## 1. Repository và working tree

| Mục | Giá trị |
|---|---|
| Branch | `Finn/New/Category-Restructure-Future` (không chuyển branch) |
| HEAD | `6bdf83d` |
| Thay đổi chưa commit | `admin/admin.css`, `js/admin-app.js`, `js/admin/catalog-admin.js`. Đã kiểm tra bằng `git diff --ignore-cr-at-eol`: nội dung không đổi, chỉ đổi xuống dòng CRLF sang LF (13/11 14:16). Không đụng, không revert ba file này |
| Chưa theo dõi | `.next/` (build POS cũ), không liên quan |

## 2. Module danh mục hiện tại

| Thành phần | Vị trí | Hành vi |
|---|---|---|
| UI Brand/Category | `admin/index.html` dòng 245-523, sub-tab "Thương hiệu", "Danh mục" trong tab Sản phẩm | Form một màn hình, bảng danh sách không phân trang |
| Logic | `js/admin/catalog-admin.js`: `saveBrandForm`, `saveCategoryForm`, `refreshBrandsTable`, `refreshCategoriesTable` | Gọi `sb.from("brands"/"categories")` trực tiếp từ UI, không có tầng service |
| Slug | `TLKVProducts.slugifySimple` (`js/products-data.js` dòng 192) | Sinh lại từ tên ở cả tạo và sửa |
| Auth | `js/admin-app.js` `bootSupabaseAuth`, client chung `js/tlkv-supabase-client.js` (`storageKey: "tlkv-supabase-auth"`) | Session dùng chung cho mọi trang `/admin/*` cùng origin |
| Trang riêng có sẵn | `admin/news.html` (+ route `routes/admin.js`) | Mẫu cho trang admin độc lập có login riêng |

Product Type: không tồn tại ở đâu (UI, code, database).

## 3. Schema hiện tại (đã truy vấn)

- `public.brands`: `id, name, slug, description, logo_url, is_active, sort_order, created_at, updated_at`.
- `public.categories`: `id, name, slug, parent_id, is_active, sort_order, created_at, updated_at`. Không có `description`, không có `brand_id`.
- Không có bảng nào khớp `%product_type%`, `%brand_categor%`, `%category_brand%`.
- `products.brand_id`, `products.category_id` là FK; `products.category` (text cũ) vẫn còn dữ liệu.
- 20 Category tại thời điểm audit; Category mới nhất `V610` (slug `v610`) tạo 13/11 12:21 (UTC+7). Không có tên Category trùng nhau trong database hiện tại.

Hệ quả: domain model mới (Category có `description`, quan hệ Brand-Category nhiều-nhiều, Product Type) chưa có chỗ lưu trên database. Phải chạy trên data source riêng.

## 4. Dependency đang đọc Brand/Category

| Consumer | Bằng chứng | Đọc gì | Rủi ro nếu module mới ghi production |
|---|---|---|---|
| Admin sản phẩm | `catalog-admin.js` `loadTaxonomies`, `product-form-admin.js` | `brands`, `categories` | Dropdown và bộ lọc đổi ngay |
| Website catalog | `js/products/catalog-api.js` `fetchBrandsList`, `fetchCategoriesList`, `fetchProductsPage` | `brands`, `categories` theo slug, `is_active` | Lọc, URL `/thuong-hieu/:slug`, `/sanpham/danh-muc/:slug` |
| API public | `routes/api-public.js` `/api/public/brands` | `brands` | Trang chủ |
| POS nhập kho | POS `src/modules/inventory/query.ts` `listCategories` | `categories` `is_active = true` | Dropdown Category khi nhập hàng đổi ngay |
| POS in tem | POS `src/modules/label-print/query.ts` `listLabelReceiveOptions` | `categories` `is_active = true`, RPC `pos_list_brands` | Như trên |
| POS ghi `category_id` | POS `ReceiveForm.tsx` dòng 109, `label-print/receive-actions.ts` dòng 80 | Ghi `order_product.category_id` | Category bị ẩn hoặc đổi ID làm sai dữ liệu nhập |
| POS Category riêng | POS `src/modules/category/actions.ts`, `inventory/CountPage.tsx` | RPC `pos_list_categories` (`pos_categories`, đang 0 dòng) | Hệ thống riêng, không dùng bảng `categories` |
| Trigger đồng bộ SKU | `trg_products_sync_pos_sku` (`AFTER UPDATE OF name, weight, price_source_product, brand_id, is_active`) | `products.brand_id` | Đổi Brand của sản phẩm dựng lại mã SKU và dò lại `price_row_id` |
| Price Mapping | `products.price_row_id`, `pos_skus.price_row_id`, `pos_private.compute_gold_unit` | Không đọc Category | Không bị ảnh hưởng nếu không đổi `brand_id` |

Các luồng SKU generation, Inventory, Stock-in/out, POS mua/bán, Reports đều đi qua `pos_skus` và `products.brand_id`; không đọc quan hệ Brand-Category (vì quan hệ này chưa tồn tại). Module mới không ghi `products`, `pos_skus` hay `brands`/`categories`, nên không chạm các luồng này.

## 5. Rủi ro

1. Ghi nhầm production: thấp vì module mới không gọi Supabase để đọc/ghi dữ liệu danh mục (chỉ dùng Supabase Auth để kiểm tra đăng nhập).
2. Nhầm dữ liệu thử nghiệm với dữ liệu thật: giảm bằng banner cố định trên trang, nhãn "mô phỏng" ở số lượng sản phẩm, và lưu ở `localStorage` với key riêng.
3. Thay đổi màn hình production: không, vì trang mới là file riêng, không thêm link vào `/admin` hiện tại.
4. Fallback âm thầm: repository Supabase chỉ là adapter giữ chỗ, ném lỗi rõ ràng "chưa Migration"; factory không tự chuyển nguồn.

## 6. Phương án triển khai

- Trang riêng `/admin/danh-muc.html`, được `express.static` trong `routes/admin.js` phục vụ sẵn và route `/(.*)` của `vercel.json`, nên không cần sửa route. Không link từ `/admin`.
- Dùng template sẵn có: `admin/admin.css` + `css/admin-catalog.css` (màu `#8b1d1d`, nền zinc, radius 8-12px, `catalog-admin-*`, `admin-tab`, `admin-pagination`, `admin-modal`, `admin-toast`). CSS bổ sung đặt trong file riêng.
- JS vanilla theo convention repo (IIFE gắn namespace `window.TLKV*`), chia tầng:
  - `domain.js`: kiểu dữ liệu, chuẩn hóa tên, slug, validation thuần.
  - `local-repository.js`: data source `localStorage` + seed.
  - `data-source.js`: chọn repository, adapter Supabase giữ chỗ.
  - `service.js`: nghiệp vụ, kiểm tra trùng, quan hệ nhiều-nhiều, kích hoạt/ngừng, đánh giá tác động.
  - `ui.js`: render và tương tác, chỉ gọi service.
- Kiểm thử: `node --test` cho domain/service/repository (không thêm dependency), và kiểm thử trình duyệt trên `/admin/danh-muc.html`.

## 7. File dự kiến

Tạo mới:
- `admin/danh-muc.html`
- `css/admin-catalog-v2.css`
- `js/admin/catalog-v2/domain.js`, `local-repository.js`, `data-source.js`, `service.js`, `ui.js`
- `tests/catalog-v2.test.js`
- `docs/audit/category-restructure/CATEGORY_MODULE_IMPLEMENTATION_REPORT.md`

Sửa: `docs/audit/category-restructure/README.md` (cập nhật tiến độ).

## 8. Không được sửa

`admin/index.html`, `admin/admin.css`, `css/admin-catalog.css`, `js/admin-app.js`, `js/admin/catalog-admin.js`, `js/admin/product-form-admin.js`, `js/products-data.js`, `js/products/*`, `routes/*`, `supabase/*`, mọi bảng và function trên database, nhánh POS.

## 9. Existing Issue phát hiện thêm

- Form Brand/Category hiện tại (`catalog-admin.js` dòng 426, 457) sinh lại slug từ tên khi sửa. Đổi tên làm đổi URL thương hiệu/danh mục. Module mới khóa slug khi sửa, chỉ mở khi người dùng chủ động bật kèm cảnh báo.
