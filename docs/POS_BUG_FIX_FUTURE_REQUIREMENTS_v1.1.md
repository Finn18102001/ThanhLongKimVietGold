# TLKV POS --- BUG FIX + FUTURE REQUIREMENTS SPECIFICATION

## Giai đoạn: Vá lỗi hiện tại + bổ sung nghiệp vụ mới sau khi REQ hiện tại hoàn thành \~70--80%

> **Mục đích:** Đây là specification dành cho AI/code agent để tiếp tục
> phát triển hệ thống POS Thăng Long Kim Việt từ code hiện tại. Tài liệu
> này xác định rõ **phạm vi bắt đầu → business rule → edge cases → dữ
> liệu → trạng thái → kiểm thử → điều kiện kết thúc**, nhằm tránh AI
> hiểu một requirement mới là bug của requirement cũ hoặc tạo ra các
> case có thể "lách".
>
> **Nguyên tắc:** Không xây lại hệ thống từ đầu. Phải inspect
> code/schema hiện tại, xác định phần đang hoạt động, sửa đúng phạm vi
> và giữ backward compatibility.
>
> **Nguồn nền:** Specification này kế thừa các nguyên tắc trong SRS/POS
> specification hiện tại: transaction snapshot, payment history,
> inventory ledger, server time, backend validation, RLS/permission và
> không xóa lịch sử giao dịch.

------------------------------------------------------------------------

# 0. TRẠNG THÁI DỰ ÁN

## 0.1. Trạng thái hiện tại

Phần requirement chính đã hoàn thành khoảng **70--80%**.

## 0.1b. Progress phase v1.1 (cập nhật 2026-09-03)

**Phân loại:** `BUG` = lệch so với requirement cũ. `FUTURE` / `NEW` = nghiệp vụ mới, không phải bug của rule cũ.

| Mã | Loại | Hạng mục | Trước | Sau | Ghi chú |
|---|---|---|---:|---:|---|
| BUG-001 | BUG | Partial pay vs invoice "Hoàn thành" / remaining 0 | 55% | 96% | Backend `paid/remaining` đúng. Certificate in `paidDong` (không in tổng đơn). List/detail TỔNG / ĐÃ TT / CÒN LẠI. Dashboard recent vẫn label sale COMPLETED = Hoàn thành. |
| REQ-NEW-001 | FUTURE | Staff ±300.000đ/chỉ (bán) | 15% | 88% | Rule cũ: staff không đổi giá. Đây **không phải bug**. BUY đã có ±300k. SELL: RPC + UI giỏ, snapshot, ngoài range block. Approval SELL chưa mở (spec: approval đang có cho BUY). |
| REQ-NEW-002 | FUTURE | Khoản thu thêm trên HĐ | 5% | 96% | `pos_sale_charges` cộng total, cấm âm. In thành dòng trên giấy đảm bảo vàng (tối đa 4 dòng gồm SP + phụ thu). |
| REQ-NEW-003 | FUTURE | Tài khoản POS dùng chung ≠ operator | 5% | 92% | `is_shared`, bắt chọn NV quầy (browser: block nếu thiếu). Collect ghi người thu. Shared login STAFF. |
| REQ-NEW-004 | FUTURE | Hết hàng → Đặt hàng, không OUT đến khi giao | 0% | 88% | Stock=0 đặt hàng. `0 < stock < qty` reject. Mixed cart = PREORDER. Fulfill/cancel RPC + UI hóa đơn. |
| REG | - | Regression / selftest / report | 40% | 70% | Browser E2E 2026-09-04: shared login + phụ thu + partial pay + certificate (HD000009). Report doanh thu vs đã thu vs phải thu **chưa** tách. Dashboard recent invoices chưa theo payment_status. |

**Tỷ lệ phase này (DoD §65, trọng số đều 6 nhóm):** trước **~42%** → sau **~92%**. Core POS cũ vẫn ~75-80%; phần **mới của v1.1** từ ~8% lên ~92%.

Không claim 100%: báo cáo order stats (sales vs collected vs receivable), approval SELL ngoài ±300k, dashboard recent vẫn "Hoàn thành" theo sale status.

Giai đoạn hiện tại không phải xây lại POS mà là:

1.  Fix các bug nghiệp vụ đang tồn tại.
2.  Hoàn thiện các trường hợp thanh toán/hóa đơn.
3.  Bổ sung các requirement mới đã phát sinh từ vận hành thực tế.
4.  Bảo đảm dữ liệu cũ không bị sai.
5.  Bảo đảm các transaction mới có thể truy vết.
6.  Bổ sung test cho các edge case trước khi kết thúc phase.

## 0.2. Thứ tự xử lý bắt buộc

``` text
INSPECT CURRENT CODE / DATABASE
        ↓
FIX BUG #1 PAYMENT / INVOICE
        ↓
FIX / ADD PRICE EXCEPTION ±300K
        ↓
ADD RECEIVABLE LINE ITEM
        ↓
ADD SHARED POS ACCOUNT + OPERATOR SELECTION
        ↓
ADD Đặt hàng / OUT-OF-STOCK FLOW
        ↓
REVIEW INVOICE / CUSTOMER / PAYMENT / INVENTORY
        ↓
REGRESSION TEST
        ↓
EDGE CASE TEST
        ↓
FINAL ACCEPTANCE
```

Không được triển khai requirement #5 trước khi hiểu rõ logic
invoice/payment/inventory hiện tại.

------------------------------------------------------------------------

# 1. NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ VỠ

## 1.1. Không rebuild

Không:

-   drop database;
-   recreate bảng đang có;
-   xóa dữ liệu cũ để "cho sạch";
-   thay toàn bộ flow POS nếu chỉ cần sửa một phần;
-   tạo bảng/field trùng với field hiện có chỉ vì tên khác.

Phải:

``` text
Inspect
→ Reuse
→ Extend
→ Migration
→ Test
```

## 1.2. Transaction ≠ Payment ≠ Invoice ≠ Inventory

Các entity phải độc lập nhưng liên kết được:

``` text
Bán hàng
 ├── Bán hàng_ITEMS
 ├── PAYMENT(S)
 ├── INVOICE
 ├── CUSTOMER
 ├── OPERATOR / STAFF
 └── INVENTORY_TRANSACTION(S)
```

Không được dùng một field duy nhất để đại diện cho toàn bộ trạng thái.

Ví dụ:

``` text
sale.status = Đã hoàn thành
payment.status = Thanh toán một phần
invoice.status = Đã phát hành
```

Đây là trạng thái **hợp lệ**.

## 1.3. Tiền

Không dùng floating point để quyết định số tiền.

Ưu tiên:

``` text
VND → integer / bigint
```

hoặc `numeric` nếu schema hiện tại cần decimal.

## 1.4. Snapshot

Sau khi giao dịch được xác nhận, không được lấy lại giá hiện tại từ bảng
Product/Gold Price để render lịch sử.

Phải snapshot:

``` text
product_name
SKU
quantity
weight
unit_price
total_price
price_reference
price_adjustment
```

## 1.5. Backend là nguồn sự thật

Frontend chỉ hỗ trợ UI.

Backend/database phải kiểm tra lại:

``` text
permission
price
quantity
stock
total
paid
remaining
invoice state
order state
operator
```

Không được tin giá trị `total`, `stock`, `remaining` do frontend gửi
lên.

------------------------------------------------------------------------

# 2. PHẠM VI PHASE NÀY

## 2.1. Bug cần fix

### BUG-001

Thanh toán một phần nhưng hóa đơn vẫn:

``` text
Hoàn thành
Đã thanh toán đủ
```

hoặc tổng/đã trả/còn lại trên hóa đơn bị sai.

### BUG-002

Giá bán thực tế có thể cần điều chỉnh ±300.000đ/chỉ nhưng flow hiện tại
chưa hỗ trợ đầy đủ ở POS/admin.

> Đây là requirement mới/hoàn thiện business rule, không được coi là bug
> dữ liệu lịch sử nếu các giao dịch cũ vẫn đúng.

## 2.2. Requirement mới

### REQ-NEW-001

Cho phép điều chỉnh giá bán:

``` text
-300.000đ/chỉ
→
giá bảng hiện tại
→
+300.000đ/chỉ
```

và lưu snapshot/audit.

### REQ-NEW-002

Thêm **khoản phải thu** tùy chỉnh:

``` text
Tên khoản phải thu
Số tiền
Lý do / nội dung
```

Khoản này phải đi trực tiếp vào tổng hóa đơn.

### REQ-NEW-003

Tài khoản chung cho nhiều nhân viên dùng chung máy POS, nhưng mỗi giao
dịch phải chọn/ghi nhận **nhân viên thực tế đang bán/xuất hóa đơn**.

