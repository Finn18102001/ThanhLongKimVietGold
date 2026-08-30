# TLKV POS – AI IMPLEMENTATION SPECIFICATION
## Mở rộng nghiệp vụ Mua hàng + Bán hàng + Công nợ + Khách hàng + Vàng thị trường

> **Theo dõi tiến độ trong repo:** [`TLKV_IMPLEMENTATION_PROGRESS.md`](./TLKV_IMPLEMENTATION_PROGRESS.md)
>
> **Mục đích của file này:** Đây là specification để AI/code agent đọc, hiểu nghiệp vụ và **apply trực tiếp vào website TLKV hiện tại**, không phải chỉ là tài liệu mô tả ý tưởng.
>
> **Quan trọng:** Website hiện tại đã có nền tảng POS, sản phẩm, tồn kho, khách hàng, hóa đơn, báo cáo và Supabase. Không được xây lại hệ thống từ đầu. Hãy **inspect code/schema hiện tại trước**, sau đó mở rộng theo specification này.

---

# 1. CONTEXT HIỆN TẠI

Hệ thống là website quản lý cửa hàng vàng Thăng Long Kim Việt.

Nền tảng hiện tại đã được thiết kế xoay quanh:

- Product / SKU
- Inventory
- POS
- Customer
- Sale
- Invoice
- Purchase / nhập hàng
- Inventory Ledger
- Reports
- Staff / Role
- Audit Log

Nguyên tắc nền tảng:

- Mọi biến động tồn kho phải có nguồn gốc.
- Không sửa trực tiếp số tồn.
- Giao dịch hoàn tất không được xóa vật lý.
- Invoice, Sale, Inventory, Customer, Report là các entity liên kết nhưng không thay thế nhau.
- Giá trên giao dịch phải giữ snapshot tại thời điểm giao dịch.
- Tiền phải được tính chính xác, không dùng floating point.
- Thời gian nghiệp vụ quan trọng lấy từ server.
- Có thể truy ngược từ giao dịch → khách hàng → nhân viên → item → payment → inventory transaction.

**Nguồn SRS hiện tại xác nhận các nguyên tắc trên.**

---

# 2. REQUIREMENTS ĐÃ ĐƯỢC KHÁCH HÀNG XÁC NHẬN

Các requirement sau đây **KHÔNG phải assumption** và không cần hỏi lại khách:

## 2.1. ±300.000đ/chỉ

Khách hàng đã xác nhận business rule:

> Giá mua/bán có thể chênh lệch khoảng ±300.000đ trên 1 chỉ để kiểm soát trường hợp giao dịch, đặc biệt các giao dịch mua/bán trả sau.

Hệ thống phải implement rule này theo dạng validation / warning / approval.

Không tự động sửa giá.

---

## 2.2. Chờ thanh toán + hẹn trả tiền

Khách hàng đã xác nhận:

- Có giao dịch chờ thanh toán.
- Có thanh toán một phần.
- Có số tiền còn lại.
- Có ngày hẹn trả.
- Khi mua hàng từ khách, cửa hàng có thể chưa trả đủ tiền ngay.
- Khi bán hàng cho khách, khách cũng có thể chưa thanh toán đủ nếu nghiệp vụ cho phép.

Phải quản lý công nợ hai chiều:

```text
CUSTOMER RECEIVABLE
Khách còn nợ cửa hàng

CUSTOMER PAYABLE
Cửa hàng còn nợ khách
```

Không gộp hai loại này thành một field `debt`.

---

## 2.3. Vàng thị trường + giá nhập tay + sửa tuổi vàng

Khách hàng đã xác nhận:

- Có vàng không nằm trong danh sách sản phẩm chuẩn.
- Có loại `VÀNG THỊ TRƯỜNG`.
- Cho phép nhập giá mua thủ công.
- Cho phép nhập/sửa tuổi vàng theo nghiệp vụ.
- Vàng thị trường vẫn phải được lưu lịch sử giao dịch.
- Giá, tuổi vàng, trọng lượng tại thời điểm giao dịch phải được snapshot.

---

# 3. MỤC TIÊU KIẾN TRÚC

Hệ thống phải trở thành hệ thống quản lý:

```text
                    TLKV GOLD POS
                         |
          +--------------+--------------+
          |                             |
       PURCHASE                       SALE
       Mua vào                       Bán ra
          |                             |
     Inventory IN                  Inventory OUT
          |                             |
     Pay customer                Collect customer
          |                             |
   Customer Payable            Customer Receivable
          |                             |
          +--------------+--------------+
                         |
                    CUSTOMER
                         |
       +-----------------+----------------+
       |                 |                |
      CCCD          Purchase History   Sale History
       |                 |                |
   CCCD images          Excel Export    Excel Export
                         |
                    REPORTING
                         |
                   ADMIN / MANAGER
```

