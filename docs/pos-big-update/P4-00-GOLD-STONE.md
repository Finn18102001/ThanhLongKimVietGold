# Phase 4 — Mua / bán vàng trang sức kèm đá

> Mở: 2026-11-12 · Yêu cầu: tuananh18101@gmail.com · Trạng thái: **Xong 4.1–4.5 (C1–C11), đã hard-test giao dịch thật và hủy chứng từ test** (xem §9). Còn: giá bán MG, đơn tạm / đặt cọc, cột xuất Excel.
> Liên quan: [`P1-06-MARKET-GOLD.md`](./P1-06-MARKET-GOLD.md) (D1–D9), [`P1-01-RECEIVE-LABEL.md`](./P1-01-RECEIVE-LABEL.md), [`02-IMPACT-ASSESSMENT.md`](./02-IMPACT-ASSESSMENT.md). Thuộc GĐ5 (mua) + GĐ6 (bán) trong plan 7 giai đoạn.

## 1. Yêu cầu (tóm tắt nguyên văn)

1. **Mua vào** (modal Thêm vàng thị trường, cả hàng nguyên và hàng nấu): thêm *Trọng lượng đá* (decimal), *Giá tiền đá* (VND nhập tay). Tổng = Giá vàng + Giá đá. Vẫn là 1 dòng mua, không tách giao dịch đá.
2. **Chứng từ mua:** Phiếu 02 và Phiếu thu mua kiêm nhập kho có **dòng đá riêng** (TL đá, giá đá). Phiếu cam kết nấu **không** hiện đá. Nấu hay không theo lựa chọn nấu hiện tại, không theo có đá.
3. **Sản phẩm / tồn:** mua xong tạo card SKU như vàng thị trường hiện tại; lưu riêng TL vàng, TL đá, hàm lượng, giá đá. Chưa làm danh mục cây, chưa mua bán đá lẻ.
4. **Bán ra** (chung cho SP từ tab In tem và SP mua từ khách): Tổng = Giá vàng (bảng giá liên kết tại lúc bán) + Giá đá (theo SP, sửa được khi bán) + Tiền công (từ tem nếu có, optional, chỉnh +/- như voucher; = 0 thì không in dòng công ở phiếu bán). Lưu riêng: hàm lượng, TL vàng, TL đá, giá vàng, giá đá, tiền công, tổng.
5. **Tồn kho:** quản lý như 1 SP; nhập kho / xuất bán ghi đủ thông tin vàng + đá; không đổi logic tồn ngoài phần cần thiết.
6. **In tem từ hóa đơn mua:** nút **In tem** cạnh **Tài liệu** ở chi tiết hóa đơn mua → mở luồng in tem, tự chọn SKU, điền HL, TL vàng, TL đá, giá đá, ghi chú; sửa được trước khi in; **không** tạo giao dịch mua / cộng tồn lần 2.
7. **Snapshot:** giá vàng + giá đá lúc mua lưu lại; bán lấy giá vàng lúc bán, sửa giá đá khi bán không đổi lịch sử mua. Đá không là SP độc lập nhưng dữ liệu lưu riêng.

## 2. Hiện trạng (rà soát 2026-11-12)

