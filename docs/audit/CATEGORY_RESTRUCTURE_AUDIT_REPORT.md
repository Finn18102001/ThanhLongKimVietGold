# Audit Report — Tái cấu trúc Danh mục (Implementation Gate)

> **Đã bị thay thế (12/11/2026).** Bộ tài liệu audit mới nằm ở `docs/audit/category-restructure/`; đọc `README.md` trong thư mục đó trước.
>
> Các chỗ cần đọc lại trong báo cáo này:
> - Ghi "không có source POS trong repo" là sai. Source POS nằm ở nhánh `origin/Finn/New/POS-Future`.
> - Các mục ghi "Completed" chưa được truy vết đầy đủ theo yêu cầu mới và sẽ được làm lại.
> - Phần mapping Category thuộc Brand đã có quyết định mới, xem mục 6 của `README.md`.

Ngày tạo: 2026-11-12  
Nguồn bằng chứng: **source code trong repo này** + **Supabase project** `WebsiteThangLongKimViet` (ref `yrdqnmsvwovwhepmhigv`) + SQL introspection.

> Quy tắc: Đây là **báo cáo Audit**. Không thay đổi code / schema / data trong báo cáo này.

---

## 0) Executive Summary

### Trạng thái các hạng mục Gate

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| 1) Inventory mọi nơi dùng `brand_id`/`category_id`/tương đương | **Completed** | Bao gồm code + DB schema + triggers + một phần functions POS |
| 2) Truy vết CRUD UI → API/Query → DB | **Completed (Website Admin + Website Catalog)** / **Unable to Verify (POS UI + Admin purchase/sale apps)** | Repo hiện chỉ có website/admin static; không có source POS/purchase/sale ngoài các DB functions |
| 3) Truy vết luồng xác định & lấy dòng giá Admin → POS | **Completed (DB + Website)** / **Unable to Verify (POS UI call-sites)** | DB đã xác minh POS pricing phụ thuộc `pos_skus.price_row_id → gold_price_rows` |
| 4) Xác định consumer/side-effect | **Completed (DB + Website)** / **Unable to Verify (POS UI)** | DB consumer đủ; app-side POS/purchase/sale không có source để map end-to-end |
| 5) Thống kê bất thường dữ liệu & đề xuất mapping | **Completed** / **Pending User Confirmation (Category→Brand mapping)** | Mapping danh mục thuộc thương hiệu nào: cần bạn xác nhận |
| 6) Migration + Verification + Rollback plan | **Completed (Draft, mapping-dependent)** | Kế hoạch cụ thể nhưng các bước “fill mapping” = Pending User Confirmation |
| 7) Regression Checklist | **Completed (Draft)** | Cần QA chạy đầy đủ trước/sau khi implement |

---

## 1) Inventory — Tất cả nơi sử dụng `brand_id`, `category_id` và tương đương

**Status:** Completed

### 1.1. Database schema (Supabase — public schema)

**Core catalog tables**
- `public.products`
  - `brand_id uuid NULL` (FK → `public.brands.id`)
  - `category_id uuid NULL` (FK → `public.categories.id`)
  - `category text NOT NULL default ''` (**legacy category text** — vẫn đang populated)
  - `price_row_id text NULL` (FK → `public.gold_price_rows.id`)
  - `price_source_product text NULL` (**text key** dùng cho derived pricing lookup)
  - `weight numeric NULL`, `is_active boolean`, `slug text`, …
- `public.brands` (`id`, `name`, `slug`, `is_active`, `sort_order`, timestamps)
- `public.categories`
  - **Không có** `brand_id` (hiện tại danh mục **không thuộc thương hiệu**)
  - Có `parent_id uuid NULL` (self-FK: `categories_parent_id_fkey`)
- `public.gold_price_rows` (`id`, `brand` text, `product` text, `metal` text, `buy/sell`, `is_visible_on_website` …)
- `public.product_images` (`product_id` FK → `products.id`)