---

# 4. NGUYÊN TẮC QUAN TRỌNG NHẤT

## 4.1. BUY != SELL

Mua và bán là hai nghiệp vụ độc lập.

### BUY

```text
Customer -> Store

Inventory + quantity
Store owes customer money
```

### SELL

```text
Store -> Customer

Inventory - quantity
Customer owes store money nếu chưa thanh toán đủ
```

Không dùng một logic transaction duy nhất rồi đảo dấu một cách thiếu kiểm soát.

---

# 5. TRANSACTION MODEL

Nếu hệ thống hiện tại đã có `SALE`, giữ nguyên.

Bổ sung / hoàn thiện:

```text
PURCHASE
PURCHASE_ITEM
PAYMENT
CUSTOMER_LEDGER
```

Transaction type:

```text
BUY
SELL
RETURN
ADJUSTMENT
```

Inventory transaction type tối thiểu:

```text
PURCHASE_RECEIVED
SALE
CUSTOMER_RETURN
SUPPLIER_RETURN
STOCK_ADJUSTMENT_IN
STOCK_ADJUSTMENT_OUT
```

Có thể giữ các type hiện tại nếu schema đã tồn tại.

---

# 6. PURCHASE – MUA HÀNG TỪ KHÁCH

## 6.1. Flow

```text
Chọn MUA HÀNG
    ↓
Chọn / tạo Customer
    ↓
Thêm vàng / sản phẩm
    ↓
Nhập loại vàng
    ↓
Nhập tuổi vàng
    ↓
Nhập trọng lượng
    ↓
Lấy giá mua hoặc nhập giá thủ công
    ↓
Kiểm tra ±300k/chỉ
    ↓
Approval nếu cần
    ↓
Xác nhận giao dịch
    ↓
Thanh toán đủ / một phần / chờ thanh toán
    ↓
Purchase completed
    ↓
Inventory IN
    ↓
Payment
    ↓
Customer Payable nếu còn nợ
    ↓
Audit Log
```

---

# 7. PURCHASE DATA

Purchase tối thiểu:

```text
id
code
customer_id
staff_id
status
total_amount
paid_amount
remaining_amount
payment_status
due_date
created_at
completed_at
```

Purchase item:

```text
id
purchase_id
product_id nullable
product_name_snapshot
gold_type
gold_age
quantity
weight
unit_price
total_price
is_market_gold
```

Nếu schema hiện tại có tên field tương đương thì **reuse**, không tạo duplicate field chỉ vì tên khác.

---

# 8. VÀNG THỊ TRƯỜNG

Hỗ trợ item không tồn tại trong product catalog chuẩn.

Ví dụ:

```text
Tên: Vàng thị trường
Loại: Vàng 9999
Tuổi: 99.99
Trọng lượng: 2 chỉ
Giá mua: 14.500.000/chỉ
Thành tiền: 29.000.000
```

Có thể dùng:

```text
is_market_gold = true
```

hoặc enum/type tương đương nếu schema hiện tại phù hợp.

## Không được:

- Ép vàng thị trường vào SKU không liên quan.
- Lấy giá bán của sản phẩm khác làm giá mua.
- Làm mất thông tin tuổi vàng/trọng lượng thực tế.
- Làm mất snapshot giá.

---

# 9. TUỔI VÀNG

Mỗi transaction item phải giữ snapshot:

```text
gold_type
gold_age
weight
```

Nếu nhân viên chỉnh tuổi vàng sau này:

- Không mutate dữ liệu lịch sử transaction đã completed.
- Nếu thay đổi nghiệp vụ của transaction cũ, phải qua adjustment/audit flow.

---

# 10. GIÁ MUA THỦ CÔNG

Với `MARKET_GOLD`:

```text
unit_price = manual input
```

Giá phải được lưu tại transaction item.

Không phụ thuộc realtime vào bảng giá sau khi transaction đã completed.

---

# 11. RULE ±300.000Đ/CHỈ

Đây là business rule đã được khách hàng xác nhận.

Giả sử:

```text
reference_price = 14.500.000
limit = 300.000
```

Range:

```text
14.200.000 <= transaction_price <= 14.800.000
```

Nếu ngoài range:

```text
PRICE_EXCEPTION
```

