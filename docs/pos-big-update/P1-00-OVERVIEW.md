# PHASE 1 — Các phần ít phụ thuộc (tổng quan)

> Mở: 2026-11-10 · Ưu tiên cao nhất  
> Ràng buộc: **không** đổi logic mua bán, **không** đổi cấu trúc danh mục hiện tại. Mọi thay đổi DB chỉ thêm (additive), không đổi/drop cột cũ.  
> Mỗi section có file chi tiết riêng khi đã chốt (`P1-0N-*.md`).

| # | Section | File chi tiết | Tiến độ | Trạng thái |
|---|---------|---------------|---------|------------|
| 1 | Nhập hàng kiêm in tem | [`P1-01-RECEIVE-LABEL.md`](./P1-01-RECEIVE-LABEL.md) | 95% | Xong, hard-test PN000093 (đã đảo). Còn: test 1 phiếu giá vốn > 0 (ghi chi tiền thật) |
| 2 | Tem sản phẩm | [`P1-02-LABEL-CONTENT.md`](./P1-02-LABEL-CONTENT.md) | 85% | Code xong (tạm). Còn: in thử tem thật trên iDPRT; lưu tên in / HL / xuất xứ vào log in lại (migration) |
| 3 | Sản phẩm (tuổi vàng, số chỉ, số lượng, phân trang) | `P1-03-PRODUCT.md` | 0% | **Hoãn — làm khi chuyển sang nhánh `main`** (CRUD sản phẩm nằm ở admin website `admin/index.html` + `js/admin/*`). Cột `products.gold_age` đã có sẵn từ Section 1 |
| 4 | Báo cáo / Excel — cột hàm lượng | [`P1-04-EXPORT-PURITY.md`](./P1-04-EXPORT-PURITY.md) | 90% | Cột "Hàm lượng" có ở cả 8 file xuất + ô chọn số dòng xuất (Kho, Báo cáo, Phiếu 02). Còn: tải thử file thật trên trình duyệt |
| 5 | Website — ẩn dòng giá | (mục 5 dưới đây) | 0% | **Note — làm khi chuyển nhánh sang `main`** |
| 6 | Vàng thị trường — 3 card 999.9 / 99.9 / 9 ở tab Mua / Bán | [`P1-06-MARKET-GOLD.md`](./P1-06-MARKET-GOLD.md) | 95% | Xong + hard-test thật (BUY-000442, DH003383 đã hủy); sửa lỗi có sẵn bán MG (`complete_sale`). Còn: admin hủy BUY-000442; test 1 đơn bán MG thu đủ tiền |

| 7 | Kho hàng — bộ lọc "Tồn kho hiện tại" | (mục 7 dưới đây) | 100% | Xong 2026-11-11 |

**Việc để lại cho nhánh `main`:** Section 3 (Sản phẩm), Section 5 (Website ẩn dòng giá), export 4 migration chỉ có trên DB về repo (xem `01-DB-AUDIT.md` §2.11).

## Hiện trạng từng section (để không phá logic cũ)

### 1. Nhập hàng kiêm in tem

- Form "Tạo sản phẩm Order" hiện ở Kho → Nhập hàng: `src/modules/inventory/components/ReceiveForm.tsx` → action `receivePurchase` (`src/modules/inventory/actions.ts`) → RPC `pos_receive_order_purchase` (tạo SKU qua `pos_private.create_order_jewelry_sku`, mã `TLKVTS` + số tự tăng, cộng kho, ghi ledger, ghi phiếu nhập + thanh toán).
- Thanh toán `FULL` → `paid_dong = giá vốn × số nhận` → trigger `cash_trg_purchase_payment` ghi **chi tiền** vào dòng tiền.
- In tem: `src/modules/label-print/**` → `pos_mint_label_piece` (MSP + barcode / chiếc) → `pos_record_label_print` (chỉ ghi log, không đổi tồn).
- `receivePurchase` hiện `throw` lỗi (chưa theo `ActionResult` §30.1). Section mới sẽ có action riêng trong `label-print` trả `ActionResult`, **không sửa** `receivePurchase`.

### 2. Tem sản phẩm (90×14)

- Mặt 2: KLT / KLV / KLĐ (nếu > 0) / C / G. Mặt 1: công ty / barcode / MSP. Đuôi: địa chỉ.
- Đã có chỉnh cỡ chữ theo 3 vùng (Mặt 1 6pt, Mặt 2 7pt, Đuôi 5.4pt).
- **Chưa có:** tên SP, hàm lượng, "Xuất xứ: Việt Nam". Log in (`pos_label_print_log`) chưa có cột hàm lượng / xuất xứ.

### 3. Sản phẩm

- `/products` trong POS là **placeholder**. CRUD sản phẩm thật ở admin website (`admin/index.html` + `js/admin/*`) trên bảng `products` → trigger sync sang `pos_skus`.
- `products.weight numeric(9,5)` = số chỉ. Chưa có tuổi vàng. Số lượng = tồn `pos_inventory_stock` (chỉ đọc).

### 4. Báo cáo / Excel

- Không file export nào có cột hàm lượng: hóa đơn, báo cáo, kho (tồn, lịch sử), quản lý vàng, Phiếu 02.
- Nguồn hàm lượng có sẵn: `pos_buy_items.gold_age` (mua), `gold_price_rows.purity` (text). Dòng bán **không** lưu snapshot hàm lượng.

### 5. Website — ẩn dòng giá (NOTE, chưa làm round này)

- Cột `gold_price_rows.is_visible_on_website` đã có trên DB (migration `20261028094157`, chưa có file trong repo), 9/21 dòng đang `false`.
- Không code nào (nhánh này và `main`) đọc cột → website vẫn hiện dòng ẩn.
- Khi chuyển sang `main`: lọc `is_visible_on_website = true` trong `js/gold-data.js` (bảng giá) — **không** lọc ở POS (POS vẫn cần dòng ẩn để tính giá). Export migration về repo cùng lúc.

### 7. Kho hàng — bộ lọc "Tồn kho hiện tại" (2026-11-11)

- Yêu cầu: hàng chip dưới tiêu đề "Tồn kho hiện tại" đổi thành **thương hiệu**; 4 trạng thái tồn (`Tất cả`, `Còn hàng`, `Sắp hết hàng`, `Hết hàng`) chuyển thành **dropdown**. Giữ nguyên logic lọc.
- Làm: `src/modules/inventory/components/StockTable.tsx` — chip = "Tất cả" + thương hiệu (sắp A→Z) + "Không brand" (nếu có), cuộn ngang khi nhiều; dropdown trạng thái thay chỗ dropdown thương hiệu cũ. State / điều kiện lọc (`tab`, `brand`, `stockStatus`) và file xuất Excel không đổi.
- Kiểm chứng (DevTools): chip "Bạc" + dropdown "Hết hàng" → 5 mã bạc tồn 0.
- Bố cục cột bảng (2026-11-11): `table-fixed` + `colgroup` có độ rộng đo theo dữ liệu thật (298 dòng). Cột chữ (Sản phẩm, Mã hàng, Thương hiệu, Danh mục) xuống dòng đủ chữ; cột số/tiền căn phải, `tabular-nums`, không xuống dòng; badge trạng thái 1 dòng; cột Sản phẩm sticky trái và tối thiểu ~178px (bảng `min-w-[1224px]`, nhỏ hơn thì cuộn ngang). Nếu thêm cột hoặc giá trị tiền > 13 ký tự thì đo lại độ rộng cột tiền (hiện 132px).
