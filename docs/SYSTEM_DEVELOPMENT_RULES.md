# SYSTEM DEVELOPMENT RULES — HỆ THỐNG QUẢN LÝ BÁN HÀNG TẠI QUẦY

> **Tài liệu bắt buộc phải đọc trước khi phát triển bất kỳ chức năng nào thuộc hệ thống.**
>
> Mục tiêu của tài liệu này là biến SRS nghiệp vụ thành **bộ quy tắc kỹ thuật bắt buộc** để mọi thay đổi được triển khai đúng phạm vi, không phá vỡ module khác và giữ nguyên tính toàn vẹn dữ liệu.

---

## 1. Mục đích

Hệ thống quản lý:

- Sản phẩm / SKU
- Tồn kho
- Nhập hàng
- Xuất kho
- Bán hàng tại quầy (POS)
- Khách hàng
- Hóa đơn
- Thanh toán
- Lịch sử biến động kho
- Kiểm kê
- Báo cáo
- Audit Log
- Phân quyền

Quy trình nghiệp vụ cốt lõi:

```text
NHẬP HÀNG
    ↓
CẬP NHẬT TỒN KHO
    ↓
BÁN HÀNG
    ↓
THANH TOÁN
    ↓
XUẤT HÓA ĐƠN
    ↓
HOÀN TẤT GIAO DỊCH
    ↓
TRỪ KHO
    ↓
LƯU LỊCH SỬ
    ↓
CẬP NHẬT KHÁCH HÀNG
    ↓
CẬP NHẬT DOANH SỐ
    ↓
BÁO CÁO
```

Nguyên tắc nền tảng:

> **Mọi biến động tồn kho phải có nguồn gốc, lý do, người thực hiện, thời gian, giao dịch tham chiếu, tồn trước và tồn sau.**

---

# 2. QUY TẮC BẮT BUỘC SỐ 1 — MODULE ĐỘC LẬP

## 2.1. Quy định tuyệt đối

**Phần này sẽ là 1 module riêng biệt không được sửa bất cứ file, module khác không liên quan và sẽ có router riêng.**

Đây là quy tắc bắt buộc.

Khi phát triển một module/chức năng:

1. Chỉ được sửa các file thuộc module đang phát triển.
2. Không tự ý sửa file của module khác.
3. Không refactor code của module khác nếu không phục vụ trực tiếp cho module hiện tại.
4. Không đổi API, interface, type, model, database contract của module khác chỉ vì thấy "có thể làm đẹp hơn".
5. Không đổi routing của module khác.
6. Không thay đổi UI/UX của module khác.
7. Không thay đổi business rule của module khác.
8. Không đổi database schema của module khác nếu không có yêu cầu đã được xác nhận.
9. Không sửa global configuration nếu thay đổi đó chỉ phục vụ một module.
10. Mỗi module phải có **router riêng**.
11. Mỗi module phải có boundary rõ ràng.
12. Dependency giữa module phải được xác định rõ ràng.
13. Nếu bắt buộc phải thay đổi module khác, phải dừng implementation và xác định rõ:
   - Vì sao phải thay đổi.
   - File nào cần thay đổi.
   - Module nào bị ảnh hưởng.
   - API/contract nào bị thay đổi.
   - Có phương án không thay đổi module kia hay không.
   - Regression test nào cần chạy.

### Quy tắc ngắn gọn

```text
MODULE A
    ↓
CHỈ SỬA PHẠM VI MODULE A

KHÔNG:
MODULE A
    ↓
TỰ Ý SỬA
    ├── MODULE B
    ├── MODULE C
    ├── GLOBAL COMPONENT
    └── ROUTER MODULE KHÁC
```

---

# 3. MODULE BOUNDARY

Mỗi module phải có cấu trúc độc lập tương đối.

Ví dụ:

```text
modules/
├── product/
│   ├── router/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── dto/
│
├── inventory/
│   ├── router/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── dto/
│
├── pos/
│   ├── router/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── dto/
│
├── customer/
│   ├── router/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── dto/
│
├── invoice/
│   ├── router/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── dto/
│
└── reporting/
    ├── router/
    ├── controller/
    ├── service/
    ├── repository/
    ├── model/
    └── dto/
```

Tên thư mục có thể thay đổi theo stack thực tế, nhưng **nguyên tắc boundary không được thay đổi**.

---

# 4. ROUTER RIÊNG CHO TỪNG MODULE

Mỗi module phải có route/endpoint boundary riêng.

Ví dụ:

```text
/api/products/*
/api/inventory/*
/api/pos/*
/api/customers/*
/api/invoices/*
/api/purchases/*
/api/returns/*
/api/reports/*
/api/audit/*
```

Không gom toàn bộ nghiệp vụ vào một router/controller duy nhất.

