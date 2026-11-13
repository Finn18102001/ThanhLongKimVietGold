# Phase 0 Audit: Tái cấu trúc Brand, Category, Product Type, Product trong /admin

Ngày: 13/11/2026. Nhánh `Finn/New/Category-Restructure-Future`. Chỉ đọc code và chạy `SELECT`; chưa sửa code, chưa đổi schema.

## 1. Đã có, dùng lại được

| Hạng mục | Vị trí | Hiện trạng |
|---|---|---|
| Form Product create/edit dùng chung, nằm trên danh sách | `admin/index.html` (`#product-form`), `js/admin/product-form-admin.js` | Có `formState.mode` (`create`/`edit`) và `productId` tường minh. Nút Sửa gọi `loadForEdit` điền form. Không có màn chi tiết riêng |
| Lưu Product | `js/products-data.js` `saveProduct`, `productAppToDb`, `resolveSlugForSave` | Tạo mới: slug tự sinh, tự thêm hậu tố nếu trùng. Sửa: giữ slug cũ. Không có ô nhập slug, chỉ có ô xem trước |
| Validation Product | `js/products/product-crud.js` `validateForSave` | Bắt buộc tên, Brand, Category |
| Price Row | `product-form-admin.js` | Chọn dòng giá lọc theo tên Brand. Có dòng giá thì dùng giá dòng; không có thì dùng `price_text` nhập tay |
| CRUD Brand / Category | `js/admin/catalog-admin.js` `saveBrandForm`, `saveCategoryForm` | Sub-tab trong tab Sản phẩm. Gọi Supabase trực tiếp từ UI |
| History Product | `product_change_log` + `catalog-admin.js` (`TLKVAudit.logProductSafe`) | Ghi `action`, `entity_name`, `entity_id`, `summary`, `payload` (trạng thái sau khi lưu) |
| Quy tắc slug, chuẩn hóa tên | `js/admin/catalog-v2/domain.js` (lượt trước) | Dùng lại được khi tích hợp |

## 2. Chưa có, cần bổ sung

| Hạng mục | Lý do |
|---|---|
| Product Type | Không có bảng, cột hay UI nào |
| Quan hệ Brand - Category | Không có bảng nối. `categories` không có `brand_id` |
| `products.product_type_id` | Chưa có cột |
| Chặn trùng tên Brand/Category | Không kiểm tra ở UI lẫn database; chỉ có unique trên `slug` |
| Lọc Category theo Brand trong form Product | Đang hiện tất cả Category |
| Xác nhận khi bỏ thay đổi chưa lưu ở form Product | Nút "Mục mới" reset ngay |
| Tab riêng cho Brand, Category, Product Type | Đang là sub-tab trong tab Sản phẩm |

## 3. Không khớp giữa spec và hệ thống

| Spec | Thực tế |
|---|---|
| Buy Price, Sell Price nhập tay | `products` chỉ có `price_text` (giá hoặc ghi chú hiển thị) và `price_numeric`. Không có cột giá mua/bán |
| Tags | Không có. Chỉ có 3 cờ `is_featured`, `is_best_seller`, `is_hot` (Nổi bật, Bán chạy, Hot) |
| Status và Website visibility là 2 trường | Chỉ có `is_active` (ô "Hiển thị") |
| Slug khi đổi tên xử lý theo cơ chế hiện có | Form Brand/Category hiện sinh lại slug mỗi lần sửa (`catalog-admin.js` dòng 426, 457) |

## 4. Rủi ro phát hiện

