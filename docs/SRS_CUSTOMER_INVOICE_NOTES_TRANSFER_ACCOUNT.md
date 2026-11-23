# SRS — CUSTOMER NOTES, INVOICE NOTES & TRANSFER ACCOUNT

**Project:** Thăng Long Kim Việt POS  
**Scope:** Customer Management, Purchase (Mua vào), Sales (Bán hàng), Invoice List  
**Document type:** Software Requirements Specification  
**Branch target:** `Finn/New/POS-Future`  
**Status:** Approved for implementation (feasibility re-check 23/11/2026) — **docs only; no code in this commit**

---

## 0. Feasibility re-check (23/11/2026)

### Verdict

**Khả thi.** Có thể triển khai trên schema/RPC/UI hiện tại mà không đổi nghiệp vụ thanh toán, công nợ, tồn kho hay trạng thái hoàn thành hóa đơn.

### Mapping nhanh FR → hiện trạng

| FR | Khả thi | Việc cần làm | Rủi ro / lưu ý |
|---|---|---|---|
| FR-01 Ghi chú khách hàng | Có | UI `CustomerDetailModal` hiện `pos_customers.note` (CRUD đã có) | Thấp |
| FR-02 Ghi chú hóa đơn | Có | Giữ `pos_sales.note` / `pos_buys.note`; không đụng `pos_*_payments.note` | Thấp — note HĐ lịch sử đang chứa cả shorthand CK (`CK CTY`, `CK DƯƠNG`…) |
| FR-03 Cần theo dõi = note không rỗng | Có | Derived flag; không cột/status mới | Filter “cần theo dõi” sẽ gồm cả HĐ cũ có note kiểu `CK CTY` — **đã chấp nhận theo SRS** |
| FR-04 Loại TK CK theo payment | Có | **Cần migration** cột có cấu trúc trên payment (vd. `receive_account_kind`, optional note); **không** reuse `pos_sale_payments.note` | Trung bình — phải sửa `complete_sale` / `payment_splits`, `collect_sale_payment`, luồng mua tương ứng |
| FR-05 List hiển thị note + TT | Có | Mở rộng `pos_list_documents` + UI list | Trung bình — HĐ nhiều payment cần aggregate rõ từng dòng |
| FR-06 2 filter mới | Có | Thêm param filter vào list RPC + UI; **giữ nguyên filter cũ** | Trung bình — kết hợp AND với filter hiện có; MIXED = xuất hiện ở cả TM và CK |

### Quyết định schema (đề xuất triển khai — chưa code)

**Bán hàng (`pos_sale_payments`):**

- Thêm `receive_account_kind` (`COMPANY` \| `PERSONAL` \| NULL).
- Thêm `receive_account_note` (text, NULL; bắt buộc khi kind = `PERSONAL` theo UI).
- NULL cho CASH / lịch sử thiếu dữ liệu.
- Không parse note cũ (`CK CTY`, …) để backfill.

**Mua vào:**

- Kind vẫn gắn **từng** `pos_buy_payments` (cùng semantic COMPANY/PERSONAL theo SRS §4.2).
- Chi tiết số TK / chủ TK: **tái sử dụng** `bank_account` / `bank_account_holder` (và snapshot trên `pos_buys`) — không tạo cột trùng nghĩa.
- Nếu UI cần hiện chi tiết TK trên từng payment PERSONAL mà snapshot chỉ ở cấp phiếu mua: đọc từ snapshot phiếu + kind trên payment (không nhân bản cột trừ khi audit phát hiện thiếu).

**Không tạo bảng mới** nếu ALTER payment đủ dùng.

### Module / file dự kiến (khi code — không thuộc commit này)

- `customer`: `CustomerDetailModal` (+ types/map nếu thiếu field trên payload popup).
- `pos`: UI chọn kind khi TRANSFER; truyền metadata trong `payment_splits` / complete sale.
- `purchase`: UI kind + gắn với payment mua; reuse bank fields.
- `invoice`: `pos_list_documents`, list UI, 2 filter mới; detail vẫn hiện đủ.
- `supabase/migrations`: ALTER payment + cập nhật RPC (GRANT §32.1 chỉ nếu CREATE TABLE — ALTER cột trên bảng đã grant thì giữ grant hiện có).