Không được tạo kiểu:

```text
/api/admin/do-everything
```

hoặc một controller/service khổng lồ xử lý:

```text
Product
Inventory
POS
Invoice
Customer
Report
```

---

# 5. NGUYÊN TẮC DEPENDENCY

Dependency phải đi theo hướng rõ ràng.

Ví dụ:

```text
POS
 ↓
Product / Pricing
 ↓
Customer
 ↓
Payment
 ↓
Invoice
 ↓
Sale
 ↓
Inventory
 ↓
Inventory Ledger
 ↓
Reporting
```

Nhưng việc POS gọi module khác phải thông qua contract/service/interface được xác định rõ.

Không được:

```text
POS
 └── sửa trực tiếp database logic của Inventory
```

Thay vào đó:

```text
POS
 ↓
Inventory Service / Contract
 ↓
Inventory
```

Không để module phụ thuộc trực tiếp vào implementation nội bộ của module khác nếu không cần thiết.

---

# 6. KHÔNG ĐƯỢC PHÁ VỠ CONTRACT

Một module đã có API/contract đang được module khác sử dụng thì không được tự ý:

- Đổi tên field.
- Đổi kiểu dữ liệu.
- Đổi enum.
- Đổi status.
- Xóa field.
- Đổi semantics.
- Đổi response structure.
- Đổi error code.
- Đổi authorization behavior.

Nếu bắt buộc phải thay đổi:

```text
OLD CONTRACT
    ↓
Xác định consumer
    ↓
Đánh giá backward compatibility
    ↓
Thiết kế migration
    ↓
Test
    ↓
Mới được thay đổi
```

---

# 7. KHÔNG REFACTOR NGOÀI PHẠM VI

Trong lúc làm một chức năng, nếu phát hiện:

```text
File khác đang xấu
Code khác đang duplicate
Module khác có thể refactor
Tên biến module khác chưa đẹp
```

**Không tự ý sửa.**

Ghi nhận thành:

```text
TECH DEBT / FOLLOW-UP
```

Chỉ refactor khi:

- Có yêu cầu riêng.
- Có ticket riêng.
- Có approval.
- Có đánh giá impact.

---

# 8. NGUYÊN TẮC DATABASE

Database là nguồn dữ liệu nghiệp vụ quan trọng.

Không được:

- Update tồn kho trực tiếp từ frontend.
- Cho frontend quyết định trạng thái giao dịch cuối cùng.
- Xóa vật lý dữ liệu giao dịch đã hoàn tất.
- Sửa lịch sử inventory transaction.
- Sửa audit log theo cách làm mất lịch sử.

Frontend chỉ gửi command/request.

Ví dụ:

```text
Frontend
    ↓
Create Sale
    ↓
Backend
    ├── Check permission
    ├── Check stock
    ├── Check status
    ├── Check price
    ├── Create transaction
    ├── Update inventory
    ├── Create inventory ledger
    ├── Create invoice
    ├── Update reporting data
    └── Audit log
```

---

# 9. INVENTORY — QUY TẮC BẮT BUỘC

## 9.1. Không sửa tồn kho trực tiếp

Không được:

```text
UPDATE stock = 10
```

mà không có nghiệp vụ.

Phải có:

```text
Current = 8
Adjustment = +2
Reason = "Kiểm kê"
```

và tạo inventory transaction:

```text
Type   = ADJUSTMENT_IN
Quantity = +2
Before = 8
After  = 10
Reason = "Kiểm kê"
```

---

## 9.2. Mọi inventory change phải có nguồn gốc

Mỗi biến động phải xác định:

```text
WHAT
WHY
WHEN
WHO
REFERENCE
BEFORE
AFTER
```

Ví dụ:

```text
Product: Nhẫn A
Type: SALE
Quantity: -1
Before: 5
After: 4
Reference: HD00125
Staff: Staff A
Time: 15/08/2026 14:32
```

---

# 10. CÁC LOẠI INVENTORY TRANSACTION

Tối thiểu:

```text
PURCHASE_RECEIVED
SALE
CUSTOMER_RETURN
SUPPLIER_RETURN
STOCK_ADJUSTMENT_IN
STOCK_ADJUSTMENT_OUT
```

Có thể mở rộng:

```text
TRANSFER_IN
TRANSFER_OUT
DAMAGED
LOST
OTHER_OUT
```

Không được tạo loại transaction mới tùy tiện nếu chưa xác định business meaning.

---

# 11. POS — QUY TẮC BẮT BUỘC

## 11.1. Không trừ kho khi tạo đơn

```text
Create POS
    ↓
Select Product
    ↓
Check Stock
    ↓
Add Cart
```

**Chưa được trừ kho.**

---

## 11.2. Không trừ kho khi hóa đơn chưa thành công

