# Giai đoạn P5 — POS theo Thương hiệu / Danh mục / Loại sản phẩm mới

> Chốt: 2026-11-13 · Người chốt: tuananh18101@gmail.com
> Nguồn: nhánh `Finn/New/Category-Restructure-Future` (`docs/audit/category-restructure/*`, nhất là `ROLLOUT_PLAN_MAIN_AND_POS.md` phase D, E) và trả lời câu hỏi ngày 13/11 (22:40-23:05).

## 1. Yêu cầu đã chốt

Mô hình dữ liệu (đã có trên production, do website `/admin` quản lý): Brand → Category (nhiều-nhiều qua `brand_categories`) → Loại sản phẩm (`product_types`, dùng chung) → Product → SKU.

| # | Yêu cầu | Quyết định |
|---|---|---|
| Q1 | Lọc Loại sản phẩm trên POS | Thêm ô "Loại sản phẩm" cạnh ô Thương hiệu ở Bán hàng, Mua vào, Kho hàng, In tem. Giữ chip nhóm (luật theo tên `browseGroupFromProduct`) và lọc Thương hiệu như cũ |
| Q2 | Nhập hàng (Kho tab "Tạo sản phẩm Order" + Nhập hàng tab In tem) | Danh mục lọc theo Thương hiệu đã chọn (`brand_categories`). Thêm ô Loại sản phẩm (không bắt buộc). **RPC từ chối** cặp Thương hiệu - Danh mục chưa liên kết. Danh mục vẫn được để trống như cũ. Chỉ hiện Thương hiệu đang dùng |
| Q3 | Menu "Danh mục" của POS (`/categories`) | Đổi thành màn **chỉ xem** Thương hiệu / Danh mục / Loại sản phẩm mới; chỉnh sửa ở `/admin` website. Kiểm kê phạm vi "Danh mục" dùng danh mục mới |
| Q4 | Lịch sử tem | Đổi nhãn "Loại SP" thành "Danh mục" (dữ liệu cũ giữ nguyên) |
| E1 | 40 món của Brand VÀNG TRANG SỨC TLKV (39 "TRANH …" + "CÁ CHÉP HOÁ VÀNG SONG NGƯ CÁT HẠNH 2") | Brand → Thăng Long Kim Việt, Danh mục → **Tranh** (bật lại). Giá nhập tay (`price_text`) giữ nguyên. Chấp nhận mã SKU mới `vtst-…` → `tlkv-…` |
| E2 | 4 món Order TLKVTS000004-007 (Brand VÀNG TRANG SỨC TLKV) | Brand → Thăng Long Kim Việt, Danh mục → **Trang Sức** (bật lại). Mã SKU giữ nguyên |
| E3 | Brand VÀNG TRANG SỨC TLKV | Sau E1, E2 không còn sản phẩm → ngừng dùng (không xóa); gỡ liên kết tạm VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K |
| E4 | Brand Bạc (12 sản phẩm) | **Giữ nguyên** Brand, Danh mục, liên kết giá (7 sản phẩm đang gắn `r12` "Bạc BTMC 1L 2L 5L"; 5 sản phẩm không gắn, dùng giá hiện tại) |
| E5 | 18 món BCHARM (BAC000003-011, TLKVTS000008-016) chưa bán, có phiếu nhập đã chi tiền mặt (PN000101-118) | Không xóa cứng (Rule 5, sổ quỹ). **Đảo 18 phiếu nhập** (kho về 0, hoàn tiền vào quỹ) + ẩn SKU / sản phẩm; nhân viên nhập lại |

## 2. Business rule

| # | Rule | Kiểm chứng |
|---|---|---|
| R1 | Sản phẩm Order tạo từ POS: nếu có Danh mục thì cặp (Thương hiệu, Danh mục) phải có trong `brand_categories` | RPC trả lỗi rõ ràng, không cấp số phiếu |
| R2 | Loại sản phẩm (nếu chọn) phải tồn tại và đang dùng | RPC trả lỗi |
| R3 | Đổi Danh mục / Loại không đổi SKU, giá, tồn (trigger SKU không theo dõi các cột này; đã chứng minh bằng `04_trigger_proof`) | — |
| R4 | Đổi Thương hiệu sản phẩm thường dựng lại mã SKU; tem (`BC`+MSP), dòng giá, trạng thái bán, lịch sử bán (`sku_snapshot`) không đổi (dry-run 13/11) | So trước/sau |
| R5 | Lọc trên POS chỉ là hiển thị, không đổi giá / kho / chứng từ | — |

## 3. Module boundary

| Hạng mục | Giá trị |
|---|---|
| Allowed | `src/modules/pos/**`, `src/modules/purchase/**` (lưới mua), `src/modules/inventory/**` (Tồn kho, Nhập hàng, Kiểm kê), `src/modules/label-print/**`, `src/modules/category/**`, `src/app/(admin)/categories/**`, `supabase/migrations/<ts>_p5_catalog_*.sql`, file này, README |
| Forbidden | Website (`js/**`, `admin/**`, `routes/**`, `vercel.json`) trên nhánh POS; RPC bán / mua / hóa đơn; bảng giá |
| Shared | Chỉ dùng tiện ích chung có sẵn |

## 4. DB impact

- Không tạo bảng mới. `product_types`, `brand_categories` đã có GRANT `authenticated`, `service_role` + RLS (đợt website).
- Migration `p5_catalog_order_type`: `pos_private.create_order_jewelry_sku` thêm `p_product_type_id uuid default null` + kiểm R1, R2; `pos_private.receive_purchase` / `pos_receive_label_order_purchase` truyền `order_product.product_type_id`. Backup function vào `tlkv_backup_20261110`, md5 guard, chữ ký cũ vẫn gọi được.
- Migration `p5_catalog_stock_count`: `pos_private.create_stock_count` phạm vi CATEGORY đọc `products.category_id` (danh mục mới) thay vì `pos_category_skus`.
- Dữ liệu E1-E3, E5: transaction có backup + log (`product_change_log`, `pos_audit_log`).