**Schema/migration SQL trong repo (evidence bổ sung)**
- `supabase/products-catalog-schema.sql`
  - Adds `products.brand_id` (FK → `brands.id`) và `products.category_id` (FK → `categories.id`)
  - Có “best-effort backfill” `category_id` từ `products.category` (legacy text)
  - Có “default brand for orphan products” (set brand = `thang-long-kim-viet`)
- `supabase/migrations/20260907010000_products_price_row_source.sql`: add `products.price_row_id` + generated `products.price_source`
- `supabase/migrations/20261013120000_products_weight_five_decimals.sql`: đổi type `products.weight`, cập nhật trigger sync POS và heuristic mapping `price_row_id` từ `gold_price_rows`

**POS tables liên quan (đang chạy thật trên DB)**
- `public.pos_skus`
  - `brand_id uuid NULL` (FK → `brands.id`)
  - `catalog_product_id text NULL` (FK → `products.id`)
  - `price_row_id text NULL` (FK → `gold_price_rows.id`)
  - `weight_chi`, `board_unit_chi`, `labor_fee_dong`, `is_market_gold`, `is_order_jewelry`, …
- `public.pos_buy_items.brand_id` (FK → `brands.id`) — brand snapshot theo line
- `public.pos_categories` + `public.pos_category_skus` (**POS category system riêng**, hiện đang 0 rows)

**Bằng chứng**
- Columns introspection (information_schema) và FK list (information_schema) được lấy từ Supabase MCP `execute_sql`.

### 1.2. Database triggers (tác động gián tiếp)

Các trigger **đang tồn tại**:
- `products.trg_products_sync_pos_sku` → gọi function `public.tlkv_products_sync_pos_sku()`  
  - Trigger fires **AFTER INSERT OR UPDATE OF** `name, weight, price_source_product, brand_id, is_active`  
  - **Không** bao gồm `category_id` → thay đổi category hiện tại **không sync** xuống `pos_skus` (trừ khi POS đọc category từ nơi khác).
- `gold_price_rows.gold_price_rows_bump_version` → `public.tlkv_bump_gold_price_version()` (bump version để client invalidate cache/realtime)
- `brands.trg_brands_updated_at` / `categories.trg_categories_updated_at` → `public.tlkv_set_updated_at()`

**Bằng chứng**
- Trigger list từ query `pg_trigger` (Supabase MCP).

### 1.3. Database functions / RPC (consumer DB-side)

Các function/RPC có liên quan trực tiếp tới `brand_id` / `category` / `price_row_id`:
- `public.tlkv_products_sync_pos_sku()` → gọi `public.tlkv_sync_pos_sku_from_product(new)` (sync sản phẩm sang POS SKU)
- `public.tlkv_sync_pos_sku_from_product(products)`:
  - update/insert `pos_skus` với `catalog_product_id`, `brand_id`, `price_row_id`, `weight_chi`, `board_unit_chi`
  - **lookup `gold_price_rows` bằng text match** theo `price_source_product` hoặc `product name` (có heuristic Vàng Rồng)
- `pos_private.compute_gold_unit(pos_skus)`:
  - Nếu `is_market_gold=true`: map dòng giá thị trường qua `pos_private.market_gold_price_row()`
  - Nếu không market: **bắt buộc** `pos_skus.price_row_id` != null, đọc `gold_price_rows.sell`
- `pos_private.complete_sale(...)`:
  - load SKU → gọi `pos_private.compute_gold_unit(v_sku)`
  - có call `pos_private.assert_price_within_or_exception(...)` (liên quan `pos_price_exceptions`)
- POS categories (riêng): `public.pos_list_categories()`, `public.pos_create_category(...)`, `public.pos_update_category(...)`, `public.pos_delete_category(...)`

**Bằng chứng**
- Nguồn function lấy từ `pg_proc.prosrc` (Supabase MCP).

### 1.4. Source code (Website/Admin trong repo)