UI phải cảnh báo rõ:

```text
Giá giao dịch vượt ngưỡng ±300.000đ/chỉ.
```

Không tự động thay đổi giá.

---

# 12. PRICE EXCEPTION

Khi vượt ngưỡng:

```text
NORMAL
PRICE_EXCEPTION
```

Nếu user hiện tại không có quyền approve:

```text
Không cho hoàn tất
→ yêu cầu Manager/Admin xác nhận
```

Nếu có quyền:

```text
Cho phép xác nhận
→ ghi Audit Log
```

Audit cần lưu:

```text
transaction_id
reference_price
actual_price
difference_per_chi
reason
created_by
approved_by
approved_at
```

---

# 13. PAYMENT MODEL

Không dùng:

```text
paid_amount = total_amount
```

để thay thế payment history.

Phải có Payment records.

Ví dụ:

```text
BUY-000125
Total = 100.000.000

Payment 1 = 30.000.000
Payment 2 = 40.000.000

Remaining = 30.000.000
Due date = 25/08/2026
```

Payment history phải immutable về mặt lịch sử.

Nếu cần sửa thì tạo reversal/adjustment transaction.

---

# 14. PAYMENT STATUS

Có thể dùng:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERDUE
```

Transaction status độc lập với payment status.

Ví dụ hợp lệ:

```text
Transaction = COMPLETED
Payment = PARTIALLY_PAID
```

---

# 15. CHỜ THANH TOÁN

Đơn có thể:

```text
DRAFT
PENDING_PAYMENT
PARTIALLY_PAID
PAYMENT_CONFIRMED
COMPLETED
CANCELLED
REFUNDED
```

Không trừ/tăng kho ở trạng thái draft.

Thời điểm inventory mutation phải tuân theo business rule hiện tại và transaction completion.

---

# 16. HẸN TRẢ TIỀN

Purchase:

```text
total_amount = 100M
paid_amount = 40M
remaining_amount = 60M
due_date = 25/08/2026
```

Dashboard/detail phải hiển thị:

```text
Tổng
Đã trả
Còn lại
Ngày hẹn trả
Trạng thái
```

Có thể cảnh báo:

```text
Sắp đến hạn
Quá hạn
```

nhưng notification không bắt buộc nếu website hiện tại chưa có module notification.

---

# 17. CUSTOMER RECEIVABLE / PAYABLE

## 17.1. Receivable

Phát sinh khi:

```text
SALE
customer paid < total
```

Ví dụ:

```text
Sale = 100M
Paid = 70M
Receivable = 30M
```

## 17.2. Payable

Phát sinh khi:

```text
PURCHASE
store paid < total
```

Ví dụ:

```text
Purchase = 80M
Paid = 50M
Payable = 30M
```

---

# 18. CUSTOMER DETAIL

Customer detail phải có:

```text
Thông tin khách hàng

MUA VÀO
- số giao dịch
- tổng số lượng
- tổng trọng lượng
- tổng giá trị
- đã thanh toán
- cửa hàng còn nợ

BÁN RA
- số giao dịch
- tổng số lượng
- tổng trọng lượng
- tổng giá trị
- đã thanh toán
- khách còn nợ
```

UI:

```text
[ Tổng quan ]
[ Mua vào ]
[ Bán ra ]
[ Công nợ ]
[ Lịch sử thanh toán ]
```

---

# 19. QUANTITY + TOTAL WEIGHT

Các table transaction/item phải hiển thị:

```text
Số lượng
Trọng lượng
Tổng trọng lượng
```

Công thức:

```text
total_weight = quantity * unit_weight
```

Ví dụ:

```text
2 sản phẩm
1.5 chỉ / sản phẩm