Nếu:

```text
Payment
    ↓
Invoice Error
```

thì:

```text
Sale ≠ Completed
Inventory ≠ Reduced
```

Phải:

- Ghi nhận lỗi.
- Cho phép retry nếu phù hợp.
- Không tạo hóa đơn trùng.
- Không tạo inventory transaction trùng.

---

## 11.3. Thời điểm trừ kho

Quy tắc:

```text
Invoice Issued Successfully
+
Sale Completed
=
Inventory Out
```

---

# 12. CONCURRENCY — HAI NHÂN VIÊN BÁN CÙNG SẢN PHẨM

Không được tin số tồn hiển thị trên frontend.

Ví dụ:

```text
Stock = 1

Staff A → thấy 1
Staff B → thấy 1

Staff A → Complete
Stock = 0

Staff B → Complete
```

Backend phải kiểm tra lại:

```text
Current Stock >= Requested Quantity
```

Nếu không đủ:

```text
REJECT
```

Không được dựa vào:

```text
UI Stock
```

để quyết định giao dịch cuối cùng.

---

# 13. PRICE — GIÁ BÁN

POS lấy giá từ bảng giá hiện tại.

```text
Current Price Table
        ↓
Calculate Product Price
        ↓
POS
```

Không tạo hệ thống tính giá riêng nếu không cần thiết.

Khi giao dịch hoàn tất phải lưu snapshot:

```text
Unit Price
Quantity
Total Price
```

Hóa đơn cũ không được tính lại theo giá mới.

Ví dụ:

```text
15/08
Price = 8.000.000
Invoice = 8.000.000

16/08
Price = 9.000.000

Invoice ngày 15/08
= 8.000.000
```

---

# 14. PRICE CHANGE KHI ĐANG BÁN

Nếu giá thay đổi trong lúc nhân viên đang mở POS:

```text
POS opened
Price = 8.000.000

Price table changed
Price = 8.500.000
```

Hệ thống phải có rule rõ ràng về thời điểm chốt giá.

Quy tắc đề xuất:

```text
Giá được xác nhận tại thời điểm nhân viên chốt giao dịch.
```

**Không tự ý thay đổi rule này nếu chưa có xác nhận nghiệp vụ.**

---

# 15. MONEY — TIỀN TỆ

Không sử dụng floating point để tính tiền.

Không để xảy ra:

```text
10.00000000001
```

Các giá trị phải chính xác:

```text
Unit Price
Total Price
Invoice Total
Revenue
```

Database và application phải sử dụng kiểu dữ liệu phù hợp với tiền tệ, ví dụ `DECIMAL/NUMERIC` hoặc integer theo đơn vị tiền nhỏ nhất tùy kiến trúc đã thống nhất.

Không dùng `float/double` làm nguồn tính toán tiền nếu có nguy cơ sai số.

---

# 16. TIME — THỜI GIAN

Mọi nghiệp vụ quan trọng phải sử dụng server time làm nguồn chính.

Ví dụ:

```text
created_at
completed_at
invoice_issued_at
inventory_transaction_at
```

Không dùng client time làm nguồn dữ liệu nghiệp vụ quan trọng.

---

# 17. INVOICE

Trạng thái đề xuất:

```text
DRAFT
PENDING_PAYMENT
PAYMENT_CONFIRMED
INVOICE_PENDING
INVOICE_ISSUED
COMPLETED
FAILED
CANCELLED
REFUNDED
```

Không được tự ý thêm/xóa/đổi semantics status.

Invoice đã phát hành:

**Không được xóa vật lý.**

Nếu cần xử lý:

```text
CANCEL
RETURN
ADJUSTMENT
REPLACEMENT
```

phải tạo lịch sử nghiệp vụ tương ứng.

---

# 18. TRANSACTION INTEGRITY

Các nghiệp vụ liên quan đến tiền và tồn kho không được rơi vào trạng thái một phần.

Không được xảy ra:

```text
Invoice SUCCESS
+
Inventory NOT REDUCED
```

hoặc:

```text
Inventory REDUCED
+
No Sale Transaction
```

hoặc:

```text
2 Invoices
+
1 Payment
```

Phải kiểm soát:

- Database transaction.
- Business status.
- Idempotency.
- Duplicate request.
- Retry.
- Concurrency.

---

# 19. IDEMPOTENCY

Các thao tác có thể retry phải có cơ chế chống duplicate.

Đặc biệt:

- Payment.
- Invoice issuance.
- Sale completion.
- Inventory transaction.
- Return.
- Purchase confirmation.

Một request retry không được tạo:

```text
2 Sale
2 Invoice
2 Payment
2 Inventory OUT
```

---

# 20. CUSTOMER

Thông tin tối thiểu:

```text
Name
Phone
```

Có thể có:

```text
Email
Address
Tax Code
Note
```

Khách mua tại quầy không bắt buộc phải có tài khoản website.

Customer phải có thể:

```text
Search
Create
View Detail
View Purchase History
View Invoice History
View Total Purchase
```

Không xóa customer đã có giao dịch nếu việc xóa làm mất lịch sử.

---

# 21. PURCHASE / NHẬP HÀNG

Trạng thái:

```text
DRAFT
RECEIVING
RECEIVED
CANCELLED
```

Chỉ khi:

```text
RECEIVED
```

thì inventory mới tăng.

Phải phân biệt:

```text
Expected Quantity
Received Quantity
```

Ví dụ:

```text
Expected = 10
Received = 9

Inventory += 9
```

Không tự động cộng 10.

---

# 22. RETURN

Không sửa sale cũ thành trạng thái khác để che giấu lịch sử.

Ví dụ:

```text
Original Sale
Quantity = -1

Customer Return
Quantity = +1
```

Lịch sử phải giữ:

```text
SALE -1
RETURN +1
```

Không biến:

```text
SALE -1
```

thành:

```text
SALE 0
```

---

# 23. STOCK COUNT / KIỂM KÊ

Quy trình:

```text
Create Stock Count
    ↓
Read System Stock
    ↓
Count Physical Stock
    ↓
Input Actual Quantity
    ↓
Calculate Difference
    ↓
Authorized User Confirm
    ↓
Create Adjustment
    ↓
Update Inventory
    ↓
Create Inventory Transaction
```

Không sửa stock trực tiếp.

---

# 24. AUDIT LOG

Các thao tác quan trọng phải được audit.

Ví dụ:

```text
User
Time
Action
Product
Quantity
Reason
Reference
```

Audit log không được cho phép nhân viên thông thường xóa.

Các thao tác nhạy cảm phải được ghi nhận, ví dụ:

```text
STOCK_ADJUSTMENT_IN
STOCK_ADJUSTMENT_OUT
SALE
RETURN
CANCEL
INVOICE
PURCHASE
PERMISSION_CHANGE
```

---

# 25. REPORTING

Reporting chỉ lấy dữ liệu từ nguồn nghiệp vụ đã hoàn tất/hợp lệ theo business rule.

Không để frontend tự tính doanh thu bằng dữ liệu không đáng tin cậy.

Các báo cáo:

```text
Daily Revenue
Monthly Revenue
Yearly Revenue
Product Sales
Employee Sales
Import / Export / Stock
Inventory History
```

Báo cáo lớn không được làm ảnh hưởng đến POS.

Nếu cần:

- Read model.
- Aggregate table.
- Cache.
- Background job.
- Materialized view.

Nhưng phải giữ nguyên source of truth của nghiệp vụ.

---

# 26. DATA RELATIONSHIP

Các entity có liên quan nhưng không thay thế lẫn nhau.

```text
Invoice ≠ Inventory
Sale ≠ Invoice
Customer ≠ Sale
```

Mỗi nghiệp vụ phải có:

- Data riêng.
- Status riêng.
- Lifecycle riêng.
- History riêng.

---

# 27. TRACEABILITY

Từ Invoice phải truy ngược được:

```text
Invoice
 ↓
Sale
 ↓
Customer
 ↓
Staff
 ↓
Sale Items
 ↓
Inventory Transaction
```

Từ Inventory Transaction phải truy ngược được:

```text
Inventory Transaction
 ↓
Reference
 ↓
Sale / Purchase / Return / Adjustment
```

Mục tiêu:

> **Mọi giao dịch đều phải có thể truy xuất nguồn gốc.**

---

# 28. BACKEND LÀ NGUỒN QUYẾT ĐỊNH

Frontend không được là nguồn quyết định cuối cùng cho:

- Permission.
- Stock.
- Price validity.
- Transaction status.
- Invoice status.
- Revenue.
- Inventory mutation.

Frontend chỉ gửi command/request.

Backend phải:

```text
Validate permission
Validate input
Validate business rule
Validate stock
Validate status
Validate concurrency
Execute transaction
Write history
Write audit
Return result
```

---

# 29. FRONTEND KHÔNG ĐƯỢC TRUST

Không tin các giá trị sau do frontend gửi lên:

```text
stock
final_price
total_price
user_role
invoice_status
completed_status
inventory_before
inventory_after
revenue
```

Backend phải tự xác định hoặc kiểm tra lại.

---

# 30. ERROR HANDLING

Mỗi lỗi nghiệp vụ phải có trạng thái rõ ràng.

Không:

```text
catch
↓
ignore
```

Không nuốt exception.

Không trả:

```text
200 OK
```

cho một nghiệp vụ thực tế thất bại nếu contract yêu cầu failure.