**Admin (/admin)**
- `admin/index.html`: form sản phẩm có `pf-brand-id`, `pf-category-id`, list filter `catalog-admin-filter-brand` / `catalog-admin-filter-category`
- `js/admin/catalog-admin.js`: CRUD `brands`/`categories` và list/filter sản phẩm admin
- `js/admin/product-form-admin.js`: state & payload đọc `brandId/categoryId/priceRowId`
- `js/products/product-crud.js`: validation & error mapping cho `brandId/categoryId/priceRowId` (single source of CRUD rules)
- `js/products-data.js`: CRUD `products` + `product_images` (Supabase direct)
- `js/gold-data.js` + `js/admin-app.js`: CRUD `gold_meta` + `gold_price_rows` (Supabase direct)
- `js/admin/gold-inventory-capital.js`: admin tính % vốn Vàng/Bạc, query `pos_skus` + `gold_price_rows(metal)` (consumer gián tiếp của mapping giá/dòng giá)

**Website catalog**
- `js/products/catalog-api.js`: query Supabase `products` filter theo `brand_id/category_id`, resolve slug→id
- `js/products/catalog-archive.js`: UI filter đọc `brandSlug/categorySlug`, gọi `TLKVCatalogApi.fetchProductsPage(...)`
- `js/products/catalog-filters.js`: parse/write URL params `brand` / `cat`
- `js/products/brand-page.js`: load brand theo `slug`
- `js/products/product-price-engine.js`: derived pricing dựa trên `products.price_row_id`/`price_source_product` + `gold_price_rows`

**News (ngoài scope catalog nhưng dùng `category_id`)**
- `public.news.category_id` và module `js/news/news-api.js`, `js/admin/news-admin.js` xử lý `news_categories`

**Express routes**
- `routes/api-public.js`: endpoint `/api/public/brands` đọc `brands` (RLS/anon key)
- `routes/api.js`: debug `/api/health/supabase-products`

**Build artifacts (không dùng làm evidence logic)**
- Có thư mục `.next/` chứa các chunk SSR có string `brand_id/category_id/pos_*`. Đây là **artifact** (không có source TS/JS tương ứng trong repo) → **Unable to Verify** nếu coi là module POS/Purchase/Sale.

---

## 2) CRUD Flow Audit — UI → API/Query → Database

**Status:** Completed (Website/Admin) / Unable to Verify (POS UI + purchase/sale apps not in repo)

> Ghi chú quan trọng: Website/Admin trong repo này chủ yếu **call Supabase trực tiếp từ trình duyệt** (supabase-js). Express chỉ phục vụ static + một số API phụ (cache public brands/news, upload ảnh).

### 2.1. Brands CRUD (Website Admin)

- **UI**
  - `/admin` → tab `Sản phẩm` → subtab `Thương hiệu`
  - Form `#brand-form`, list `#admin-brand-rows`
- **Client query**
  - Read/list: `sb.from("brands").select(...).order(...)`
  - Create/update: `sb.from("brands").insert(...)` / `.update(...).eq("id", id)`
  - Delete: `sb.from("brands").delete().eq("id", id)`
- **DB**
  - Table: `public.brands`
  - Trigger: `trg_brands_updated_at`
- **Cache invalidation**
  - Event: `tlkv:brands-changed` → `TLKVCatalogApi.clearCatalogSessionCaches()` (website)

### 2.2. Categories CRUD (Website Admin)

Tương tự Brands:
- **UI**: `/admin` → tab `Sản phẩm` → subtab `Danh mục`
- **DB**: `public.categories` + trigger `trg_categories_updated_at`
- **Lưu ý schema**: categories hiện **không có brand_id**; có `parent_id` reserved.

### 2.3. Products CRUD (Website Admin + Website Catalog)

**Admin**
- **UI**
  - `/admin` → tab `Sản phẩm`
  - Form `#product-form` (`pf-brand-id`, `pf-category-id`, `pf-price-row-id`, `pf-weight`, `pf-priceText`…)
  - List table `#admin-product-rows`
- **Client flow**
  - Form build payload: `js/admin/product-form-admin.js` → gọi `TLKVProducts.saveProduct(...)`
  - List: `TLKVProducts.getProducts()` trong `js/admin/catalog-admin.js`