Total weight = 3 chỉ
```

Nếu item đã lưu trực tiếp total weight thì dùng giá trị canonical đó.

Không tạo sai lệch giữa frontend và backend.

---

# 20. EXPORT EXCEL

Customer detail phải có action:

```text
Export Excel
```

Ít nhất hỗ trợ:

```text
Purchase history
```

Excel columns:

```text
Ngày
Mã giao dịch
Loại giao dịch
Sản phẩm
Loại vàng
Tuổi vàng
Số lượng
Trọng lượng
Tổng trọng lượng
Đơn giá
Thành tiền
Đã thanh toán
Còn lại
Trạng thái
Nhân viên
```

Footer:

```text
Tổng số giao dịch
Tổng số lượng
Tổng trọng lượng
Tổng giá trị
Tổng đã thanh toán
Tổng còn lại
```

Không export ảnh CCCD mặc định.

---

# 21. CUSTOMER – CCCD

Customer type:

```text
INDIVIDUAL
BUSINESS
```

Individual:

```text
full_name
phone
email
date_of_birth
gender
nationality
citizen_id
citizen_id_issue_date
citizen_id_issue_place
address
```

Business:

```text
business_name
tax_code
representative_name
phone
email
address
```

Có thể giữ các field hiện tại nếu đã tồn tại.

---

# 22. CCCD IMAGES

Customer có thể có:

```text
CCCD_FRONT
CCCD_BACK
```

Storage metadata:

```text
customer_id
document_type
storage_path
uploaded_by
uploaded_at
```

Security:

- Không public.
- Không expose URL storage trực tiếp nếu bucket private.
- Dùng signed URL khi cần xem.
- Có permission.
- Có audit khi view/download nếu backend hiện tại hỗ trợ.

---

# 23. QR CCCD

Đây là feature đã được khách yêu cầu nghiên cứu.

Mục tiêu:

```text
Scan QR CCCD
      ↓
Parse
      ↓
Map fields
      ↓
Prefill customer form
      ↓
Staff verifies
      ↓
Save
```

**Không tự động save ngay sau scan.**

Phải có bước:

```text
Scan → Preview → Verify → Save
```

Nếu browser/device không hỗ trợ format hoặc scanner:

```text
Hiển thị fallback manual input.
```

Không hard-code giả định về format QR nếu chưa có test thực tế.

---

# 24. BUSINESS CUSTOMER

Customer creation:

```text
Loại khách hàng
[ Cá nhân ]
[ Doanh nghiệp ]
```

Doanh nghiệp phải hỗ trợ ít nhất:

```text
Tên doanh nghiệp
Mã số thuế
Người đại diện
Số điện thoại
Email
Địa chỉ
```

---

# 25. STAFF

Admin có thể:

```text
Create staff account
View staff
Edit staff
Enable / Disable
Assign role
```

Nhân viên không được xem doanh số tổng thể.

---

# 26. PERMISSION

Minimum:

```text
ADMIN
STAFF
```

Có thể giữ role hiện tại nếu project đã có nhiều role.

## ADMIN

Có:

- Dashboard
- Sales
- Purchase
- Inventory
- Customer
- Reports
- Staff
- Audit
- Price exception approval
- CCCD permission

## STAFF

Có:

- POS
- Purchase nếu được cấp
- Customer
- Inventory cần thiết
- Own transaction history nếu được cấp

Không có:

- Revenue dashboard
- Employee sales
- Profit
- Financial overview
- Staff management
- Audit Log

**Permission phải enforced ở backend/database, không chỉ ẩn UI.**

---

# 27. INVENTORY RULES

## SALE

```text
SALE COMPLETED
→ INVENTORY OUT
```

## PURCHASE

```text
PURCHASE RECEIVED / COMPLETED
→ INVENTORY IN
```

Không sửa:

```text
stock = stock + 1
```

trực tiếp từ frontend.

Phải tạo inventory transaction/ledger.

---

# 28. INVENTORY AUDIT

Mọi inventory transaction phải có:

```text
What
Why
When
Who
Reference
Before
After
```

Ví dụ:

```text
Inventory +5

WHY:
PURCHASE_RECEIVED

REFERENCE:
BUY-000125

WHO:
Staff A

BEFORE:
10

AFTER:
15
```

---

# 29. TRANSACTION SNAPSHOT

Transaction completed phải snapshot:

```text
product_name
SKU
gold_type
gold_age
weight
quantity
unit_price
total_price
```

Không render transaction history bằng giá hiện tại từ Product table.

---

# 30. MONEY PRECISION

Không dùng JavaScript floating point cho tiền.

Không làm:

```js
0.1 + 0.2
```

để tính tiền.

Ưu tiên:

```text
integer bigint
```

cho VND nếu schema hiện tại dùng integer/bigint.

Hoặc:

```text
numeric
```

nếu business cần decimal.

Frontend phải format tiền nhưng không được làm mất precision.

---

# 31. SERVER TIME

Các timestamp quan trọng:

```text
created_at
completed_at
payment_at
due_date
inventory_transaction_at
approved_at
```

Business timestamp phải lấy từ server/database.

---

# 32. DATA INTEGRITY

Không được:

- Delete completed Sale.
- Delete completed Purchase.
- Delete Payment history.
- Delete Inventory Ledger.
- Update transaction snapshot theo Product hiện tại.
- Bypass RLS.
- Tin vào stock frontend khi finalize.
- Cho phép negative stock nếu business rule hiện tại không cho phép.
- Cho phép staff bypass price approval bằng API trực tiếp.

---

# 33. CONCURRENCY

Khi hai nhân viên cùng bán sản phẩm cuối cùng:

```text
Stock = 1

