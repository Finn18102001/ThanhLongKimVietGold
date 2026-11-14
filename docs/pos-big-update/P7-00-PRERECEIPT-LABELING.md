# P7 — Pre-receipt labeling → Nhập kho từ draft + tìm MSP

> Chốt quyết định: 2026-11-15 · Nhánh: `Finn/New/POS-Future`  
> Spec nguồn: PreReceipt Labeling (cập nhật 15/11) + trả lời A/B của chủ SP  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) · Backup: [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md)  
> U1 draft schema: [`sql/P6-U1-draft-schema.sql`](./sql/P6-U1-draft-schema.sql)

## 1. Quyết định đã chốt

| # | Nội dung | Chốt |
|---|----------|------|
| 1 | Serial MSP tự động | **A** — reserve khi tạo/in draft; hủy draft → gap sequence, không reuse |
| 2 | Lưu draft | **B** — bảng `pos_label_drafts` riêng |
| 3 | Giá bán trên Nhập hàng | **3a** — có ô Giá vốn + Giá bán; autofill từ draft; alert cũ/mới |
| 4 | Validation bạc | Bắt buộc đầy đủ **lúc nhập kho** |
| 5 | Prefix | Giữ **`type_code`** như mint hiện tại (không Brand abbreviation) |
| U1 | Unit | **Có trong round này** — tạo Unit khi nhập thành công (Hybrid) |
| qty | `received_qty` | **= 1** mỗi draft |
| UI | `LabelReceiveSection` | **Bỏ** khỏi tab In tem |
| Search | MSP 5 tab | Trong scope round này |
| Test | Prod hard-test | Có kiểm soát; cleanup đúng ID; đảo phiếu qua RPC đã audit |

## 2. Audit giá bán (bắt buộc trước khi ghi SKU)

### 2.1 Evidence

| Nơi | Field | Ý nghĩa |
|-----|-------|---------|
| In tem UI | `laborFeeDong` / nhãn **C (Công)** | Tiền công — ghi SKU qua `pos_set_sku_sale_components(_v2)` → `pos_skus.labor_fee_dong` |
| In tem UI | `priceDong` / nhãn **G (Giá)** | Tổng giá in trên tem; snapshot `pos_label_print_log.price_dong` |
| Prefill | `priceDong = sku.unitPriceDong` | `unitPriceDong` = kết quả **tính** từ bảng giá + công (+ đá), không phải cột DB |
| Nhập hàng UI | `cost_price_dong` | Giá vốn / chiếc trên phiếu nhập — **không** có ô giá bán |
| `pos_skus` | Không có cột sell/list price | Có `price_row_id`, `labor_fee_dong`, `stone_*` |
| POS bán | `pos_private.compute_unit_price` | Non-market: `round(gold_price_rows.sell * weight/board) + labor_fee_dong` (+ đá ở P4). Market: `last_cost` |

**Kết luận:** Không có “nguồn giá bán” dạng một cột. Giá bán chính thức khi bán = **hàm tính** từ bảng giá + tiền công (+ đá).  
`priceDong` (G) **không đồng nhất** `labor_fee_dong` (C). Không được gán thẳng G → C.

### 2.2 Cần chủ SP chọn cách ghi sau “Đồng ý thay đổi”

| Mã | Cách | Ghi chú |
|----|------|---------|
| **S1** | Back-solve `labor_fee_dong` sao cho `compute_unit_price ≈ Giá bán form` (sau khi đã chọn `price_row` + weight + đá) | Không cột mới; audit before/after labor + intended G. **Không** gán G nguyên xi vào labor. |
| **S2** | Thêm cột override (vd `list_price_dong`) và sửa `compute_unit_price` ưu tiên override | Migration + đổi RPC bán; impact rộng hơn |
| **S3** | Round này: lưu Giá bán trên draft + snapshot phiếu; **chưa** đẩy vào SKU bán | An toàn nhất ngắn hạn; PRE PRICE-03 chưa đủ |

**Chặn ghi SKU** đến khi có S1/S2/S3. UI ô Giá bán + so sánh alert vẫn làm theo 3a.

## 3. Mô hình dữ liệu (dự kiến)

### 3.1 `pos_label_drafts` (mới)

- Snapshot form tạo tem (code_mode, type_code, product_number / reserved msp+serial, tên, brand_text, category_text, product_type, price_row ref, cost, sell, weight, gold_age, notes, labor/stone…).
- Status: `DRAFT` → `PRINTED` → `RECEIVED` | `CANCELLED`.
- `reserved_serial_no` / `reserved_msp` khi AUTO (1A).
- `receipt_id` / `receipt_item_id` / `unit_id` / `piece_id` sau nhận.
- `snapshot_json` bất biến (PRE-24).
- `test_marker` text nullable cho hard-test cleanup.
- GRANT §32.1: `authenticated` + `service_role`; **không** `anon`; RLS bật.

### 3.2 `pos_inventory_units` (U1 — áp dụng từ P6 draft)

- Tạo **chỉ** khi nhập kho từ draft thành công.
- `origin = RECEIPT`, gắn `origin_receipt_item_id`, status `IN_STOCK`.
- AUTO: tạo/ghi `pos_label_pieces` với MSP đã reserve + `unit_id`.
- PRE_ASSIGNED: **không** ép mã dùng chung vào unique MSP piece theo kiểu 1 mã = 1 piece tái dụng cho nhiều Unit; lưu mã trên draft/Unit theo RPC thiết kế (audit unique `msp` hiện tại).

### 3.3 Không tăng tồn khi chỉ in draft

- Draft không đụng `pos_inventory_stock`.
- Không bán được cho đến khi receive tạo SKU/stock/Unit.

## 4. RPC / UI boundary

| Hạng mục | Allowed | Forbidden |
|----------|---------|-----------|
| Draft + in | `label-print/**`, migration drafts/print | Đổi mint SKU-path cũ ngoài cần thiết |
| Nhận từ draft | `inventory/**` ReceiveForm + RPC nhận | Multi-select draft; qty ≠ 1 |
| U1 | migration units + piece.unit_id | Backfill MSP lịch sử; BF-B rewrite |
| Search MSP | query/filter 5 tab | Bắt buộc cột MSP trên mọi bảng UI |
| Bỏ | `LabelReceiveSection` khỏi In tem | Giữ 2 điểm nhập kho |

## 5. Hard-test / cleanup

- Marker `test_marker = 'P7-HT-YYYYMMDD-…'`.
- Đảo phiếu: audit `pos_private.void_purchase_receipt` trước khi gọi.
- Xóa đúng draft/print test IDs; không reset `pos_label_msp_seq`.

## 6. Tiến độ

- [x] Chốt quyết định nghiệp vụ (trừ S1/S2/S3 ghi giá bán SKU)
- [x] Audit giá bán / schema pieces / U1 absent
- [x] Migration schema: `pos_label_drafts`, `pos_label_draft_print_log`, `pos_inventory_units`, `pos_label_pieces.unit_id`
- [x] RPC: `pos_create_label_draft`, `pos_record_label_draft_print`, `pos_list_pending_label_drafts`
- [x] RPC `pos_receive_label_draft` (qty=1, Unit + MSP AUTO / shared PRE, anti-dup, sell_price not written to labor_fee)
- [x] UI: tab «Tem trước nhập kho» + `DraftReceivePanel` (picker 1 draft, autofill, diff alert, giá bán 3a)
- [ ] Search MSP 5 tab
- [ ] Hard-test + cleanup