### Out of scope (xác nhận lại)

Không CRM, không status “đã xử lý ghi chú”, không đổi công nợ/giá/kho, không backfill từ ghi chú lịch sử, không refactor ngoài phạm vi.

---

## 1. Mục tiêu

Bổ sung và hoàn thiện các chức năng:

1. Quản lý ghi chú khách hàng.
2. Quản lý và hiển thị ghi chú trên hóa đơn.
3. Lưu thông tin tài khoản liên quan đến giao dịch chuyển khoản.
4. Bổ sung bộ lọc phương thức thanh toán và loại tài khoản tại danh sách hóa đơn.

Yêu cầu áp dụng cho cả hai nghiệp vụ **Mua vào** và **Bán hàng**.

Ưu tiên tái sử dụng dữ liệu, UI, API và logic hiện có. Không thay đổi các nghiệp vụ thanh toán, công nợ, tồn kho hoặc hoàn thành hóa đơn.

---

## 2. Hiện trạng hệ thống theo kết quả audit

| Hạng mục | Hiện trạng |
|---|---|
| Ghi chú khách hàng | Đã có `pos_customers.note`, CRUD và upsert RPC đã lưu dữ liệu |
| Chi tiết khách hàng | `CustomerDetailModal` chưa hiển thị ghi chú |
| Ghi chú hóa đơn Bán hàng | Đã có `pos_sales.note`, POS đã lưu và tải lại |
| Ghi chú hóa đơn Mua vào | Đã có `pos_buys.note`, POS đã lưu và tải lại |
| Danh sách hóa đơn | `pos_list_documents` chưa trả về trường ghi chú |
| Thanh toán | Payment có `method` và `note`; `note` hiện được sử dụng cho nội dung hệ thống |
| Tài khoản chuyển khoản | Chưa có cấu trúc đầy đủ để phân loại tài khoản Công ty/Cá nhân theo từng lần thanh toán |
| Thông tin tài khoản khách hàng khi Mua vào | Đã có `bank_account` và `bank_account_holder`; đây là thông tin tài khoản nhận tiền của khách hàng |

**Nguyên tắc:** Không tạo lại những trường hoặc chức năng đã tồn tại. Chỉ bổ sung phần còn thiếu.

---

## 3. Functional Requirements

### FR-01 — Ghi chú khách hàng

**Mục tiêu:** Cho phép lưu và xem ghi chú riêng của từng khách hàng.

Yêu cầu:

- Sử dụng lại trường `pos_customers.note`.
- Cho phép thêm, chỉnh sửa và lưu ghi chú trong chức năng tạo/sửa khách hàng hiện tại.
- Khi mở thông tin khách hàng, phải hiển thị nội dung ghi chú.
- Bổ sung hiển thị ghi chú vào `CustomerDetailModal`.
- Ghi chú phải được tải lại chính xác sau khi đóng và mở lại màn hình.
- Không tạo thêm bảng hoặc trường dữ liệu nếu không thực sự cần thiết.

**Acceptance Criteria:**

- Tạo khách hàng có ghi chú → lưu thành công.
- Chỉnh sửa ghi chú → dữ liệu được cập nhật.
- Mở chi tiết khách hàng → hiển thị đúng ghi chú đã lưu.
- Khách hàng không có ghi chú → hiển thị trạng thái phù hợp, không gây lỗi UI.

### FR-02 — Ghi chú hóa đơn

**Mục tiêu:** Cho phép nhân viên ghi lại nội dung cần lưu ý cho từng hóa đơn.

Yêu cầu:

- Tiếp tục sử dụng trường `pos_sales.note` cho Bán hàng.
- Tiếp tục sử dụng trường `pos_buys.note` cho Mua vào.
- Giữ nguyên vị trí và cách nhập ghi chú đang có trên POS.
- Ghi chú phải được lưu và tải lại chính xác.
- Không sử dụng trường ghi chú hệ thống của payment để thay thế ghi chú hóa đơn.
- Không gộp thông tin tài khoản chuyển khoản vào nội dung ghi chú hóa đơn.