| Vùng | Hiện trạng | Hệ quả cho Phase 4 |
|---|---|---|
| Dòng mua `pos_buy_items` | Không có cột đá. `total_price_dong = unit_price × weight_chi × qty` tính ở SQL (`create_buy_intake`, 2 khối `jsonb_to_recordset`) | Thêm cột + công thức mới ở cả 2 khối |
| Nhập cân sau nấu `pos_set_buy_melt_weights` | **Tính lại** `total_price_dong = unit × weight_after × qty` | Nếu không sửa → **mất giá đá** sau nấu |
| Lựa chọn nấu | `pos_buys.skip_melt`; UI chỉ cho "Không nấu" khi **mọi dòng không phải vàng thị trường** (`canOfferSkipMelt`) → vàng thị trường luôn đi luồng nấu | Mâu thuẫn "áp dụng cho cả hàng nguyên" → hỏi Q4 |
| SKU vàng thị trường | `ensure_market_gold_sku` tạo 1 SKU `MG-*` / dòng mua, inactive, `weight_chi`, `labor_fee_dong = 0`, không dòng giá | Thêm cột đá trên `pos_skus` |
| Nhập kho | `pos_complete_buy_melt` → `apply_stock_change(+qty, PURCHASE_RECEIVED, cost = total/qty)` → `last_cost_dong` | Giá vốn sẽ gồm giá đá |
| Giá bán MG | `compute_unit_price`: MG = `last_cost_dong` (chốt D9 Phase 1) | **Mâu thuẫn** yêu cầu "giá vàng theo bảng giá lúc bán" → hỏi Q5 |
| Giá bán SP thường | `sell × weight_chi / board_unit_chi + pos_skus.labor_fee_dong`; điều chỉnh ±300k/chỉ ("Giá GD / SP") | Cần tách giá vàng / đá / công |
| Tiền công | `pos_skus.labor_fee_dong` luôn 0 (không UI ghi). Tiền công trên tem chỉ nằm trong `pos_label_print_log` theo từng lần in; POS bán theo `sku_id`, không biết chiếc tem nào | Cần nguồn công cho lúc bán → hỏi Q6 |
| "Sản phẩm phụ" | Không có. Phụ phí túi/hộp = **Khoản thu thêm** `pos_sale_charges`: cấp hóa đơn, `amount_dong > 0`, không gắn dòng | Không dùng được cho công âm / theo dòng → đề xuất cột theo dòng |
| Dòng bán `pos_sale_items` | Có `gold_sell_dong`, `weight_chi`, `labor_fee_dong` (copy SKU), `price_adjustment_per_chi`; check tiền ≥ 0 | Thêm cột snapshot đá / công điều chỉnh |
| Đơn tạm / đặt cọc | `pos_held_order_items` chỉ lưu giá; đặt cọc in bảng hàng từ `pos_sale_items` | Phạm vi → hỏi Q10 |
| Hóa đơn in | `InvoiceDocument` tối đa **4 dòng** (`print-template.ts`); đơn giá = giá chiếc / TL | Dòng đá / công làm đầy form → hỏi Q9 |
| Chứng từ mua | `PurchaseVoucherDocument` (Phiếu mua hàng kiêm nhập kho và chi tiền), `Form02Document` (cũng dùng ở `form02`), `MeltCommitmentDocument` — đều đọc `pos_get_buy` | Thêm dòng đá ở 2 phiếu; phiếu nấu đọc item nên tự không có đá |
| Chi tiết hóa đơn mua | 2 nơi có nút "Tài liệu": `BuyDetailDrawer` (mở từ Hóa đơn) và modal chi tiết trong `PurchaseWorkspace` | Thêm nút In tem ở cả 2 |
| Dropdown SKU In tem | `label-print/query.ts` lọc `is_active = true` → **SKU MG (inactive) không xuất hiện** | Cần cho SKU MG đã nhập kho vào dropdown |
| Nhập hàng tab In tem | 1 lần nhập = 1 SKU Order, N chiếc chung SKU; form tem có KLĐ, C (công) | Thêm giá đá; lưu đá / công lên SKU |

## 3. Đề xuất thiết kế (chờ chốt §7)

### 3.1 Dữ liệu (migration additive, existing tables → giữ grant hiện có; backup snapshot `tlkv_backup_20261110`)

| Bảng | Cột mới | Ghi chú |
|---|---|---|
| `pos_buy_items` | `stone_weight_chi numeric(12,4) default 0`, `stone_price_dong bigint default 0`, `gold_amount_dong bigint` | Snapshot lúc mua. `total = gold_amount + stone_price`. Dòng cũ: `gold_amount = total`, đá 0 |
| `pos_skus` | `stone_weight_chi`, `stone_price_dong` (default 0). `weight_chi` = **TL vàng** | Giá đá mặc định khi bán. `labor_fee_dong` dùng làm tiền công của SP |
| `pos_sale_items` | `stone_weight_chi`, `stone_price_dong`, `gold_amount_dong`, `labor_adjust_dong` (có dấu), `stone_price_reason` / `labor_adjust_reason` | Snapshot lúc bán. `labor_fee_dong` (đã có) = công gốc |
| `pos_inventory_transactions` | `stone_weight_chi` (nullable) | Ghi TL đá khi nhập / xuất cho kiểm kê. Overload `apply_stock_change` có tham số mặc định, caller cũ không đổi |

Check: TL đá ≥ 0, giá đá ≥ 0, tổng dòng ≥ 0. Tiền là `bigint` VND.

### 3.2 RPC / function sửa

