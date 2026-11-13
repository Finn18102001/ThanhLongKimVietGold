# Phase 1 · Section 6 — Vàng thị trường: 3 card 999.9 / 99.9 / 9 ở tab Mua / Bán

> Mở: 2026-11-11 · Yêu cầu: tuananh18101@gmail.com. Tổng quan: [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md)

## 1. Yêu cầu (nguyên văn tóm tắt)

1. Gộp 2 nhóm "Vàng thị trường" và "Vàng Thị Trường" thành 1.
2. Tab Bán (POS) và tab Mua vào chỉ hiện **3 card**: 999.9, 99.9, 9 (vàng tây). Ẩn toàn bộ card `MG-*` sinh ra mỗi lần mua vàng thị trường.
3. Giá **hiển thị** trên 3 card lấy theo dòng giá (link giá) vàng thị trường.
4. Giá mua / bán **thực tế** trong hóa đơn, kho, báo cáo… giữ nguyên, không đổi logic. Chỉ đổi logic hiển thị ở tab Mua / Bán.
5. Thông tin chi tiết ở hóa đơn / báo cáo giữ nguyên.

## 2. Hiện trạng (2026-11-11)

- Mỗi dòng mua vàng thị trường → `pos_private.ensure_market_gold_sku` tạo 1 SKU `MG-<12 ký tự>` (`is_market_gold`, `is_active = false`, không gắn dòng giá). Live: 118 SKU, 97 còn tồn, mỗi SKU tồn 1 chiếc.
- **Tab Bán:** `pos/query.ts` `fetchPosCatalogMeta({ includeMarketGold: true })` lấy mọi MG → mỗi SKU 1 card, nhóm cứng "Vàng thị trường". Giá card = `last_cost_dong / weight_chi`.
- Nhóm "Vàng Thị Trường" (viết hoa) = 3 SKU cũ `vtt-vtt9-1-4` / `vtt-vtt9-1` / `vtt-vtt9-1-2` ("Vàng Thị Trường 9/99/999", category website). Thêm "Vàng Thị Trường 9999", "VTT 99/999/9999" (category VÀNG 24K). Cả 7 SKU: tồn 0, không dòng giá.
- **Bán:** client gửi `{sku_id, quantity, price_adjustment_per_chi}`; server `compute_unit_price` lấy giá = `last_cost_dong` của **đúng SKU MG đó**, trừ kho theo SKU. → Card gộp phải quy về 1 SKU MG thật khi bán.
- **Tab Mua:** không có card MG; chỉ nút "+ Vàng thị trường" → `MarketGoldModal` (gõ tên, loại vàng, tuổi vàng, trọng lượng, SL, giá/chỉ, gợi ý dòng giá).
- Dòng giá vàng thị trường (`pos_list_market_gold_refs`): `r9` 999,9 mua 12 850 000 / bán 0; `r10` 99,9 mua 12 780 000 / bán 0. **Chưa có dòng giá cho "9" (vàng tây)**.
- Lỗi sẵn có: lưu đơn tạm (held order) có dòng MG bị từ chối (`replace_held_order_items` đòi `is_active`).

## 3. Đã chốt (2026-11-11)