### FR-03 — Tự động xác định hóa đơn cần theo dõi

**Quy tắc đã chốt:**

Hóa đơn có nội dung ghi chú không rỗng sẽ tự động được xem là hóa đơn cần theo dõi.

Yêu cầu:

- Không thêm checkbox “Cần theo dõi”.
- Không thêm trạng thái hoặc thao tác xác nhận riêng.
- Hệ thống tự xác định dựa trên nội dung ghi chú hóa đơn.
- Ghi chú chỉ chứa khoảng trắng được xem là không có ghi chú.
- Khi ghi chú được thêm vào, hóa đơn tự động thuộc nhóm cần theo dõi.
- Khi xóa hết ghi chú, hóa đơn không còn thuộc nhóm cần theo dõi.
- Không làm thay đổi trạng thái thanh toán hoặc trạng thái hoàn thành hóa đơn.

### FR-04 — Thông tin tài khoản chuyển khoản

**Mục tiêu:** Phân biệt tài khoản Công ty và tài khoản Cá nhân trong các giao dịch chuyển khoản.

Phạm vi: Áp dụng cho cả **Bán hàng** và **Mua vào**.

#### 4.1. Loại tài khoản

Cung cấp hai lựa chọn:

- Tài khoản công ty.
- Tài khoản cá nhân.

Thông tin loại tài khoản được lưu theo từng giao dịch thanh toán chuyển khoản, không chỉ lưu ở cấp hóa đơn.

#### 4.2. Quy tắc theo nghiệp vụ

**Bán hàng:**

- Khách hàng thanh toán cho TLKV.
- Loại tài khoản thể hiện tài khoản nhận tiền của TLKV.
- Tài khoản công ty: tiền được chuyển vào tài khoản công ty.
- Tài khoản cá nhân: tiền được chuyển vào tài khoản cá nhân.
- Khi chọn tài khoản cá nhân, phải cho phép lưu thông tin nhận diện tài khoản cá nhân theo thiết kế UI được duyệt.

**Mua vào:**

- TLKV thanh toán cho khách hàng.
- Loại tài khoản thể hiện chủ sở hữu tài khoản nhận tiền của khách hàng.
- Tài khoản công ty: tài khoản nhận tiền thuộc công ty của khách hàng.
- Tài khoản cá nhân: tài khoản nhận tiền thuộc cá nhân khách hàng.
- Tái sử dụng thông tin `bank_account` và `bank_account_holder` hiện có khi phù hợp.
- Không được nhầm tài khoản nhận tiền của khách hàng với tài khoản ngân hàng của TLKV.

#### 4.3. Quy tắc lưu dữ liệu

- Thông tin tài khoản phải gắn với từng payment.
- Không ghi đè thông tin của lần thanh toán trước khi hóa đơn có nhiều lần thanh toán.
- Payment tiền mặt không có loại tài khoản.
- Không bắt buộc nhập loại tài khoản đối với payment tiền mặt.
- Không tự động gán loại tài khoản cho dữ liệu lịch sử nếu không có dữ liệu đáng tin cậy.
- Không phân tích nội dung ghi chú cũ như `CK CTY`, `CK DƯƠNG`, `TM` để tự động suy ra loại tài khoản.

**Lưu ý:** `pos_sale_payments.note` hiện chứa nội dung hệ thống như “Thanh toán lúc bán”, “Tiền đặt cọc lúc bán”. Không được tái sử dụng trường này làm nơi lưu loại tài khoản hoặc thông tin tài khoản có cấu trúc.

### FR-05 — Hiển thị thông tin trên danh sách hóa đơn

**Mục tiêu:** Giúp nhân viên xem nhanh ghi chú và thông tin thanh toán mà không cần mở từng hóa đơn.

Yêu cầu:

- Mở rộng dữ liệu trả về từ `pos_list_documents` để có thông tin ghi chú hóa đơn.
- Hiển thị ghi chú của hóa đơn Mua vào và Bán hàng.
- Hiển thị thông tin phương thức thanh toán.
- Hiển thị loại tài khoản đối với giao dịch chuyển khoản có thông tin này.
- Nếu hóa đơn có nhiều lần thanh toán, hiển thị thông tin từng lần thanh toán tương ứng.
- Không gộp hoặc ghi đè dữ liệu giữa các lần thanh toán.

Khu vực thông tin trên hóa đơn cần phân biệt rõ:

**A. Ghi chú hóa đơn**

- Nội dung ghi chú tự do.
- Có ghi chú thì tự động được xem là cần theo dõi.

**B. Thông tin thanh toán**

- Phương thức thanh toán.
- Loại tài khoản đối với chuyển khoản.
- Thông tin tài khoản liên quan nếu có.

Không gộp hai loại dữ liệu này thành một trường ghi chú duy nhất.

### FR-06 — Bộ lọc danh sách hóa đơn

**Nguyên tắc bắt buộc:** Giữ nguyên toàn bộ filter hiện có. Không xóa, thay thế hoặc thay đổi ý nghĩa các filter hiện tại.

Chỉ bổ sung đúng **2 filter mới**:

#### Filter 1 — Phương thức thanh toán

Các lựa chọn:

- Chuyển khoản.
- Tiền mặt.

Quy tắc:

- Lọc theo phương thức thanh toán thực tế của các payment thuộc hóa đơn.
- Nếu hóa đơn có nhiều lần thanh toán, chỉ cần có ít nhất một payment phù hợp thì hóa đơn được hiển thị.
- Hóa đơn có cả tiền mặt và chuyển khoản có thể xuất hiện ở cả hai kết quả lọc tương ứng.
- Không suy luận phương thức thanh toán từ ghi chú tự do.

#### Filter 2 — Loại tài khoản

Các lựa chọn:

- Tài khoản công ty.
- Tài khoản cá nhân.

Quy tắc:

- Chỉ áp dụng cho các payment chuyển khoản có dữ liệu loại tài khoản.
- Nếu hóa đơn có nhiều payment, chỉ cần một payment có loại tài khoản phù hợp thì hóa đơn được hiển thị.
- Payment tiền mặt không được tự động xếp vào tài khoản công ty hoặc cá nhân.
- Hóa đơn không có thông tin loại tài khoản đáng tin cậy không được tự động phân loại.
- Không phân tích ghi chú hóa đơn cũ để xác định loại tài khoản.

#### Quy tắc kết hợp filter

- Các filter phải hoạt động đồng thời.
- Khi chọn nhiều điều kiện, kết quả phải thỏa mãn các điều kiện lọc được chọn.
- Việc lọc không được làm thay đổi dữ liệu hóa đơn.
- Không làm thay đổi thứ tự, phân trang hoặc các hành vi hiện tại ngoài phạm vi cần thiết để hỗ trợ hai filter mới.

---

## 4. Data Requirements

### 4.1. Dữ liệu khách hàng

Tái sử dụng:

- `pos_customers.note`

Không tạo thêm trường ghi chú khách hàng nếu trường hiện tại đáp ứng yêu cầu.

### 4.2. Dữ liệu hóa đơn

Tái sử dụng:

- `pos_sales.note`
- `pos_buys.note`

Không tạo thêm cột trạng thái “Cần theo dõi”.

### 4.3. Dữ liệu thanh toán

Thông tin loại tài khoản phải được lưu riêng theo từng payment.

Nếu schema hiện tại chưa có các trường tương ứng, xem xét bổ sung các trường có cấu trúc, ví dụ:

- `receive_account_kind`: `COMPANY` / `PERSONAL` / `NULL`.
- `receive_account_note`: thông tin bổ sung của tài khoản, nếu cần.

Tên trường và cấu trúc cuối cùng phải được xác định sau khi kiểm tra schema hiện tại, tránh tạo dữ liệu trùng lặp.

Đối với Mua vào, cần kiểm tra khả năng tái sử dụng `bank_account` và `bank_account_holder` hiện có. Không tạo thêm trường trùng với dữ liệu tài khoản nhận tiền của khách hàng.

