# Giai đoạn 1 — Rà soát Database (hiện trạng trước POS big update)

> Rà soát: 2026-11-10 trên Supabase production `yrdqnmsvwovwhepmhigv` (Postgres 17), **chỉ đọc**.  
> Backup đối chiếu: schema `tlkv_backup_20261110` — xem [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md).  
> Project dùng **chung** cho website (`js/*`, anon) và POS (`src/*`, authenticated). Mọi đổi schema phải giữ tương thích cho website.

## 1. Tổng quan dữ liệu

| Nhóm | Bảng | Số dòng |
|------|------|---------|
| Catalog website | `products` / `categories` / `brands` / `product_images` | 145 / 19 / 6 / 48 |
| Bảng giá | `gold_price_rows` / `gold_meta` / `gold_price_change_log` | 21 / 1 / ~5.3k |
| Mã hàng POS | `pos_skus` | 303 (182 active, 118 vàng thị trường `MG-*`, 1 vàng đặt) |
| Danh mục POS | `pos_categories` / `pos_category_skus` | **0 / 0** |
| Tồn kho | `pos_inventory_stock` / `pos_inventory_transactions` | 303 / ~5.0k (0 dòng tồn âm) |
| Bán | `pos_sales` / `pos_sale_items` / `pos_invoices` | ~3.1k / ~3.5k / ~3.1k |
| Mua vào | `pos_buys` / `pos_buy_items` | 430 / ~580 |
| Nhập NCC | `pos_purchase_receipts` / `pos_purchase_items` | ~90 / ~96 |
| Tem | `pos_label_pieces` / `pos_label_print_log` | ~580 / ~690 |

Function: 160 trong `public` (wrapper RPC) + 92 trong `pos_private` (logic). 17 trigger. Realtime publish: `gold_meta`, `gold_price_rows`, `products`.

## 2. Phát hiện theo hạng mục

### 2.1 Sản phẩm / mã hàng

- **2 lớp sản phẩm:** `products` (website, `id text`) → trigger `trg_products_sync_pos_sku` (`tlkv_products_sync_pos_sku` → `tlkv_sync_pos_sku_from_product`) sinh/cập nhật `pos_skus` (`catalog_product_id`). POS bán theo `pos_skus`.
- CRUD sản phẩm hiện nằm ở **admin website** (`js/admin/catalog-admin.js`); module POS `src/modules/product` chỉ là placeholder.
- `products.category` (text cũ) **song song** với `products.category_id` (FK) → POS đang đọc text `category` để nhóm (`pos/query.ts` → `browseGroupFromProduct`).
- `products.price_source`: `LINKED_PRICE` 95 · `MANUAL` 43 · `null` 7.
- `pos_skus`: 204/303 không có `price_row_id`, 158 không gắn `products`, 32 không có `brand_id`.

### 2.2 Danh mục

- `categories` **đã hỗ trợ cây** (`parent_id` FK tự tham chiếu, `ON DELETE SET NULL`, check không tự trỏ) nhưng 19 danh mục đều là gốc (độ sâu 1).
- Tên đang trộn loại vàng + nhóm hàng: `VÀNG 24K`, `V24K NHẪN`, `V24K DÂY CHUYỀN`, `VÀNG 10K LẮC TAY`, `BẠC TRANG SỨC`… → cần mapping sang cây + thuộc tính loại vàng.
- `pos_categories` (phẳng) + 5 RPC `pos_*_category` + module `src/modules/category` **không có dữ liệu** → 2 hệ danh mục trùng chức năng.

### 2.3 Thương hiệu

- `brands` 6 dòng (FK từ `products`, `pos_skus`, `pos_buy_items`).
- `gold_price_rows.brand` là **text tự do in hoa** (`BẢO TÍN MINH CHÂU`, `VÀNG THỊ TRƯỜNG`, `SJC`, `Bạc`) — không FK tới `brands`.

### 2.4 Bảng giá vàng / bạc

- `gold_price_rows`: `id text`, `buy`/`sell` là `numeric` **không scale** (thực tế là đồng nguyên), `metal ∈ {gold, silver}` (1 dòng bạc), `is_visible_on_website`, `previous_buy/sell`.
- **Hàm lượng là text tự do:** `999,9` · `99,9` · `99.99` · `99.9` · `9999` · `999` · `99` · `9` · `10K` · `24K` · rỗng.
- Dòng bất thường: `TRANG SỨC V10K` buy 6 000 000 > sell 5 022 000; `VTT 9/99/999` giá 0; `CÔNG CHẾ TÁC` là tiền công nhưng nằm trong bảng giá; `SJC` rỗng.
- **Cơ chế cập nhật:** admin website `js/gold-data.js` gọi thẳng `upsert` + `delete` `gold_price_rows` từ client (RLS admin) → trigger `tlkv_bump_gold_price_version` tăng `gold_meta.price_version` → Realtime đẩy website. Log ở `gold_price_change_log`. Không có bảng lịch sử giá theo thời điểm hiệu lực.
- **Chưa có:** master hàm lượng, hệ số quy đổi, liên kết "% so với giá gốc".