Đặc biệt phải phân biệt:

```text
Validation Error
Business Error
Authorization Error
Not Found
Conflict
External Service Error
Internal Error
```

---

# 31. EXTERNAL INTEGRATION

Các integration bên ngoài phải được cô lập.

Ví dụ:

```text
Invoice Provider
Payment Provider
Printer
Barcode
```

Không để business module phụ thuộc trực tiếp vào SDK cụ thể nếu có thể tạo abstraction.

Ví dụ:

```text
Invoice Module
      ↓
Invoice Provider Interface
      ↓
Provider A / Provider B
```

Khi provider thay đổi, không được sửa lan sang:

```text
POS
Inventory
Customer
Reporting
```

trừ khi contract nghiệp vụ thực sự thay đổi.

---

# 32. DATABASE MIGRATION

Mọi thay đổi database phải:

- Có migration.
- Có rollback strategy nếu kiến trúc hỗ trợ.
- Không xóa dữ liệu production tùy tiện.
- Không đổi column đang được sử dụng mà không đánh giá consumer.
- Không sửa dữ liệu lịch sử để "làm cho đúng" nếu nghiệp vụ yêu cầu audit.

Ưu tiên migration nhiều bước khi thay đổi lớn:

```text
1. Add new field
2. Deploy compatible code
3. Backfill
4. Switch read/write
5. Remove old field sau khi chắc chắn
```

Không breaking change đột ngột.

---

# 33. API DESIGN

API phải:

- Có naming nhất quán.
- Có request/response contract rõ ràng.
- Có validation.
- Có authorization.
- Có error response chuẩn.
- Có idempotency khi cần.
- Có pagination với danh sách lớn.
- Có filtering/search hợp lý.
- Không trả thừa dữ liệu nhạy cảm.

Không tạo API chỉ để phục vụ một UI component nếu API đó phá vỡ boundary nghiệp vụ.

---

# 34. PAGINATION / SEARCH / PERFORMANCE

Các màn hình có dữ liệu lớn phải hỗ trợ:

```text
Pagination
Filtering
Sorting
Search
```

Không tải toàn bộ:

```text
Invoices
Inventory History
Customers
Audit Logs
```

về frontend nếu dữ liệu có thể lớn.

Index database phải được cân nhắc dựa trên query thực tế.

---

# 35. PERFORMANCE

Các thao tác quan trọng:

```text
Search Product
Search Customer
Create Sale
Invoice Lookup
Inventory History
Reports
```

phải hoạt động tốt.

Đặc biệt:

> **Reporting không được làm ảnh hưởng đến POS.**

Không thực hiện query/report nặng trong transaction bán hàng nếu không cần thiết.

---

# 36. SECURITY

Nhân viên bán hàng không được:

- Xóa invoice.
- Xóa inventory history.
- Sửa stock trực tiếp.
- Sửa revenue.
- Thay đổi transaction history.
- Xóa customer đã có giao dịch.
- Thay đổi admin settings.
- Thực hiện nghiệp vụ vượt quyền.

Administrator có quyền cao hơn nhưng thao tác quan trọng vẫn phải Audit Log.

---

# 37. SOFT DELETE / DATA RETENTION

Dữ liệu giao dịch quan trọng:

```text
Invoice
Sale
Sale Item
Inventory Transaction
Payment History
Audit Log
```

không được physical delete sau khi hoàn tất.

Nếu cần thay đổi:

```text
Original Transaction
        ↓
New Transaction
        ↓
Return / Cancel / Adjustment / Replacement
```

Mục tiêu:

> **Không làm mất lịch sử.**

---

# 38. UI / UX

UI phải phản ánh business state.

Không được hiển thị:

```text
Completed
```

khi backend chưa thực sự hoàn tất.

Không tự đổi:

```text
Pending → Completed
```

chỉ vì request đã được gửi.

UI phải xử lý:

```text
Loading
Success
Validation Error
Business Error
Conflict
Retry
Timeout
Network Error
```

---

# 39. ROUTER / NAVIGATION RULE

Mỗi module có router riêng.

Ví dụ:

```text
ProductRouter
InventoryRouter
POSRouter
CustomerRouter
InvoiceRouter
PurchaseRouter
ReportRouter
AuditRouter
```

Router của module A không được tự ý quản lý navigation nội bộ của module B.

Nếu cần chuyển module:

```text
Module A
 ↓
Application Navigation Contract
 ↓
Module B
```

Không import sâu implementation navigation của module B.

---

# 40. SHARED / COMMON CODE

Chỉ đưa code vào `shared/common` khi nó thực sự generic.

Được phép:

```text
Date utility
Money utility
Common validation
Network abstraction
Logger
Design system
Common error type
```