### 4.4. Dữ liệu lịch sử

- Giữ nguyên ghi chú của các hóa đơn cũ.
- Không tự động chuyển ghi chú tự do thành dữ liệu tài khoản có cấu trúc.
- Dữ liệu lịch sử thiếu loại tài khoản phải được thể hiện là chưa có thông tin phân loại.
- Không cập nhật hoặc sửa nội dung payment note cũ.

---

## 5. API, RPC & Backend Requirements

Trước khi triển khai, kiểm tra các API/RPC hiện có và cập nhật đúng luồng:

- Customer CRUD / upsert RPC.
- `pos_list_documents`.
- Luồng hoàn thành Bán hàng và tạo `payment_splits`.
- Luồng thu thêm tiền cho hóa đơn Bán hàng (`collect_sale_payment`).
- Các RPC/luồng thanh toán tương ứng của Mua vào.

Yêu cầu:

- Dữ liệu loại tài khoản phải được lưu cùng payment tương ứng.
- Không chỉ lưu ở frontend hoặc state tạm thời.
- Khi tải lại hóa đơn, backend phải trả về đầy đủ dữ liệu đã lưu.
- Các bộ lọc phải dựa trên dữ liệu có cấu trúc từ backend.
- Đảm bảo giao dịch nhiều payment không bị mất hoặc ghi đè metadata.
- Không thay đổi cách tính tiền, ghi nhận thanh toán, công nợ hoặc trạng thái hóa đơn.

Tên RPC và cách triển khai cụ thể phải dựa trên code/schema thực tế, không giả định trước khi audit.

**RPC / bảng đã audit (tham chiếu):**

| Thành phần | Ghi chú |
|---|---|
| `pos_customers.note` | Đã có |
| `pos_sales.note` / `pos_buys.note` | Đã có |
| `pos_sale_payments` | Có `note` hệ thống; **thiếu** kind/account structured |
| `pos_buy_payments` | Có `note`; bank chi tiết nằm phía khách/phiếu mua |
| `pos_list_documents` | Chưa trả `note`; chưa filter method/kind theo payment |
| `pos_private.complete_sale` + `p_payment_splits` | Hiện chỉ `method` + `amount_dong` |
| `pos_collect_sale_payment` / `collect_buy_payment` | Cần mở rộng metadata kind khi TRANSFER |

---

## 6. UI/UX Requirements

- Giữ nguyên thiết kế và bố cục hiện tại của POS.
- Tái sử dụng component hiện có khi phù hợp.
- Không thay đổi các khu vực không thuộc phạm vi.
- Hai filter mới phải có nhãn tiếng Việt rõ ràng:
  - Phương thức thanh toán.
  - Loại tài khoản.
- Không thêm filter trùng lặp với filter hiện có.
- Thông tin ghi chú và thông tin thanh toán phải được phân biệt trực quan.
- Với hóa đơn có nhiều payment, phải thể hiện được thông tin từng payment.
- Không làm giao diện danh sách hóa đơn bị quá tải hoặc ảnh hưởng khả năng sử dụng hiện tại.

---

## 7. Business Rules & Constraints

1. Giữ nguyên toàn bộ chức năng đang hoạt động.
2. Giữ nguyên tất cả filter hiện tại.
3. Chỉ thêm hai filter mới đã xác định tại FR-06.
4. Ghi chú hóa đơn không rỗng tự động được xem là cần theo dõi.
5. Không tạo checkbox hoặc trạng thái theo dõi riêng.
6. Ghi chú khách hàng, ghi chú hóa đơn và thông tin tài khoản thanh toán là ba loại dữ liệu độc lập.
7. Thông tin loại tài khoản phải gắn với từng payment.
8. Mua vào và Bán hàng phải phân biệt đúng tài khoản nhận tiền theo chiều giao dịch.
9. Không tự động suy luận dữ liệu có cấu trúc từ ghi chú lịch sử.
10. Không thay đổi logic thanh toán, công nợ, tồn kho, giá bán, giá mua hoặc trạng thái hóa đơn.
11. Không làm ảnh hưởng đến dữ liệu Production hiện tại.
12. Không thực hiện refactor ngoài phạm vi yêu cầu.