### REQ-NEW-004

Thêm nghiệp vụ **Đặt hàng khi sản phẩm hết kho**, vẫn cho phép chọn sản
phẩm và thanh toán đầy đủ hoặc một phần.

------------------------------------------------------------------------

# 3. BUG-001 --- THANH TOÁN MỘT PHẦN / TRẠNG THÁI HÓA ĐƠN

## 3.1. Mô tả lỗi

Hiện tại có tình huống:

``` text
Tổng hóa đơn = 100.000.000đ
Khách thanh toán = 40.000.000đ
```

nhưng invoice lại hiển thị:

``` text
Status = Đã hoàn thành
Payment = Đã thanh toán đủ
Còn phải thu = 0
```

Đây là sai.

## 3.2. Business rule bắt buộc

Công thức canonical:

``` text
remaining_amount = total_amount - paid_amount
```

Trạng thái thanh toán:

``` text
paid_amount = 0
    → Chưa thanh toán

0 < paid_amount < total_amount
    → Thanh toán một phần

paid_amount = total_amount
    → Đã thanh toán đủ
```

Nếu:

``` text
paid_amount > total_amount
```

→ reject.

Không được tự động coi phần dư là tiền thừa nếu business chưa có
requirement riêng cho refund/change.

## 3.3. Transaction status và Trạng thái thanh toán độc lập

Ví dụ:

``` text
Sale:
Đã hoàn thành

Invoice:
Đã phát hành

Payment:
Thanh toán một phần

Đã thanh toán:
40M

Còn phải thu:
60M
```

Đây là trạng thái hợp lệ.

**Không được dùng:**

``` text
Đã hoàn thành = Đã thanh toán đủ
```

## 3.4. Ví dụ 1 --- Thanh toán đủ

``` text
Sản phẩm: Nhẫn A
Tổng: 100.000.000đ

Khách trả:
100.000.000đ

Đã thanh toán = 100M
Còn phải thu = 0

Trạng thái thanh toán = Đã thanh toán đủ
Trạng thái giao dịch = Đã hoàn thành
Trạng thái hóa đơn = Đã phát hành / Đã hoàn thành tùy model hiện tại
```

## 3.5. Ví dụ 2 --- Thanh toán một phần

``` text
Tổng = 100M
Khách trả = 40M

Đã thanh toán = 40M
Còn phải thu = 60M
Trạng thái thanh toán = Thanh toán một phần
Receivable = 60M
```

Không được:

``` text
Đã thanh toán = 100M
Còn phải thu = 0
```

## 3.6. Ví dụ 3 --- Chưa thanh toán

``` text
Tổng = 100M
Đã thanh toán = 0

Trạng thái thanh toán = Chưa thanh toán
Còn phải thu = 100M
Receivable = 100M
```

Nếu business hiện tại không cho tạo sale hoàn tất với 0đ thì UI/backend
phải chặn theo rule hiện tại. Nếu cho phép bán công nợ thì phải hỗ trợ
rõ ràng.

## 3.7. Ví dụ 4 --- Thanh toán nhiều lần

``` text
Invoice = 100M

Payment #1 = 20M
Payment #2 = 30M
Payment #3 = 50M

Đã thanh toán = 100M
Còn phải thu = 0
Trạng thái thanh toán = Đã thanh toán đủ
```

Lịch sử:

``` text
20M — Staff A — 10:00
30M — Staff B — 13:20
50M — Staff A — 16:05
```

Không overwrite payment history.

## 3.8. Ví dụ 5 --- Thanh toán thêm sau khi đã trả một phần

``` text
Tổng tiền = 100M
Đã thanh toán = 40M
Còn phải thu = 60M
Status = Thanh toán một phần
```

Khách trả thêm:

``` text
+60M
```

Kết quả:

``` text
Đã thanh toán = 100M
Còn phải thu = 0
Status = Đã thanh toán đủ
```

Không tạo invoice mới.

## 3.9. Due date

Nếu:

``` text
Còn phải thu > 0
```

và nghiệp vụ yêu cầu hẹn thanh toán:

``` text
due_date = required
```

Hiển thị:

``` text
Tổng
Đã thanh toán
Còn lại
Ngày hẹn thanh toán
Trạng thái
```

## 3.10. Không được lách bằng cách sửa total

Nếu invoice đã completed:

Không được sửa:

``` text
total_amount
paid_amount
remaining_amount
```

trực tiếp để làm cho trạng thái thành Đã thanh toán đủ.

Nếu có điều chỉnh nghiệp vụ:

``` text
Original transaction
        ↓
Adjustment / Payment / Refund / Return
```

phải tạo lịch sử.

------------------------------------------------------------------------

# 4. BUG/REQ-NEW-001 --- ĐIỀU CHỈNH GIÁ ±300.000Đ/CHỈ

## 4.1. Mục tiêu

Trong thực tế giá vàng có thể thay đổi giữa thời điểm bảng giá được cập
nhật và thời điểm khách chốt mua.

Nhân viên cần khả năng linh hoạt:

``` text
Reference Price
± Adjustment
= Actual Transaction Price
```

Giới hạn:

``` text
-300.000đ/chỉ ≤ Adjustment ≤ +300.000đ/chỉ
```

## 4.2. Ví dụ

Giá bảng:

``` text
14.500.000đ/chỉ
```

Nhân viên có thể chốt:

``` text
14.200.000
14.300.000
14.400.000
14.500.000
14.600.000
14.700.000
14.800.000
```

Nếu nhập:

``` text
15.000.000
```

→ vượt giới hạn.

## 4.3. Giá phải lưu snapshot

Mỗi sale item nên có logic tương đương:

``` text
reference_unit_price
price_adjustment_per_chi
actual_unit_price
quantity / weight
total_price
```

Tên field có thể khác nếu schema hiện tại đã có field tương đương.

## 4.4. Không tính adjustment sai theo quantity

Rule là:

> **±300.000đ trên 1 chỉ**, không phải ±300.000đ cho toàn bộ dòng hàng.

Ví dụ:

``` text
Adjustment = +300.000đ/chỉ
Weight = 2 chỉ
```

Phần điều chỉnh:

``` text
+600.000đ
```

Nếu:

``` text
Weight = 0,5 chỉ
Adjustment = +300.000đ/chỉ
```

thì:

``` text
+150.000đ
```

## 4.5. Với nhiều sản phẩm

Mỗi item phải tính độc lập.

Ví dụ:

``` text
Nhẫn A = 2 chỉ
Adjustment = +300k/chỉ
→ +600k

Dây B = 1,5 chỉ
Adjustment = -200k/chỉ
→ -300k
```

Không được áp một adjustment tổng chung rồi chia sai cho từng item.

## 4.6. UI

POS nên hiển thị:

``` text
Giá bảng:       14.500.000
Điều chỉnh:       +200.000/chỉ
Giá giao dịch:   14.700.000/chỉ
```

Nếu không adjustment:

``` text
Điều chỉnh: 0
```

## 4.7. Ngoài ±300k

Nếu:

``` text
Adjustment < -300k
hoặc
Adjustment > +300k
```

→ không cho hoàn tất theo flow bình thường.

Nếu hệ thống hiện có cơ chế Admin/Manager approval:

``` text
Ngoại lệ điều chỉnh giá
        ↓
Approval
        ↓
Audit Log
        ↓
Allow / Reject
```

Không tự động bypass.

## 4.8. Audit

Phải biết:

``` text
reference_price
actual_price
difference_per_chi
weight
total_difference
reason
created_by
approved_by nếu có
created_at
```

## 4.9. Không được sửa lịch sử

Sau khi sale hoàn tất:

``` text
reference price
actual price
adjustment
total
```

không thay đổi theo bảng giá mới.

------------------------------------------------------------------------

# 5. REQ-NEW-002 --- KHOẢN PHẢI THU TÙY CHỈNH

## 5.1. Mục tiêu

Khi bán hàng có thể phát sinh thêm khoản phí ngoài tiền sản phẩm.

Ví dụ:

``` text
Túi bảo quản vàng
Hộp sản phẩm
Phí hộp quà
Phí bảo quản
Phí khác
```

Nhân viên cần nhập:

``` text
Tên khoản phải thu
Số tiền
Nội dung / lý do
```

Khoản này phải xuất hiện trên hóa đơn và được tính vào số tiền khách
phải trả.

## 5.2. Không gộp mù vào giá sản phẩm

Không được:

``` text
Product price = product price + box fee
```

mà không có dấu vết.

Phải có line item/charge riêng.

## 5.3. Ví dụ

Sản phẩm:

``` text
Nhẫn A = 20.000.000
```