### 2.5 Công thức giá bán hiện tại

`pos_private.compute_unit_price(pos_skus)`:

```text
vàng thị trường có last_cost_dong > 0 → unit = last_cost_dong
còn lại                               → unit = round(sell × weight_chi / board_unit_chi) + labor_fee_dong
```

Frontend `src/modules/pos/query.ts` lặp lại công thức để hiển thị (backend vẫn là nguồn quyết định khi `pos_complete_sale`). Dòng bán lưu snapshot: `unit_price_dong`, `gold_sell_dong`, `reference_unit_price_dong`, `price_adjustment_per_chi`, `price_row_id`.

### 2.6 Trọng lượng (độ chính xác)

| Cột | Kiểu | Dòng > 3 chữ số thập phân |
|-----|------|---------------------------|
| `products.weight` | `numeric(9,5)` | 5 |
| `pos_skus.weight_chi`, `board_unit_chi` | `numeric(13,5)` | 5 (weight) |
| `pos_buy_items.weight_chi` (+ before/after) | `numeric(12,4)` | 2 |
| `pos_sale_items.weight_chi`, `board_unit_chi` | `numeric(12,4)` | 2 |
| `pos_purchase_items.weight_chi`, `pos_price_exceptions.weight_chi` | `numeric(12,4)` | — |

Ngày 13/10/2026 vừa nâng `products`/`pos_skus` lên **5 chữ số** (migration chỉ có trên DB). `docs/products-derived-pricing.md` còn ghi `numeric(5,1)` — lỗi thời.

### 2.7 Mua vào

- `pos_buy_items.gold_type` / `gold_age` là **text tự do** (VD `99.94`, `99.68`, `41.6`, null).
- Mỗi dòng vàng thị trường tạo **1 SKU mới** `MG-xxxxxxxxxxxx` (`pos_private.ensure_market_gold_sku`) → 118 SKU (96 còn tồn); giá bán lại lấy `last_cost_dong` của SKU đó (giá cả món, POS hiển thị = cost / số chỉ).
- Dữ liệu nghi sai cần kế toán kiểm: `MG-4D5B21E14E6E` "BAC05112026" 30 chỉ, cost 1 368 000 000 → POS hiện 45 600 000 đ/chỉ (gấp ~3,4 lần giá vàng 9999).
- Luồng nấu: `workflow_status` (INTAKE → MELT_COMMITTED → MELTING → WEIGHT_ENTERED → AWAITING_CONFIRM → INVOICE_ISSUED → FORM02_READY → COMPLETED), `skip_melt`.

### 2.8 Tồn kho

- `pos_inventory_stock` chỉ có `quantity integer` theo SKU (+ `last_cost_dong`), **không có tồn theo trọng lượng**.
- Ledger `pos_inventory_transactions` có trigger cấm UPDATE; type CHECK: `PURCHASE_RECEIVED, SALE, CUSTOMER_RETURN, SUPPLIER_RETURN, STOCK_ADJUSTMENT_IN/OUT, PREORDER_FULFILL, SALE_VOID, PURCHASE_VOID`.

### 2.9 Tem

- `pos_label_pieces` (`msp`, `barcode` unique, FK `sku_id`), mint qua `pos_mint_label_piece`. In tem (module `label-print`) và nhập kho (module `inventory`) là **2 luồng tách**.

### 2.10 Khóa ngoại cần lưu ý

| FK | ON DELETE | Hệ quả |
|----|-----------|--------|
| `pos_skus.price_row_id → gold_price_rows` | RESTRICT | Admin website xóa dòng giá đang gắn SKU sẽ lỗi |
| `products.price_row_id → gold_price_rows` | SET NULL | Xóa dòng giá làm SP website mất liên kết âm thầm |
| `pos_skus.catalog_product_id → products` | SET NULL | Xóa SP website → SKU mồ côi (vẫn bán được) |
| `pos_category_skus → pos_categories / pos_skus` | CASCADE | — |
| `pos_sale_items / pos_buy_items / pos_inventory_* / pos_label_pieces → pos_skus` | RESTRICT | SKU đã giao dịch không xóa được (đúng Rule 5) |