- `create_buy_intake` (+ wrapper): nhận `stone_weight_chi`, `stone_price_dong` / dòng; tổng dòng = vàng + đá; `ensure_market_gold_sku` ghi đá lên SKU MG.
- `pos_set_buy_melt_weights`: chỉ tính lại **phần vàng**, giữ giá đá.
- `pos_get_buy`, `void_buy` snapshot, `pos_list_form02` / export, `pos_export_documents`, `pos_export_transactions`: thêm trường đá.
- `compute_unit_price` + `complete_sale` (4 overload) + `pos_complete_held_sale`: giá vàng theo dòng giá lúc bán, giá đá (client gửi, server kiểm ≥ 0 + ghi audit khi khác SKU), công gốc + điều chỉnh (có giới hạn §7). Backend tính tổng, không tin tổng từ client.
- Label print: dropdown cho SKU MG đã có tồn; nhận tham số mở từ hóa đơn mua (chỉ in, không gọi luồng nhập).

### 3.3 UI

- Mua: `MarketGoldModal` (+ TL đá, Giá đá), giỏ / review / chi tiết hiện vàng + đá + tổng; `PurchaseVoucherDocument`, `Form02Document` thêm dòng đá; `BuyDetailDrawer` + modal chi tiết: nút In tem.
- In tem: section Nhập hàng thêm Giá đá; form tem nạp sẵn từ hóa đơn mua.
- Bán: dòng giỏ tách Giá vàng / Giá đá (sửa) / Tiền công (+/-), checkout dialog, hóa đơn in / drawer / chi tiết.

## 4. Module boundary

Được sửa (theo bước, mỗi bước báo trước): `purchase`, `form02`, `label-print`, `pos`, `invoice`, migration SQL. Đọc lại khi cần: `reporting`, `customer`, `inventory` (chỉ cột hiển thị / xuất). Không sửa: `dashboard`, `cashflow`, `gold-management`, website `main`.

## 5. Logic cũ phải giữ nguyên (regression)

1. Dòng mua / bán **không có đá**: tổng, phiếu, kho, báo cáo y như cũ.
2. Luồng nấu: cam kết nấu → nhập cân sau nấu → xác nhận → Phiếu 02 → hoàn tất nhập kho / chi tiền; hủy phiếu mua đảo kho + tiền.
3. Vàng thị trường: 3 card + Bạc, picker món, nhóm hàm lượng D2–D4.
4. In tem: Tạo MSP, In / In lại, lịch sử, offset tem 90×14; Nhập hàng tab In tem (1 SKU / lần nhập).
5. Idempotency phiếu mua / bán, ActionResult (không throw), không xóa giao dịch đã hoàn tất.

## 6. Thứ tự triển khai (sau khi chốt §7)

| Bước | Nội dung | Kiểm chứng |
|---|---|---|
| 4.1 | Backup snapshot bảng / function chạm vào; migration cột + function mua (intake, melt weights, get_buy, void, exports) | SQL test trong transaction rollback |
| 4.2 | UI mua + 2 phiếu + Phiếu 02 module | DevTools: tạo phiếu mua test có đá, in 3 phiếu, nấu, hoàn tất, hủy |
| 4.3 | In tem từ hóa đơn mua + dropdown SKU MG + giá đá ở Nhập hàng tab In tem | In tem không đổi tồn / không thêm phiếu |
| 4.4 | Giá bán: `compute_unit_price` / `complete_sale` / held + UI giỏ, checkout | Bán SP có đá, sửa giá đá, công +/−, hóa đơn |
| 4.5 | Hóa đơn in / drawer / đặt cọc / export / báo cáo | Xuất Excel có cột đá |
| 4.6 | Hard-test tổng + ghi mã chứng từ test để hủy | Ghi §9 |

