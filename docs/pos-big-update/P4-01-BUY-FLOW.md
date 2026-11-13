# Phase 4 · Flow mua: vàng + đá (không tiền công)

> Audit: 2026-11-13, chỉ đọc. Nguồn: code nhánh `Finn/New/POS-Future` (commit `9b65fa5`), function và dữ liệu trên DB production.
> Vai trò: mô tả flow mua hiện hành cho thành phần vàng và đá (nhập liệu, validation, công thức, dữ liệu lưu, chứng từ) và tách rõ phần đã có với phần còn là mục tiêu.
> Quyết định C1–C11 và nhật ký hard-test nằm ở [`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md), không lặp lại ở đây.
> Liên quan: flow bán [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md) · báo cáo / Excel [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md) · luồng nấu 7 bước [`../SRS_PURCHASE_Mua_Hang_Tu_Khach.md`](../SRS_PURCHASE_Mua_Hang_Tu_Khach.md).
> **Big Change 2026-11-13:** file này mô tả hiện trạng **trước** Big Change. Các phần về đá bên dưới (tiền đá / chiếc nhập tay, dòng "Đá kèm" riêng có STT trên phiếu mua và Phiếu 02, không sửa được đá sau tiếp nhận) được thay bởi [`P4-04-BIG-CHANGE-BASELINE.md`](./P4-04-BIG-CHANGE-BASELINE.md) §5.1 và §5.2: đá có số lượng + đơn giá, thành tiền đá tự tính; 1 dòng / sản phẩm; sửa trọng lượng + số lượng đá ở bước tải phiếu hàm lượng. Có hiệu lực khi migration ở P4-04 §6 được áp.

Quy ước trạng thái trong file này:

- **Đã có**: đang chạy trên production, đã kiểm ở code và DB.
- **Một phần**: có ở một tầng (ví dụ server), thiếu ở tầng khác (ví dụ UI).
- **Chưa có**: chưa triển khai. Là mục tiêu, không được coi là xong.

## 1. Nguyên tắc

| # | Nguyên tắc | Nguồn |
|---|---|---|
| B1 | Một dòng mua là một sản phẩm, gồm phần vàng và phần đá. Đá là thành phần của dòng: không tách thành dòng mua riêng, không có SKU riêng, không có tồn kho riêng. | P4-00 §1 mục 1, 7 |
| B2 | Đá có trọng lượng riêng và tiền riêng, nhập theo 1 chiếc rồi nhân số lượng. | C2 |
| B3 | Tiền đá cộng vào thành tiền dòng và tổng phiếu mua. | C2 |
| B4 | Flow mua **không có tiền công**. | Yêu cầu 2026-11-13 |
| B5 | "Trọng lượng (chỉ)" của dòng mua là trọng lượng vàng, không gồm đá. | C1 |
| B6 | Giá vàng và giá đá lúc mua là snapshot. Sửa giá đá khi bán không làm đổi lịch sử mua. | P4-00 §1 mục 7 |
| B7 | Server tính tiền. Màn hình chỉ xem trước. | `SYSTEM_DEVELOPMENT_RULES.md` rule 4 |

Kiểm chứng B4: `pos_buy_items` không có cột tiền công, `create_buy_intake` không nhận tham số tiền công, `MarketGoldModal` không có ô tiền công.
Lưu ý để tránh hiểu nhầm: sau khi phiếu mua hoàn tất, nút **In tem** cho nhập ô C (công) trên tem. Giá trị đó lưu vào SKU làm tiền công mặc định **khi bán** (xem P4-02 §3), không ghi vào phiếu mua và không đổi tiền mua.

## 2. Hiện trạng tổng hợp

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Nhập TL đá và tiền đá cho dòng **vàng thị trường** | Đã có | `purchase/components/MarketGoldModal.tsx` |
| Nhập đá cho dòng **sản phẩm catalog** (hàng đang bán) | Một phần | Server tính đá cho mọi loại dòng; màn hình không có ô nhập đá cho dòng catalog nên thực tế chưa dùng được |
| Tiền đá cộng vào tổng dòng, tổng phiếu | Đã có | `pos_private.create_buy_intake` |
| Lưu riêng TL vàng, TL đá, tiền vàng, tiền đá | Đã có | `pos_buy_items` (§6) |
| Nhập cân sau nấu chỉ tính lại phần vàng, giữ tiền đá | Đã có | `pos_set_buy_melt_weights` |
| SKU vàng thị trường nhận TL đá và giá đá | Đã có | `create_buy_intake` cập nhật `pos_skus` |
| Dòng đá riêng trên Phiếu mua kiêm nhập kho và Phiếu 02 (bản in) | Đã có | `purchase/components/buyPrintRows.ts` |
| Phiếu cam kết nấu không hiện đá | Đã có | P4-00 §9.4 |
| Giá vốn nhập kho gồm cả tiền đá | Đã có | `pos_complete_buy_melt`: giá vốn / chiếc = `total_price_dong / quantity` |
| Sổ kho ghi TL đá | Chưa có | `pos_inventory_transactions` không có cột đá |
| Snapshot hủy phiếu mua ghi trường đá | Chưa có | `pos_private.void_buy` không đọc cột đá (dòng mua gốc vẫn giữ đủ) |
| Danh sách Phiếu 02 trên màn hình và file `phieu-02.csv` tách dòng đá | Chưa có | `pos_list_form02` trả 1 dòng / sản phẩm, thành tiền đã gồm đá (xem P4-03 §3) |
| File xuất có cột TL đá, tiền đá | Chưa có | Không RPC xuất nào đọc cột đá (P4-03) |
| Tiền công ở flow mua | Không áp dụng | B4 |

**Dữ liệu thật (2026-11-13):** 602 dòng mua. 3 dòng đã ghi `gold_amount_dong` (tạo hoặc nhập cân sau P4). 1 dòng có đá, thuộc phiếu test BUY-000443 đã hủy. Chưa có dòng mua có đá nào trên phiếu còn hiệu lực. Công thức `total_price_dong = gold_amount_dong + stone_price_dong × quantity` đúng trên cả 3 dòng.

## 3. Nhập liệu

### 3.1 Dòng vàng thị trường (modal "Mua …" / "Thêm vàng thị trường")

| Ô nhập | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| Tên hàng | Có | chữ | Điền sẵn theo nhóm vàng thị trường |
| Loại vàng | Không | chữ | Trống thì lưu "Vàng thị trường" |
| Tuổi vàng | Không | số, tối đa 4 chữ số nguyên và 3 chữ số thập phân | Ví dụ 999.9, 99.94, 610.5 |
| Trọng lượng vàng / chiếc (chỉ) | Có | số thập phân > 0 | Không gồm đá (B5) |
| Số lượng | Có | số nguyên > 0 | |
| Gợi ý bảng giá | Không | chọn dòng giá | Chỉ để điền sẵn giá mua |
| Giá mua / chỉ (VND) | Có | số nguyên ≥ 0 | Nhập tay, không áp ±300.000 đ/chỉ |
| **Trọng lượng đá / chiếc (chỉ)** | Không | số thập phân ≥ 0 | Để trống = 0 |
| **Giá tiền đá / chiếc (VND)** | Không | số nguyên ≥ 0 | Để trống = 0. Nhập tay, không tính từ TL đá |

Modal xem trước 3 số: **Giá vàng**, **Giá đá**, **Tổng tiền**.

Hai ô đá độc lập nhau: nhập được TL đá mà tiền đá = 0, và ngược lại. Dòng được coi là "có đá" khi TL đá > 0 **hoặc** tiền đá > 0 (`buyItemHasStone`).

### 3.2 Dòng sản phẩm catalog

Nhập số lượng, trọng lượng, giá mua (trong ±300.000 đ/chỉ so với giá tham chiếu). **Không có ô đá.** Payload gửi `stone_weight_chi = 0`, `stone_price_dong = 0`.

## 4. Validation

| Kiểm tra | Màn hình | Server (`create_buy_intake`) |
|---|---|---|
| Số lượng > 0, nguyên | "Số lượng phải là số nguyên lớn hơn 0." | "Số lượng mua phải > 0" |
| TL vàng > 0 | "Trọng lượng (chỉ) phải lớn hơn 0." | "Trọng lượng phải > 0" |
| Giá mua / chỉ ≥ 0 | "Nhập giá mua / chỉ (số nguyên VND)." | "Giá mua không hợp lệ" |
| TL đá ≥ 0 | "Trọng lượng đá phải là số không âm." | "Trọng lượng đá không hợp lệ" |
| Tiền đá ≥ 0 | "Giá tiền đá phải là số nguyên VND không âm." | "Giá tiền đá không hợp lệ" |
| Tuổi vàng đúng định dạng | "Tuổi vàng là số, tối đa 3 chữ số thập phân…" | Không kiểm ở `create_buy_intake` |
| Tên hàng có nội dung | "Nhập tên sản phẩm / mô tả vàng thị trường." | Không kiểm ở `create_buy_intake` |
| Dòng catalog: có SKU, có giá tham chiếu, trong ±300.000 đ/chỉ | Không rà lại trong đợt này (không liên quan đá) | "SKU bắt buộc với hàng catalog", "Thiếu giá tham chiếu cho sản phẩm catalog", `assert_price_within_or_exception` |
| Khách hàng thật (không khách lẻ) | Không rà lại trong đợt này | "Phải chọn khách hàng khi mua vào", "Không dùng khách lẻ cho giao dịch mua vào" |
| Số dự kiến trả trong 0..tổng; chưa trả đủ phải có ngày hẹn | Không rà lại trong đợt này | "Số tiền dự kiến trả không hợp lệ", "Phải có ngày hẹn trả khi chưa trả đủ" |
| KL sau nấu > 0 | Không rà lại trong đợt này | "Khối lượng sau nấu phải > 0" (`pos_set_buy_melt_weights`) |

Ràng buộc bảng: `pos_buy_items_stone_chk` (TL đá ≥ 0, tiền đá ≥ 0, tiền vàng ≥ 0 hoặc null), `pos_buy_items_weight_pos` (TL vàng > 0), `pos_buy_items_qty_pos`, `pos_buy_items_unit_nonneg`, `pos_buy_items_total_nonneg`.

Không có: trần cho tiền đá, ràng buộc giữa TL đá và tiền đá, lý do bắt buộc khi nhập đá.

## 5. Công thức

```text
tiền vàng dòng = làm tròn(giá mua / chỉ × TL vàng / chiếc × số lượng)     → gold_amount_dong
tiền đá dòng   = tiền đá / chiếc × số lượng
thành tiền dòng = tiền vàng dòng + tiền đá dòng                            → total_price_dong
tổng phiếu     = Σ thành tiền dòng                                         → pos_buys.total_dong
còn lại        = tổng phiếu − đã trả                                       → pos_buys.remaining_dong
```

Sau khi nhập cân sau nấu (`pos_set_buy_melt_weights`):

```text
tiền vàng dòng = làm tròn(giá mua / chỉ × KL sau nấu / chiếc × số lượng)
tiền đá dòng   = giữ nguyên
thành tiền dòng, tổng phiếu, còn lại: tính lại theo tiền vàng mới
```

- TL đá **không tham gia** công thức tiền. Tiền đá là số nhập tay theo chiếc.
- Tiền là số nguyên VND (`bigint`). Server làm tròn phần vàng về số nguyên gần nhất. Màn hình xem trước bằng `Math.round`; số lưu là số của server.
- Không có thành phần tiền công, không có chiết khấu.

Ví dụ đã chạy thật (BUY-000443, đã hủy): 0,1 chỉ × 1.000.000 đ + đá 50.000 đ = 150.000 đ. Nhập cân sau nấu 0,09 chỉ: vàng 90.000 đ + đá 50.000 đ = 140.000 đ.
Ví dụ xem trước trên modal: 1,5 chỉ × 2 chiếc × 12.000.000 đ = 36.000.000 đ vàng; đá 500.000 đ × 2 = 1.000.000 đ; tổng 37.000.000 đ.

## 6. Dữ liệu lưu

### 6.1 `pos_buy_items` (snapshot lúc mua)

| Cột | Kiểu | Ý nghĩa | Mức |
|---|---|---|---|
| `quantity` | integer | Số chiếc | dòng |
| `weight_chi` | numeric(12,4) | TL vàng. Sau khi nhập cân = KL sau nấu | 1 chiếc |
| `weight_before_chi`, `weight_after_chi` | numeric(12,4) | KL trước / sau nấu của luồng nấu | 1 chiếc |
| `unit_price_dong` | bigint | Giá mua vàng / chỉ | 1 chỉ |
| `gold_amount_dong` | bigint, null được | Tiền vàng. Null = dòng trước P4 (toàn bộ thành tiền là vàng) | **cả dòng** |
| `stone_weight_chi` | numeric(12,4), mặc định 0 | TL đá | 1 chiếc |
| `stone_price_dong` | bigint, mặc định 0 | Tiền đá | **1 chiếc** |
| `total_price_dong` | bigint | Thành tiền = tiền vàng + tiền đá × số lượng | cả dòng |
| `gold_type`, `gold_age`, `price_row_id`, `reference_price_dong_per_chi`, `is_market_gold`, `price_exception`, `difference_per_chi`, `brand_name`, `product_name_snapshot` | | Không đổi so với trước P4 | |

Chú ý khi đối soát: `gold_amount_dong` ở bảng mua là tiền **cả dòng**, còn ở bảng bán (`pos_sale_items.gold_amount_dong`) là tiền **1 chiếc**. Tiền đá ở cả hai bảng đều là 1 chiếc.

### 6.2 Bảng liên quan

| Bảng | Ghi gì | Đá |
|---|---|---|
| `pos_buys` | `total_dong`, `paid_dong`, `remaining_dong`, `intended_paid_dong`, trạng thái, snapshot khách | Tổng đã gồm đá, không có cột đá riêng |
| `pos_skus` (SKU `MG-…` của dòng vàng thị trường) | `weight_chi` = TL vàng (đồng bộ theo KL sau nấu), `stone_weight_chi`, `stone_price_dong` | Chỉ ghi khi dòng có đá. Giá đá lúc mua trở thành **giá đá mặc định khi bán** của SKU đó |
| `pos_inventory_transactions` | `PURCHASE_RECEIVED`, số lượng trước / sau, `cost_price_dong` = thành tiền dòng / số lượng | Giá vốn gồm đá. Không có cột TL đá |
| `pos_buy_payments`, payable | Tiền chi và công nợ theo tổng phiếu | Không tách vàng / đá |
| `pos_audit_log` | `BUY_MELT_WEIGHT` (tổng sau nấu), `BUY_COMPLETE` (tổng, đã trả) | Không ghi riêng đá |

`pos_get_buy` trả thêm cho mỗi dòng: `stoneWeightChi`, `stonePriceDong`, `goldAmountDong` (dòng trước P4: `total_price_dong − stone_price_dong × quantity`).

## 7. Luồng xử lý

| Bước | Thao tác | RPC | Ảnh hưởng tới đá |
|---|---|---|---|
| 1 | Tiếp nhận: chọn khách, thêm dòng, xác nhận | `pos_create_buy_intake` → `pos_private.create_buy_intake` | Lưu TL đá, tiền đá, tiền vàng từng dòng; tổng phiếu gồm đá; SKU `MG-…` nhận đá |
| 2 | Cam kết nấu | (in phiếu) | Phiếu chỉ có dòng vàng |
| 3 | Nấu vàng | | Không |
| 4 | Nhập KL sau nấu | `pos_set_buy_melt_weights` | Tính lại phần vàng, giữ tiền đá; SKU `MG-…` lấy TL vàng sau nấu |
| 5–6 | Xác nhận khách, hóa đơn mua | | Hiển thị vàng + đá |
| 7 | Xác nhận hóa đơn → Phiếu 02 → hoàn tất | `pos_confirm_buy_invoice`, `pos_complete_buy_melt` | Nhập kho theo số chiếc, giá vốn gồm đá; chi tiền / ghi nợ theo tổng phiếu |
| Hủy | Hủy phiếu mua | `pos_void_buy` | Đảo kho và tiền theo tổng. Dòng mua giữ nguyên dữ liệu đá |
| Sau hoàn tất | In tem từ hóa đơn mua | (module In tem) | Điền sẵn KLV, KLĐ, giá đá. Không tạo phiếu mua, không cộng tồn lần 2 |

Vàng thị trường luôn đi luồng nấu (C4). Vì ô đá chỉ có ở dòng vàng thị trường nên **mọi dòng mua có đá hiện nay đều đi luồng nấu**.

## 8. Hiển thị và chứng từ

| Nơi | Hiển thị |
|---|---|
| Giỏ mua, bước xem lại | Dưới dòng hàng: "Đá <TL> · <tiền đá> / chiếc" khi dòng có đá |
| Chi tiết phiếu mua (`BuyDetailDrawer`, modal chi tiết ở màn Mua) | Như trên, kèm nút In tem khi phiếu đã hoàn tất |
| Phiếu mua hàng kiêm nhập kho, Phiếu 02 (bản in), chi tiết Phiếu 02 | 2 dòng cho sản phẩm có đá: dòng vàng (TL = SL × TL vàng, đơn giá / chỉ, thành tiền = tiền vàng) và dòng "Đá kèm <tên>" (TL = SL × TL đá, đơn giá = tiền đá / chiếc, thành tiền = tiền đá × SL) |
| Phiếu cam kết nấu | Chỉ dòng vàng |
| Danh sách Phiếu 02 (bảng trên màn hình), các file xuất | 1 dòng / sản phẩm, không tách đá |

## 9. Khoảng trống so với yêu cầu mục tiêu

Chưa triển khai. Không ghi nhận là xong.

| # | Khoảng trống | Ghi chú |
|---|---|---|
| G-B1 | Ô nhập đá cho dòng sản phẩm catalog | Server đã tính được; thiếu UI |
| G-B2 | Cột TL đá, tiền đá, tiền vàng trong các file xuất có dòng mua | P4-03 |
| G-B3 | Danh sách Phiếu 02 và `phieu-02.csv` tách dòng đá cho khớp bản in | P4-03 §3 |
| G-B4 | Sổ kho ghi TL đá khi nhập | Đã đề xuất ở P4-00 §3.1, chưa làm |
| G-B5 | Snapshot hủy phiếu mua ghi trường đá | P4-00 §9.5 |

## 10. Điểm cần xác nhận

| # | Câu hỏi | Hiện tại |
|---|---|---|
| Q-B1 | Mua sản phẩm catalog (hàng đang bán) có cần nhập đá không? | Chỉ vàng thị trường nhập được đá |
| Q-B2 | Có cho phép TL đá > 0 mà tiền đá = 0, hoặc tiền đá > 0 mà TL đá = 0? | Cho phép cả hai |
| Q-B3 | Hàng có đá mua nguyên chiếc, không nấu: có cần luồng không nấu không? | Luôn nấu (C4) |
| Q-B4 | Giá đá mặc định khi bán của SKU vàng thị trường lấy bằng giá đá lúc mua: giữ hay để trống cho tới khi in tem? | Lấy bằng giá đá lúc mua |
| Q-B5 | TL đá ghi theo **chỉ** (cùng đơn vị với vàng). Có cần đơn vị khác (ví dụ carat) không? | Chỉ, 4 chữ số thập phân |

## 11. Logic cũ phải giữ nguyên

1. Dòng mua không có đá: tổng, chứng từ, kho, báo cáo như trước P4.
2. Luồng nấu 7 bước và điểm hoàn tất ở bước 7; hủy phiếu mua đảo kho và tiền.
3. ±300.000 đ/chỉ chỉ áp cho dòng catalog; vàng thị trường nhập giá tay.
4. Idempotency, `ActionResult` (không throw lỗi nghiệp vụ), không xóa giao dịch đã hoàn tất.
5. Dòng trước P4 (`gold_amount_dong` null): toàn bộ thành tiền là vàng.

## 12. Lịch sử thay đổi

- 2026-11-13: tạo file từ kết quả audit code + DB. Chưa đổi code hay DB.