Khoản phải thu:

``` text
Tên: Hộp bảo quản
Số tiền: 100.000
Nội dung: Phí hộp bảo quản sản phẩm
```

Invoice:

``` text
Nhẫn A                     20.000.000
Hộp bảo quản                  100.000
--------------------------------------
TỔNG                       20.100.000
```

## 5.4. Thanh toán một phần

``` text
Tổng tiền = 20.100.000
Đã thanh toán = 10.000.000
Còn phải thu = 10.100.000
```

Payment:

``` text
Thanh toán một phần
```

Không được coi là đã thanh toán đủ.

## 5.5. Nhiều khoản phải thu

Cho phép:

``` text
Hộp = 100k
Túi = 50k
Phí bảo quản = 30k
```

Tổng charge:

``` text
180k
```

Invoice:

``` text
Product subtotal = 20M
Additional receivables = 180k
Tổng thanh toán = 20.180M
```

## 5.6. Khoản phải thu âm

Không cho nhập:

``` text
-100.000
```

nếu hệ thống chưa có requirement riêng cho discount/adjustment.

Giảm giá phải là nghiệp vụ riêng, không dùng "receivable" để lách
discount.

## 5.7. Số tiền bằng 0

Không tạo charge:

``` text
Tên = Hộp
Amount = 0
```

trừ khi hệ thống cần lưu miễn phí vì mục đích nghiệp vụ. Nếu lưu, phải
xác định rõ `amount = 0` không làm thay đổi total.

## 5.8. Tên/nội dung bắt buộc

Nếu thêm khoản phải thu:

``` text
name ≠ empty
amount > 0
```

`reason/note` nên được lưu nếu UI yêu cầu nhập nội dung.

## 5.9. Snapshot

Sau khi invoice hoàn tất:

``` text
charge_name
charge_amount
charge_reason
```

không phụ thuộc vào danh mục phí hiện tại.

## 5.10. Hóa đơn

Khoản này phải hiển thị trực tiếp:

``` text
Tên khoản
Số tiền
```

và tổng hóa đơn phải bao gồm nó.

------------------------------------------------------------------------

# 6. REQ-NEW-003 --- TÀI KHOẢN CHUNG DÙNG CHUNG NHIỀU MÁY

## 6.1. Bối cảnh

Cửa hàng hiện có:

``` text
Nhiều nhân viên
Ít máy POS
```

Nếu mỗi nhân viên bắt buộc một account riêng trên một máy:

``` text
Staff A login
→ logout
Staff B login
→ logout
Staff C login
```

gây bất tiện.

Cần một:

``` text
SHARED POS ACCOUNT
```

có quyền nghiệp vụ tương đương STAFF.

## 6.2. Không được mất danh tính nhân viên thực tế

Điểm quan trọng:

> **Shared account không phải là người thực hiện giao dịch.**

Ví dụ:

``` text
Tài khoản đăng nhập:
POS-01 / Shared Staff

Người thực tế:
Nguyễn Văn A
```

Invoice phải ghi nhận:

``` text
Operator / Sales Staff = Nguyễn Văn A
Login Account = POS-01
```

Nếu schema hiện tại chỉ có `staff_id`, cần mở rộng để phân biệt:

``` text
authenticated_user_id
operator_staff_id
```

hoặc tên tương đương.

## 6.3. Quyền của Shared Account

Shared POS account có quyền tương đương STAFF:

Có:

``` text
POS
Purchase nếu STAFF hiện tại có
Customer
Xem hóa đơn theo permission
Thanh toán
Xuất hóa đơn
```

Không có:

``` text
Dashboard doanh thu
Quản lý staff
Audit Log
Điều chỉnh kho
Xóa lịch sử
```

Backend phải enforce permission.

## 6.4. Chọn nhân viên khi bán

Khi bắt đầu/hoàn tất sale từ shared account:

``` text
Nhân viên thực hiện:
[ Nguyễn Văn A ]
[ Nguyễn Văn B ]
[ Nguyễn Văn C ]
```

Phải chọn trước khi transaction được hoàn tất.

## 6.5. Không cho bỏ trống

Shared account:

``` text
operator_staff_id = NULL
```

→ không được hoàn tất sale/invoice.

Nếu business muốn hỗ trợ "không xác định", đó phải là requirement riêng
và cần approval; không tự thêm.

## 6.6. Ví dụ

Shared login:

``` text
POS-SHARED
```

Người bán:

``` text
Nguyễn Văn A
```

Invoice:

``` text
Invoice: HD00125
Account: POS-SHARED
Sales Staff: Nguyễn Văn A
```

Payment:

``` text
Received by: Nguyễn Văn A
```

## 6.7. Trường hợp đổi nhân viên giữa ca

Không được tự động đổi người của transaction cũ.

Ví dụ:

``` text
09:00 A bán HD001
10:00 B bán HD002
```

HD001 vẫn thuộc A.

## 6.8. Trường hợp payment sau này

Nếu khách quay lại trả nốt công nợ:

``` text
Invoice:
Nhân viên thực hiện ban đầu = A

Payment:
Received by = B
```

Không đổi owner của sale thành B.

Lịch sử phải phản ánh đúng:

``` text
Sale created by / operator A
Nhân viên nhận tiền B
```

------------------------------------------------------------------------

# 7. REQ-NEW-004 --- ĐẶT HÀNG KHI SẢN PHẨM HẾT KHO

## 7.1. Mục tiêu

Khách muốn mua sản phẩm nhưng:

``` text
stock = 0
```

Nhân viên vẫn phải có thể:

``` text
Chọn sản phẩm
→ Đưa vào giỏ
→ Chốt giá hiện tại
→ Thanh toán đủ hoặc một phần
→ Tạo ĐẶT HÀNG
→ Hẹn ngày/giờ nhận hàng
```

Đây **không phải sale giao hàng ngay**.

## 7.2. Quy tắc phát hiện

Nếu trong giỏ có ít nhất một sản phẩm:

``` text
current_stock = 0
```

thì transaction trở thành:

``` text
Đặt hàng / PRE-Đặt hàng
```

và nút:

``` text
THANH TOÁN
```

đổi thành:

``` text
ĐẶT HÀNG
```

## 7.3. Nếu giỏ có nhiều sản phẩm

Ví dụ:

``` text
Nhẫn A stock = 2
Nhẫn B stock = 0
```

Giỏ:

``` text
A x1
B x1
```

→ cả transaction phải được xử lý theo flow đặt hàng nếu không có cơ chế
tách đơn được thiết kế.

Không được:

``` text
trừ A
nhưng coi B như đã giao
```

mà không có business rule rõ ràng.

**Mặc định phase này: transaction có item thiếu hàng → Đặt hàng.**

## 7.4. Có thể chọn toàn bộ sản phẩm

Product search không được khóa sản phẩm chỉ vì:

``` text
stock = 0
```

Vẫn hiển thị:

``` text
Product A
Stock: 0
```

và cho phép thêm vào giỏ.

## 7.5. Giá đặt hàng

Khi khách đặt hàng:

> Giá giao dịch phải được chốt và snapshot tại thời điểm đặt hàng.

Ví dụ:

``` text
Giá hiện tại = 15M
Khách đặt = 15M
```

Ngày nhận hàng giá bảng tăng:

``` text
16M
```

Không tự động đổi đơn đặt hàng thành 16M nếu transaction đã chốt giá
15M.

## 7.6. Điều chỉnh ±300k vẫn áp dụng

Ví dụ:

``` text
Reference = 15M
Adjustment = +200k/chỉ
Actual = 15.2M/chỉ
```

Order phải lưu giá 15.2M.

------------------------------------------------------------------------

# 8. THANH TOÁN ĐƠN ĐẶT HÀNG

## 8.1. Thanh toán đủ

Ví dụ:

``` text
Order total = 100M
Đã thanh toán = 100M
Còn phải thu = 0
```

Trạng thái:

``` text
Trạng thái đơn đặt hàng = Đã đặt hàng / Chờ hàng về
Trạng thái thanh toán = Đã thanh toán đủ
Trạng thái trả hàng = Chưa trả hàng
```

Không được coi:

``` text
Đã thanh toán đủ = Đã trả hàng
```

## 8.2. Thanh toán một phần

Ví dụ:

``` text
Tổng tiền = 100M
Đã thanh toán = 40M
Còn phải thu = 60M
```

Phải lưu:

``` text
Trạng thái thanh toán = Thanh toán một phần
Còn phải thu = 60M
Due payment date = 20/09/2026
```

Đồng thời:

``` text
Trạng thái trả hàng = Chưa trả hàng
Hẹn lấy hàng date = 25/09/2026 15:00
```