1. **Mỗi lần lưu khi sửa Product đều kích hoạt đồng bộ SKU.** `saveProduct` dùng `upsert` ghi toàn bộ cột. Trigger `trg_products_sync_pos_sku` là `AFTER UPDATE OF name, weight, price_source_product, brand_id, is_active`, mà các cột này luôn nằm trong câu lệnh, nên trigger chạy cả khi không đổi giá trị. Hàm `tlkv_sync_pos_sku_from_product` khi đó gán lại `pos_skus.sku` và có thể ghi đè `pos_skus.price_row_id` theo dòng giá dò theo tên. Đây là hành vi đang có trên production. Nếu giữ nguyên, việc chỉ đổi Category hay Product Type của sản phẩm cũng chạy lại đồng bộ SKU.
2. **Xóa cứng Brand/Category đang tồn tại trong form cũ** (`catalog-admin.js` dòng 529, 594). FK `products.brand_id ... on delete set null` cập nhật `brand_id` của sản phẩm, cũng là cột kích hoạt trigger trên. `pos_skus.brand_id` và `pos_buy_items.brand_id` cũng tham chiếu `brands`.
3. **Slug Category nằm trong URL sản phẩm** (`/sanpham/<slug danh mục>/<slug sản phẩm>`, `js/products/product-card.js` dòng 160) và slug Brand nằm trong `/thuong-hieu/<slug>`. Đổi tên kèm sinh lại slug sẽ làm hỏng các URL này.
4. **POS ghi trực tiếp vào `products`.** `pos_private.create_order_jewelry_sku` tạo sản phẩm với `brand_id`, `category_id` bất kỳ. `pos_receive_label_order_purchase` cập nhật `gold_age`. Ràng buộc Brand - Category ở cấp database sẽ làm hỏng luồng nhập hàng POS, nên chỉ kiểm tra ở tầng dữ liệu của Admin.
5. **POS đọc `categories` với `is_active = true`** (`inventory/query.ts`, `label-print/query.ts`). Ngừng dùng Category trong Admin làm nó biến mất khỏi dropdown POS ngay. Đây là hành vi hiện có, không đổi.
6. **Lọc Category theo Brand cần dữ liệu quan hệ.** Nếu bảng nối bắt đầu rỗng, form Product không chọn được Category nào cho mọi Brand.
7. **Gán Price Row khi mở Edit.** `matchPriceRowId` đoán dòng giá theo `price_source_product` khi sản phẩm chưa có `price_row_id`. Hiện có 0 sản phẩm rơi vào trường hợp này (`price_source_product` luôn được xóa khi không có dòng giá), nhưng nên chặn để đảm bảo không tự gán.

## 5. Số liệu (SELECT ngày 13/11/2026)

- `brands` 6, `categories` 20, `products` 152.
- Tên Brand trùng (chuẩn hóa khoảng trắng, không phân biệt hoa/thường): 0. Tên Category trùng: 0. Tên Product trùng: 2 cặp (không chặn theo spec).
- Unique hiện có: `brands.slug`, `categories.slug`, `products.slug` (khi khác rỗng).
- Slug Brand/Category khớp tên hiện tại: 100%. Slug Product khác tên: 33/152 (do giữ slug khi sửa tên).
- Sản phẩm thiếu Brand: 1. Thiếu Category: 4. Không có dòng giá: 56.
- Số cặp (Brand, Category) đang được sản phẩm dùng: 20.
- RLS: `brands`, `categories` ghi bằng `tlkv_is_admin()`, đọc công khai khi `is_active`.

## 6. Schema đề xuất (chưa chạy, chờ duyệt)

Chỉ thêm, không sửa hay xóa cột cũ. Không cột nào trong danh sách kích hoạt trigger SKU.

```sql
create table public.product_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_types_name_norm_key
  on public.product_types (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table public.brand_categories (
  brand_id uuid not null references public.brands(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, category_id)
);
create index brand_categories_category_idx on public.brand_categories (category_id);

alter table public.products
  add column product_type_id uuid references public.product_types(id) on delete restrict;
create index idx_products_product_type on public.products (product_type_id) where product_type_id is not null;

create unique index brands_name_norm_key
  on public.brands (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
create unique index categories_name_norm_key
  on public.categories (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
```

Kèm trigger `updated_at` cho `product_types`, RLS giống `brands` (đọc công khai khi active, ghi bằng `tlkv_is_admin()`), và grant cho `anon`/`authenticated`.

Rollback (theo thứ tự):

```sql
drop index if exists public.categories_name_norm_key;
drop index if exists public.brands_name_norm_key;
alter table public.products drop column if exists product_type_id;
drop table if exists public.brand_categories;
drop table if exists public.product_types;
```

Ảnh hưởng dữ liệu hiện tại: không bản ghi nào bị sửa. `ADD COLUMN` nullable không có default không ghi lại dòng nào, không chạy trigger. Unique index tạo được vì hiện không có tên trùng.