**Data layer (shared website/admin)**
- `js/products-data.js`
  - `getProducts()` → `fetchProductsFromSupabase(sb)` → `sb.from("products").select(PRODUCT_ADMIN_SELECT)`
  - `saveProduct(item)` → `sb.from("products").upsert(row, { onConflict: "id" })`
  - `deleteProductById(id)` → `sb.from("products").delete().eq("id", id)`
  - Images: `product_images` insert/update

**DB side effects**
- Trigger: `products.trg_products_sync_pos_sku` → sync sang `public.pos_skus` (critical for POS)

### 2.4. Gold price rows CRUD (Website Admin + website derived pricing)

- **UI**: `/admin` (tab Giá vàng)
- **Client flow**: `js/admin-app.js` gọi `TLKVGold.getGoldTable()` và `TLKVGold.saveToStorage()` / `saveGoldMetaOnly()`
- **Data layer**: `js/gold-data.js`
  - Read: `sb.from("gold_meta")` + `sb.from("gold_price_rows")`
  - Write: upsert `gold_meta` + upsert/delete `gold_price_rows`
- **DB side effects**
  - Trigger statement-level: `gold_price_rows_bump_version` → bump `gold_meta.price_version`
- **Client side effects**
  - Events: `tlkv:gold-rows-updated`, `tlkv:gold-table-changed` → website derived pricing patch & admin refresh

### 2.5. POS categories CRUD (DB exists, UI source missing)

- **DB objects**
  - Tables: `public.pos_categories`, `public.pos_category_skus`
  - RPCs: `public.pos_list_categories()`, `public.pos_create_category(...)`, `public.pos_update_category(...)`, `public.pos_delete_category(...)`
- **UI / call-sites**
  - **Unable to Verify**: source POS UI không nằm trong repo này.

---

## 3) Price Mapping Audit — Admin → (DB) → Website/POS

**Status:** Completed (DB + Website) / Unable to Verify (POS UI call-sites)

### 3.1. Website derived pricing (Sản phẩm hiển thị giá từ bảng giá)

**Inputs**
- `public.gold_price_rows` (id, product, buy, sell, metal, …)
- `public.products`:
  - `price_row_id` (FK → gold_price_rows.id)
  - `price_source_product` (text lookup key = gold_price_rows.product)
  - `weight` (chi)
  - `price_text` (manual fallback)

**Engine**
- `js/products/product-price-engine.js`:
  - `resolveGoldRowLookupKey(...)` maps `price_source_product` / product name → gold row key (special cases: Kim Gia Bảo, Bông Lúa, Hạt Gạo, Nhẫn Tròn, Vàng Rồng)
  - `deriveProductPrice(...)` tính giá theo lượng (board unit) và side (buy/sell)
  - Nguyên tắc: **không lưu giá tính toán vào DB**, derived price patch theo event `tlkv:gold-rows-updated`

**Consumers**
- `js/products/catalog-archive.js`: gọi `applyDerivedPricesToItems(items)` và patch DOM khi `tlkv:gold-rows-updated`
- `js/admin/product-form-admin.js`: hiển thị “Nguồn giá: Bảng giá liên kết” khi chọn `pf-price-row-id`

### 3.2. POS pricing (bán hàng / tính giá theo SKU)

**POS SKU linkage**
- `public.pos_skus.price_row_id` (FK → `gold_price_rows.id`)
- `public.pos_skus.catalog_product_id` (FK → `products.id`)
- Sync từ products:
  - `products.trg_products_sync_pos_sku` → `public.tlkv_products_sync_pos_sku()` → `public.tlkv_sync_pos_sku_from_product(products)`
  - Lookup `gold_price_rows` bằng **text match** theo `price_source_product` hoặc `product name` (heuristic)

**Pricing computation**
- `pos_private.compute_gold_unit(pos_skus)`:
  - Non-market gold: **require** `pos_skus.price_row_id` và `gold_price_rows.sell > 0`
  - Market gold: map `gold_price_rows` “thị trường” theo `purity` class
  - Output: `gold_unit_dong = sell * weight_chi / board_unit_chi`