Staff A → finalize
Staff B → finalize
```

Backend phải kiểm tra/lock stock ở transaction boundary.

Không dựa vào:

```text
UI stock = 1
```

để quyết định.

---

# 34. UI MENU MỚI

Menu đề xuất:

```text
Dashboard

Bán hàng
└── POS

Mua hàng
└── Tạo giao dịch mua

Giao dịch
├── Bán hàng
├── Mua hàng
├── Chờ thanh toán
├── Công nợ
└── Lịch sử thanh toán

Hàng hóa
├── Sản phẩm
└── Tồn kho

Khách hàng
├── Danh sách
├── Tạo khách hàng
└── Chi tiết khách hàng

Hóa đơn
└── Danh sách

Báo cáo
├── Bán hàng
├── Mua hàng
├── Nhập - Xuất - Tồn
└── Excel

Quản trị
├── Nhân viên
├── Phân quyền
└── Audit Log
```

Staff chỉ thấy menu theo permission.

---

# 35. PURCHASE UI

Màn hình phải có:

```text
MUA HÀNG

Khách hàng
[ Tìm / Tạo khách hàng ]

Danh sách hàng
------------------------------------------------
Tên | Loại vàng | Tuổi | SL | Trọng lượng | Giá
------------------------------------------------

[ + Thêm hàng ]

[ Vàng thị trường ]

Tổng tiền
Đã thanh toán
Còn phải trả
Ngày hẹn trả

Thanh toán:
[ Đủ ]
[ Một phần ]
[ Chờ thanh toán ]

[ Lưu đơn ]
[ Xác nhận giao dịch ]
```

---

# 36. SALE UI

Giữ POS hiện tại, bổ sung:

```text
Số lượng
Trọng lượng
Tổng trọng lượng
Payment status
Paid
Remaining
Due date
```

Không phá UI hiện tại nếu chức năng đã hoạt động.

---

# 37. CUSTOMER DETAIL UI

```text
+--------------------------------------+
| Nguyễn Văn A                         |
| CCCD: ********8901                   |
| SĐT: 09xxxxxxxx                      |
+--------------------------------------+

[ Tổng quan ] [ Mua ] [ Bán ] [ Công nợ ]

MUA VÀO
Tổng giao dịch: 12
Tổng SL: 35
Tổng trọng lượng: 42.65 chỉ
Tổng giá trị: 580M

CỬA HÀNG CÒN NỢ
15M

BÁN RA
Tổng giao dịch: 8
Tổng SL: 15
Tổng trọng lượng: 20 chỉ
Tổng giá trị: 320M

KHÁCH CÒN NỢ
30M

[ Export Excel ]
```

---

# 38. PAYMENT DETAIL

Khi mở transaction:

```text
Transaction
Total
Paid
Remaining
Due date
Payment status
```

Lịch sử:

```text
21/08  30M  Staff A
23/08  40M  Staff B
25/08  30M  Staff A
```

---

# 39. REPORTING

Admin có:

## Purchase

```text
Tổng đơn mua
Tổng quantity
Tổng weight
Tổng giá trị
Tổng đã trả
Tổng còn phải trả
```

## Sale

```text
Tổng đơn bán
Tổng quantity
Tổng weight
Tổng doanh thu
Tổng đã thu
Tổng còn phải thu
```

Không trộn purchase amount vào revenue.

---

# 40. DOANH SỐ NHÂN VIÊN

Staff không được xem:

```text
Employee Sales
Revenue by employee
Total company revenue
Profit
```

Admin/Manager được cấp quyền mới xem.

Backend query/report endpoint phải enforce role.

---

# 41. AUDIT LOG

Bổ sung event:

```text
CREATE_PURCHASE
UPDATE_PURCHASE
COMPLETE_PURCHASE

CREATE_SALE
UPDATE_SALE
COMPLETE_SALE

CREATE_PAYMENT
PAYMENT_RECEIVED
PAYMENT_TO_CUSTOMER

PRICE_EXCEPTION
PRICE_EXCEPTION_APPROVED

UPDATE_GOLD_AGE

CREATE_CUSTOMER
UPDATE_CUSTOMER

