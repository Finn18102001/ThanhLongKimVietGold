# Phase 4 · Flow bán: vàng + đá + tiền công

> Audit: 2026-11-13, chỉ đọc. Nguồn: code nhánh `Finn/New/POS-Future` (commit `9b65fa5`), function và dữ liệu trên DB production.
> Vai trò: mô tả flow bán hiện hành cho ba thành phần giá trị (vàng, đá, tiền công): nguồn dữ liệu, nhập liệu, validation, công thức, dữ liệu lưu, hiển thị; và tách rõ phần đã có với phần còn là mục tiêu (đặc biệt là chiết khấu).
> Quyết định C1–C11 và nhật ký hard-test nằm ở [`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md), không lặp lại ở đây.
> Liên quan: flow mua [`P4-01-BUY-FLOW.md`](./P4-01-BUY-FLOW.md) · báo cáo / Excel [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md).
> **Big Change 2026-11-13:** file này mô tả hiện trạng **trước** Big Change. Các phần về đá bên dưới (ô "Giá đá / chiếc" nhập tay, chứng từ đặt cọc in đơn giá gộp) được thay bởi [`P4-04-BIG-CHANGE-BASELINE.md`](./P4-04-BIG-CHANGE-BASELINE.md) §5.1 và §5.3. **Chiết khấu không triển khai** (BC-23): mọi chỗ ghi chiết khấu là mục tiêu trong file này không còn hiệu lực. Có hiệu lực khi migration ở P4-04 §6 được áp.

Quy ước trạng thái: **Đã có** = đang chạy trên production · **Một phần** = có ở một tầng, thiếu ở tầng khác · **Chưa có** = chưa triển khai, là mục tiêu.

## 1. Nguyên tắc

| # | Nguyên tắc | Nguồn |
|---|---|---|
| S1 | Giá một chiếc khi bán = giá vàng + tiền đá + tiền công. Ba khoản tính riêng, lưu riêng, hiển thị riêng. | P4-00 §1 mục 4, yêu cầu 2026-11-13 |
| S2 | Không gộp tiền đá hoặc tiền công vào đơn giá vàng. Phải đối soát được từng khoản từ dữ liệu đã lưu. | Yêu cầu 2026-11-13 |
| S3 | Đá là thành phần của sản phẩm: có trọng lượng và tiền riêng nhưng không có SKU, tồn kho hay dòng bán riêng. | P4-00 §1 mục 7 |
| S4 | Giá vàng lấy theo bảng giá **lúc bán**. Giá đá lấy theo sản phẩm, sửa được khi bán. Tiền công lấy theo sản phẩm, tăng giảm được khi bán, tiền công cuối ≥ 0. | C5, C6, C7 |
| S5 | Điều chỉnh ±300.000 đ/chỉ chỉ tác động vào phần vàng. Giá đá và tiền công là ô riêng. | C8 |
| S6 | Server tính toàn bộ. Client chỉ gửi lệnh: SKU, số lượng, điều chỉnh / chỉ, giá đá, điều chỉnh công. | Rule 4 |
| S7 | Tổng tiền trước chiết khấu tính từ các thành phần giá trị, sau đó mới áp chiết khấu. | Yêu cầu 2026-11-13. **Chưa triển khai**, xem §9 |

## 2. Hiện trạng tổng hợp

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Tính riêng vàng, đá, công trên từng dòng bán | Đã có | `pos_private.complete_sale` (bản 13 tham số) |
| Lưu riêng từng thành phần trên dòng bán | Đã có | `pos_sale_items` (§7) |
| Sửa giá đá khi bán | Đã có | Ô "Giá đá / chiếc", chỉ hiện khi SKU có đá |
| Tăng giảm tiền công khi bán, công cuối ≥ 0 | Đã có | Ô "Tiền công / chiếc", luôn hiện |
| Lưu công gốc, điều chỉnh, công thực tế; đá mặc định, đá thực tế | Đã có | `labor_fee_dong`, `labor_adjust_dong`, `labor_final_dong`, `stone_price_default_dong`, `stone_price_dong` |
| Audit khi sửa đá hoặc công | Đã có | `pos_audit_log` payload `line_edits` |
| Hiển thị tách thành phần ở giỏ, bước xác nhận, chi tiết hóa đơn | Đã có | `PosCartPanel`, `PosCheckoutDialog`, `InvoiceDrawer` |
| Giấy đảm bảo in tách dòng Vàng / Đá / Tiền công | Đã có | `invoice/InvoiceDocument.tsx` |
| Vàng thị trường bán theo dòng giá nhóm | Đã có về logic; **chưa bán được** vì dòng giá chưa có giá bán | C5, P4-00 §9.5 mục 1 |
| Đặt cọc / Đặt trước tạo từ POS | Một phần | Cùng `complete_sale` nên dòng bán có đủ thành phần; chứng từ đặt cọc chỉ in đơn giá và thành tiền gộp (§8) |
| Đơn tạm (lưu đơn) | Một phần | Chỉ lưu SKU, số lượng, điều chỉnh / chỉ. Giá đá đã sửa và điều chỉnh công bị mất khi mở lại (§10) |
| Trả hàng | Một phần | Hoàn theo đơn giá gộp của dòng bán; dòng trả không tách thành phần |
| Chiết khấu | **Chưa có** | Không có cột, tham số hay màn hình nào (§9) |
| File xuất có cột TL đá, tiền đá, tiền công | Chưa có | P4-03 |

**Dữ liệu thật (2026-11-13):**

- 3.847 dòng bán. 72 dòng tạo sau P4 (`gold_amount_dong` có giá trị): Bán ngay 65, Đặt cọc 4, Đặt trước 3.
- Cả 72 dòng đúng đẳng thức `unit_price_dong = gold_amount_dong + stone_price_dong + labor_final_dong` và `total_price_dong = unit_price_dong × quantity`.
- Chỉ 1 dòng có đá hoặc công khác 0, thuộc hóa đơn test HD003385 đã hủy. Chỉ 2 SKU có đá / công mặc định, đều là SKU test, đã ẩn, tồn 0.
- Nghĩa là: cơ chế đã chạy, nhưng **chưa có giao dịch thật nào có tiền đá hoặc tiền công**. Trên dữ liệu còn hiệu lực, giá chiếc hiện vẫn bằng giá vàng.
- 3.775 dòng trước P4 (`gold_amount_dong` null): tiền công = 0, không có đá, toàn bộ đơn giá là vàng.
- Vàng thị trường: 101 SKU còn tồn, chưa dòng giá nhóm nào có giá bán > 0 nên chưa bán được.
- 744 hóa đơn hoàn tất có khoản thu thêm. Ở cả 744, Σ thành tiền dòng + Σ khoản thu thêm = tổng hóa đơn.

## 3. Nguồn giá trị mặc định trước khi bán

| Thành phần | Lưu ở | Nhập từ đâu |
|---|---|---|
| TL vàng / chiếc | `pos_skus.weight_chi` | Nhập hàng (tab In tem), hoặc KL sau nấu của dòng mua vàng thị trường |
| TL đá / chiếc | `pos_skus.stone_weight_chi` | In tem (ô KLĐ), hoặc dòng mua vàng thị trường có đá |
| Giá đá mặc định / chiếc | `pos_skus.stone_price_dong` | In tem (ô Giá đá), hoặc giá đá lúc mua của dòng vàng thị trường |
| Tiền công mặc định / chiếc | `pos_skus.labor_fee_dong` | In tem (ô C). Chưa nhập = 0 |
| Giá bán vàng / đơn vị bảng giá | `gold_price_rows.sell` theo `pos_skus.price_row_id`; vàng thị trường lấy dòng giá của nhóm hàm lượng | Bảng giá |

Ghi ba giá trị đá và công lên SKU qua RPC `pos_set_sku_sale_components` (gọi sau khi in tem), có audit `SKU_SALE_COMPONENTS` trước / sau. Thay đổi giá trị mặc định không đổi các dòng đã bán.

## 4. Nhập liệu tại POS

| Ô | Hiện khi | Kiểu | Gửi lên server |
|---|---|---|---|
| Số lượng | Luôn | số nguyên ≥ 1 | `quantity` |
| Giá GD / SP (±300.000 đ/chỉ) | Luôn | giá vàng / chỉ | `price_adjustment_per_chi` (chênh so với giá bảng) |
| Giá đá / chiếc | SKU có TL đá > 0 hoặc giá đá mặc định > 0 | số nguyên ≥ 0 | `stone_price_dong` (giá thực tế) |
| Tiền công / chiếc | Luôn | số nguyên ≥ 0, hiển thị công cuối | `labor_adjust_dong` = công nhập − công gốc |
| Khoản thu thêm (hộp, túi, phí) | Tùy chọn | tên + số tiền > 0 | `charges` |

Client **không** gửi đơn giá, thành tiền hay tổng. Một SKU chỉ có một dòng trong giỏ.
TL đá không sửa được khi bán: lấy từ SKU.

## 5. Validation

| Kiểm tra | Màn hình | Server (`complete_sale`) |
|---|---|---|
| Số lượng > 0 | Nút tăng giảm | "Số lượng bán phải > 0" |
| Không trùng SKU | Giỏ theo SKU | "SKU trùng trong giỏ hàng" |
| TL vàng của SKU > 0 | | "Trọng lượng sản phẩm không hợp lệ" |
| Có giá bán hợp lệ | Card hiện "Chưa có giá" | "SKU … chưa gắn bảng giá", "Không tìm thấy dòng giá cho SKU …", "Giá bán trên bảng giá không hợp lệ cho SKU …"; vàng thị trường: "Nhóm vàng thị trường … chưa có giá bán trên bảng giá. Cập nhật giá bán trước khi bán." |
| Điều chỉnh trong ±300.000 đ/chỉ | Ô đỏ + cảnh báo | `assert_price_within_or_exception`. **Không kiểm với SKU vàng thị trường** |
| Giá vàng giao dịch ≥ 0 | | "Giá giao dịch không hợp lệ" |
| Giá đá ≥ 0 | Chặn số âm | "Giá đá không hợp lệ" |
| Tiền công cuối ≥ 0 | Không cho giảm quá công gốc | "Tiền công sau điều chỉnh không được nhỏ hơn 0 (mã SKU)" |
| Khoản thu thêm có tên, số tiền > 0 | Lọc dòng trống | "Khoản phải thu phải có tên", "Số tiền khoản phải thu phải > 0" |
| Số thu trong 0..tổng; còn nợ phải có ngày hẹn | Form thanh toán | "Số tiền thanh toán không hợp lệ", "Số tiền thanh toán vượt tổng đơn", "Đơn còn nợ phải có ngày hẹn trả" |

Ràng buộc bảng: `pos_sale_items_stone_labor_chk` (TL đá ≥ 0, giá đá ≥ 0, giá đá mặc định ≥ 0, công cuối ≥ 0 hoặc null, tiền vàng ≥ 0 hoặc null), `pos_sale_items_money_nonneg`, `pos_sale_items_qty_positive`.

Không có: trần cho giá đá, trần cho mức tăng công, lý do bắt buộc khi sửa đá hoặc công (C7).

## 6. Công thức

Mọi phép tính ở server, theo **1 chiếc** rồi nhân số lượng.

```text
giá vàng niêm yết / chiếc = làm tròn(giá bán bảng giá × TL vàng ÷ đơn vị bảng giá)        (compute_gold_unit)
giá vàng giao dịch / chiếc = giá vàng niêm yết + làm tròn(điều chỉnh / chỉ × TL vàng)      → gold_amount_dong
tiền đá / chiếc           = giá đá nhập khi bán (không nhập thì lấy giá đá mặc định SKU)   → stone_price_dong
tiền công / chiếc         = công gốc SKU + điều chỉnh công                                 → labor_final_dong
đơn giá / chiếc           = giá vàng giao dịch + tiền đá + tiền công                       → unit_price_dong
thành tiền dòng           = đơn giá / chiếc × số lượng                                     → total_price_dong
tổng hóa đơn              = Σ thành tiền dòng + Σ khoản thu thêm                           → pos_sales.total_dong
còn lại                   = tổng hóa đơn − đã thu                                          → pos_sales.remaining_dong
```

Suy ra để đối soát theo dòng:

```text
tiền vàng dòng = gold_amount_dong × quantity
tiền đá dòng   = stone_price_dong × quantity
tiền công dòng = labor_final_dong × quantity
tiền vàng dòng + tiền đá dòng + tiền công dòng = total_price_dong
```

- TL đá **không tham gia** công thức tiền. Tiền đá là số tiền theo chiếc.
- Tiền là số nguyên VND.
- Hiện **không có bước chiết khấu**: "tổng trước chiết khấu" đang chính là tổng hóa đơn.
- Khoản thu thêm là khoản cấp hóa đơn, luôn dương, không gắn dòng hàng.

Ví dụ đã chạy thật (HD003385, đã hủy): giá bán 13.180.000 đ/chỉ × 0,1 chỉ = 1.318.000 đ vàng; đá sửa từ 200.000 xuống 180.000 đ; công sửa từ 150.000 xuống 100.000 đ; tổng 1.598.000 đ.

## 7. Dữ liệu lưu

### 7.1 `pos_sale_items` (snapshot lúc bán)

| Cột | Ý nghĩa | Mức |
|---|---|---|
| `quantity` | Số chiếc | dòng |
| `weight_chi` | TL vàng | 1 chiếc |
| `board_unit_chi`, `price_row_id`, `gold_sell_dong` | Đơn vị bảng giá, dòng giá, giá bán bảng giá lúc bán | |
| `price_adjustment_per_chi` | Điều chỉnh giá vàng / chỉ | 1 chỉ |
| `gold_amount_dong` | Giá vàng giao dịch (đã gồm điều chỉnh). Null = dòng trước P4 | **1 chiếc** |
| `stone_weight_chi` | TL đá, lấy từ SKU lúc bán | 1 chiếc |
| `stone_price_default_dong` | Giá đá mặc định của SKU lúc bán | 1 chiếc |
| `stone_price_dong` | Giá đá thực tế | 1 chiếc |
| `labor_fee_dong` | Tiền công gốc của SKU lúc bán | 1 chiếc |
| `labor_adjust_dong` | Điều chỉnh công, có dấu | 1 chiếc |
| `labor_final_dong` | Tiền công thực tế. Null = dòng trước P4 | 1 chiếc |
| `reference_unit_price_dong` | Giá niêm yết = vàng niêm yết + đá mặc định + công gốc | 1 chiếc |
| `unit_price_dong` | Đơn giá thực tế = vàng + đá + công | 1 chiếc |
| `total_price_dong` | Thành tiền = đơn giá × số lượng | cả dòng |
| `product_name_snapshot`, `sku_snapshot`, `item_status`, `qty_delivered`, … | Không đổi so với trước P4 | |

Chú ý khi đối soát: `gold_amount_dong` ở bảng bán là **1 chiếc**, còn ở bảng mua (`pos_buy_items.gold_amount_dong`) là **cả dòng**.

### 7.2 Bảng liên quan

| Bảng | Ghi gì |
|---|---|
| `pos_sales` | `total_dong`, `paid_dong`, `remaining_dong`, loại giao dịch (SALE / DEPOSIT / PREORDER). Không có cột tổng vàng, tổng đá, tổng công |
| `pos_sale_charges` | Khoản thu thêm: tên, số tiền > 0, lý do. Không nhận số âm |
| `pos_sale_payments` | Từng lần thu: số tiền, hình thức |
| `pos_price_exceptions` | Ghi khi điều chỉnh / chỉ khác 0 |
| `pos_inventory_transactions` | Xuất kho theo số chiếc. Không có cột TL đá |
| `pos_audit_log` | Hoàn tất bán, kèm `line_edits` khi giá đá khác mặc định hoặc điều chỉnh công khác 0 |
| `pos_return_items` | `unit_price_dong`, `total_price_dong` gộp. Không tách thành phần |
| `pos_held_order_items` | `unit_price_dong`, `line_total_dong` gộp. Không tách thành phần |

## 8. Hiển thị

| Nơi | Hiển thị |
|---|---|
| Card sản phẩm POS | Giá chiếc = vàng + đá mặc định + công mặc định. Vàng thị trường chưa có giá bán hiện "Chưa có giá" |
| Dòng giỏ | Ô Giá GD / SP, ô Giá đá / chiếc (khi có đá), ô Tiền công / chiếc; dòng tóm tắt "Vàng … · Đá <TL> chỉ, <tiền> · Công … (gốc …, ±…)" |
| Bước xác nhận thanh toán | Dưới tên hàng: "Vàng … · Đá … · Công … / chiếc"; cột Thành tiền theo dòng |
| Chi tiết hóa đơn (drawer) | Như trên. Dòng trước P4 hiện đơn giá / chỉ như cũ |
| Giấy đảm bảo (bản in) | Mỗi sản phẩm tối đa 3 dòng: Vàng (hàm lượng, TL, đơn giá / chỉ, thành tiền), Đá (TL đá, đơn giá / chiếc, thành tiền; chỉ khi có đá), Tiền công (chỉ khi khác 0). Khoản thu thêm in thành dòng riêng. Hơn 4 dòng thì thu nhỏ trong vùng 4 dòng của phôi; **từ dòng thứ 9 trở đi không in** |
| Chứng từ đặt cọc (thỏa thuận, phiếu cọc, biên bản giao) | Bảng hàng chỉ có đơn giá và thành tiền gộp, không tách vàng / đá / công |
| Danh sách hóa đơn, báo cáo, file xuất | Không có cột đá, công (P4-03) |

## 9. Chiết khấu: mục tiêu, chưa triển khai

**Yêu cầu:** tổng tiền trước chiết khấu được tính từ các thành phần giá trị (vàng, đá, công); sau đó mới áp dụng chiết khấu.

**Hiện trạng đã kiểm:**

- Không có khái niệm chiết khấu trong code hay DB: không cột, không tham số RPC, không ô nhập, không dòng in.
- `pos_sale_charges` chỉ nhận số tiền > 0 (ghi chú bảng: "Never a negative discount"; màn hình báo "Không dùng khoản âm để giảm giá"). Quy định gốc: `POS_BUG_FIX_FUTURE_REQUIREMENTS_v1.1.md` §5.6 "Giảm giá phải là nghiệp vụ riêng".
- Ba cách hiện có làm giá thấp hơn niêm yết đều là **sửa giá thành phần trước khi cộng tổng**, không phải chiết khấu: điều chỉnh âm tới −300.000 đ/chỉ trên vàng, giảm tiền công tới 0, sửa giá đá xuống. Sau khi sửa, hệ thống chỉ lưu giá gốc và giá thực tế của từng thành phần, không có số "trước chiết khấu / sau chiết khấu".

**Phần đã sẵn sàng cho yêu cầu:** vế đầu (tổng từ thành phần) đã đúng: `total_price_dong` của dòng chính là tổng các thành phần, và từng thành phần đã lưu riêng nên làm cơ sở tính chiết khấu theo từng khoản được.

**Chưa có và cần chốt trước khi thiết kế** (không tự suy diễn):

| # | Câu hỏi |
|---|---|
| Q-S1 | Chiết khấu áp theo dòng hàng, theo hóa đơn, hay cả hai? |
| Q-S2 | Tính theo % hay số tiền? Trên cơ sở nào: tiền công, tiền đá, toàn bộ sản phẩm (gồm vàng), hay tổng hóa đơn? |
| Q-S3 | Quan hệ với điều chỉnh ±300.000 đ/chỉ và chỉnh tiền công đang có: giữ song song hay thay thế? Nếu song song, thứ tự áp dụng? |
| Q-S4 | Làm tròn chiết khấu % về số nguyên VND theo quy tắc nào? |
| Q-S5 | Ai được chiết khấu, giới hạn bao nhiêu, có bắt buộc lý do hay mã chương trình khuyến mãi không? |
| Q-S6 | Với Đặt cọc / Đặt trước / thu nhiều lần / Trả hàng / Hủy hóa đơn: chiết khấu phân bổ và hoàn lại thế nào? |
| Q-S7 | Giấy đảm bảo (phôi 4 dòng) in chiết khấu ở đâu? |
| Q-S8 | Doanh thu trong báo cáo lấy trước hay sau chiết khấu? Khoản thu thêm có được chiết khấu không? |

File tham chiếu cho thấy một cách làm cụ thể (chiết khấu theo % trên tiền công, tiền đá hoặc toàn bộ sản phẩm, gắn chương trình khuyến mãi); chi tiết và mức khớp ở P4-03 §2. Đó là cách của hệ thống xuất ra file, chưa phải quy tắc đã chốt cho TLKV.

Ràng buộc đã có sẵn mà thiết kế chiết khấu phải theo: tiền là số nguyên VND; server tính, không tin số từ client; lưu snapshot trên dòng bán; không sửa dòng đã bán; migration chỉ thêm, có backup và GRANT theo §32.1.

## 10. Khoảng trống so với yêu cầu mục tiêu

Chưa triển khai. Không ghi nhận là xong.

| # | Khoảng trống | Ghi chú |
|---|---|---|
| G-S1 | Chiết khấu | §9 |
| G-S2 | Đơn tạm giữ giá đá đã sửa và điều chỉnh công | `pos_save_held_order` chỉ nhận `sku_id`, `quantity`, `price_adjustment_per_chi`. Đơn giá lưu = giá niêm yết + điều chỉnh. Mở lại đơn: đá về mặc định, điều chỉnh công về 0. Khi thanh toán đơn tạm, dòng bán vẫn lưu đủ thành phần theo giỏ lúc thanh toán |
| G-S3 | Chứng từ đặt cọc tách vàng / đá / công | Dữ liệu dòng bán đã có, bản in chưa dùng |
| G-S4 | Trả hàng tách thành phần | Hoàn = `unit_price_dong` × số lượng trả; `pos_return_items` không có cột thành phần |
| G-S5 | Cột TL đá, tiền đá, tiền công, tiền vàng trong file xuất | P4-03 |
| G-S6 | Tổng vàng / đá / công cấp hóa đơn | Chưa lưu sẵn, tính được từ dòng |
| G-S7 | Giấy đảm bảo khi hơn 8 dòng in | Dòng thứ 9 trở đi bị bỏ khỏi bản in. Ví dụ 3 sản phẩm đều có đá và công = 9 dòng |
| G-S8 | Giá bán dòng giá vàng thị trường | Admin chưa nhập nên vàng thị trường chưa bán được (P4-00 §9.5) |
| G-S9 | Sổ kho ghi TL đá khi xuất | `pos_inventory_transactions` không có cột đá |

## 11. Điểm cần xác nhận

| # | Câu hỏi | Hiện tại |
|---|---|---|
| Q-S1 … Q-S8 | Chiết khấu | §9 |
| Q-S9 | C10 ghi Đặt cọc / Đặt trước "làm đợt sau", nhưng giao dịch Đặt cọc / Đặt trước tạo từ POS đã lưu đủ thành phần và sửa được đá, công (7 dòng thật). Coi phần dữ liệu là xong và chỉ còn chứng từ đặt cọc + đơn tạm, hay cần chặn sửa đá / công ở hai loại này? | Sửa được, đã lưu |
| Q-S10 | SKU vàng thị trường khi bán không bị giới hạn ±300.000 đ/chỉ ở server. Có đúng ý cho chiều bán không? | Không giới hạn |
| Q-S11 | Sản phẩm không có đá trên SKU thì không hiện ô giá đá khi bán. Có cần cho nhập tiền đá tại quầy cho SKU chưa khai đá không? | Không hiện ô |
| Q-S12 | Có cần sửa TL đá khi bán không? | Không sửa được, lấy từ SKU |
| Q-S13 | Trả hàng một phần cho dòng có đá, công: hoàn theo đơn giá gộp có đủ không, hay cần tách từng khoản? | Hoàn gộp |

## 12. Logic cũ phải giữ nguyên

1. Sản phẩm không đá, công = 0: giá, hóa đơn, kho, báo cáo như trước P4.
2. Điều chỉnh ±300.000 đ/chỉ và `pos_price_exceptions`.
3. Khoản thu thêm luôn dương, cấp hóa đơn.
4. Dòng trước P4 (`gold_amount_dong` null) in và hiển thị 1 dòng như cũ.
5. Thiếu tồn chuyển Đặt trước; còn nợ hoặc có hẹn giao chuyển Đặt cọc; idempotency; `ActionResult`.
6. Không sửa, không xóa dòng bán đã hoàn tất.

## 13. Lịch sử thay đổi

- 2026-11-13: tạo file từ kết quả audit code + DB. Ghi chiết khấu là mục tiêu chưa triển khai. Chưa đổi code hay DB.