Không được đưa business logic của một module vào shared chỉ để tiện import.

Ví dụ KHÔNG:

```text
shared/
└── inventoryBusinessHelper
```

nếu helper đó thực tế chỉ thuộc Inventory.

---

# 41. QUY TẮC KHI BẮT ĐẦU MỘT TASK

Trước khi code phải xác định:

```text
1. Module nào?
2. Router nào?
3. Business rule nào?
4. File nào thuộc module?
5. Dependency nào?
6. API contract nào?
7. Database nào?
8. Permission nào?
9. Transaction nào?
10. Audit nào?
11. Có ảnh hưởng module khác không?
```

Nếu chưa trả lời được các câu trên:

> **Không bắt đầu code.**

---

# 42. QUY TẮC XÁC ĐỊNH PHẠM VI FILE

Trước khi sửa code phải lập danh sách:

```text
ALLOWED FILES
```

Ví dụ:

```text
modules/inventory/router/*
modules/inventory/controller/*
modules/inventory/service/*
modules/inventory/repository/*
modules/inventory/model/*
modules/inventory/dto/*
```

Và:

```text
FORBIDDEN WITHOUT APPROVAL
```

Ví dụ:

```text
modules/pos/*
modules/invoice/*
modules/customer/*
modules/reporting/*
```

Nếu phát hiện cần sửa file ngoài phạm vi:

**Dừng và đánh giá impact trước.**

---

# 43. QUY TẮC PR / COMMIT

Mỗi task nên có phạm vi rõ.

Ví dụ:

```text
feat(inventory): add stock adjustment
```

Không gom:

```text
feat(inventory):
- stock adjustment
- refactor POS
- redesign customer
- change invoice API
```

trong cùng một task nếu không cần thiết.

PR phải trả lời:

```text
What changed?
Why?
Which module?
Which files?
Business rules affected?
Database changes?
API changes?
Regression risk?
Test result?
```

---

# 44. CHECKLIST TRƯỚC KHI CODE

- [ ] Xác định module.
- [ ] Xác định router.
- [ ] Xác định business rule.
- [ ] Xác định allowed files.
- [ ] Xác định forbidden files.
- [ ] Xác định dependency.
- [ ] Xác định API contract.
- [ ] Xác định database impact.
- [ ] Xác định permission.
- [ ] Xác định audit requirement.
- [ ] Xác định transaction boundary.
- [ ] Xác định concurrency risk.
- [ ] Xác định idempotency requirement.

---

# 45. CHECKLIST SAU KHI CODE

- [ ] Không sửa module không liên quan.
- [ ] Không sửa router module khác.
- [ ] Không thay đổi contract không cần thiết.
- [ ] Không sửa trực tiếp inventory.
- [ ] Không bypass backend business rule.
- [ ] Không dùng floating point cho money.
- [ ] Không dùng client time cho nghiệp vụ quan trọng.
- [ ] Không tạo duplicate transaction.
- [ ] Không tạo duplicate invoice.
- [ ] Không làm mất history.
- [ ] Có audit cho thao tác quan trọng.
- [ ] Có validation.
- [ ] Có authorization.
- [ ] Có error handling.
- [ ] Có concurrency check.
- [ ] Có transaction integrity.
- [ ] Có test.
- [ ] Có regression check module liên quan.

---

# 46. CHECKLIST MODULE ISOLATION

Trước khi hoàn thành task, bắt buộc trả lời:

```text
Module đang sửa:
→ ____________________

Router:
→ ____________________

Các file được phép sửa:
→ ____________________

Các module không được sửa:
→ ____________________

Có sửa shared/common không?
→ YES / NO

Nếu YES, lý do:
→ ____________________

Có thay đổi API contract không?
→ YES / NO

Có thay đổi DB schema không?
→ YES / NO

Có ảnh hưởng module khác không?
→ YES / NO

Nếu YES, module nào?
→ ____________________

Đã có approval chưa?
→ YES / NO
```

---

# 47. DEFINITION OF DONE

Một chức năng chỉ được coi là hoàn thành khi:

```text
Business Rule
        +
Module Boundary
        +
API Contract
        +
Database Integrity
        +
Authorization
        +
Audit
        +
Error Handling
        +
Concurrency
        +
Idempotency
        +
Testing
```

đều đạt yêu cầu.

Không coi:

```text
UI chạy được
```

là đồng nghĩa với:

```text
Feature hoàn thành
```

---

# 48. NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ VỠ

## Rule 1

> **Không sửa module không liên quan.**

## Rule 2

> **Module mới/chức năng mới phải có boundary riêng và router riêng.**

## Rule 3

> **Không sửa trực tiếp tồn kho. Mọi thay đổi phải có nghiệp vụ và Inventory Transaction.**

## Rule 4