UPLOAD_CCCD
VIEW_CCCD
DOWNLOAD_CCCD

EXPORT_CUSTOMER_EXCEL
```

Không log dữ liệu CCCD/ảnh dạng raw vào log.

---

# 42. DATABASE MIGRATION STRATEGY

**Không được drop/recreate database để triển khai feature này.**

Trước tiên:

1. Inspect current schema.
2. Identify existing:
   - products
   - sales
   - sale_items
   - invoices
   - inventory
   - inventory_transactions
   - customers
   - staff/users
   - payments
3. Reuse existing tables.
4. Add only missing columns/tables.
5. Add indexes.
6. Add RLS/policies.
7. Add functions/triggers only where necessary.
8. Migrate data safely.
9. Test backward compatibility.

Nếu project đang dùng Supabase:

```text
supabase/migrations/
```

phải chứa migration mới.

Không sửa trực tiếp production schema bằng cách không có migration history.

---

# 43. BACKEND IMPLEMENTATION RULE

Frontend không được tự quyết định:

```text
stock
total
remaining
permission
price approval
```

Backend/database phải validate lại.

Ví dụ:

```text
Frontend:
total = quantity * unit_price

Backend:
recalculate total
validate amount
validate stock
validate permission
validate price rule
commit transaction
```

---

# 44. ATOMIC TRANSACTION

Khi hoàn tất Purchase, các operation liên quan phải đảm bảo consistency:

```text
Purchase
+
Purchase Items
+
Payment
+
Inventory Transaction
+
Customer Ledger
+
Audit Log
```

Không được xảy ra:

```text
Purchase completed
nhưng Inventory chưa update
```

hoặc:

```text
Inventory updated
nhưng Purchase failed
```

Nếu backend/database hiện tại hỗ trợ PostgreSQL transaction/RPC thì ưu tiên atomic transaction.

---

# 45. CUSTOMER LEDGER

Ledger nên có concept:

```text
RECEIVABLE
PAYABLE
```

Ví dụ:

```text
SALE  +30M RECEIVABLE
PAYMENT -10M RECEIVABLE
```

và:

```text
PURCHASE +50M PAYABLE
PAYMENT -20M PAYABLE
```

Current balance có thể derive từ ledger hoặc snapshot được cập nhật transactionally.

Không để frontend tự cộng trừ công nợ.

---

# 46. SEARCH / FILTER

Purchase list:

```text
Date
Customer
Staff
Status
Payment Status
Gold Type
Market Gold
```

Sale list:

```text
Date
Customer
Staff
Status
Payment Status
```

Customer:

```text
Name
Phone
Citizen ID
Tax Code
Customer Code
```

---

# 47. PERFORMANCE

Không load toàn bộ lịch sử khách hàng vào browser.

Dùng:

```text
pagination
server-side filtering
server-side sorting
```

Excel export lớn phải chạy server-side nếu dataset lớn.

Không query:

```text
SELECT * FROM all_transactions
```

rồi filter ở frontend.

---

# 48. ACCEPTANCE TEST – PURCHASE

### Test 1

Tạo purchase:

```text
5 chỉ
14.5M/chỉ
```

Expected:

```text
Total = 72.5M
```

### Test 2

Thanh toán 50M:

```text
Paid = 50M
Remaining = 22.5M
```

### Test 3

Set due date:

```text
Due = 25/08/2026
```

### Test 4

Purchase completed:

```text
Inventory IN
```

### Test 5

History:

```text
Customer → Purchase → Payment → Inventory
```

phải truy xuất được.

---

# 49. ACCEPTANCE TEST – MARKET GOLD

Input:

```text
Market Gold
Gold Age = 99.99
Weight = 3 chỉ
Buy Price = 14.2M/chỉ
```

Expected:

```text
Total = 42.6M
```

Transaction phải lưu snapshot.

Product catalog không cần có SKU chuẩn cho item này nếu implementation sử dụng `MARKET_GOLD`.

---

# 50. ACCEPTANCE TEST – ±300K

Reference:

```text
14.5M/chỉ
```

Input:

```text
14.2M
```

Expected:

```text
Allowed boundary
```

Input:

```text
14.1M
```

Expected:

```text
PRICE_EXCEPTION
```

Không tự động sửa giá.

---

# 51. ACCEPTANCE TEST – PARTIAL PAYMENT

Purchase:

```text
100M
```

Payment:

```text
40M
```

Expected:

```text
Paid = 40M
Remaining = 60M
Status = PARTIALLY_PAID
```

Customer payable:

```text
60M
```

---

# 52. ACCEPTANCE TEST – CUSTOMER

Create individual:

```text
Name
Phone
CCCD
DOB
Gender
Address
```

Upload:

```text
Front
Back
```

Expected:

```text
Customer saved
Documents linked
Permission enforced
```

---

# 53. ACCEPTANCE TEST – BUSINESS

Create:

```text
Business
Name
Tax code
Representative
Phone
Email
Address
```

Expected:

```text
Customer type = BUSINESS
```

---

# 54. ACCEPTANCE TEST – EXPORT

Customer has:

```text
10 purchases
```

Click:

```text
Export Excel
```

Expected file contains:

```text
10 transaction rows
quantity
weight
total weight
price
total
paid
remaining
```

Footer totals must match backend values.

---

# 55. ACCEPTANCE TEST – STAFF

Login as STAFF.

Expected:

```text
Can use POS according to permission.
Can access customer according to permission.
Cannot access revenue dashboard.
Cannot access employee sales.
Cannot access staff management.
Cannot access audit log.
```

Direct API access must also be denied.

---

# 56. AI IMPLEMENTATION WORKFLOW

AI/code agent phải làm theo thứ tự:

## STEP 1 – INSPECT

Đọc:

```text
package.json
project structure
frontend routes
backend/API routes
Supabase schema
Supabase migrations
RLS policies
current POS
current customer
current inventory
current invoice
current report
```

## STEP 2 – MAP

Tạo mapping:

```text
Existing table → New requirement
Existing component → New requirement
Existing API → New requirement
Existing route → New requirement
```

## STEP 3 – MIGRATION PLAN

Trước khi code:

```text
DB changes
API changes
UI changes
Permission changes
```

## STEP 4 – IMPLEMENT BACKEND FIRST

Ưu tiên:

```text
DB
RPC/service
API
RLS
validation
transaction
audit
```

## STEP 5 – IMPLEMENT FRONTEND

Sau khi backend contract ổn định:

```text
Purchase UI
Payment UI
Customer UI
Customer detail
Market gold
Price exception
Reports
Excel
Permissions
```

## STEP 6 – TEST

Test:

```text
normal
partial payment
pending
overdue
market gold
price exception
inventory
concurrency
permissions
export
```

---

# 57. KHÔNG ĐƯỢC LÀM

AI agent tuyệt đối không được:

1. Rewrite toàn bộ project.
2. Tạo một POS mới nếu POS hiện tại có thể mở rộng.
3. Tạo bảng duplicate cho dữ liệu đã tồn tại.
4. Bỏ qua Supabase RLS.
5. Sửa trực tiếp production DB không qua migration.
6. Hard-code giá vàng.
7. Dùng floating point cho tiền.
8. Tính công nợ chỉ ở frontend.
9. Tin stock từ frontend.
10. Xóa transaction completed.
11. Update lịch sử theo product price hiện tại.
12. Cho Staff xem report mà không có permission.
13. Public CCCD image.
14. Tự động save customer ngay khi scan QR.
15. Tự động sửa giá khi vượt ±300k.
16. Gộp BUY và SELL thành một business meaning.
17. Gộp RECEIVABLE và PAYABLE thành một `debt`.
18. Làm mất dữ liệu cũ.

---

# 58. DEFINITION OF DONE

Feature chỉ được coi là hoàn thành khi:

- [ ] BUY hoạt động.
- [ ] SELL hiện tại không bị regression.
- [ ] BUY và SELL tách biệt.
- [ ] Purchase item snapshot đúng.
- [ ] Market gold hoạt động.
- [ ] Manual buy price hoạt động.
- [ ] Gold age hoạt động.
- [ ] ±300k validation hoạt động.
- [ ] Price exception approval hoạt động.
- [ ] Partial payment hoạt động.
- [ ] Pending payment hoạt động.
- [ ] Due date hoạt động.
- [ ] Receivable hoạt động.
- [ ] Payable hoạt động.
- [ ] Payment history hoạt động.
- [ ] Inventory IN cho BUY.
- [ ] Inventory OUT cho SELL.
- [ ] Customer CCCD hoạt động.
- [ ] CCCD images hoạt động.
- [ ] Business customer hoạt động.
- [ ] QR CCCD POC/flow được tích hợp hoặc có fallback.
- [ ] Quantity + total weight hiển thị.
- [ ] Customer detail có BUY/SELL riêng.
- [ ] Excel export hoạt động.
- [ ] Staff không xem doanh số.
- [ ] Admin xem được reports.
- [ ] RLS/permission enforced backend.
- [ ] Audit Log hoạt động.
- [ ] Không regression chức năng cũ.
- [ ] Migration chạy thành công.
- [ ] Existing data vẫn đọc được.
- [ ] Các transaction quan trọng được test atomicity.

---

# 59. FINAL BUSINESS MODEL

Sau khi apply toàn bộ requirement:

```text
                         CUSTOMER
                            |
              +-------------+-------------+
              |                           |
           PURCHASE                      SALE
           Cửa hàng mua                Cửa hàng bán
              |                           |
        +     INVENTORY                - INVENTORY
              |                           |
       PAYABLE TO CUSTOMER        RECEIVABLE FROM CUSTOMER
              |                           |
       Payment History             Payment History
              |                           |
              +-------------+-------------+
                            |
                       TRANSACTION
                            |
        +-------------------+-------------------+
        |                   |                   |
      ITEMS              PAYMENT             AUDIT
        |                   |                   |
   Gold Snapshot       Paid/Remaining       Who/When
   Weight              Due Date             What/Why
   Gold Age            Status               Reference
   Unit Price
        |
   Market Gold