| # | Quyết định |
|---|-----------|
| D1 | Tab Bán: bấm card → mở **danh sách món MG** thuộc nhóm (tên, trọng lượng, tuổi vàng, ngày mua) để NV chọn đúng món. Dòng bán vẫn gửi `sku_id` MG thật → giá / kho / hóa đơn / báo cáo giữ nguyên. |
| D2 | Phân nhóm theo tuổi vàng (đổi ‰ → %: 9999→99,99; 999→99,9; 980→98,0): **999.9** = từ 99,95% · **99.9** = 99,0–99,94% · **9 (vàng tây)** = dưới 99% (980, 750, 610, 585, 418…). |
| D3 | MG trống tuổi vàng: loại vàng chứa "9999" → 999.9, còn lại → 99.9. |
| D4 | MG là **Bạc** (loại vàng chứa "BẠC"): không vào 3 card vàng; hiện 1 card riêng **"Bạc thị trường"**. |
| D5 | Giá hiển thị trên card = giá của dòng giá vàng thị trường (999,9 → `r9`, 99,9 → `r10`). Tab Bán dùng giá bán, tab Mua dùng giá mua. Giá = 0 / không có dòng giá → hiện **"Chưa có giá"**, card **vẫn bấm được**. |
| D6 | Card "9" và "Bạc thị trường": chưa tạo dòng giá, hiện "Chưa có giá" (admin cập nhật sau). |
| D7 | Tab Mua: 3 card (+ Bạc) mở form mua vàng thị trường hiện tại, điền sẵn nhóm + giá mua từ dòng giá; NV vẫn gõ tuổi vàng thật. Nhóm lưu theo card đã bấm (cột mới, additive). |
| D8 | Gộp nhóm "Vàng thị trường" / "Vàng Thị Trường"; **ẩn** 7 SKU cũ (Vàng Thị Trường 9/99/999/9999, VTT 99/999/9999 — tồn 0) bằng inactive + audit, không xóa. |
| D9 | Giá thực tế mua / bán trong hóa đơn, kho, báo cáo **không đổi** (bán = `last_cost_dong` của món MG + điều chỉnh/chỉ như cũ). **Thay bởi P4 C5 (2026-11-12):** MG bán theo giá bán dòng giá nhóm × TL vàng + đá + công; giá bán = 0 → chặn bán. Xem [`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md); công thức bán hiện hành ở [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md) §6, mua có đá ở [`P4-01-BUY-FLOW.md`](./P4-01-BUY-FLOW.md) §5. Các dòng nhật ký test bên dưới ghi theo logic giá vốn cũ. |

## 4. Đã làm (2026-11-11)

**DB** — migration `20261110182624_market_gold_classes` (additive):
- Cột `pos_skus.market_purity_class` (`9999` / `999` / `9` / `SILVER`, nullable).
- `pos_private.market_gold_class_from(gold_type, gold_age)` (quy tắc D2–D4) và `pos_private.market_gold_class(sku_id)` (cột đã lưu → suy từ dòng mua).
- RPC `pos_list_market_gold_stock()` (món MG còn tồn + nhóm), `pos_market_gold_class_prices()` (giá hiển thị theo nhóm từ dòng giá thị trường), `pos_set_market_gold_class(buy_id, lines)` (ghi nhóm theo card, chỉ khi còn trống). Grant `authenticated` + `service_role`, không `anon`.
- Ẩn 7 SKU cũ + 7 dòng audit `SKU_DEACTIVATE`.
- Kết quả live: 97 món còn tồn → 999.9: 53 · 99.9: 37 · 9: 2 · Bạc: 5 món (37 chiếc). Giá: 999.9 → `r9`, 99.9 → `r10` (giá bán đang 0).

**Tab Bán** (`src/modules/pos/**`): lưới chỉ còn 4 card nhóm (nhóm "Vàng thị trường" duy nhất); bấm → `MarketGoldPickerModal` (món, loại / tuổi vàng, KL, giá/chỉ, ngày mua, tồn; xếp món mua sớm trước) → thêm đúng SKU MG vào giỏ như cũ. Card "Chưa có giá" vẫn bấm được.

**Tab Mua** (`src/modules/purchase/**`): 4 card thay nút "+ Vàng thị trường"; bấm → form cũ điền sẵn tên / loại vàng / dòng giá / giá mua; NV gõ tuổi vàng thật. Sau `pos_create_buy_intake` thành công gọi `pos_set_market_gold_class` (lỗi ở bước này không làm hỏng phiếu mua).

**Kiểm chứng:** quy tắc phân nhóm 20 ca mẫu đúng; DevTools: tab Bán 4 card + picker 53 món, chọn món → giỏ đúng SKU MG & giá vốn 13.989.099 đ/chỉ (đã xóa giỏ nháp); tab Mua 4 card + form điền sẵn; `pos_set_market_gold_class` chạy đúng trong khối rollback. **Chưa** tạo phiếu mua / bán thật.

## 5. Rà soát 2026-11-11 tối — đã chốt thêm

| # | Yêu cầu | Trạng thái |
|---|---------|------------|
| R1 | Tuổi vàng khi mua vàng thị trường: chỉ số, ≤ 3 chữ số thập phân, gợi ý 999.9 / 99.9 / 980 / 750 / 610 / 585 / 418, không bắt buộc | Xong (`MarketGoldModal`) |
| R2 | Hóa đơn in: dòng vàng thị trường hiện hàm lượng = tuổi vàng NV gõ lúc mua món đó | Xong (`invoice/query.ts`, fallback `pos_list_sku_purity` khi SKU không có dòng giá) |
| R3 | Màn Kho thêm cột hàm lượng trên bảng | Không làm (chỉ cần trong file xuất) |
| R4 | Dashboard cảnh báo tồn / ô tìm kiếm chung còn liệt kê từng mã MG | Giữ nguyên |
| R5 | Giá card: 999.9 → `r9`, 99.9 → `r10` (dòng "VÀNG THỊ TRƯỜNG" trên bảng giá web). Giá bán 2 dòng này = 0 → tab Bán "Chưa có giá" | Đã nối. Card 9: chưa có dòng giá |
| R6 | Card Bạc: dòng giá bạc `r12` tính theo **lượng** (form mua nhập theo chỉ) | **Tạm chưa nối giá** (theo yêu cầu) |
| R7 | Lỗi "Sản phẩm không còn bán được" khi lưu đơn tạm có món MG | **Không liên quan round này**: điều kiện `is_active` có từ migration 2026-08-28 / 09-06; MG luôn inactive. Ghi lại, chưa sửa |

## 6. Hard-test thật 2026-11-11 23:00 (khách test KH000169 "E2E Ngày VN Test")

| Bước | Kết quả |
|------|---------|
| Mua: card 999.9, tuổi vàng `99.9999` | Bị chặn: "Tuổi vàng là số, tối đa 3 chữ số thập phân" |
| Mua: tuổi vàng `99.99`, 0,1 chỉ, 0đ → **BUY-000442** | Tạo phiếu tiếp nhận (INTAKE, 0đ); SKU mới `MG-85B52BAEAFEC` có `market_purity_class = 9999` (ghi theo card). Chưa nhập kho (chờ luồng nấu). **Chưa hủy được**: `void_buy` chỉ hủy phiếu `COMPLETED` → admin tự hủy phiếu test này |
| Bán (lần 1): card Bạc → `MG-1BEF9C0EF972` | **Lỗi có sẵn**: `null value in column "price_row_id" of relation "pos_sale_items"` — bán vàng thị trường chưa từng chạy được (0 dòng bán MG trên production) |
| Fix | Migration `20261111160717_complete_sale_market_gold_price_row`: `complete_sale` (overload 13 tham số, duy nhất insert `pos_sale_items`) ghi `coalesce(v_sku.price_row_id, '')`. Bản cũ: `scripts/backup/2026-11-11-complete-sale-before.sql` + `tlkv_backup_20261110._routines` |
| Bán (lần 2), Chờ TT → **DH003383** / `PRE-000415` | Thành công (luồng đặt cọc vì chưa thu): đơn giá 370.000 = giá vốn món (logic cũ), `price_row_id = ''`, kho chưa trừ (đặt cọc). Hóa đơn hiện hàm lượng **94** (tuổi vàng lúc mua) |
| Hủy DH003383 | VOIDED, tồn giữ 1, không ledger, không tiền |

Chưa test: đơn bán vàng thị trường **thu đủ tiền** (trừ kho ngay) — cùng đường insert đã sửa.

**Còn lại / lỗi sẵn có (chưa sửa):** lưu đơn tạm có món MG bị từ chối (`replace_held_order_items` đòi `is_active`); Dashboard cảnh báo tồn và ô tìm kiếm chung vẫn liệt kê từng mã MG; nếu admin sửa SP website của 7 SKU cũ, trigger sync có thể bật lại `is_active`.