## 7. Câu hỏi nghiệp vụ (đang chờ chốt)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | "Trọng lượng (chỉ)" hiện có trong modal là TL vàng hay TL tổng (vàng + đá)? | TL vàng |
| Q2 | Giá đá nhập theo **1 chiếc** (× SL) hay **cả dòng**? | 1 chiếc |
| Q3 | Hàng nấu có đá: sau nấu giá đá vẫn trả cho khách? SKU sau nấu còn đá không? | Giữ giá đá trong tiền mua; SKU giữ thông tin đá |
| Q4 | Vàng thị trường hiện **luôn** phải nấu. Mở "Không nấu" cho vàng thị trường (hàng nguyên)? | Mở |
| Q5 | Giá bán MG đang = giá vốn (D9). Đổi sang giá dòng giá lúc bán + đá + công? (dòng giá thị trường giá bán = 0 → "Chưa có giá") | Hỏi |
| Q6 | Nguồn tiền công khi bán: lưu trên SKU (nhập ở In tem) hay quét tem lúc bán? | Lưu trên SKU |
| Q7 | Giới hạn chỉnh công: công cuối ≥ 0 hay cho âm (giảm sang giá vàng)? Bắt buộc lý do? | Công cuối ≥ 0, có lý do khi chỉnh |
| Q8 | Điều chỉnh "Giá GD / SP" ±300k/chỉ hiện có: giữ, hay thay bằng chỉnh công? | Giữ |
| Q9 | Hóa đơn in (form 4 dòng): đá / công in thành dòng phụ dưới SP? | Dòng phụ, nới giới hạn dòng |
| Q10 | Phạm vi bán: chỉ Bán ngay, hay cả Đặt cọc / Đặt trước / Đơn tạm? | Hỏi |
| Q11 | In tem từ hóa đơn mua: cho in ở trạng thái nào? Ghi chú lấy từ đâu? | Sau khi hoàn tất nhập kho; ghi chú = ghi chú phiếu mua |

### 7.1 Đã chốt (2026-11-12)

| # | Quyết định |
|---|---|
| C1 | `Trọng lượng (chỉ)` = **TL vàng** (không gồm đá). Giá vàng mua = đơn giá/chỉ × TL vàng × SL. |
| C2 | TL đá và giá đá nhập **theo 1 chiếc**, nhân SL. Tổng dòng mua = (giá vàng 1 chiếc + giá đá 1 chiếc) × SL. |
| C3 | Hàng nấu có đá: vẫn trả tiền đá cho khách (nhập cân sau nấu chỉ tính lại phần vàng); SKU nhập kho giữ TL đá + giá đá. |
| C4 | Vàng thị trường **vẫn luôn nấu** như cũ (không mở "Không nấu"). |
| C5 | Giá bán MG **đổi hẳn** sang bảng giá lúc bán (giá bán/chỉ của dòng giá nhóm × TL vàng) + đá + công. Dòng giá bán = 0 / chưa có → **không cho bán** đến khi admin cập nhật giá. Thay D9 của Phase 1. ⚠ Lúc chốt: dòng 999.9 (`r9`) / 99.9 (`r10`) giá bán = 0, nhóm 9 và Bạc chưa có dòng giá → toàn bộ MG tồn tạm không bán được tới khi có giá. |
| C6 | Tiền công mặc định lưu trên **SKU** (`pos_skus.labor_fee_dong`): nhập ở tab In tem → tự lưu vào SKU (không chỉ lịch sử in). POS Order luôn hiện field **Tiền công**: lấy từ SKU, chưa có = 0; chỉnh tăng / giảm trực tiếp; = 0 thì không in dòng công ở phiếu bán; lưu công thực tế từng giao dịch. |
| C7 | Chỉnh công: tăng không giới hạn; giảm tới công cuối ≥ 0. Lưu **công gốc, điều chỉnh, công thực tế**. Không bắt buộc lý do. |
| C8 | Giữ ô "Giá GD / SP" (±300.000 đ/chỉ) như cũ; Giá đá + Tiền công là ô riêng. |
| C9 | Hóa đơn bán in mỗi SP thành tối đa 3 dòng: (1) Vàng: tên, hàm lượng, TL, SL, đơn giá, thành tiền · (2) Đá: thông tin đá, TL, SL, đơn giá, thành tiền · (3) Tiền công: thành tiền (chỉ khi ≠ 0). |
| C10 | Đợt này áp cho **Bán ngay**; Đặt cọc / Đặt trước / Đơn tạm làm đợt sau (vẫn chạy logic cũ, không vỡ). |
| C11 | Nút In tem ở chi tiết hóa đơn mua chỉ bật khi phiếu đã **hoàn tất nhập kho**; ghi chú = ghi chú phiếu mua. |

Giả định kèm theo (sửa nếu sai): SKU từ tab In tem cũng có `weight_chi` = TL vàng; Giá đá + TL đá nhập ở tab In tem lưu lên SKU như tiền công; dòng không có đá in như cũ (không có dòng "Đá").

## 8. Lịch sử thay đổi

- 2026-11-12: tạo file, rà soát impact, chờ chốt Q1–Q11.
- 2026-11-12: chốt C1–C11 (thay D9 Phase 1 bằng C5). Bắt đầu bước 4.1.
- 2026-11-12: xong 4.1–4.5 (3 migration + UI mua / in tem / POS / hóa đơn), kiểm chứng không tạo giao dịch.

