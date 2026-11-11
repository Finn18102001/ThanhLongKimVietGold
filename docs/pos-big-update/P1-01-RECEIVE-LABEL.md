# Phase 1 · Section 1 — Nhập hàng kiêm in tem

> Chốt: 2026-11-10 · Người chốt: tuananh18101@gmail.com  
> Tổng quan Phase 1: [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md)

## 1. Yêu cầu đã chốt

1. Màn **In tem** (`/label-print`, tab In tem) có section **Nhập hàng** nằm ngay **trên** section "Thông tin in".
2. Section dùng **đúng logic tab "Tạo sản phẩm Order"** của Kho → Nhập hàng: mỗi lần nhập tạo 1 SKU Order mới (`<Mã đầu><6 số tự tăng>`, VD `TLKVTS000012`); N chiếc trong lần nhập dùng chung SKU đó, tồn kho cộng N.
3. **Không** có field "Thanh toán phiếu nhập". Phiếu nhập luôn **thanh toán đủ** (`paid = giá vốn × số nhận`, backend tự tính). Người dùng chọn **Tiền mặt / Chuyển khoản** (ghi chi tiền tương ứng vào dòng tiền).
4. Giữ ô **Nhà cung cấp** như form Kho.
5. Thêm field **Tuổi vàng**: số, tối đa **3 chữ số thập phân**, nhập tự do; gợi ý sẵn `999.9 / 99.9 / 980 / 750 / 610 / 585 / 418` (sau này lấy từ /admin). Thông số áp chung cho cả lô.
6. Nhập thành công → tự chọn SKU vừa nhập ở dropdown **Sản phẩm (SKU)** của "Thông tin in" và nạp thông tin (KLT, KLV, C, G…).
7. **Không** tự tạo MSP. Giữ nguyên logic hiện tại: SKU chưa có MSP → người dùng bấm "Tạo MSP mới".
8. Nhập thất bại (mạng, trùng, lỗi server…) → hiện lỗi thật, **không** lưu dữ liệu dở, **giữ nguyên** dữ liệu đã nhập để thử lại. Không kiểm tra Internet trước khi gửi.
9. Nguyên tử + idempotent: lỗi thì rollback toàn bộ; thử lại **không** tạo phiếu nhập / cộng tồn trùng.

## 2. Business rule

| # | Rule | Kiểm chứng |
|---|------|------------|
| R1 | Chỉ ADMIN (quyền ghi quản trị) thấy và dùng section Nhập hàng; RPC kiểm `require_admin` | STAFF / ADMIN_VIEWER không thấy section |
| R2 | `paid_dong` do backend tính = `cost_price_dong × received_qty`; client không gửi số tiền | `pos_purchase_receipts.payment_status = PAID`, `remaining_dong = 0` |
| R3 | Hình thức thanh toán ∈ {CASH, TRANSFER} | RPC từ chối giá trị khác |
| R4 | Tuổi vàng `> 0`, `≤ 1000`, tối đa 3 số thập phân; để trống được | RPC + UI cùng chặn |
| R5 | Cùng `idempotency_key` gọi lại → trả phiếu cũ, không cộng tồn lần 2, không ghi tuổi vàng lần 2 | Gọi 2 lần cùng key |
| R6 | Key chỉ đổi sau khi thành công; thất bại giữ key + dữ liệu form | — |
| R7 | Nhập kho tăng tồn qua `PURCHASE_RECEIVED` ledger (không đổi) | `pos_inventory_transactions` |

## 3. Module boundary

| Hạng mục | Giá trị |
|----------|---------|
| Module | `src/modules/label-print/**` |
| Route | `/label-print` (không đổi) |
| Allowed files | `src/modules/label-print/**`, `supabase/migrations/<ts>_label_print_receive_order.sql`, file md này |
| Forbidden | `src/modules/inventory/**` (không sửa `ReceiveForm`, `receivePurchase`), RPC `pos_receive_order_purchase` / `pos_private.*` |
| Cross-module | Gọi RPC contract `pos_receive_label_order_purchase`; `revalidatePath` các trang kho / dòng tiền / POS (one-liner như các module khác) |

## 4. DB impact (migration `label_print_receive_order`)