## 7. Thay đổi logic đề xuất (chờ duyệt)

1. Khi sửa Product, `saveProduct` chỉ gửi các cột thực sự thay đổi (so với bản ghi đọc lúc bắt đầu sửa), dùng `update` thay vì `upsert`. Chỉ đổi Category, Product Type, cờ hay ảnh thì trigger SKU không chạy. Đổi tên, định lượng, Brand, dòng giá hay trạng thái thì trigger vẫn chạy như hiện nay.
2. Giữ nguyên slug Brand/Category khi đổi tên (thay vì sinh lại), để không hỏng URL.
3. Thay xóa cứng Brand/Category bằng Ngừng dùng; chỉ cho xóa khi không có sản phẩm, SKU hay phiếu mua nào tham chiếu.
4. Ở chế độ Edit, không tự đoán Price Row; chỉ hiển thị dòng giá đang lưu.
5. History: thêm `before` và danh sách trường đổi vào `payload` của `product_change_log`.

## 8. Môi trường

Máy này không có Docker, Supabase CLI hay `psql`, nên chưa diễn tập migration trên Supabase local được.

## 9. Quyết định đã duyệt (13/11/2026)

| Chủ đề | Quyết định |
|---|---|
| Schema | Duyệt cả 4 thay đổi ở mục 6 |
| Nơi chạy | Người dùng tự chạy trên Supabase Dashboard, SQL Editor. Không dùng Docker/CLI; agent không thực thi SQL thay đổi trên production |
| Mapping Brand - Category | Theo mapping đã xác nhận ở spec mục 2.2, nhưng là bước dữ liệu riêng, kiểm tra và xác nhận sau. Không suy ra từ dữ liệu Product. Migration không chứa mapping |
| Trường không khớp spec | Giữ trường hiện có: giá nhập tay = `price_text`; Tags = 3 cờ Nổi bật/Bán chạy/Hot; Status = Website visibility = `is_active` |
| Lưu Product khi sửa | `update` chỉ gửi cột thay đổi. Chỉ coi là xong khi chứng minh trên trigger thật rằng đổi riêng Category/Product Type không chạy đồng bộ SKU và các trường khác vẫn như hiện tại |
| Brand/Category | Bảo toàn dữ liệu hiện tại, không tự đổi tên, gộp, mapping hay chuyển Product. Bỏ xóa cứng, chỉ dùng inactive |
| Edit Product | Có `price_row_id` thì hiện đúng dòng đó; không có thì để trống, không tự tìm hay gán; không đổi Price Row nếu người dùng không chủ động sửa |
| History | Thêm `before` và danh sách trường đổi (gồm Brand, Category, Product Type) vào `payload`; chưa ghi lịch sử cho Brand/Category/Product Type |
| Trang `/admin/danh-muc.html` | Dùng lại quy tắc trong `/admin`, sau đó xóa trang thử nghiệm và repository mock |

## 10. Audit bổ sung trước migration (SELECT, 13/11/2026)

**Schema thực tế**

| Bảng | Cột |
|---|---|
| `brands` | `id uuid` PK default `uuid_generate_v4()`; `name text` not null; `slug text` not null; `description text`; `logo_url text`; `is_active boolean` not null default true; `sort_order int` not null default 0; `created_at`, `updated_at timestamptz` not null default now() |
| `categories` | `id uuid` PK; `name text` not null; `slug text` not null; `parent_id uuid`; `is_active boolean` not null default true; `sort_order int` not null default 0; `created_at`, `updated_at` |
| `products` | `id text` PK; `sort_order int` not null default 0; `name text` not null; `category text` not null default ''; `price_text text` not null default ''; `image text` not null default ''; `updated_at`; `brand_id uuid`; `category_id uuid`; `slug text`; `is_featured`, `is_best_seller`, `is_hot`, `is_active boolean` not null; `price_numeric numeric`; `weight numeric`; `price_source_product text`; `price_row_id text`; `price_source text` (cột sinh tự động); `gold_age numeric` |

**Tên trùng** theo quy tắc `lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC))`: Brand 0/6, Category 0/20.

**Foreign key liên quan**