- `pos_private.compute_unit_price(pos_skus)`:
  - `unit_price_dong = gold_unit_dong + labor_fee_dong + stone_price_dong`
- `pos_private.complete_sale(...)`:
  - luôn gọi `compute_gold_unit(v_sku)` cho line bán
  - có cơ chế kiểm tra exception: `assert_price_within_or_exception(...)` + bảng `pos_price_exceptions`

**Hàm ý quan trọng đối với round tái cấu trúc danh mục**
- Dù thay đổi danh mục, **risk lớn nhất** là làm sai/mất mapping `price_row_id` hoặc làm thay đổi/đứt link `pos_skus.price_row_id`.
- `gold_price_rows.is_visible_on_website` là cờ UI website; **POS pricing không filter theo cờ này** → không được repurpose làm điều kiện POS.

**POS UI call-sites**
- **Pending (POS UI)**: repo hiện không chứa mã front-end POS, nên chưa thể truy vết “UI → RPC” hoàn chỉnh; DB-side đã xác minh.

---

## 4) Dependency & Side-effect Audit (Consumer Matrix)

**Status:** Completed (DB + Website) / Unable to Verify (POS app-side consumers)

### 4.1. Website public
- Trang danh sách sản phẩm: `/sanpham/*` (filters `brandSlug`, `categorySlug`)
  - Data: `TLKVCatalogApi.fetchProductsPage()` filter `brand_id/category_id`
- Trang thương hiệu: `/thuong-hieu/:slug` (lookup brands.slug)
- Trang chi tiết sản phẩm: `/san-pham/chi-tiet.html` (categorySlug + productSlug routing)
- Derived pricing: phụ thuộc `gold_price_rows` + events `tlkv:gold-rows-updated`

### 4.2. Website /admin
- CRUD products/brands/categories (Supabase direct)
- CRUD gold_price_rows & gold_meta (Supabase direct)
- Upload ảnh sản phẩm: `/api/products/upload-image` (Express) → Supabase Storage
- Lịch sử thay đổi: `product_change_log`, `gold_price_change_log` (consumer UI admin)

### 4.3. POS (DB confirmed; UI unknown in repo)
- `pos_skus` liên kết `products` và `gold_price_rows`
- Bán hàng: `pos_private.complete_sale` uses SKU pricing
- Mua hàng / nhập: `pos_private.complete_buy` (liên quan `pos_price_exceptions`, SKU, brand_id trong line)
- Kho / kiểm kê / in tem / báo cáo: nhiều bảng phụ thuộc `sku_id` → join về `pos_skus.brand_id/price_row_id`
- POS categories: hệ thống riêng (`pos_categories`, `pos_category_skus`) — hiện đang 0 rows nhưng RPC đã có

---

## 5) Data Quality Audit — bất thường & đề xuất mapping

**Status:** Completed / Pending User Confirmation (Category→Brand mapping)

### 5.1. Thống kê nhanh (DB current)

**Products (147 rows)**
- Missing `brand_id`: **1**
- Missing `category_id`: **3** (trong đó 2 dòng là test/inactive)
- Legacy `category` text populated: **145**
- Missing `price_row_id`: **51**
- Has `price_source_product`: **95**
- Inactive products: **2**

**POS SKUs (311 rows)**
- Linked to products (`catalog_product_id` not null): **147** (khớp đúng số products)
- Orphan `catalog_product_id`: **0**
- Missing `price_row_id`: **211**
  - market gold: **122**
  - non-market: **89**
  - active & non-market & missing price row: **có tồn tại** (nguy cơ blocker)

### 5.2. Bất thường cần xử lý trước khi enforce “Category belongs to Brand”

#### A) Product thiếu brand_id (1 row)
- `TRANG SỨC VÀNG TÂY 10K` có `category_id = vang-10k` nhưng `brand_id = NULL`
- **Đề xuất mapping**: `Pending User Confirmation` (chọn brand phù hợp hoặc tạo brand mới)