### 2.11 Lệch migration (drift)

DB có 168 migration, repo `supabase/migrations` có 81 file (timestamp khác do apply qua MCP). **Chỉ có trên DB, chưa có file trong repo:**

- `20261007111235_drop_products_price_source_weight_unique`
- `20261013112850_products_weight_five_decimals`
- `20261013112917_pos_sku_board_unit_five_decimals`
- `20261028094157_gold_price_rows_website_visibility`

→ Việc đầu tiên của Giai đoạn 1: export 4 migration này về repo (lấy từ `supabase_migrations.schema_migrations.statements`).

## 3. Bản đồ impact theo giai đoạn

| GĐ | DB chạm | RPC / function chạm | Module / file chạm | Website bị ảnh hưởng |
|----|---------|---------------------|--------------------|----------------------|
| 2 | Bảng master mới (loại vàng, hàm lượng, hệ số, cấu hình kim loại); thêm cột FK vào `products`, `pos_skus`, `gold_price_rows`; cây `categories` | `tlkv_sync_pos_sku_from_product`, `pos_list_brands` | `category` (đổi sang `categories`?), admin website catalog | Có — đọc `products`, `categories` |
| 3 | `gold_price_rows` (liên kết giá, % gốc, ẩn web), lịch sử giá | `compute_unit_price`, `pos_list_market_gold_refs`, `tlkv_bump_gold_price_version` | `pricing`, `pos/query.ts`, `js/gold-data.js`, `js/products/product-price-engine.js` | Có — bảng giá + giá SP |
| 4 | `products`, `pos_skus` (chế độ giá: công SP / hệ số), index phân trang | sync trigger, RPC list SP mới | `product` (đang placeholder), `category` | Có |
| 5 | `pos_buys`, `pos_buy_items` (FK hàm lượng), 2 SKU vàng thị trường cố định, tồn theo trọng lượng?, `pos_label_pieces` | `ensure_market_gold_sku`, `create_buy_intake`, `complete_buy`, `void_buy`, `pos_buy_skip_melt`, `pos_set_buy_melt_weights`, `receive_purchase`, `pos_mint_label_piece` | `purchase`, `inventory`, `label-print`, `form02`, `gold-management` | Không |
| 6 | `pos_sale_items` (snapshot hàm lượng/hệ số) | `compute_unit_price`, `complete_sale`, `require_saleable_sku`, `replace_held_order_items`, `void_sale_invoice` | `pos`, `invoice`, `sale-deposit` | Không |
| 7 | Đọc | `pos_get_reporting`, `pos_export_documents`, `pos_export_transactions`, `pos_cashflow_*`, `pos_stock_day_movements` | `reporting`, `dashboard`, `label-print`, `gold-management` | Không |

## 4. Câu hỏi nghiệp vụ cần chốt (Rule 9 — không tự đặt)

1. **Danh mục cây:** dùng `categories` (website) làm cây chung cho POS và ngừng `pos_categories` (đang rỗng)?
2. **Loại vàng ↔ hàm lượng:** "999, 9999, vàng tây" và "999.9, 99.9, 980, 750, 610, 585, 418" ánh xạ thế nào? (VD vàng tây = 750/610/585/418? 980 thuộc loại nào?) `10K`, `24K` hiện có map về đâu?
3. **Hệ số quy đổi:** = hàm lượng/1000 hay cấu hình tay từng hàm lượng? Làm tròn giá tới đơn vị nào (đồng / 1 000đ)?
4. **3 chữ số thập phân:** chỉ áp ở nhập liệu + hiển thị (giữ cột 4–5 chữ số, không mất dữ liệu lịch sử) hay ép cả kiểu cột? 14 dòng hiện có > 3 chữ số xử lý sao?
5. **Vàng thị trường 2 mã cố định:** 2 mã nào? 118 SKU `MG-*` cũ giữ nguyên lịch sử hay gộp? Tồn kho tính theo **chỉ** (cần cột trọng lượng tồn) thay vì số lượng?
6. **Liên kết giá "% so với giá gốc":** giá gốc là dòng nào, áp cho buy, sell hay cả hai?
7. **Giá ẩn trên website:** ẩn cả dòng (`is_visible_on_website` đã có) hay hiện "Liên hệ"? Có áp cho giá sản phẩm website không?
8. **Bán theo công SP hoặc hệ số:** cấu hình ở cấp sản phẩm, danh mục hay hàm lượng?
9. **In tem kiêm nhập kho:** 1 tem = 1 chiếc (`pos_label_pieces`) và nhập kho cùng transaction với mint tem?
