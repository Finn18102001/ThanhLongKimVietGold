# P9.4 — Giá bán gợi ý thủ công vàng (không link bảng giá) + checkbox tiền công trên HĐ

> Chốt: 2026-11-26 · Người chốt: PO (4 quyết định trong chat)  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) · P9 gốc: [`P9-00-GOLD-SILVER-RECEIVE-SELL-PRICE.md`](./P9-00-GOLD-SILVER-RECEIVE-SELL-PRICE.md) · Bạc: [`P9-01`](./P9-01-SILVER-SELL-PRICE-POS-AUDIT.md)–[`P9-03`](./P9-03-SILVER-MANUAL-SELL-PHASE2-FILELIST.md)  
> Module: `inventory`, `label-print`, `pos`, `invoice` (+ migration `pos_skus` / `compute_gold_unit` / `pos_set_sku_manual_sell`)

## 1. Yêu cầu đã chốt

1. Hiển thị giá bán gợi ý nhập thủ công trên card Bán hàng (không tính lại công thức board/HESO).
2. `Giá hiển thị = manual_sell_dong (cơ sở, chưa gồm công) + labor_fee_dong` (nếu có).
3. Checkbox **tại nhập kho** (kho hàng + in tem kiêm nhập / draft): bật = hiện riêng dòng tiền công trên HĐ; tắt = gộp công vào dòng vàng trên phôi. Tổng tiền **không** đổi. **Không** chọn lại lúc in HĐ.
4. Flag lưu `pos_skus.invoice_show_labor_line` → snapshot `pos_sale_items` khi bán → in mới / in lại theo snapshot.

## 2. Business rule

| # | Rule |
|---|------|
| R1 | SoT cơ sở vàng không link: `pos_skus.manual_sell_dong` = giá gợi ý **chưa** gồm tiền công bán. |
| R2 | Phạm vi: chỉ **GOLD không chọn `price_row_id`**. Có link bảng giá → giữ board/HESO AS-IS; không dùng manual làm SoT bán. |
| R3 | Card POS + `complete_sale`: unlinked GOLD + `manual_sell_dong > 0` → `gold_unit = manual`; đơn giá = gold + labor + stone (như vàng hiện tại). |
| R4 | Bạc P9 **không đổi**: `manual_sell` vẫn **all-in**, không cộng labor thêm. |
| R5 | Không backfill SKU cũ; vá bằng nhập lại / điền giá gợi ý khi nhận không link. |
| R6 | Checkbox công chọn lúc **nhập kho**; snapshot sale line; chỉ presentation; không đổi tổng HĐ. |
| R7 | P9 §5 (sửa giá bán ngoài CRUD) vẫn **hoãn**. |

## 3. Module boundary

**Allowed:** `inventory` (receive + `applySkuManualSell*`), `label-print` Combined, `pos/query` (+ types nếu cần), `invoice` print UI/`InvoiceDocument`, migration P9.4, doc này + README.

**Forbidden:** bạc all-in path; vàng đã link; fund/cashflow; P9 §5 UI; đổi công thức HESO khi có `price_row_id`.

## 4. DB impact

- Snapshot `pg_get_functiondef` → `tlkv_backup_20261110` trước replace.
- `pos_set_sku_manual_sell`: nhánh GOLD ghi `manual_sell_dong` khi `> 0`, else `null` (clear).
- `pos_private.compute_gold_unit`: sau nhánh SILVER, nếu không MG và `price_row_id is null` và `manual_sell_dong > 0` → trả `gold_unit_dong = manual_sell_dong`.
- `pos_private.complete_sale`: bỏ assert ±300k/chỉ khi `gold_sell_dong = 0`; snapshot `invoice_show_labor_line`.
- Cột `pos_skus.invoice_show_labor_line` (default true) + `pos_sale_items.invoice_show_labor_line` (nullable legacy); RPC `pos_set_sku_invoice_show_labor`; GRANT restated (§32.1).

## 5. Logic cũ phải giữ

- SILVER all-in + reject thiếu manual.
- GOLD + `price_row_id` → board LINK/HESO như hiện tại.
- Prefill `labor_fee_dong` trên HĐ; snapshot `gold_amount_dong` / `labor_final_dong`.
- In HĐ mặc định vẫn hiện dòng công khi `labor_final ≠ 0` (checkbox mặc định bật).

## 6. Hard-test

- Nhập vàng **không** link + BÁN RA tay (vd 1.820.975) + công 0 → card hiện đúng; F9 bán OK.
- Cùng case + công 300.000 → card = manual + 300.000.
- Vàng **có** link → không phụ thuộc ô gợi ý tay; board/HESO như cũ.
- Bạc không đổi.
- Nhập kho: tick/untick “Hiện riêng dòng tiền công”; bán → in HĐ theo flag; in lại không đổi được trên màn HĐ.

## 7. Lịch sử

- 2026-11-26: chốt 4 quyết định PO; bắt đầu code.
- 2026-11-26: PO sửa — checkbox ở nhập kho (không ở màn in HĐ); login/OTP loading.