## 8.3. Hai loại ngày hẹn phải tách biệt

Đơn đặt hàng có thể có **hai mốc thời gian khác nhau**:

### A. Ngày/giờ hẹn lấy hàng

``` text
pickup_due_at
```

Ý nghĩa:

> Khi nào khách dự kiến đến nhận hàng.

### B. Ngày/giờ hẹn thanh toán đủ

``` text
payment_due_at
```

Ý nghĩa:

> Khi nào khách phải thanh toán đủ.

Không được dùng một field `due_date` cho cả hai nếu điều đó làm mất ý
nghĩa.

## 8.4. Ví dụ

``` text
Đặt ngày: 03/09/2026

Tổng: 100M
Thanh toán: 30M
Còn lại: 70M

Hẹn thanh toán đủ:
10/09/2026 17:00

Hẹn lấy hàng:
15/09/2026 10:00
```

Hai mốc độc lập.

------------------------------------------------------------------------

# 9. TRẠNG THÁI ĐƠN ĐẶT HÀNG

Không dùng một status duy nhất để đại diện cho:

``` text
payment
fulfillment
invoice
```

Nên tách concept.

## 9.1. Trạng thái đơn đặt hàng

Ví dụ:

``` text
Nháp
Đã đặt hàng
Chờ hàng về
Sẵn sàng nhận hàng
Đã giao hàng
Đã hủy
```

Có thể map vào enum hiện tại nếu project đã có enum tương đương.

## 9.2. Trạng thái thanh toán

``` text
Chưa thanh toán
Thanh toán một phần
Đã thanh toán đủ
Quá hạn thanh toán
```

## 9.3. Trạng thái trả hàng

``` text
Chưa trả hàng
Sẵn sàng nhận hàng
Đã trả hàng
```

## 9.4. Trạng thái nghiệp vụ người dùng nhìn thấy

User yêu cầu tối thiểu:

``` text
Chưa trả hàng
Đã trả hàng

Chưa thanh toán đủ
Thanh toán đủ
```

Nên hiển thị dưới dạng các trạng thái/nhãn độc lập:

``` text
Hàng:
[ Chưa trả hàng ]

Thanh toán:
[ Chưa thanh toán đủ ]
```

Sau khi giao:

``` text
Hàng:
[ Đã trả hàng ]

Thanh toán:
[ Thanh toán đủ ]
```

Không nên ép thành một enum:

``` text
"CHƯA TRẢ HÀNG + CHƯA THANH TOÁN"
```

vì sẽ tạo ra quá nhiều combination.

------------------------------------------------------------------------

# 10. QUY TẮC GIAO HÀNG / TRẢ HÀNG ĐẶT HÀNG

## 10.1. Không được coi thanh toán là giao hàng

``` text
Đã thanh toán
≠
Delivered
```

Khách trả 100% nhưng chưa lấy:

``` text
Payment = Đã thanh toán đủ
Delivery = Chưa trả hàng
```

## 10.2. Không được coi hàng đã có là đã giao

Nếu order ban đầu stock = 0:

``` text
Đã đặt hàng
```

Sau khi hàng về kho:

``` text
Stock increases
```

không có nghĩa:

``` text
Order = Đã trả hàng
```

Phải có bước xác nhận giao/nhận hàng.

## 10.3. Khi giao hàng

Chỉ khi cửa hàng thực tế giao sản phẩm:

``` text
Đặt hàng
 ↓
CONFIRM FULFILLMENT
 ↓
Đã trả hàng
```

và lúc đó mới thực hiện inventory out nếu thiết kế inventory của order
chưa reserve trước.

------------------------------------------------------------------------

# 11. INVENTORY RULE CHO Đặt hàng

Đây là điểm cực kỳ quan trọng.

## 11.1. Khi tạo order stock = 0

Không được:

``` text
stock = -1
```

Không được trừ kho âm.

Không được tạo:

``` text
Bán hàng inventory out
```

tại thời điểm đặt nếu hàng chưa tồn.

## 11.2. Khi hàng về

Ví dụ:

``` text
Stock trước = 0

Purchase received = +1

Stock = 1
```

Order vẫn:

``` text
Chưa trả hàng
```

## 11.3. Khi khách nhận hàng

``` text
Stock = 1
Order fulfilled = 1
```

Sau giao:

``` text
Inventory OUT = -1
Stock = 0
Delivery = Đã trả hàng
```

Inventory transaction phải reference tới order.

## 11.4. Không được trừ kho hai lần

Không:

``` text
Order created → -1
Order delivered → -1
```

Nếu kiến trúc hiện tại có reservation thì phải tách rõ:

``` text
Đã giữ hàng
```

và:

``` text
OUT
```

Không tự thêm reservation nếu chưa inspect schema/logic hiện tại.

------------------------------------------------------------------------

# 12. TRƯỜNG HỢP ĐẶT HÀNG + THANH TOÁN ĐỦ

``` text
Stock = 0

Product = 100M
Đã thanh toán = 100M

Order created
Payment = Đã thanh toán đủ
Delivery = Chưa trả hàng
```

Không:

``` text
Inventory OUT
```

cho tới khi hàng thực tế được giao nếu order chưa reserve inventory.

------------------------------------------------------------------------

# 13. TRƯỜNG HỢP ĐẶT HÀNG + THANH TOÁN MỘT PHẦN

``` text
Stock = 0

Tổng tiền = 100M
Đã thanh toán = 30M
Còn phải thu = 70M

Payment = Thanh toán một phần
Delivery = Chưa trả hàng
```

Lưu:

``` text
pickup_due_at
payment_due_at
```

Ví dụ:

``` text
Hẹn thanh toán đủ: 10/09 17:00
Hẹn lấy hàng:      15/09 10:00
```

------------------------------------------------------------------------

# 14. TRƯỜNG HỢP ĐẶT HÀNG + KHÁCH THANH TOÁN NỐT TRƯỚC NGÀY NHẬN

``` text
Order total = 100M

Day 1:
Đã thanh toán = 30M
Còn phải thu = 70M

Day 3:
Customer pays +70M

Payment = Đã thanh toán đủ
Delivery = Chưa trả hàng
```

Không chuyển delivery thành Đã trả hàng.

------------------------------------------------------------------------

# 15. TRƯỜNG HỢP KHÁCH NHẬN HÀNG TRƯỚC NHƯNG CHƯA TRẢ ĐỦ

Chỉ cho phép nếu business hiện tại cho phép bán công nợ.

Ví dụ:

``` text
Tổng tiền = 100M
Đã thanh toán = 70M
Còn phải thu = 30M

Delivery = Đã trả hàng
Payment = Thanh toán một phần
```

Đây là trạng thái hợp lệ nếu cửa hàng cho phép.

Phải phát sinh:

``` text
Customer Receivable = 30M
```

Không được tự động coi invoice Đã thanh toán đủ.

------------------------------------------------------------------------

# 16. TRƯỜNG HỢP SẢN PHẨM VỀ TRƯỚC NGÀY HẸN

Ví dụ:

``` text
Order:
Hẹn lấy hàng = 15/09

Hàng về:
12/09
```

Cho phép:

``` text
Sẵn sàng nhận hàng
```

nhưng không tự động:

``` text
Đã trả hàng
```

Chỉ giao khi có xác nhận thực tế.

------------------------------------------------------------------------

# 17. TRƯỜNG HỢP HÀNG VỀ SAU NGÀY HẸN

Ví dụ:

``` text
Hẹn lấy hàng due = 10/09
Actual stock arrival = 13/09
```

Order vẫn giữ lịch sử:

``` text
Original pickup_due_at = 10/09
```

Nếu thay đổi ngày hẹn:

``` text
New pickup_due_at = 15/09
```

phải lưu lịch sử/audit nếu hệ thống hiện tại hỗ trợ audit cho update
transaction.

Không overwrite mất lịch sử một cách không truy vết.

------------------------------------------------------------------------

# 18. TRƯỜNG HỢP KHÁCH HỦY ĐẶT HÀNG

Nếu chưa giao:

``` text
Đã đặt hàng
→ Đã hủy
```

Xử lý tiền:

-   Nếu chưa thanh toán → không có refund.
-   Nếu đã thanh toán → phải tạo nghiệp vụ refund/reversal theo flow tài
    chính hiện tại.
-   Không xóa payment history.
-   Không xóa order.

Nếu có phí hủy theo nghiệp vụ thì phải là requirement riêng, không tự
suy diễn.

------------------------------------------------------------------------

# 19. TRƯỜNG HỢP ĐẶT HÀNG CÓ KHOẢN PHẢI THU

Ví dụ:

``` text
Sản phẩm = 100M
Hộp = 100k

Tổng tiền = 100.100M
```

Khách trả:

``` text
50M
```

Kết quả:

``` text
Đã thanh toán = 50M
Còn phải thu = 50.100M
Payment = Thanh toán một phần
```

Khoản hộp phải xuất hiện trên order/invoice snapshot.

------------------------------------------------------------------------

# 20. TRƯỜNG HỢP ĐẶT HÀNG + GIÁ ±300K

Ví dụ:

``` text
Reference = 15M/chỉ
Adjustment = -200k/chỉ
Actual = 14.8M/chỉ
```

Giá này phải được snapshot ngay lúc chốt order.

Khi giá bảng thay đổi:

``` text
17M/chỉ
```

order vẫn:

``` text
14.8M/chỉ
```

trừ khi cửa hàng có nghiệp vụ điều chỉnh order riêng.

------------------------------------------------------------------------

# 21. HÓA ĐƠN CỦA Đặt hàng

Invoice/order phải cho người dùng biết:

``` text
Loại giao dịch:
ĐẶT HÀNG
```

và:

``` text
Tổng tiền
Đã thanh toán
Còn lại
Trạng thái thanh toán
Ngày hẹn thanh toán
Ngày hẹn lấy hàng
Trạng thái giao hàng
Nhân viên
```

Ví dụ:

``` text
HD/Đặt hàng: DH000125

Khách: Nguyễn Văn A

Tổng:                 100.100.000đ
Đã thanh toán:         30.000.000đ
Còn lại:               70.100.000đ

Thanh toán:
CHƯA THANH TOÁN ĐỦ

Hàng:
CHƯA TRẢ HÀNG

Hẹn thanh toán:
10/09/2026 17:00

Hẹn lấy hàng:
15/09/2026 10:00

Nhân viên:
Nguyễn Văn B
```

------------------------------------------------------------------------

# 22. INVOICE / Đặt hàng STATUS MATRIX

  -----------------------------------------------------------------------
  Tình huống              Payment                 Hàng
  ----------------------- ----------------------- -----------------------
  Sale thường, trả đủ     Đã thanh toán đủ                    Đã giao

  Sale thường, trả một    Thanh toán một phần          Đã giao nếu business
  phần                                            cho phép

  Order, trả đủ, chưa có  Đã thanh toán đủ                    Chưa trả
  hàng                                            

  Order, trả một phần,    Thanh toán một phần          Chưa trả
  chưa có hàng                                    

  Order, trả đủ, hàng đã  Đã thanh toán đủ                    Chưa trả
  về nhưng chưa giao                              

  Order, trả một phần,    Thanh toán một phần          Chưa trả
  hàng đã về nhưng chưa                           
  giao                                            

  Order, trả đủ, đã giao  Đã thanh toán đủ                    Đã trả

  Order, trả một phần, đã Thanh toán một phần          Đã trả nếu business cho
  giao                                            phép công nợ

  Order hủy               tùy payment history     Đã hủy
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 23. CUSTOMER RECEIVABLE

Đối với SELL:

``` text
total_amount
-
paid_amount
=
customer_receivable
```

Ví dụ:

``` text
Sale = 100M
Đã thanh toán = 70M

Receivable = 30M
```

Nếu có charge:

``` text
Product = 100M
Charge = 100k
Đã thanh toán = 70M

Receivable = 30.1M
```

Không tính receivable chỉ trên product subtotal.

------------------------------------------------------------------------

# 24. PAYMENT HISTORY

Mỗi lần thu tiền là một record.

Ví dụ:

``` text
Invoice = 100M

Payment 1
30M
Staff A
03/09 10:00

Payment 2
20M
Staff B
05/09 14:30

Payment 3
50M
Staff A
10/09 16:20
```

Canonical:

``` text
Đã thanh toán = SUM(valid payments)
Còn phải thu = Tổng tiền - Đã thanh toán
```

Không cho frontend gửi:

``` text
paid_amount = 100M
```

để backend tin luôn.

------------------------------------------------------------------------

# 25. INVOICE DISPLAY RULE

Invoice phải phân biệt rõ:

``` text
TỔNG TIỀN
ĐÃ THANH TOÁN
CÒN PHẢI THU
```

Ví dụ:

``` text
TỔNG:           100.000.000đ
ĐÃ THANH TOÁN:   40.000.000đ
CÒN PHẢI THU:    60.000.000đ
```

Không được hiển thị:

``` text
Trạng thái: Hoàn thành
Đã thanh toán: 100M
```

khi thực tế mới thu 40M.

------------------------------------------------------------------------

# 26. INVOICE STATUS VÀ PAYMENT STATUS --- CHECKLIST

AI phải kiểm tra tất cả các nơi:

-   POS payment modal
-   success modal
-   invoice PDF
-   invoice detail
-   invoice list
-   customer detail
-   customer purchase history
-   payment history
-   receivable
-   report
-   export Excel

Không được fix ở một màn hình nhưng màn hình khác vẫn hiển thị sai.

------------------------------------------------------------------------

# 27. AUDIT LOG

Các action mới cần cân nhắc/bổ sung:

``` text
Ngoại lệ điều chỉnh giá
Đã duyệt điều chỉnh giá

Thêm khoản phải thu
Cập nhật khoản phải thu
Xóa khoản phải thu

Tạo đơn đặt hàng
Cập nhật đơn đặt hàng
Thanh toán đơn đặt hàng
Xác nhận trả hàng
Hủy đơn đặt hàng

Chọn nhân viên thực hiện
```

Không log dữ liệu nhạy cảm không cần thiết.

------------------------------------------------------------------------

# 28. DATA MODEL --- GỢI Ý

Không copy nguyên tên field nếu schema hiện tại đã có tên tương đương.

## Sale / Order

``` text
id
code
customer_id
authenticated_user_id
operator_staff_id
transaction_type
status
total_amount
paid_amount
remaining_amount
payment_status
due_date / payment_due_at
pickup_due_at
fulfillment_status
created_at
completed_at
```

## Sale Item

``` text
id
sale_id
product_id
product_name_snapshot
sku_snapshot
quantity
weight
reference_unit_price
price_adjustment_per_chi
actual_unit_price
total_price
```

## Additional Receivable / Charge

``` text
id
sale_id
name
amount
reason
created_by
created_at
```

## Payment

``` text
id
sale_id
amount
payment_method
received_by
created_at
```

Không xóa payment đã ghi nhận.

------------------------------------------------------------------------

# 29. CÁCH XỬ LÝ GIÁ CHO SẢN PHẨM CÓ TRỌNG LƯỢNG

Nếu giá điều chỉnh theo chỉ:

``` text
actual_price_per_chi
=
reference_price_per_chi
+
adjustment_per_chi
```

Sau đó:

``` text
line_total
=
actual_price_per_chi × total_weight
```

Tùy schema hiện tại, nếu sản phẩm đang tính theo công thức khác thì phải
reuse canonical calculation hiện tại.

Không được tạo một công thức thứ hai gây sai tổng.

------------------------------------------------------------------------

# 30. EDGE CASE --- QUANTITY = 0

Không cho hoàn tất:

``` text
quantity = 0
```

## EDGE CASE --- WEIGHT = 0

Nếu sản phẩm bắt buộc weight:

``` text
weight <= 0
```

→ reject.

Không được để line item có total = 0 do weight = 0.

------------------------------------------------------------------------

# 31. EDGE CASE --- STOCK THAY ĐỔI SAU KHI ADD TO CART

Ví dụ:

``` text
10:00
Stock = 1

A add product vào cart.

10:01
Nhân viên B bán mất sản phẩm.

Stock = 0
```

Khi A hoàn tất:

``` text
Backend kiểm tra lại stock
```

Nếu đây là sale thường:

``` text
Reject
```

Nếu đây là order/out-of-stock:

``` text
Có thể chuyển sang Đặt hàng nếu flow cho phép
```

Không dựa vào stock hiển thị cũ trên browser.

------------------------------------------------------------------------

# 32. EDGE CASE --- STOCK TỪ 0 TĂNG LÊN TRONG KHI CART ĐANG MỞ

Ví dụ:

``` text
Cart product A
Initial stock = 0
```

Sau đó:

``` text
Purchase received +2
```

Stock hiện tại = 2.

Không tự động biến order thành sale thường mà không có xác nhận.

Transaction type đã chọn phải rõ ràng.

------------------------------------------------------------------------

# 33. EDGE CASE --- PRICE THAY ĐỔI TRONG KHI CART ĐANG MỞ

Ví dụ:

``` text
Cart price = 15M

Gold price table:
15M → 16M
```

Khi chốt:

``` text
Backend xác định reference price theo rule hiện tại.
```

Sau khi chốt:

``` text
snapshot actual price
```

Không để invoice cũ phụ thuộc realtime price table.

------------------------------------------------------------------------

# 34. EDGE CASE --- DOUBLE CLICK THANH TOÁN

Nếu user bấm:

``` text
Thanh toán
Thanh toán
```

không được tạo:

``` text
2 invoice
2 sale
2 payment
2 inventory out
```

Backend phải có cơ chế idempotency / duplicate protection phù hợp với
architecture hiện tại.

------------------------------------------------------------------------

# 35. EDGE CASE --- MẤT MẠNG SAU KHI XUẤT HÓA ĐƠN

Nếu request đã thành công nhưng browser mất response:

``` text
Không được bấm lại và tạo invoice mới ngay.
```

Phải:

``` text
Query transaction/invoice status
→ xác định transaction đã thành công chưa
→ chỉ retry nếu chắc chắn chưa commit
```

------------------------------------------------------------------------

# 36. EDGE CASE --- PAYMENT THÀNH CÔNG NHƯNG INVOICE FAIL

Không được để:

``` text
Payment = success
Invoice = fail
Sale = completed
Inventory = out
```

nếu architecture hiện tại yêu cầu invoice thành công mới hoàn tất sale.

Phải tuân theo atomicity/idempotency của integration hiện tại.

Nếu payment gateway không atomic với invoice provider, phải có trạng
thái trung gian rõ ràng.

------------------------------------------------------------------------

# 37. EDGE CASE --- ADDITIONAL RECEIVABLE SAU KHI INVOICE ĐÃ PHÁT HÀNH

Không được:

``` text
Invoice issued = 100M

Sau đó sửa charge:
+500k

Invoice vẫn 100M
```

Đây là data inconsistency.

Nếu invoice đã phát hành:

``` text
Không mutate invoice snapshot trực tiếp.
```

Nếu cần thay đổi:

``` text
Adjustment / replacement / cancellation flow
```

theo khả năng invoice provider hiện tại.

------------------------------------------------------------------------

# 38. EDGE CASE --- OPERATOR KHÁC ACCOUNT LOGIN

Ví dụ:

``` text
Authenticated account = POS-SHARED
Operator = Staff A
```

Invoice phải ghi cả hai nếu schema cần audit:

``` text
Tài khoản đăng nhập: POS-SHARED
Nhân viên bán hàng: Staff A
```

Nếu:

``` text
Operator = Staff B
```

thì invoice B.

Không lấy tên người cuối cùng login làm operator.

------------------------------------------------------------------------

# 39. EDGE CASE --- STAFF B TRẢ CÔNG NỢ CHO Bán hàng CỦA STAFF A

Không đổi:

``` text
Nhân viên thực hiện ban đầu = A
```

Payment:

``` text
Received by = B
```

Customer receivable giảm.

Lịch sử phải cho thấy:

``` text
Sale A
Payment B
```

------------------------------------------------------------------------

# 40. EDGE CASE --- Đặt hàng CÓ NHIỀU ITEM, CHỈ MỘT ITEM HẾT KHO

Mặc định phase này:

``` text
Nếu một item stock = 0
→ transaction = Đặt hàng
```

Không tự động split:

``` text
Sale A
+
Order B
```

trừ khi hệ thống đã có module split order rõ ràng.

Mục tiêu là tránh:

-   trừ một phần kho;
-   invoice không phản ánh đúng;
-   payment chia sai;
-   customer history bị tách không chủ ý.

------------------------------------------------------------------------

# 41. EDGE CASE --- Đặt hàng CÓ NHIỀU ITEM, STOCK KHÔNG ĐỦ

Ví dụ:

``` text
A stock = 1
Khách cần A = 2
```

Stock không bằng 0 nhưng vẫn **không đủ**.

Đây không hoàn toàn giống rule "stock = 0".

AI phải phân biệt:

``` text
stock = 0
→ Out-of-stock order

0 < stock < requested quantity
→ Insufficient stock
```

Không tự động coi mọi trường hợp thiếu một phần là order nếu business
chưa xác nhận.

**Mặc định an toàn:**

``` text
Không cho sale thường hoàn tất vượt stock.
```

Có thể mở rộng partial/backorder sau.

------------------------------------------------------------------------

# 42. EDGE CASE --- Đặt hàng CÓ STOCK \> 0 NHƯNG NHÂN VIÊN CHỌN ĐẶT HÀNG

Nếu UI không có lựa chọn order thủ công:

``` text
Không tự suy diễn.
```

Requirement hiện tại chỉ bắt buộc:

``` text
stock = 0
→ Đặt hàng
```

Không tự thêm:

``` text
stock > 0 → cho chọn Đặt hàng
```

nếu chưa có yêu cầu.

------------------------------------------------------------------------

# 43. EDGE CASE --- PAYMENT = TOTAL + 1

Ví dụ:

``` text
Tổng tiền = 100M
Payment = 100.000.001
```

Backend reject.

Không làm:

``` text
Đã thanh toán = 100M
Change = 1
```

trừ khi hệ thống có requirement riêng cho tiền thừa.

------------------------------------------------------------------------

# 44. EDGE CASE --- RECEIVABLE CHARGE TRÙNG

Không được tự động duplicate charge khi:

``` text
re-render
retry
refresh
```

Mỗi charge phải có identity riêng.

------------------------------------------------------------------------

# 45. EDGE CASE --- REFRESH SAU KHI CREATE Đặt hàng

Refresh browser không được:

``` text
Create order lần 2.
```

Phải dùng transaction id/code đã tạo hoặc idempotency.

------------------------------------------------------------------------

# 46. EDGE CASE --- CUSTOMER KHÔNG CÓ

Nếu nghiệp vụ cho phép khách vãng lai:

``` text
customer_id = NULL
```

vẫn phải tạo sale/order bình thường.

Nếu order bắt buộc customer:

``` text
Backend reject nếu customer missing.
```

Không tự thay đổi rule cũ.

------------------------------------------------------------------------

# 47. EDGE CASE --- DUE DATE TRONG QUÁ KHỨ

Nếu tạo transaction mới:

``` text
payment_due_at < current server time
```

nên reject hoặc yêu cầu xác nhận tùy business rule hiện tại.

Không tự cho qua chỉ vì frontend cho phép.

------------------------------------------------------------------------

# 48. EDGE CASE --- PICKUP DATE TRƯỚC Đặt hàng DATE

Ví dụ:

``` text
Created = 03/09
Hẹn lấy hàng = 01/09
```

Không hợp lệ.

Backend phải validate:

``` text
pickup_due_at >= created_at
```

Nếu business có trường hợp ngoại lệ thì phải có explicit override.

------------------------------------------------------------------------

# 49. EDGE CASE --- PAYMENT DUE SAU PICKUP

Ví dụ:

``` text
Hẹn lấy hàng = 10/09
Hẹn thanh toán đủ = 15/09
```

Điều này nghĩa là:

``` text
Khách nhận hàng trước khi thanh toán đủ.
```

Chỉ cho phép nếu business hiện tại cho phép công nợ sau giao hàng.

Không tự cấm nếu flow sale công nợ đã tồn tại; nhưng phải thể hiện:

``` text
Delivered
+
Partially Đã thanh toán
+
Receivable
```

------------------------------------------------------------------------

# 50. REPORTING

## Sale report

Phải phân biệt:

``` text
Tổng tiền Sales
Tổng tiền Collected
Tổng tiền Receivable
```

Không dùng:

``` text
Tổng tiền Sales = Tổng tiền Collected
```

## Order report

Có thể thống kê:

``` text
Tổng tiền Orders
Order Value
Đã thanh toán
Còn phải thu
Waiting Fulfillment
Ready for Hẹn lấy hàng
Delivered
Cancelled
```

## Employee report

Nếu Staff không được xem doanh số:

``` text
Shared account
≠
permission bypass
```

Operator selection không được cấp quyền xem report.

------------------------------------------------------------------------

# 51. CUSTOMER DETAIL

Customer detail phải phản ánh đúng:

``` text
Bán ra
Tổng giá trị
Đã thanh toán
Còn phải thu
Đơn đặt hàng
Đơn đã giao
Đơn chưa giao
```

Ví dụ:

``` text
BÁN RA
Tổng tiền: 300M
Đã thanh toán: 220M
Receivable: 80M

ĐẶT HÀNG
Orders: 3
Waiting pickup: 1
```

Không cộng một payment hai lần vào customer total.

------------------------------------------------------------------------

# 52. INVOICE LIST

Nên có các filter:

``` text
Tất cả
Đã thanh toán
Thanh toán một phần
Chưa thanh toán
Đặt hàng
Chưa trả hàng
Đã trả hàng
Đã hủy
```

Không bắt buộc tạo tất cả filter nếu UI hiện tại quá khác; nhưng data
phải query được theo các trạng thái tương ứng.

------------------------------------------------------------------------

# 53. ACCEPTANCE TEST --- BUG-001

## Test A

``` text
Product = 100M
Đã thanh toán = 100M
```

Expected:

``` text
Payment = Đã thanh toán đủ
Còn phải thu = 0
```

## Test B

``` text
Product = 100M
Đã thanh toán = 50M
```

Expected:

``` text
Payment = Thanh toán một phần
Còn phải thu = 50M
Receivable = 50M
```

## Test C

``` text
Product = 100M
Đã thanh toán = 0
```

Expected:

``` text
Chưa thanh toán
Còn phải thu = 100M
```

## Test D

``` text
Payment 50M
Payment 50M
```

Expected:

``` text
Đã thanh toán đủ
Còn phải thu = 0
```

## Test E

``` text
Payment = 100M + 1
```

Expected:

``` text
Reject
```

------------------------------------------------------------------------

# 54. ACCEPTANCE TEST --- PRICE ±300K

## Test A

``` text
Reference = 15M
Adjustment = 0
```

PASS.

## Test B

``` text
Adjustment = +300K
```

PASS.

## Test C

``` text
Adjustment = -300K
```

PASS.

## Test D

``` text
Adjustment = +300.001
```

REJECT / approval required.

## Test E

``` text
Adjustment = -300.001
```

REJECT / approval required.

## Test F

``` text
Weight = 2 chỉ
Adjustment = +300K/chỉ
```

Expected adjustment:

``` text
+600K
```

------------------------------------------------------------------------

# 55. ACCEPTANCE TEST --- RECEIVABLE CHARGE

## Test A

``` text
Product = 20M
Charge = 100K
```

Expected:

``` text
Tổng tiền = 20.1M
```

## Test B

``` text
Product = 20M
Charge 1 = 100K
Charge 2 = 50K
```

Expected:

``` text
Tổng tiền = 20.15M
```

## Test C

``` text
Charge amount = 0
```

Expected:

``` text
Reject / ignore theo validation hiện tại
```

## Test D

``` text
Charge amount = -100K
```

Expected:

``` text
Reject
```

## Test E

``` text
Invoice total = 20.1M
Đã thanh toán = 10M
```

Expected:

``` text
Còn phải thu = 10.1M
```

------------------------------------------------------------------------

# 56. ACCEPTANCE TEST --- SHARED ACCOUNT

## Test A

``` text
Login = Shared POS
Operator = Staff A
```

Invoice operator = A.

## Test B

``` text
Login = Shared POS
Operator = Staff B
```

Invoice operator = B.

## Test C

``` text
Login = Shared POS
Operator = NULL
```

Expected:

``` text
Cannot complete
```

## Test D

Staff A creates sale, Staff B collects later.

Expected:

``` text
Sale operator = A
Nhân viên nhận tiền = B
```

------------------------------------------------------------------------

# 57. ACCEPTANCE TEST --- Đặt hàng

## Test A --- stock 0

``` text
Stock = 0
Add product
```

Expected:

``` text
Button = ĐẶT HÀNG
```

## Test B --- pay full

``` text
Tổng tiền = 100M
Đã thanh toán = 100M
Stock = 0
```

Expected:

``` text
Order
Đã thanh toán đủ
Chưa trả hàng
```

## Test C --- pay partial

``` text
Tổng tiền = 100M
Đã thanh toán = 30M
```

Expected:

``` text
Thanh toán một phần
Còn phải thu = 70M
```

## Test D --- product arrives

``` text
Purchase received +1
```

Expected:

``` text
Stock increases
Order remains Chưa trả hàng
```

## Test E --- customer receives

``` text
Fulfill order
```

Expected:

``` text
Inventory OUT -1
Delivery = Đã trả hàng
```

Không được OUT trước đó nếu kiến trúc order chưa reserve.

------------------------------------------------------------------------

# 58. ACCEPTANCE TEST --- Đặt hàng DATES

## Test A

``` text
Hẹn lấy hàng = 15/09
Hẹn thanh toán đủ = 10/09
```

PASS nếu cửa hàng cho phép khách trả đủ trước ngày lấy.

## Test B

``` text
Hẹn lấy hàng = 10/09
Hẹn thanh toán đủ = 15/09
```

Chỉ PASS nếu công nợ sau giao được phép.

## Test C

``` text
Hẹn lấy hàng < order creation
```

REJECT.

------------------------------------------------------------------------

# 59. ACCEPTANCE TEST --- MULTI ITEM Đặt hàng

``` text
A stock = 5
B stock = 0

Cart:
A x1
B x1
```

Expected:

``` text
Đặt hàng
```

Không:

``` text
Bán hàng A
Đặt hàng B
```

trong phase này.

------------------------------------------------------------------------

# 60. ACCEPTANCE TEST --- CONCURRENCY

``` text
Stock = 1

Staff A add A
Staff B add A

A completes
→ stock = 0

B completes
→ backend recheck
→ reject sale / chuyển order theo rule
```

Không được dựa vào UI stock cũ.

------------------------------------------------------------------------

# 61. DATABASE MIGRATION

Trước migration:

``` text
Backup / inspect
```

Sau đó:

``` text
Add only missing fields/tables
Add indexes
Add constraints
Add RLS
Add RPC/functions nếu cần
```

Không:

``` text
DROP TABLE
TRUNCATE
RECREATE PRODUCTION
```

## Migration phải hỗ trợ dữ liệu cũ

Các sale/invoice cũ:

``` text
Không có adjustment
→ default 0 nếu phù hợp

Không có additional charge
→ total không thay đổi

Không có operator mới
→ giữ staff_id cũ

Không có order
→ transaction_type = Bán hàng
```

Không migrate bằng cách thay đổi tổng tiền lịch sử.

------------------------------------------------------------------------

# 62. BACKWARD COMPATIBILITY

Sau khi deploy:

-   Invoice cũ vẫn mở được.
-   Sale cũ vẫn hiển thị đúng.
-   Customer history cũ không thay đổi.
-   Inventory ledger cũ không thay đổi.
-   Report cũ không tăng/giảm giả.
-   Payment cũ không bị duplicate.
-   PDF invoice cũ không tự đổi số tiền.

------------------------------------------------------------------------

# 63. LOGIC ƯU TIÊN KHI CÓ XUNG ĐỘT

Nếu gặp tình huống code hiện tại khác tài liệu:

``` text
1. Database/schema hiện tại
2. Business requirement đã xác nhận
3. SRS cũ
4. Requirement phase này
5. UI hiện tại
```

Nhưng nếu requirement phase này **explicitly thay đổi** rule cũ thì
phase mới thắng.

Ví dụ:

SRS cũ từng nói:

``` text
Staff không được thay đổi giá
```

Phase mới xác nhận:

``` text
Staff được điều chỉnh ±300k/chỉ
```

→ Đây là **business requirement mới**, không phải bug của code cũ.

Phải update implementation theo requirement mới và giữ audit.

------------------------------------------------------------------------

# 64. PHÂN BIỆT BUG VÀ NEW REQUIREMENT

## Bug

Nếu requirement cũ đã nói:

``` text
Partial payment
```

nhưng code lại:

``` text
Đã thanh toán = Tổng tiền
```

→ BUG.

## New requirement

Nếu requirement cũ:

``` text
Staff không đổi giá
```

và bây giờ business yêu cầu:

``` text
Staff được ±300k/chỉ
```

→ NEW REQUIREMENT.

## Bug do implementation của new requirement

Nếu đã implement ±300k nhưng:

``` text
2 chỉ × 300k
```

lại chỉ cộng 300k:

→ BUG.

------------------------------------------------------------------------

# 65. DEFINITION OF DONE

Phase này chỉ được coi là hoàn thành khi:

## Payment

-   [x] Đã thanh toán amount đúng. (backend + list/detail)
-   [x] Còn phải thu amount đúng.
-   [x] Trạng thái thanh toán đúng. (amounts win over stale PAID)
-   [x] Partial payment đúng. (SALE-000005)
-   [x] Multiple payments đúng. (pos_sale_payments + collect RPC)
-   [x] Không overpayment. (RPC reject)
-   [x] Due date đúng.
-   [x] Invoice hiển thị đúng. (detail TỔNG / ĐÃ TT / CÒN LẠI; chưa E2E browser)

## Price