#### B) Product thiếu category_id (3 rows; 1 active)
- Active: `Miếng Vàng Rồng Thăng Long BTMC 10 chỉ` có legacy category text `Vàng Miếng` → slug guess `vang-mieng` match được category hiện có.
- 2 rows test/inactive có category rỗng.
- **Đề xuất mapping**: 1 active row có candidate category rõ; vẫn `Pending User Confirmation` nếu bạn muốn strict.

#### C) Category đang chứa sản phẩm từ **nhiều brand** (conflict với target model 1 category ↔ 1 brand)
Các category sau có `brand_bucket_count > 1` (theo join products hiện tại):
- `qua-tang-24k`: tổng 42 sản phẩm, 3 brand buckets
- `vang-24k`: tổng 30, 2 brand buckets
- `nhan-tron`: tổng 28, 3 brand buckets
- `grif-kim-gia-bao-24k`: tổng 10, 2 brand buckets

**Ý nghĩa**: nếu target model bắt buộc “category thuộc đúng 1 brand” thì cần 1 trong các hướng:
- Split category theo brand (tạo category mới, migrate sản phẩm)
- Hoặc đổi model (ví dụ pivot table Brand↔Category)

→ **Pending User Confirmation** (đây là phần nghiệp vụ bạn nói sẽ cung cấp).

#### D) POS SKU active non-market thiếu `price_row_id` (data-risk)
Audit cho thấy tồn tại nhiều SKU active, non-market, `price_row_id = NULL` (ví dụ nhóm “TRANH … MẠ VÀNG 24K”, một số SKU bạc…).

**Rủi ro**: `pos_private.compute_gold_unit()` sẽ raise exception “SKU chưa gắn bảng giá” khi bán (non-market).

→ Đây là **pre-existing data issue** cần đưa vào checklist trước khi rollout migration, vì round category restructure có thể kích hoạt re-sync / re-check.

### 5.3. Duplicates
Không phát hiện duplicate theo `slug` hoặc `name_norm` trong `brands` / `categories` hiện tại (theo query audit).

---

## 6) Migration / Verification / Rollback Plan (draft)

**Status:** Completed (Draft, mapping-dependent)

> Lưu ý: bước “Category thuộc Brand nào” là **Pending User Confirmation**.

### 6.1. Migration strategy (Backup → Add → Migrate → Verify → Switch → Cleanup)

**Backup**
- Snapshot schema + data các bảng: `brands`, `categories`, `products`, `product_images`, `gold_price_rows`, `pos_skus`, các bảng POS liên quan sale/buy/inventory/reporting.
- Đã thấy tồn tại schema backup `tlkv_backup_20261110` (lưu ý RLS/no policy warnings là expected cho backup).

**Add (non-breaking)**
Option A (theo target model): thêm `categories.brand_id uuid NULL references brands(id)`
- Thêm index `categories(brand_id, is_active, sort_order, name)`
- Chưa set NOT NULL trong giai đoạn đầu.

Option B (nếu category cần dùng cho nhiều brand): tạo pivot `brand_categories(brand_id, category_id)` + migrate.

**Migrate (data)**
- Fill mapping `categories.brand_id` (hoặc pivot) theo bảng mapping bạn xác nhận.
- Với các category conflict (đa brand): split hoặc điều chỉnh theo hướng bạn chọn.
- Normalize products:
  - Đảm bảo mọi product có `brand_id` + `category_id`
  - Đảm bảo category chosen hợp lệ theo mapping mới (brand/category consistency)

**Verify (pre-switch)**
Chạy SQL verification:
- No product missing `brand_id` / `category_id`
- Không có product trỏ tới category không thuộc brand
- Không có POS SKU linked-to-product mà brand_id mismatch bất thường
- `pos_private.compute_gold_unit` pass cho set SKU “saleable” (đặc biệt non-market active)
- Website catalog filters (brand/category) trả kết quả đúng

**Switch (consumer)**
- Admin:
  - Khi chọn brand, dropdown category filter theo brand (UI) + validation không cho lưu sai