- `products.gold_age numeric(7,3)` nullable + check `0 < gold_age ≤ 1000`. Bảng cũ → giữ grant hiện có (§32.1 mục 1). Trigger `trg_products_sync_pos_sku` **không** chạy vì chỉ theo dõi `name, weight, price_source_product, brand_id, is_active`.
- RPC mới `public.pos_receive_label_order_purchase(p_idempotency_key, p_supplier_name, p_reason, p_item jsonb, p_payment_method, p_note)`:
  - `require_admin` → validate → gọi `pos_receive_order_purchase` (cũ, không đổi) với `paid = cost × qty`, `goods_status = RECEIVED` → tìm `sku_id` qua `pos_purchase_items` → lần đầu (không phải replay) thì ghi `products.gold_age`.
  - Cả hàm là 1 transaction → lỗi bất kỳ rollback toàn bộ.
  - `revoke all from public`; `grant execute to authenticated, service_role` (giống RPC cũ, không `anon`).
- Rollback: `drop function public.pos_receive_label_order_purchase(...)`; `alter table public.products drop column gold_age` (chỉ khi chưa section nào khác dùng).

## 5. API contract

Server action `receiveLabelOrderPurchase(input)` (`label-print/receive-actions.ts`) → `ActionResult<{ receiptNo, skuId, skuCode, replayed, sku: LabelSkuOption }>` — **không throw** (§30.1).

## 6. Logic cũ phải giữ nguyên (regression)

- Kho → Nhập hàng (cả 2 tab) chạy y như trước; `pos_receive_order_purchase` không đổi.
- In tem: chọn SKU, Tạo MSP mới, đổi mã loại, In / In lại, lịch sử — không đổi.
- Tem in **không** đổi tồn kho.
- SKU Order tự active khi có `PURCHASE_RECEIVED` (trigger `activate_order_jewelry_sku`) → xuất hiện trong dropdown In tem.

## 7. Hard-test checklist (DevTools)

1. Login ADMIN → sidebar **In tem** → thấy section Nhập hàng trên Thông tin in.
2. Nhập SP Order (tuổi vàng `610.5`, SL 2, giá vốn, NCC, Tiền mặt) → thành công, dropdown SKU tự chọn mã mới, tồn 2.
3. Kho → Lịch sử: có `PURCHASE_RECEIVED` +2. Dòng tiền: có khoản chi tiền mặt = giá vốn × 2.
4. Tuổi vàng `610.1234` → bị chặn (UI + RPC).
5. Lỗi (VD bỏ trống NCC) → dữ liệu form còn nguyên, không có phiếu mới.
6. Gọi lại cùng key → trả phiếu cũ, tồn không đổi.
7. Bấm Tạo MSP mới cho SKU vừa nhập → tạo được, in được.

## 8. Lịch sử thay đổi

- 2026-11-10: chốt lần đầu.
- 2026-11-10: áp migration `20261110163201_label_print_receive_order` lên production. Đã kiểm: UI hiện đúng vị trí (ADMIN), validate client giữ dữ liệu form, RPC từ chối 5 ca sai (tuổi vàng 4 số lẻ, > 1000, CARD, SL 0, thiếu order_product) trước khi cấp số `PN`.
- 2026-11-10: hard-test thật (DevTools, giá vốn 0đ): `PN000093` / `TLKVTS000002` — RECEIVED + PAID, ledger `PURCHASE_RECEIVED` +1, `products.gold_age = 610.500`, SKU tự chọn ở Thông tin in. Replay cùng key → `replayed=true`, tồn / số phiếu / sequence không đổi, tuổi vàng không bị ghi đè. Đã **đảo phiếu** ở Hóa đơn (`PURCHASE_VOID` −1, tồn 0). SKU test `TLKVTS000002` đã **ẩn** (`is_active = false`, audit `SKU_DEACTIVATE`). Không xóa được vì đã có ledger + phiếu nhập (FK RESTRICT, Rule 5).
- Chưa test bằng tiền thật (giá vốn > 0 → ghi chi Tiền mặt / Chuyển khoản): dùng chung `pos_private.receive_purchase` như tab Order ở Kho với "Đủ".
- Files: `label-print/receive-actions.ts`, `components/LabelReceiveSection.tsx`, `query.ts` (`getLabelSku`, `listLabelReceiveOptions`), `types.ts`, `LabelPrintPage.tsx`, `components/LabelPrintWorkspace.tsx` (chèn section + chọn SKU sau khi nhập).