---

## 8. Out of Scope

Không thuộc phạm vi triển khai:

- CRM hoặc quản lý lịch sử chăm sóc khách hàng.
- Nhắc việc hoặc gửi thông báo tự động.
- Tạo trạng thái theo dõi hóa đơn riêng.
- Thay đổi công thức tính tiền.
- Thay đổi logic thanh toán một phần hoặc thanh toán đủ.
- Thay đổi logic công nợ phải thu/phải trả.
- Thay đổi nghiệp vụ nhập/xuất kho.
- Thay đổi mẫu in hóa đơn ngoài yêu cầu đã nêu.
- Tự động phân tích ghi chú cũ để chuyển thành dữ liệu tài khoản.
- Thay đổi cấu trúc dữ liệu không liên quan.

---

## 9. Acceptance Criteria

| ID | Tiêu chí nghiệm thu |
|---|---|
| AC-01 | Ghi chú khách hàng được tạo, sửa, lưu và hiển thị chính xác |
| AC-02 | CustomerDetailModal hiển thị ghi chú khách hàng |
| AC-03 | Ghi chú Mua vào và Bán hàng được lưu và tải lại chính xác |
| AC-04 | Hóa đơn có ghi chú tự động được xem là cần theo dõi |
| AC-05 | Không tồn tại checkbox hoặc trạng thái theo dõi riêng |
| AC-06 | Có thể lưu loại tài khoản Công ty/Cá nhân cho payment chuyển khoản |
| AC-07 | Mua vào và Bán hàng lưu đúng thông tin tài khoản theo chiều giao dịch |
| AC-08 | Nhiều payment trên cùng hóa đơn không bị ghi đè thông tin |
| AC-09 | Danh sách hóa đơn hiển thị ghi chú và thông tin thanh toán |
| AC-10 | Filter Phương thức thanh toán lọc đúng Chuyển khoản/Tiền mặt |
| AC-11 | Filter Loại tài khoản lọc đúng Công ty/Cá nhân |
| AC-12 | Hai filter mới hoạt động đồng thời với các filter hiện tại |
| AC-13 | Dữ liệu lịch sử không bị tự động phân loại sai |
| AC-14 | Không ảnh hưởng logic thanh toán, công nợ và trạng thái hóa đơn |
| AC-15 | Không làm mất dữ liệu hoặc thay đổi chức năng hiện có |

---

## 10. Implementation Constraints

Trước khi triển khai:

1. Audit lại schema, RPC, API và UI thực tế.
2. Xác định chính xác luồng thanh toán của Mua vào và Bán hàng.
3. Xác định dữ liệu tài khoản hiện có có thể tái sử dụng.
4. Chỉ bổ sung migration khi schema thực sự thiếu.
5. Xác định các RPC cần cập nhật để bảo đảm dữ liệu được lưu xuyên suốt.
6. Không tạo bảng mới nếu các trường bổ sung trên payment hiện tại đã đáp ứng được yêu cầu.
7. Chia nhỏ triển khai theo từng nhóm chức năng, tránh sửa nhiều khu vực không liên quan.
8. Báo cáo rõ file, API, RPC và schema đã thay đổi.

### Đề xuất phase khi code (không thuộc commit docs này)

1. **Phase A — Customer note UI:** FR-01 (`CustomerDetailModal`).
2. **Phase B — Invoice note surface:** FR-02/FR-03/FR-05 phần note + derived “cần theo dõi” trên list (`pos_list_documents` + UI).
3. **Phase C — Transfer account:** FR-04 migration + sale/buy payment RPCs + POS UI.
4. **Phase D — Filters:** FR-06 hai filter mới + kết hợp với filter hiện có; hard-test AC-10…AC-15.

**Yêu cầu cuối cùng:** Hoàn thiện các chức năng trong phạm vi SRS này, bảo toàn toàn bộ nghiệp vụ đang chạy và dữ liệu hiện tại của TLKV POS.