- Website:
  - Query categories list theo brand (nếu UI cần)
- POS:
  - Chỉ switch nếu POS có consumer categories; hiện DB có `pos_categories` riêng → cần quyết định có migrate hay giữ độc lập.

**Cleanup (post-stable)**
- Không cleanup `products.category` legacy text cho đến khi chắc chắn không còn consumer.

### 6.2. Rollback plan
- Rollback nhanh theo tầng:
  - UI rollback: tắt logic filter/validation mới (giữ DB additive)
  - DB rollback: giữ cột mới nhưng ngừng dùng; hoặc restore backup schema/data (tùy mức độ thay đổi)
- Nguyên tắc: additive-first, không drop constraint/column cũ trước khi ổn định.

---

## 7) Regression Checklist (draft — bắt buộc chạy trước/sau)

**Status:** Completed (Draft)

### 7.1. Website public
- `/sanpham/*`: filter brand/category hoạt động; pagination; query q-search client filter
- `/thuong-hieu/:slug`: load brand + products ok
- `/sanpham/danh-muc/:slug`: load category ok
- Derived pricing: update giá khi gold rows đổi (event `tlkv:gold-rows-updated`)
- Sản phẩm manual price vs linked price hiển thị đúng

### 7.2. Admin (/admin)
- CRUD brands/categories/products: create/update/delete; sort/order
- Product form: chọn brand → chọn category; chọn price row; save; edit; delete
- Upload ảnh: `/api/products/upload-image` ok
- Bảng giá: thêm/sửa/xóa gold rows, meta; các dòng hidden website không ảnh hưởng POS

### 7.3. POS (DB-level + UI if available)
- Bán hàng (SALE/PREORDER/DEPOSIT): tính giá unit = gold_unit + labor + stone; không lỗi “SKU chưa gắn bảng giá” cho SKU saleable
- Mua hàng / nhập kho: buy flows không bị sai brand mapping
- Kho / kiểm kê: stock count, adjust, receive/outbound
- In tem: label mint/print flows
- Báo cáo/Excel: export theo brand vẫn đúng
- POS categories (nếu bật): list/create/update/delete + assign SKU

---

## Pending User Confirmation (bắt buộc bạn xác nhận)

1) **Mapping Category → Brand** (cho mọi category, đặc biệt các category đang cross-brand: `nhan-tron`, `vang-24k`, `qua-tang-24k`, `grif-kim-gia-bao-24k`).  
2) Quyết định mô hình: **Category belongs to one Brand** (split) hay **many-to-many** (pivot).  
3) Quy tắc xử lý các sản phẩm thiếu `brand_id` / thiếu `category_id`.

---

## Unable to Verify (giới hạn hiện tại)

- POS UI source / call-sites (frontend) không có trong repo workspace này → chưa thể truy vết đầy đủ UI → RPC cho POS (chỉ audit được DB-side functions/tables).

---

## Appendix — SQL queries used (reference)

### A1) Category đang có nhiều brand buckets
```sql
with x as (
  select c.id as category_id, c.slug as category_slug, c.name as category_name,
         p.brand_id, b.name as brand_name,
         count(*) as product_count
  from public.categories c
  join public.products p on p.category_id = c.id
  left join public.brands b on b.id = p.brand_id
  group by c.id, c.slug, c.name, p.brand_id, b.name
)
select category_slug,
       sum(product_count) as total_products,
       count(*) filter (where brand_id is not null) as brand_bucket_count
from x
group by category_slug
having count(*) filter (where brand_id is not null) > 1;
```

### A2) Data quality counts (products / pos_skus)
```sql
select
  (select count(*) from public.products) as products_total,
  (select count(*) from public.products where brand_id is null) as products_missing_brand_id,
  (select count(*) from public.products where category_id is null) as products_missing_category_id,
  (select count(*) from public.products where price_row_id is null) as products_missing_price_row_id,
  (select count(*) from public.pos_skus) as pos_skus_total,
  (select count(*) from public.pos_skus where price_row_id is null) as pos_skus_missing_price_row_id;
```