```

## Core rule

> **Mọi biến động hàng hóa và tiền đều phải có transaction nguồn gốc, người thực hiện, thời gian, reference và lịch sử.**

Hệ thống phải trả lời được:

```text
Hàng này từ đâu vào?
→ PURCHASE

Hàng này đi đâu?
→ SALE

Ai thực hiện?
→ STAFF

Giá lúc đó là bao nhiêu?
→ TRANSACTION SNAPSHOT

Vàng bao nhiêu tuổi?
→ GOLD AGE SNAPSHOT

Bao nhiêu trọng lượng?
→ WEIGHT SNAPSHOT

Đã trả bao nhiêu?
→ PAYMENT

Còn bao nhiêu?
→ LEDGER / REMAINING

Khi nào phải trả?
→ DUE DATE

Tại sao tồn kho thay đổi?
→ INVENTORY TRANSACTION

Ai duyệt giá ngoại lệ?
→ APPROVAL + AUDIT LOG
```

---

# 60. SOURCE ALIGNMENT

Specification này là phần mở rộng trực tiếp trên SRS hiện tại.

SRS hiện tại đã xác định:

- Hệ thống quản lý sản phẩm, tồn kho, nhập hàng, bán hàng, hóa đơn, khách hàng, lịch sử và báo cáo.
- Không được sửa trực tiếp tồn kho; mọi biến động phải đi qua nghiệp vụ.
- Sale hoàn tất mới tạo Inventory OUT.
- Inventory transaction phải truy xuất được What / Why / When / Who / Reference / Before / After.
- Transaction completed không được xóa vật lý.
- Giá giao dịch phải giữ snapshot.
- Customer có lịch sử giao dịch.
- Staff/Admin có phân quyền.
- Hệ thống sử dụng server time và money precision.

Phần specification này mở rộng các nguyên tắc đó sang nghiệp vụ **PURCHASE thực tế từ khách hàng**, **PAYABLE**, **RECEIVABLE**, **PARTIAL PAYMENT**, **DUE DATE**, **MARKET GOLD**, **GOLD AGE**, **PRICE EXCEPTION ±300K/chỉ**, **CCCD**, **BUSINESS CUSTOMER**, **QR CCCD**, **CUSTOMER EXCEL EXPORT** và **Staff reporting restriction**.

---

# 61. INSTRUCTION FOR AI AGENT

> **Do not merely explain this specification. Implement it.**
>
> Before modifying anything, inspect the existing codebase and database.
>
> Reuse existing architecture and components wherever possible.
>
> Make the smallest safe set of migrations and code changes that fully satisfies this specification.
>
> Preserve all existing working features.
>
> If an existing implementation conflicts with this specification, identify the exact conflict, explain the impact, then modify it according to this specification.
>
> Do not invent business rules beyond this document.
>
> Do not ask the customer again about:
>
> - ±300.000đ/chỉ
> - Pending payment
> - Partial payment
> - Due date
> - Market gold
> - Manual buy price
> - Gold age
>
> These have already been confirmed by the customer.
>
> When implementation is complete, report:
>
> 1. Files changed.
> 2. Database migrations added.
> 3. APIs added/changed.
> 4. UI screens/components changed.
> 5. RLS/permission changes.
> 6. Tests executed.
> 7. Remaining limitations.
> 8. Any requirement that cannot be implemented without external hardware/API/configuration.