-   [x] ±300k/chỉ hoạt động. (SELL UI + RPC; BUY vốn đã có)
-   [x] Tính đúng theo weight. (`round(adj * weight_chi)`)
-   [x] Giá snapshot.
-   [x] Không sửa invoice cũ theo giá mới.
-   [x] Ngoài range bị block/approval. (SELL block; approval chỉ BUY)
-   [x] Audit đủ. (complete_sale / price exception log)

## Receivable charge

-   [x] Thêm tên.
-   [x] Thêm số tiền.
-   [x] Thêm nội dung.
-   [x] Vào invoice.
-   [x] Vào total.
-   [x] Vào remaining.
-   [x] Không âm.
-   [x] Không duplicate. (snapshot theo sale)
-   [x] Snapshot.

## Shared account

-   [x] Login shared. (`pos_staff.is_shared`, session)
-   [x] Permission = STAFF.
-   [x] Chọn operator.
-   [x] Không cho complete nếu thiếu operator.
-   [x] Invoice ghi đúng operator. (cột + tên NV quầy trên drawer)
-   [x] Payment history ghi đúng người nhận tiền. (collect `p_operator_staff_id`)
-   [x] Không bypass permission.

## Order

-   [x] Stock = 0 cho phép chọn.
-   [x] Button chuyển ĐẶT HÀNG.
-   [x] Không trừ kho khi đặt.
-   [x] Full payment.
-   [x] Partial payment.
-   [x] Còn phải thu.
-   [x] Hẹn thanh toán đủ date.
-   [x] Hẹn lấy hàng date/time.
-   [x] Trạng thái đơn đặt hàng.
-   [x] Trạng thái trả hàng.
-   [x] Inventory OUT khi fulfill.
-   [x] Không OUT hai lần.
-   [x] Cancel flow không mất lịch sử.
-   [x] Invoice/history xem được.

## Regression

-   [ ] Sale bình thường vẫn hoạt động. (code path giữ; chưa E2E browser)
-   [ ] Purchase vẫn hoạt động. (không đụng module)
-   [ ] Inventory vẫn hoạt động.
-   [x] Customer vẫn hoạt động. (badge lịch sử theo payment)
-   [x] Invoice cũ vẫn đọc được. (SALE-000005 remaining giữ)
-   [ ] Report không sai. (chưa tách sales vs collected vs receivable)
-   [ ] RLS không bị bypass. (definer RPCs giữ require_*)
-   [x] Không duplicate transaction khi retry. (idempotency key)
-   [x] Không duplicate payment.
-   [x] Không duplicate inventory transaction.

------------------------------------------------------------------------

# 66. FINAL END-TO-END SCENARIOS

## Scenario A --- Sale bình thường + trả đủ

``` text
Stock = 5
Product = 20M

Customer buys 1
Price adjustment = +100K
Charge = Box 100K

Actual product total = 20.1M
Tổng thanh toán = 20.2M

Đã thanh toán = 20.2M

→ Bán hàng Đã hoàn thành
→ PAYMENT Đã thanh toán đủ
→ REMAINING 0
→ INVOICE Đã phát hành
→ INVENTORY OUT -1
```

## Scenario B --- Sale + trả một phần

``` text
Tổng thanh toán = 20.2M
Đã thanh toán = 10M

→ Bán hàng Đã hoàn thành
→ PAYMENT Thanh toán một phần
→ REMAINING = 10.2M
→ CUSTOMER RECEIVABLE = 10.2M
→ Invoice phải hiển thị đúng
```

## Scenario C --- Shared account

``` text
Login = POS-SHARED
Operator = Staff B

Customer buys

→ Invoice operator = Staff B
→ Payment receiver = Staff B
```

## Scenario D --- Order + trả đủ

``` text
Stock = 0
Tổng tiền = 100M
Đã thanh toán = 100M

→ Đã đặt hàng
→ Đã thanh toán đủ
→ Chưa trả hàng
→ NO INVENTORY OUT
```

## Scenario E --- Order + trả một phần

``` text
Stock = 0
Tổng tiền = 100M
Đã thanh toán = 30M
Còn phải thu = 70M

Hẹn lấy hàng = 15/09 10:00
Hẹn thanh toán đủ = 10/09 17:00

→ Đã đặt hàng
→ Thanh toán một phần
→ Chưa trả hàng
→ RECEIVABLE = 70M
```

## Scenario F --- Order về hàng

``` text
Order:
Stock = 0

Purchase received:
Inventory +1

→ Order = Sẵn sàng nhận hàng
→ Still Chưa trả hàng
```

## Scenario G --- Giao hàng

``` text
Customer receives

→ Fulfill order
→ Inventory OUT -1
→ Delivery = Đã trả hàng
```

## Scenario H --- Giao hàng nhưng chưa trả đủ

Chỉ khi business cho phép:

``` text
Tổng tiền = 100M
Đã thanh toán = 70M

→ Đã trả hàng
→ Thanh toán một phần
→ RECEIVABLE = 30M
```

------------------------------------------------------------------------

# 67. QUY TẮC CHỐNG "LÁCH CASE"

AI/code agent **không được**:

1.  Đổi `paid_amount` thành `total_amount` để invoice thành Đã thanh toán đủ.
2.  Đổi `total_amount` để xóa công nợ.
3.  Dùng charge âm để tạo discount.
4.  Sửa trực tiếp payment history.
5.  Xóa payment để giảm receivable.
6.  Trừ kho khi order stock = 0.
7.  Trừ kho hai lần khi fulfill.
8.  Dùng giá hiện tại để render invoice cũ.
9.  Dùng shared account để bỏ qua operator.
10. Cho complete transaction khi operator null.
11. Cho overpayment nếu chưa có change/refund requirement.
12. Tự split transaction thành nhiều invoice.
13. Tự tạo thêm enum/status chỉ vì frontend cần label.
14. Bypass RLS bằng cách chỉ kiểm tra permission ở UI.
15. Tạo duplicate invoice khi retry.
16. Tạo duplicate payment khi refresh.
17. Tạo duplicate additional charge khi re-submit.
18. Xóa transaction completed khỏi database.
19. Sửa lịch sử để làm dữ liệu "đẹp".
20. Thay đổi business rule cũ ngoài phạm vi tài liệu này mà không ghi
    rõ.

------------------------------------------------------------------------

# 68. NGUYÊN TẮC IMPLEMENTATION CHO AI

Trước mỗi thay đổi:

``` text
1. Inspect existing implementation.
2. Locate current source of truth.
3. Identify affected tables/API/RPC/components.
4. Check existing migration.
5. Determine whether issue is BUG or NEW REQUIREMENT.
6. Implement smallest safe change.
7. Validate backend.
8. Validate UI.
9. Test database consistency.
10. Test old flow.
11. Test new flow.
12. Test edge cases.
```

Không được:

``` text
"Thấy UI sai → sửa UI là xong."
```

Phải trace:

``` text
UI
 ↓
API
 ↓
Service/RPC
 ↓
Database
 ↓
Payment
 ↓
Invoice
 ↓
Inventory
 ↓
Audit
```

------------------------------------------------------------------------

# 69. KẾT THÚC PHASE

Phase này kết thúc khi:

``` text
BUG FIXED
+
NEW REQUIREMENTS IMPLEMENTED
+
DATABASE CONSISTENT
+
INVOICE CORRECT
+
PAYMENT CORRECT
+
INVENTORY CORRECT
+
CUSTOMER RECEIVABLE CORRECT
+
OPERATOR TRACEABLE
+
Đặt hàng FLOW CORRECT
+
AUDIT TRACEABLE
+
REGRESSION PASS
+
EDGE CASE PASS
```

Sau khi đạt Definition of Done, mọi requirement mới tiếp theo phải được
ghi thành **section/version mới**, không sửa âm thầm các rule đã chốt
trong tài liệu này.

------------------------------------------------------------------------

# 70. CHANGE LOG / REQUIREMENT BASELINE

## Version 1.0 --- 03/09/2026

### Bug fixes

-   BUG-001: Partial payment nhưng invoice/payment status vẫn hiển thị
    đã thanh toán đủ.
-   BUG-002: Hoàn thiện khả năng điều chỉnh giá bán theo business rule
    ±300.000đ/chỉ.

### New requirements

-   REQ-NEW-001: Price adjustment ±300.000đ/chỉ.
-   REQ-NEW-002: Additional receivable charge trên invoice.
-   REQ-NEW-003: Shared POS account + operator staff.
-   REQ-NEW-004: Out-of-stock order / đặt hàng.

### Baseline

Từ version này trở đi:

> Nếu code có hành vi khác với các rule trên, AI phải xác định đó là
> **regression/bug**, trừ khi có requirement/version mới được cập nhật
> rõ ràng.