## 9. Đã làm (2026-11-12)

### 9.1 DB (đã áp production, file repo trùng version)

| Migration | Nội dung |
|---|---|
| `20261111182014_p4_buy_stone` | Backup `tlkv_backup_20261110.pos_buy_items__p4`, `pos_skus__p4`, `_routines__p4` (21 function). Cột `pos_buy_items.stone_weight_chi / stone_price_dong / gold_amount_dong`, `pos_skus.stone_weight_chi / stone_price_dong` (default 0, check ≥ 0). `create_buy_intake`: tổng dòng = vàng + đá × SL, SKU MG nhận đá. `pos_set_buy_melt_weights`: chỉ tính lại vàng, giữ đá; SKU MG nhận TL sau nấu. `pos_get_buy`: thêm `stoneWeightChi / stonePriceDong / goldAmountDong`. |
| `20261111182451_p4_sku_sale_components` | RPC `pos_set_sku_sale_components(sku, công, TL đá, giá đá)` + audit `SKU_SALE_COMPONENTS` before/after. Grant `authenticated`, `service_role`. |
| `20261111183407_p4_sale_gold_stone_labor` | Backup `pos_sale_items__p4`, `pos_skus__p4_sale`. Cột `pos_sale_items.gold_amount_dong / stone_weight_chi / stone_price_dong / stone_price_default_dong / labor_adjust_dong / labor_final_dong`. `pos_private.compute_gold_unit` (MG = giá bán dòng giá nhóm × TL vàng, = 0 → chặn bán), `compute_unit_price` = vàng + công + đá mặc định. `complete_sale`: dòng = vàng (+ điều chỉnh/chỉ) + đá (client gửi, ≥ 0) + công gốc + điều chỉnh (công cuối ≥ 0); audit `line_edits`. Đồng bộ TL 18 SKU MG = KL sau nấu (audit `SKU_WEIGHT_SYNC`). |

Kiểm chứng DB: giá niêm yết 94 SKU catalog đang bán **không đổi** (so công thức cũ, 0 lệch). Dòng giá MG: 999.9 / 99.9 giá bán = 0, nhóm 9 và Bạc chưa có dòng → MG đang **không bán được** (đúng C5).

### 9.2 Code

- `purchase`: `MarketGoldModal` (TL vàng / chiếc, TL đá / chiếc, giá đá / chiếc, xem trước Giá vàng / Giá đá / Tổng), `types.ts` (`lineGoldDong`, `lineStoneDong`, `lineTotalDong` = vàng + đá, payload `stone_*`), giỏ / review / chi tiết hiện dòng đá, `buyPrintRows` (dòng đá riêng) dùng cho `PurchaseVoucherDocument` + `Form02Document`; `BuyLabelPrintButton` cạnh "Tài liệu" ở `BuyDetailDrawer` và modal chi tiết (chỉ bật khi `COMPLETED`; nhiều dòng → chọn dòng).
- `form02`: `Form02DetailDrawer` bảng màn hình dùng `buyPrintRows`.
- `label-print`: dropdown có SKU MG còn tồn; form có Giá đá / chiếc; KLT = KLV + KLĐ mặc định từ SKU; in xong lưu công / TL đá / giá đá lên SKU (`saveLabelSkuComponents`, ActionResult); nhận prefill URL `?sku&src&ga&klv&kld&sp&note` (`prefill.ts`), banner "Chỉ in tem, không tạo phiếu mua / không cộng tồn".
- `pos`: catalog có `goldUnitDong / laborFeeDong / stone*`; MG giá = giá bán nhóm × TL; giỏ có ô Giá đá (khi SP có đá) + Tiền công / chiếc (luôn hiện, công cuối ≥ 0), dòng tóm tắt Vàng · Đá · Công; payload `stone_price_dong`, `labor_adjust_dong`; checkout dialog hiện tách thành phần.
- `invoice`: `InvoiceLine` có thành phần; Giấy đảm bảo in mỗi SP tối đa 3 dòng (Vàng / Đá / Tiền công khi ≠ 0), > 4 dòng thì thu nhỏ đều trong vùng 4 dòng của phôi (tối đa 8); drawer hiện tách thành phần. Dòng bán trước P4 in 1 dòng như cũ.

### 9.3 Kiểm chứng UI (DevTools, không tạo giao dịch)