| Constraint | Định nghĩa |
|---|---|
| `products_brand_id_fkey` | `products.brand_id → brands.id ON DELETE SET NULL` |
| `products_category_id_fkey` | `products.category_id → categories.id ON DELETE SET NULL` |
| `products_price_row_id_fkey` | `products.price_row_id → gold_price_rows.id ON DELETE SET NULL` |
| `pos_skus_brand_id_fkey` | `pos_skus.brand_id → brands.id ON DELETE SET NULL` |
| `pos_buy_items_brand_id_fkey` | `pos_buy_items.brand_id → brands.id ON DELETE SET NULL` |
| `pos_skus_catalog_product_id_fkey` | `pos_skus.catalog_product_id → products.id ON DELETE SET NULL` |
| `product_images_product_id_fkey` | `product_images.product_id → products.id ON DELETE CASCADE` |
| `categories_parent_id_fkey` | `categories.parent_id → categories.id ON DELETE SET NULL` |

**Index và constraint liên quan**

- `brands`: `brands_pkey`, `brands_slug_key` (unique), `idx_brands_active_sort`.
- `categories`: `categories_pkey`, `categories_slug_key` (unique), `idx_categories_active_sort`, `idx_categories_parent`, check `categories_no_self_parent`.
- `products`: `products_pkey`, `idx_products_slug_unique` (unique khi slug khác rỗng), `idx_products_brand_active_sort`, `idx_products_category_active`, `idx_products_flags_homepage`, `idx_products_price_numeric`, `idx_products_price_row_id`, `idx_products_price_source_product`, `idx_products_price_source_weight`, check `products_gold_age_range`.

**Điều kiện kỹ thuật**

- `normalize(text, text)`, `lower(text)` là immutable nên dùng được trong index.
- `uuid_generate_v4()` nằm ở schema `extensions`; migration dùng `gen_random_uuid()` (có sẵn trong PostgreSQL 17) để không phụ thuộc `search_path`.
- `tlkv_is_admin()` và `tlkv_set_updated_at()` có sẵn. Tên tất cả đối tượng mới chưa bị dùng.
- `products` nằm trong publication realtime; cột mới tự đi theo, không cần cấu hình.
- `pos_skus` không có `updated_at`, nên phép chứng minh trigger đo `xmin` của dòng `pos_skus`.

## 11. Gói migration

Thư mục `supabase/catalog-restructure/`. Không file nào chứa thông tin đăng nhập.

| Thứ tự | File | Loại | Khi nào chạy |
|---|---|---|---|
| 1 | `01_preflight_readonly.sql` | Chỉ đọc | Ngay trước migration. Mục 1-2 phải là 0, mục 3-6 "chua co", 7-8 "co"; nếu không thì dừng. Lưu checksum mục 13-16 |
| 2 | `02_migration.sql` | DDL trong 1 transaction | Sau khi 01 đạt. Có khối kiểm tra tự dừng nếu tên trùng hoặc đối tượng đã tồn tại |
| 3 | `03_verify_readonly.sql` | Chỉ đọc | Ngay sau 02. Checksum mục 13-16 phải giống 01 |
| 4 | `04_trigger_proof_autorollback.sql` | UPDATE gán lại giá trị cũ trong khối tự hoàn tác | Sau 02, khi được duyệt. Chứng minh đổi riêng `category_id`/`product_type_id` không chạy đồng bộ SKU, đổi `name` thì có |
| Rollback | `99_rollback.sql` | DDL trong 1 transaction | Chỉ khi cần hoàn tác; gỡ code dùng bảng mới trước |

Chạy thử `01_preflight_readonly.sql` qua kết nối chỉ đọc lúc 13/11/2026: tất cả mục đạt điều kiện; 6 brands, 20 categories, 152 products, 317 pos_skus. Checksum tại thời điểm đó: brands `14ad3e66…`, categories `465e719a…`, products `1d5ac336…`, pos_skus `d9d6bc69…` (sẽ khác nếu dữ liệu đổi trước lúc bạn chạy; so 01 và 03 trong cùng một lần chạy).

`02_migration.sql` chưa được chạy ở đâu (không có môi trường thử). Các biểu thức index đã được chạy thử bằng `SELECT` trên dữ liệu thật. Rà tĩnh: không có `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `COPY`; từ khóa `update` duy nhất là khai báo trigger `before update on public.product_types`.