## 5. API / RPC contract

- `pos_receive_order_purchase` / `pos_receive_label_order_purchase`: `order_product` nhận thêm `product_type_id` (tùy chọn). Payload cũ vẫn chạy.
- Server action mới đọc danh mục: trả `ActionResult`.

## 6. Logic cũ phải giữ nguyên

- P1-01 §6 (Nhập hàng kiêm in tem), P4-04 (đá, công, chứng từ), P4-00 C1-C11.
- Chip nhóm lưới Bán / Mua (Vàng Rồng, Bông lúa, Bông Sen, Kim Gia Bảo, Nhẫn, nhóm Vàng thị trường).
- Nhập hàng "Sản phẩm có sẵn" không đổi.
- Kiểm kê phạm vi "Tất cả" / "Thương hiệu" không đổi.

## 7. Hard-test checklist

1. Bán hàng / Mua vào / Kho / In tem: lọc Loại "Lắc Tay" ra 7 sản phẩm; bỏ lọc về như cũ.
2. Nhập hàng (Kho, In tem): chọn Thương hiệu → chỉ hiện Danh mục đã liên kết; chọn Loại; tạo phiếu test → `products.product_type_id` đúng; đảo phiếu test.
3. Gọi RPC với cặp chưa liên kết → bị từ chối, không có phiếu mới.
4. `/categories` hiện đúng 3 danh sách, không có nút sửa.
5. Kiểm kê phạm vi Danh mục "VÀNG 24K" → đúng số SKU.

## 8. Lịch sử thay đổi

- 2026-11-13: chốt lần đầu.
- 2026-11-13/14: **đã triển khai**.
  - Dữ liệu (MCP, transaction có backup `tlkv_backup_20261110.*__p5_20261113`, log `product_change_log` source `p5-catalog-20261113`):
    - E1: 40 món → Thăng Long Kim Việt / Tranh; mã SKU `vtst-…` → `tlkv-…`; dòng giá, trạng thái bán không đổi.
    - E2: TLKVTS000004-007 → Thăng Long Kim Việt / Trang Sức; mã giữ nguyên.
    - E3: bật lại danh mục Tranh, Trang Sức; liên kết TLKV → Tranh, Trang Sức; gỡ VÀNG TRANG SỨC TLKV → QUÀ TẶNG 24K; ngừng dùng Brand VÀNG TRANG SỨC TLKV (0 sản phẩm). Tổng 20 liên kết.
    - E5: đảo PN000101-118 qua màn Hóa đơn (mỗi phiếu `PURCHASE_VOID_RECLAIM` hoàn đúng số đã chi, tồn về 0); ẩn 18 SKU + sản phẩm BCHARM (`SKU_DEACTIVATE`). PN000119 (TKJ) không đụng.
  - Migration:
    - `20261113172826_p5_catalog_order_type`: `create_order_jewelry_sku` 9 tham số (R1, R2, ghi `product_type_id`); bản 8 tham số gọi bản mới; `pos_receive_order_purchase` truyền `product_type_id`. Backup `tlkv_backup_20261110._routines__p5`.
    - `20261113172947_p5_catalog_stock_count`: kiểm kê phạm vi Danh mục đọc `products.category_id`.
  - Code: lọc Loại sản phẩm ở Bán hàng, Mua vào, Kho hàng, In tem; Nhập hàng (Kho + In tem) lọc Danh mục theo Thương hiệu, ô Loại sản phẩm, chỉ hiện Thương hiệu đang dùng; `/categories` thành màn chỉ xem; kiểm kê dùng danh mục mới; nhãn lịch sử tem "Danh mục".
  - Kiểm:
    - RPC tự hoàn tác: cặp chưa liên kết bị chặn (cả chữ ký cũ), Loại không tồn tại bị chặn, cặp hợp lệ ghi đúng `product_type_id`.
    - UI DevTools: lọc Lắc Tay ra 7 sản phẩm ở Bán / Mua / Kho / In tem; Nhập hàng hiện đúng danh mục theo 6 thương hiệu; `/categories` 3 bảng không nút sửa; kiểm kê liệt kê danh mục mới.
    - `tsc`, `next build` đạt.
  - 2026-11-14 (bổ sung):
    - Order hard-test UI: PN000121 / TLKVTS000019 (TLKV + Trang Sức + Loại Nhẫn, giá vốn 0) → đảo phiếu qua Hóa đơn; ẩn SKU/sản phẩm test (`SKU_DEACTIVATE`).
    - V24KHOATAI000300: Danh mục VÀNG 10K → VÀNG 24K (giữ Loại Khuyên Tai; SKU `tlkv-v24kho-0.338` không đổi).
    - Brand Vàng thị trường: `brand_categories` chỉ **VÀNG 10K**; 3 SP catalog `Vàng Thị Trường 9/99/999` (tồn 0). Vàng thị trường mua vào vẫn đi nhóm MG (SKU `MG-…`), không phải 3 SP catalog trên.
    - L-VOID-DEPOSIT: migration `20261113174743_void_deposit_fulfilled_restock` — `void_sale_invoice` hoàn kho khi DEPOSIT+FULFILLED (giống PREORDER đã giao). Backup `tlkv_backup_20261110._routines__void_deposit`. Không backfill 8 HĐ lịch sử (liệt kê đối soát thủ công).