> **Không tin dữ liệu nghiệp vụ quan trọng từ frontend. Backend là nguồn quyết định cuối cùng.**

## Rule 5

> **Không xóa dữ liệu giao dịch đã hoàn tất.**

## Rule 6

> **Không để một giao dịch tạo ra trạng thái một phần.**

## Rule 7

> **Không dùng floating point để tính tiền.**

## Rule 8

> **Không dùng client time làm nguồn chính cho nghiệp vụ quan trọng.**

## Rule 9

> **Không tự ý thay đổi business rule chưa được xác nhận.**

## Rule 10

> **Không refactor ngoài scope của task.**

## Rule 11

> **Không breaking API/database contract mà không có migration và đánh giá impact.**

## Rule 12

> **Mọi thay đổi phải có khả năng truy xuất nguồn gốc khi liên quan đến giao dịch, tồn kho và tiền.**

---

# 49. NGUYÊN TẮC KHI CÓ YÊU CẦU MỚI

Khi nhận một yêu cầu mới, không được code ngay.

Phải thực hiện:

```text
REQUEST
  ↓
IDENTIFY MODULE
  ↓
IDENTIFY ROUTER
  ↓
IDENTIFY BUSINESS RULE
  ↓
CHECK EXISTING CONTRACT
  ↓
CHECK DEPENDENCIES
  ↓
CHECK DATABASE IMPACT
  ↓
CHECK SECURITY
  ↓
CHECK CONCURRENCY
  ↓
CHECK AUDIT
  ↓
DEFINE ALLOWED FILES
  ↓
IMPLEMENT
  ↓
TEST
  ↓
REGRESSION TEST
```

---

# 50. KHI YÊU CẦU CÓ VẺ ĐƠN GIẢN NHƯNG CÓ THỂ ẢNH HƯỞNG MODULE KHÁC

Ví dụ:

> "Thêm nút sửa tồn kho."

Không được chỉ nghĩ:

```text
Add Button
```

Phải kiểm tra:

```text
Permission
Inventory
Inventory Transaction
Audit Log
Stock Count
Reporting
Concurrency
API
Database
```

Sau đó mới implement.

---

# 51. KHI PHÁT HIỆN CODE HIỆN TẠI ĐANG SAI

Không tự động sửa hàng loạt.

Phải phân loại:

```text
A. Bug thuộc module hiện tại
→ Có thể sửa trong scope.

B. Bug thuộc module khác
→ Không tự ý sửa.

C. Shared bug ảnh hưởng module hiện tại
→ Đánh giá impact và approval.

D. Business rule chưa rõ
→ Không tự đoán.

E. Data migration cần thiết
→ Lập migration riêng.
```

---

# 52. KHI BUSINESS RULE CHƯA RÕ

Không được tự suy diễn thành behavior production.

Ví dụ:

```text
Giá thay đổi khi POS đang mở
```

Nếu chưa có rule xác nhận:

```text
STOP
→ Document question
→ Customer/Product Owner confirm
→ Update specification
→ Implement
```

---

# 53. NGUYÊN TẮC DATA SOURCE

Mỗi loại dữ liệu phải có source of truth.

Ví dụ:

```text
Product
→ Product Module / Product Data

Current Stock
→ Inventory

Inventory History
→ Inventory Ledger

Sale
→ Sale

Invoice
→ Invoice

Customer
→ Customer

Revenue
→ Reporting từ transaction hợp lệ
```

Không tạo nhiều source of truth cho cùng một business fact nếu không có lý do rõ ràng.

---

# 54. SOURCE OF TRUTH CỦA INVENTORY

Có thể lưu:

```text
Current Stock
```

để truy xuất nhanh.

Nhưng bắt buộc có:

```text
Inventory Transaction History
```

để truy xuất nguồn gốc.

Ví dụ:

```text
Opening       +5
Purchase     +10
Sale          -4
Return        +1
Adjustment    -2
-----------------
Final         10
```

Nếu Current Stock không khớp Ledger:

> Đây là **data integrity issue**, không được đơn giản sửa Current Stock để che lỗi.

---

# 55. SOURCE OF TRUTH CỦA INVOICE

Invoice phải lưu snapshot tại thời điểm giao dịch:

```text
Unit Price
Quantity
Total Price
Customer
Staff
Time
Status
```

Không tính lại invoice lịch sử dựa trên dữ liệu hiện tại.

---

# 56. SOURCE OF TRUTH CỦA REVENUE

Revenue phải dựa trên các giao dịch hợp lệ/hoàn tất theo business rule đã thống nhất.

Không cộng doanh thu chỉ vì:

```text
POS button clicked
```

hoặc:

```text
Payment request sent
```

---

# 57. REGRESSION RULE

Sau mỗi thay đổi phải kiểm tra ít nhất:

```text
Module hiện tại
+
Module trực tiếp phụ thuộc
+
Module trực tiếp được module hiện tại sử dụng
```

Nhưng:

> Regression test **không đồng nghĩa với sửa code của module đó**.

Có thể test module khác mà không được phép tự ý refactor module đó.

---

# 58. FINAL ARCHITECTURE PRINCIPLE

Kiến trúc phải hướng đến:

```text
                    ┌──────────────┐
                    │  PRICE TABLE │
                    └──────┬───────┘
                           ↓
┌──────────┐        ┌──────────────┐
│ CUSTOMER │ ←────→ │     POS      │
└──────────┘        └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    PAYMENT   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   INVOICE    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ SALE COMPLETE│
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  INVENTORY   │
                    └──────┬───────┘
                           ↓
                 ┌────────────────────┐
                 │ INVENTORY LEDGER   │
                 └─────────┬──────────┘
                           ↓
                    ┌──────────────┐
                    │  REPORTING   │
                    └──────────────┘
```

Các module liên kết với nhau bằng **business contract**, không phải bằng việc sửa trực tiếp implementation nội bộ của nhau.

---

# 59. TINH THẦN PHÁT TRIỂN

Hệ thống không chỉ nhằm trả lời:

> "Hiện tại kho còn bao nhiêu?"

Mà phải trả lời được:

```text
Sản phẩm nào thay đổi?
↓
Thay đổi bao nhiêu?
↓
Tăng hay giảm?
↓
Vì sao?
↓
Liên quan giao dịch nào?
↓
Ai thực hiện?
↓
Khi nào?
↓
Tồn trước?
↓
Tồn sau?
```

Đây là nguyên tắc cốt lõi của toàn bộ hệ thống.

---

# 60. QUY TẮC CUỐI CÙNG — STRICT MODE

Khi làm việc với hệ thống này, mặc định áp dụng:

```text
STRICT MODULE ISOLATION = ON
STRICT BUSINESS RULE = ON
STRICT DATA INTEGRITY = ON
STRICT AUDIT = ON
STRICT API CONTRACT = ON
STRICT DATABASE INTEGRITY = ON
STRICT SECURITY = ON
STRICT TRANSACTION INTEGRITY = ON
STRICT CONCURRENCY = ON
STRICT IDEMPOTENCY = ON
```

Nếu một yêu cầu mới mâu thuẫn với tài liệu này:

```text
STOP
↓
Xác định rule bị ảnh hưởng
↓
Xác định module bị ảnh hưởng
↓
Xác định file bị ảnh hưởng
↓
Đánh giá impact
↓
Xác nhận business rule
↓
Cập nhật specification nếu cần
↓
Sau đó mới code
```

**Không được tự ý bỏ qua các rule trên chỉ để hoàn thành task nhanh hơn.**

---

# 61. REFERENCE — BUSINESS SCOPE

Các module nghiệp vụ chính của hệ thống:

```text
MODULE 1  — Product
MODULE 2  — Inventory
MODULE 3  — POS / Sale
MODULE 4  — Customer
MODULE 5  — Invoice
MODULE 6  — Purchase
MODULE 7  — Stock Out
MODULE 8  — Inventory Ledger
MODULE 9  — Stock Count
MODULE 10 — Reporting
MODULE 11 — Search / Query
MODULE 12 — Audit Log
```

Ngoài phạm vi giai đoạn đầu gồm các hướng mở rộng như:

```text
Multi-store
Multi-warehouse
Warehouse Transfer
Advanced Supplier
Supplier Debt
Loyalty
Point
Voucher / Promotion
HR
Full Accounting
Advanced Financial Reporting
Online Sales Integration
```

Các chức năng mở rộng không được tự ý triển khai vào core module nếu chưa có scope riêng.

---

# 62. KẾT LUẬN

Đây là **development contract** của hệ thống.

Mọi developer/AI/agent tham gia phát triển phải tuân thủ:

1. Đúng business rule.
2. Đúng module boundary.
3. Đúng router.
4. Đúng API contract.
5. Đúng database integrity.
6. Đúng permission.
7. Đúng audit.
8. Đúng transaction.
9. Đúng concurrency.
10. Đúng idempotency.
11. Không sửa module không liên quan.
12. Không xóa lịch sử.
13. Không bypass backend.
14. Không tự ý suy diễn business rule.
15. Không refactor ngoài scope.

> **Mỗi module là một boundary độc lập. Mỗi nghiệp vụ là một transaction có nguồn gốc. Mỗi thay đổi phải có phạm vi rõ ràng.**

> **Đặc biệt: Phần này sẽ là 1 module riêng biệt không được sửa bất cứ file, module khác không liên quan và sẽ có router riêng.**