- Mua: modal 999.9, TL 1,5 × SL 2 × 12.000.000 + đá 500.000 / chiếc → Giá vàng 36.000.000, Giá đá 1.000.000, Tổng 37.000.000; giỏ hiện "Đá 0,25 chỉ · 500.000 đ / chiếc" (đã xóa giỏ nháp).
- Bán: Bông Lúa Vàng 0.1 Chỉ, công 0 → 150.000 → dòng 1.320.000 → 1.470.000, ghi "gốc 0 đ, +150.000 đ" (đã xóa giỏ). Card MG hiện "Chưa có giá".
- In tem từ hóa đơn mua: BUY-000435 → `/label-print` tự chọn `MG-083E495EE87D`, HL 9999, KLV / KLT 3,552, banner + ghi chú "CK". Không bấm in.

### 9.4 Hard-test giao dịch thật (2026-11-12, đã được đồng ý)

Phát hiện khi test: `pos_mint_label_piece` chỉ nhận SKU active → không tạo được MSP cho SKU MG. Sửa bằng migration `20261111184919_p4_label_mint_market_gold` (cho SKU MG còn tồn; backup function vào `_routines__p4`).

| Bước | Mã | Kết quả |
|---|---|---|
| Mua vàng thị trường 999.9 có đá (KH000169, 0,1 chỉ × 1.000.000 + đá 0,02 chỉ / 50.000) | **BUY-000443** | Tổng 150.000 = vàng 100.000 + đá 50.000; SKU `MG-1DD19A734FAE` nhận đá |
| Cam kết nấu | PCN20261112-554 | Bản in chỉ dòng vàng, không có đá |
| KL sau nấu 0,09 | | Tổng 140.000 = vàng 90.000 + đá 50.000 (giữ đá); SKU TL 0,09 |
| Phiếu HL (file PDF test) + KH đồng ý + xác nhận HĐ | **BK20261112-555** | Hoàn tất, chi 140.000 tiền mặt, kho 0 → 1 (`PURCHASE_RECEIVED`, giá vốn 140.000). Phiếu mua kiêm nhập kho + Phiếu 02 có dòng "Đá kèm …" riêng |
| In tem từ hóa đơn mua | MSP 000706 | Tự chọn SKU, KLV 0,09 / KLĐ 0,02 / KLT 0,11 / giá đá 50.000 / ghi chú phiếu; công 100.000 lưu vào SKU (audit). Kho vẫn 1, không thêm giao dịch |
| Nhập hàng tab In tem (giá vốn 0) | **PN000094** / SKU **TLKVTS000003** | Tồn 1; tem MSP 000707 với KLĐ 0,03, giá đá 200.000, công 150.000 → lưu SKU |
| Bán TLKVTS000003: sửa đá 200.000 → 180.000, công 150.000 → 100.000 | **HD003385 / SALE-002989** | Tổng 1.598.000 = vàng 1.318.000 (13.180.000 × 0,1) + đá 180.000 + công 100.000; dòng bán lưu đá mặc định / thực tế, công gốc / điều chỉnh / thực tế; audit `line_edits`; kho 1 → 0. Giấy đảm bảo in 3 dòng Vàng / Đá / Tiền công |

**Đã hủy toàn bộ chứng từ test (2026-11-12, lý do "P4 hard-test vàng kèm đá"):** HD003385 / SALE-002989 → VOIDED (kho TLKVTS000003 về 1, `SALE_VOID`) → PN000094 đảo (`PURCHASE_VOID`, kho 0) → SKU TLKVTS000003 ẩn (audit `SKU_DEACTIVATE`) → BUY-000443 → VOIDED (kho `MG-1DD19A734FAE` về 0, thu hồi 140.000 tiền mặt). MSP 000706 / 000707 chỉ là lịch sử tem.

### 9.5 Còn lại

1. Admin nhập **giá bán** dòng giá vàng thị trường 999.9 / 99.9 (và tạo dòng cho nhóm 9, Bạc) để MG bán lại được.
2. Đợt sau (C10): Đơn tạm / Đặt cọc lưu giá đá + điều chỉnh công (hiện đơn tạm chỉ lưu điều chỉnh/chỉ; mở lại đơn tạm dùng đá / công mặc định).
3. Xuất Excel / báo cáo thêm cột TL đá, giá đá, công (dữ liệu đã lưu, chưa xuất). Snapshot hủy phiếu mua (`void_buy`) chưa ghi trường đá (dòng mua vẫn giữ đủ).
4. In thử Giấy đảm bảo trên phôi thật khi đơn > 4 dòng.
