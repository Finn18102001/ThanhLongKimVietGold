# P10 — NGHIỆP VỤ AS-IS, CÂU HỎI VÀ QUYẾT ĐỊNH TRIỂN KHAI

> Ngày cập nhật: 2026-11-19  
> Tài liệu liên quan: [`P10-00-FUND-ACCOUNTS-SRS.md`](./P10-00-FUND-ACCOUNTS-SRS.md)  
> Phạm vi: Quỹ tiền nhân viên, Quỹ vàng nhân viên, liên kết hóa đơn, chuyển giữa các tài khoản và Feature Flag.  
> Trạng thái: **Đã chốt** nghiệp vụ AS-IS và các quyết định triển khai.  
> Mẫu phiếu: `assets/...Vietnamese_Payment_Request...jpg` (PHIẾU YÊU CẦU THU/CHI) — mô tả in tại **Phần G**.

---

# PHẦN A — NGHIỆP VỤ HỆ THỐNG ĐANG SỬ DỤNG (AS-IS)

## A1. Phân quyền và nghiệp vụ hiện tại

| Vai trò | Phạm vi sử dụng | Nghiệp vụ hiện tại |
|---|---|---|
| STAFF | POS, Mua hàng, Kho, Hóa đơn, Khách hàng, In tem | Lập hóa đơn bán/mua, ghi nhận thanh toán ngay trên màn hình nghiệp vụ, nhận hàng, in tem và xử lý hóa đơn theo quyền được cấp. |
| ADMIN | Toàn bộ module được cấp quyền | Quản lý hệ thống, xem báo cáo, quản lý sổ quỹ cửa hàng, thực hiện các nghiệp vụ nạp/rút/chuyển quỹ cửa hàng hiện tại. |
| ADMIN_VIEWER | Các màn hình Admin được cấp quyền xem | Xem dữ liệu, không thực hiện thao tác ghi quỹ. |

**Đặc điểm AS-IS:** Nhân viên bán hàng hiện vừa lập hóa đơn vừa ghi nhận thu/chi tiền ngay trên màn hình POS hoặc Mua hàng. Không có bước gửi yêu cầu để một nhân viên chuyên trách quỹ xác nhận.

## A2. Tiền đang được quản lý như thế nào?

Hiện tại hệ thống có 2 tài khoản tiền cửa hàng:

| Mã tài khoản | Tên | Nghiệp vụ |
|---|---|---|
| `CASH-001` | Tiền mặt | Ghi nhận tiền mặt thu từ khách hoặc chi trả cho khách. |
| `BANK-001` | Ngân hàng công ty | Ghi nhận giao dịch chuyển khoản hoặc thẻ. |

### Luồng bán hàng hiện tại

1. Nhân viên lập hóa đơn trên `/pos`.
2. Chọn trạng thái thanh toán: Đủ, Đặt cọc, Chờ thanh toán hoặc thanh toán một phần.
3. Hệ thống hoàn tất hóa đơn.
4. Nếu có khoản thu, hệ thống ghi nhận payment.
5. Tiền được cộng ngay vào `CASH-001` hoặc `BANK-001` theo phương thức thanh toán.
6. Sổ quỹ ghi nhận biến động và số dư trước/sau.

### Luồng mua hàng từ khách hiện tại

1. Nhân viên lập phiếu mua.
2. Hoàn tất nghiệp vụ mua và nhận hàng theo quy trình hiện tại.
3. Nếu có khoản tiền trả khách, hệ thống ghi nhận payment.
4. Tiền được trừ ngay khỏi `CASH-001` hoặc `BANK-001`.
5. Sổ quỹ ghi nhận biến động.

### Thu thêm hoặc trả thêm sau khi lập hóa đơn

- Thu thêm tiền khách: cộng vào tài khoản tiền cửa hàng tương ứng ngay khi xác nhận.
- Trả thêm tiền cho khách: trừ khỏi tài khoản tiền cửa hàng tương ứng ngay khi xác nhận.
- Không có trạng thái chờ nhân viên quỹ xác nhận.

### Nạp, rút và chuyển tiền cửa hàng hiện tại

Các thao tác này được quản lý tại `/cashflow` bởi Admin.

| Thao tác | Hành vi hiện tại |
|---|---|
| Nạp tiền | Cộng tiền trực tiếp vào tài khoản cửa hàng. |
| Rút tiền | Trừ tiền trực tiếp khỏi tài khoản cửa hàng. |
| Chuyển CASH ↔ BANK | Trừ tài khoản gửi và cộng tài khoản nhận trong cùng giao dịch. |

Chuyển tiền CASH ↔ BANK hiện hoàn tất ngay, không có bước in chứng từ A4 và không chờ bên nhận xác nhận trên hệ thống.

## A3. Vàng và tồn kho đang được quản lý như thế nào?

| Khái niệm | Nghiệp vụ hiện tại |
|---|---|
| Tồn kho bán | Mỗi SKU có số lượng tồn chung cho toàn cửa hàng. |
| Sổ nhập/xuất | Ghi nhận lịch sử giao dịch, số lượng trước/sau và người thực hiện để phục vụ truy vết. |
| Quản lý vàng `/gold-management` | Theo dõi nghĩa vụ còn phải giao vàng cho khách và nghĩa vụ còn phải nhận hàng từ nhà cung cấp. |

**Lưu ý:** `/gold-management` là màn quản lý nghĩa vụ giao/nhận vàng, không phải tài khoản vàng nhân viên và không phải nơi theo dõi số vàng nhân viên đang giữ.

### Bán hàng hiện tại

- Bán ngay: tồn kho SKU được trừ khi hoàn tất hóa đơn theo quy trình hiện tại.
- Đặt cọc/đặt trước: có thể thu tiền trước; việc giao vàng và trừ kho thực hiện theo thời điểm fulfill hiện tại.
- Không có số dư vàng riêng theo từng nhân viên.

## A4. Trạng thái thanh toán và hủy hóa đơn

| Trạng thái | Ý nghĩa |
|---|---|
| Đủ | Khách đã thanh toán đủ theo nghiệp vụ hóa đơn. |
| Đặt cọc | Khách thanh toán một phần, phần còn lại xử lý theo quy trình giao hàng và thanh toán sau. |
| Chờ thanh toán | Hóa đơn còn khoản phải thu hoặc phải thanh toán. |
| Thanh toán một phần | Đã phát sinh một phần thanh toán, vẫn còn số dư cần xử lý. |
| Hủy hóa đơn | Ghi nhận giao dịch đảo, hoàn kho nếu hàng đã xuất và hoàn tiền theo các khoản thanh toán đã phát sinh. Không xóa lịch sử gốc. |

P10 không thay đổi công thức giá, cách tính tổng hóa đơn, trạng thái thanh toán hoặc quy trình đặt cọc hiện tại. P10 thay đổi cách phân công và nơi ghi nhận số dư khi Feature Flag được bật.

## A5. So sánh AS-IS và nghiệp vụ mới

| Nội dung | AS-IS | Khi bật Feature Flag |
|---|---|---|
| Thu tiền bán hàng | Nhân viên bán xác nhận ngay trên hóa đơn | Nhân viên bán gửi yêu cầu; nhân viên Quỹ tiền xác nhận |
| Trả tiền mua hàng | Nhân viên mua xác nhận ngay trên phiếu | Tạo yêu cầu chi; nhân viên Quỹ tiền xác nhận |
| Tài khoản tiền | CASH-001 / BANK-001 | Quỹ tiền theo từng nhân viên |
| Quản lý vàng | Tồn kho chung cửa hàng | Có tài khoản Quỹ vàng riêng theo nhân viên |
| Giao dịch bán | Nhân viên bán vừa xử lý vàng vừa ghi nhận tiền | Tách nghiệp vụ vàng và tiền |
| Chuyển tiền nội bộ | Admin chuyển CASH ↔ BANK ngay | Chuyển giữa hai Quỹ tiền, có chứng từ và xác nhận của bên nhận |
| Chuyển vàng nội bộ | Chưa có tài khoản vàng nhân viên | Có chức năng chuyển vàng giữa các Quỹ vàng |
| Tắt tính năng mới | Không áp dụng | Quay lại đúng luồng AS-IS |

---

# PHẦN B — CÂU HỎI VÀ QUYẾT ĐỊNH ĐÃ CHỐT

## Câu 1 — Tiền bán/mua khi bật Quỹ nhân viên được ghi vào tài khoản nào?

**AS-IS:** Tiền bán/mua được ghi trực tiếp vào `CASH-001` hoặc `BANK-001`.

**Quyết định: Chọn A**

Khi Feature Flag bật:

- Khoản thu bán hàng chỉ được ghi vào Quỹ tiền của nhân viên xác nhận thu.
- Khoản chi mua hàng chỉ được ghi vào Quỹ tiền của nhân viên xác nhận chi.
- Không cộng/trừ đồng thời vào `CASH-001` hoặc `BANK-001`.
- Mỗi giao dịch phải lưu phương thức thanh toán để truy vết.
- Admin theo dõi hoạt động của các Quỹ tiền nhân viên trên module quản lý quỹ mới.

Ví dụ: Hóa đơn bán hàng thu 10.000.000 đồng tiền mặt, Quỹ tiền của Bình xác nhận thì Quỹ Bình tăng 10.000.000 đồng. Không ghi thêm 10.000.000 đồng vào `CASH-001`.

## Câu 2 — Có tạo database riêng cho Quỹ nhân viên không?

**Quyết định: Chọn A — Tạo nhóm bảng mới.**

Tạo schema/bảng riêng phục vụ:

- Tài khoản Quỹ tiền nhân viên.
- Tài khoản Quỹ vàng nhân viên.
- Số dư và lịch sử biến động.
- Yêu cầu thu/chi liên kết với hóa đơn.
- Giao dịch chuyển giữa các tài khoản.
- Chứng từ chuyển tiền.
- Liên kết giao dịch quỹ với hóa đơn mua/bán.

Không sửa cấu trúc cũ theo hướng làm ảnh hưởng trực tiếp đến luồng CASH-001/BANK-001.

Khi Feature Flag tắt, hệ thống tiếp tục sử dụng luồng cũ. Các trigger và nghiệp vụ cũ không bị thay đổi ngoài phạm vi cần thiết để tích hợp Feature Flag.

## Câu 3 — Quỹ vàng nhân viên quản lý tồn kho theo mô hình nào?

**Quyết định: Chọn A — Sổ cầm giữ (custody) trên tồn kho cửa hàng.**

- Tồn kho SKU chung của cửa hàng vẫn được giữ nguyên.
- Mỗi nhân viên có tài khoản Quỹ vàng riêng, theo dõi số lượng vàng được phân bổ và đang nắm giữ.
- Khi nhân viên bán hàng, hệ thống ghi nhận giảm tồn kho chung và giảm số lượng tương ứng trong Quỹ vàng của nhân viên thực hiện giao dịch.
- Không được bán vượt số lượng vàng đang có trong Quỹ vàng của nhân viên.
- Không tách toàn bộ bảng tồn kho vật lý thành từng kho nhân viên.
- Không thay đổi ý nghĩa của `/gold-management`.

Ví dụ:

- Tồn kho cửa hàng: 50 chiếc SKU X.
- Quỹ vàng An: 10 chiếc SKU X.
- An bán 1 chiếc: tồn kho cửa hàng còn 49, Quỹ vàng An còn 9.

## Câu 4 — Ai xác nhận tiền? Thời điểm trả vàng?

> **Chốt lại 2026-11-21** — đè bản «Chọn C» cũ. Chi tiết flow: [`P10-03-TWO-STEP-CONFIRM-FLOW.md`](./P10-03-TWO-STEP-CONFIRM-FLOW.md).

**Quyết định (mới):**

- **Chỉ Admin và tài khoản Quỹ tiền** được xác nhận nhận/chi tiền của hóa đơn (kể cả đặt cọc hoặc thanh toán một phần).
- **Tài khoản Quỹ vàng không có quyền** xác nhận thu/chi tiền.
- Số dư Quỹ tiền chỉ cập nhật khi QT/Admin xác nhận YC.
- **Trừ kho / trừ custody Quỹ vàng / «trả vàng»** chỉ sau khi QT/Admin đã xác nhận khoản tiền tương ứng — Quỹ vàng bấm «Xác nhận hóa đơn / trả vàng» (nút enable lúc đó).
- Điều kiện hóa đơn **hoàn thành** (cọc / một phần / đủ) **không đổi** — giữ logic POS hiện tại; P10 không đặt rule hoàn thành mới.

## Câu 5 — F9 / lưu đơn khi bật Feature Flag nghĩa là gì?

> **Chốt lại 2026-11-21** — đè bản «Chọn A» cũ (F9 trừ kho ngay). Xem [`P10-03`](./P10-03-TWO-STEP-CONFIRM-FLOW.md).

**Quyết định (mới) — 2 bước xác nhận:**

1. **Quỹ vàng** tạo HĐ (form hiện tại) → tạo chứng từ A4 đủ thông tin HĐ → **in chứng từ ban đầu** → **lưu đơn** (được làm giao dịch khác; không giữ màn chờ).
2. Hệ thống tạo YC thu/chi → **Quỹ tiền** nhận card → QT/Admin **Xác nhận** tiền (+ ký giấy).
3. Chỉ sau bước 2, nút xác nhận phía **Quỹ vàng** mới enable → QV chọn đơn đã lưu → **Xác nhận trả vàng** (= xác nhận hóa đơn phía QV) → **in chứng từ thanh toán cuối**.
4. Hoàn thành HĐ theo logic POS hiện tại (đủ / cọc / một phần **không đổi** trong P10).

F9/lưu đơn **không** tự cộng/trừ Quỹ tiền và **không** trừ kho/custody cho đến bước xác nhận trả vàng của QV.

Không gộp xác nhận tiền và xác nhận trả vàng thành một thao tác.

## Câu 6 — Một nhân viên được gắn bao nhiêu tài khoản quỹ?

**Quyết định: Chọn A.**

- Mỗi nhân viên tối đa một Quỹ tiền.
- Mỗi nhân viên tối đa một Quỹ vàng.
- Một nhân viên có thể được gắn đồng thời cả Quỹ tiền và Quỹ vàng.
- Cho phép kiêm nhiệm khi cần.
- Không tạo nhiều tài khoản cùng loại cho một nhân viên trong phạm vi P10.

## Câu 7 — Feature Flag lưu ở đâu và ai được quyền bật/tắt?

**Quyết định: Chọn C.**

- Feature Flag được lưu trong database.
- Admin được quyền bật/tắt trên giao diện quản trị.
- ENV có thể ép tắt tính năng trong trường hợp cần khẩn cấp.
- Backend phải kiểm tra Feature Flag trước khi xử lý nghiệp vụ.
- Frontend chỉ hiển thị giao diện tương ứng với trạng thái tính năng.
- Khi Flag tắt, toàn bộ luồng bán/mua và ghi nhận tiền quay lại đúng cách hoạt động AS-IS.
- Không xóa dữ liệu Quỹ nhân viên đã phát sinh khi tắt Flag.

Tên đề xuất: `pos_employee_fund_enabled`.

## Câu 8 — Chứng từ chuyển tiền giữa hai Quỹ tiền

**Quyết định: Chọn A — In A4 bằng trình duyệt.**

Luồng chuyển tiền:

1. Nhân viên Quỹ tiền A tạo yêu cầu chuyển tiền cho Quỹ tiền B.
2. Hệ thống tạo chứng từ chuyển tiền.
3. Nhân viên A in chứng từ A4.
4. Nhân viên B nhận và ký xác nhận trên chứng từ.
5. Nhân viên B đăng nhập hệ thống và bấm **Đã xác nhận**.
6. Hệ thống trừ tiền ở Quỹ A và cộng tiền vào Quỹ B.
7. Lịch sử biến động của cả hai tài khoản được liên kết với cùng giao dịch chuyển tiền.

**Nguyên tắc bắt buộc:**

- Trước khi B xác nhận, số dư hai tài khoản không thay đổi.
- Chỉ được xác nhận một lần.
- Không cho phép xác nhận trùng.
- Lịch sử bên gửi và bên nhận phải liên kết cùng một chứng từ.

Mã chứng từ sử dụng sequence riêng theo định dạng `CTCT-000001`.

Admin tạo hoặc gán tài khoản quỹ không cần chứng từ A4 chuyển tiền giữa nhân viên.

## Câu 9 — P10 có bao gồm nhập kho và sửa giá bán không?

**Quyết định: Chọn A — Không thuộc phạm vi P10.**

- Giữ nguyên nghiệp vụ nhập kho đã triển khai trong P8/P9.
- Giữ nguyên công thức giá nhập và giá bán đã thống nhất.
- Không triển khai chỉnh sửa giá bán thủ công ngoài CRUD sản phẩm trong P10.
- P9 §5 tiếp tục được hoãn.
- Không sửa các module nhập kho, in tem hoặc quản lý sản phẩm ngoài phần tích hợp thực sự cần thiết cho Quỹ nhân viên.

## Câu 10 — Hủy hóa đơn khi đã phát sinh nhiều lần thu tiền từ nhiều Quỹ tiền

**Quyết định: Chọn A — Hoàn đúng từng lần và đúng tài khoản gốc.**

Ví dụ:

- Lần 1: Quỹ Bình xác nhận thu 3.000.000 đồng.
- Lần 2: Quỹ An xác nhận thu 7.000.000 đồng.
- Sau đó hóa đơn bị hủy.

Hệ thống phải:

- Ghi giao dịch đảo 3.000.000 đồng vào đúng Quỹ Bình.
- Ghi giao dịch đảo 7.000.000 đồng vào đúng Quỹ An.
- Giữ nguyên lịch sử thu tiền gốc.
- Tạo lịch sử hoàn tiền liên kết với giao dịch gốc.
- Không hoàn trùng.
- Hoàn kho và Quỹ vàng theo đúng nghiệp vụ hủy hóa đơn hiện tại.

Không hoàn toàn bộ tiền vào một tài khoản mặc định hoặc tài khoản của người đang đăng nhập.

---

# PHẦN C — NGUYÊN TẮC QUYỀN VÀ NGHIỆP VỤ CỦA TÀI KHOẢN QUỸ

## C1. Nguyên tắc chung

Tài khoản Quỹ tiền và Quỹ vàng là tài khoản theo dõi số dư và lịch sử nghiệp vụ của nhân viên. Không phải tài khoản cho phép nhân viên tự do điều chỉnh số dư.

**Nhân viên (kể cả nhân viên quỹ) không được tự ý cộng/trừ số dư.**

Số dư chỉ thay đổi qua:

1. Mua/bán với khách hàng (sau xác nhận Quỹ tiền khi Flag bật).
2. Chuyển tiền/vàng giữa tài khoản A và B có chứng từ và lịch sử hai phía.
3. **Admin** cộng/trừ tiền hoặc vàng qua chức năng quản lý quỹ (Q3) — bắt buộc lịch sử đối ứng ở cả tài khoản Admin và tài khoản nhân viên.

Không cho phép nhân viên:

- Nạp/rút tiền hoặc vàng tự do.
- Điều chỉnh tăng/giảm số dư tự ý.
- Tự nhập số dư mới để ghi đè số dư hiện tại.

## C2. Quỹ tiền

Quỹ tiền chỉ phát sinh tăng/giảm số dư thông qua:

1. Xác nhận thu tiền từ hóa đơn bán hàng.
2. Xác nhận chi tiền cho hóa đơn mua hàng.
3. Giao dịch chuyển tiền giữa hai Quỹ tiền theo quy trình chuyển tiền được quy định.
4. Admin cộng/trừ tiền theo Q3 (lịch sử đối ứng Admin ↔ nhân viên).

Nhân viên không có chức năng nạp/rút hoặc điều chỉnh tăng/giảm tiền tùy ý. Chỉ Admin được cộng/trừ theo Q3.

### Các tab và chức năng Quỹ tiền

Quỹ tiền phục vụ các nghiệp vụ:

- Xem số dư tài khoản.
- Xem lịch sử biến động theo ngày.
- Nhận danh sách yêu cầu thu/chi từ hóa đơn.
- Xác nhận khoản thu/chi.
- Chuyển tiền cho tài khoản Quỹ tiền khác.
- Xem và in chứng từ chuyển tiền.
- Theo dõi trạng thái xác nhận chuyển tiền.

## C3. Quỹ vàng

Quỹ vàng chỉ có đúng 4 tab:

1. **Tồn kho**
2. **Kiểm kê**
3. **Lịch sử biến động**
4. **Chuyển vàng**

### 1. Tồn kho

- Hiển thị số lượng vàng đang được ghi nhận trong tài khoản Quỹ vàng của nhân viên.
- Theo dõi theo sản phẩm/SKU và thông tin cần thiết để xác định số vàng đang nắm giữ.
- Số lượng giảm khi phát sinh nghiệp vụ bán hàng hợp lệ.
- Không có thao tác nhập/xuất hoặc điều chỉnh số dư thủ công.

### 2. Kiểm kê

- Hiển thị dữ liệu phục vụ kiểm kê số vàng trong tài khoản.
- Ghi nhận kết quả kiểm kê và lịch sử kiểm kê.
- Kiểm kê không phải chức năng điều chỉnh tăng/giảm số dư.
- Không tự động thay đổi số dư Quỹ vàng chỉ bằng việc nhập số lượng kiểm kê.

### 3. Lịch sử biến động

- Hiển thị lịch sử tăng/giảm vàng phát sinh từ các nghiệp vụ hợp lệ.
- Có thông tin giao dịch liên quan, số lượng biến động, thời gian và tài khoản.
- Có thể truy ngược về hóa đơn hoặc chứng từ chuyển vàng tương ứng.

### 4. Chuyển vàng

- Cho phép chuyển vàng từ tài khoản Quỹ vàng này sang tài khoản Quỹ vàng khác.
- Ghi nhận tài khoản gửi, tài khoản nhận, sản phẩm/SKU và số lượng.
- Sau khi chuyển, hệ thống cập nhật số dư hai tài khoản.
- Tạo chứng từ/lịch sử chuyển vàng để truy vết giao dịch.
- Lịch sử của tài khoản gửi và tài khoản nhận phải liên kết cùng giao dịch chuyển.

Không thêm các tab hoặc nghiệp vụ của màn quản lý kho hiện tại như Đặt hàng cho kho, Nhập hàng, Xuất hàng, Trả hàng, Điều chỉnh kho vào Quỹ vàng.

## C4. Phân biệt chuyển tài khoản và điều chỉnh số dư

Chuyển tiền hoặc chuyển vàng là nghiệp vụ chuyển giữa hai tài khoản có nguồn gửi, nguồn nhận và lịch sử giao dịch rõ ràng.

Admin cộng/trừ (Q3) cũng bắt buộc lịch sử đối ứng hai phía (Admin ↔ nhân viên), không tạo một dòng cộng/trừ độc lập.

Nhân viên không được cộng/trừ số dư tùy ý.

---

# PHẦN D — QUYẾT ĐỊNH TRIỂN KHAI VÀ PHẠM VI KỸ THUẬT

## D1. Feature Flag và tương thích nghiệp vụ cũ

- Tạo Feature Flag trong database.
- Admin có quyền bật/tắt trên giao diện quản trị.
- ENV hỗ trợ ép tắt khẩn cấp.
- Backend là nơi quyết định luồng nghiệp vụ theo trạng thái Flag.
- Khi Flag tắt, sử dụng đúng luồng AS-IS hiện tại.
- Khi Flag bật, sử dụng Quỹ tiền và Quỹ vàng nhân viên.
- Không ghi nhận cùng một khoản tiền đồng thời vào Quỹ nhân viên và CASH-001/BANK-001.
- Không xóa hoặc làm mất dữ liệu lịch sử cũ.

## D2. Nhóm dữ liệu cần triển khai

Thiết kế bảng/RPC riêng cho các nhóm nghiệp vụ:

1. Tài khoản Quỹ tiền nhân viên.
2. Tài khoản Quỹ vàng nhân viên.
3. Sổ biến động Quỹ tiền.
4. Sổ biến động Quỹ vàng.
5. Yêu cầu thu/chi từ hóa đơn.
6. Giao dịch chuyển tiền.
7. Giao dịch chuyển vàng.
8. Chứng từ chuyển tiền và liên kết lịch sử.
9. Liên kết hóa đơn với các giao dịch quỹ.
10. Cấu hình Feature Flag.

Không sửa hoặc thay thế các bảng nghiệp vụ cũ nếu không thực sự cần thiết cho tích hợp.

## D3. Luồng bán hàng khi bật Flag

> Cập nhật 2026-11-21 theo [`P10-03`](./P10-03-TWO-STEP-CONFIRM-FLOW.md).

1. Nhân viên **Quỹ vàng** lập hóa đơn trên POS (form hiện tại).
2. Tạo chứng từ A4 đủ thông tin HĐ → in chứng từ ban đầu → **lưu đơn** (được làm việc khác).
3. Hệ thống tạo yêu cầu thu (YC-THU) — **chưa** trừ kho / custody QV; **chưa** cộng QT.
4. Card YC xuất hiện phía **Quỹ tiền** (và Admin).
5. **Chỉ QT hoặc Admin** xác nhận khoản thu → cập nhật số dư QT + lịch sử.
6. Nút «Xác nhận hóa đơn / trả vàng» phía QV **enable**.
7. Quỹ vàng chọn đơn đã lưu → xác nhận trả vàng → trừ kho/custody theo nghiệp vụ hiện tại → in chứng từ thanh toán cuối.
8. Trạng thái hoàn thành HĐ (đủ / cọc / một phần) = logic POS hiện tại.

Mỗi lần thanh toán thêm = YC riêng; chỉ QT/Admin confirm tiền; QV không có quyền xác nhận tiền.

## D4. Luồng mua hàng khi bật Flag

1. Nhân viên lập phiếu mua hàng.
2. Hoàn tất phiếu theo quy trình hiện tại.
3. Hệ thống xử lý nhận hàng/tồn kho theo nghiệp vụ mua hàng hiện tại.
4. Tạo yêu cầu chi tiền tương ứng.
5. Yêu cầu xuất hiện trong danh sách chờ của Quỹ tiền.
6. Nhân viên Quỹ tiền kiểm tra và xác nhận khoản chi.
7. Hệ thống trừ số tiền khỏi Quỹ tiền và ghi lịch sử.
8. Phiếu mua lưu liên kết đến giao dịch Quỹ tiền.

Không thay đổi công thức giá nhập, giá bán hoặc các nghiệp vụ nhập kho thuộc P8/P9.

## D5. Chuyển tiền giữa các Quỹ tiền

- Nhân viên A tạo giao dịch chuyển tiền cho nhân viên B.
- Hệ thống tạo mã và chứng từ chuyển tiền.
- Hỗ trợ in chứng từ A4 bằng trình duyệt.
- Nhân viên B ký chứng từ và xác nhận trên hệ thống.
- Chỉ khi B xác nhận mới ghi nhận giảm tiền ở A và tăng tiền ở B.
- Lưu lịch sử hai phía và liên kết cùng mã giao dịch.
- Chặn xác nhận trùng.

## D6. Chuyển vàng giữa các Quỹ vàng

- Nhân viên chọn tài khoản Quỹ vàng nhận.
- Chọn sản phẩm/SKU và số lượng cần chuyển.
- Hệ thống kiểm tra số lượng khả dụng của tài khoản gửi.
- Ghi nhận giao dịch chuyển vàng.
- Cập nhật giảm tài khoản gửi và tăng tài khoản nhận.
- Ghi lịch sử ở cả hai tài khoản.
- Tạo chứng từ `CTCV-…` sau khi giao dịch hoàn tất.
- **In A4** chứng từ chuyển vàng (cùng bố cục mẫu chứng từ chuyển tiền giữa tài khoản quỹ; cột số lượng/SKU thay cho số tiền). Xem/in lại từ danh sách CTCV.

Khác CTCT: chuyển vàng **cập nhật tồn ngay** — không chờ bên nhận bấm xác nhận trên hệ thống (không đổi rule nghiệp vụ này).

## D7. Hủy hóa đơn

Khi hủy hóa đơn **bán** (`pos_void_invoice` / `void_sale_invoice`) hoặc hủy phiếu **mua** đã hoàn tất (`pos_void_buy`):

- Giữ nguyên lịch sử giao dịch gốc (YC, ledger quỹ, payment CASH-001 nếu có).
- Tạo giao dịch đảo tương ứng — **bắt buộc** hoàn đúng tài khoản Quỹ đã xác nhận giao dịch (P10-01 Q3 / Module 6).
- **Quỹ tiền (YC):**
  - Mọi `YC-THU` / `YC-CHI` gắn `source_id` HĐ/phiếu:
    - `CONFIRMED` → `VOID_REVERSAL` đảo số dư đúng `cash_account_id` đã confirm (THU: OUT; CHI: IN) → status `REVERSED`.
    - `PENDING` → đóng `REJECTED` (không đụng số dư) với lý do hủy chứng từ.
  - Không hoàn trùng (idempotent theo `source_table`/`source_row_id` đảo YC).
  - Không đổ tiền vào tài khoản người đang đăng nhập / pool mặc định.
- **Quỹ vàng (bán đã trả vàng):** nếu đã `SALE_CUSTODY` OUT khi QV xác nhận trả vàng → đảo custody IN cùng tài khoản gốc; kho chung vẫn hoàn theo AS-IS `SALE_VOID`.
- Flag OFF / không có YC: giữ AS-IS hoàn CASH-001/BANK-001 qua `pos_sale_payments` / `pos_buy_payments`.
- Mỗi giao dịch hoàn phải liên kết được với giao dịch gốc và hóa đơn/phiếu bị hủy.

**Chốt 2026-11-22:** void mua/bán Flag ON **không** được để YC còn `CONFIRMED` / QT lệch số dư sau khi chứng từ đã VOIDED.

## D8. Phạm vi không triển khai trong P10

Không đưa các nội dung sau vào P10:

- Thay đổi công thức giá nhập hoặc giá bán.
- Chỉnh sửa giá bán thủ công ngoài CRUD sản phẩm.
- Thay đổi quy trình nhập kho P8/P9.
- Thay đổi nghiệp vụ in tem.
- Thay đổi ý nghĩa màn `/gold-management`.
- Tách vật lý tồn kho thành nhiều kho nhân viên.
- Tạo quyền nhập/xuất/điều chỉnh số dư tiền hoặc vàng thủ công.
- Thêm các chức năng kho hiện tại vào 4 tab Quỹ vàng.

---

# PHẦN E — THỨ TỰ TRIỂN KHAI

Thực hiện tuần tự theo từng module, kiểm tra hoàn tất module hiện tại rồi mới chuyển sang module tiếp theo.

| Thứ tự | Module | Nội dung |
|---|---|---|
| 1 | Feature Flag | DB flag, quyền Admin, ENV ép tắt, kiểm tra luồng cũ/mới. |
| 2 | Quỹ tiền | Tài khoản, số dư, lịch sử, yêu cầu thu/chi, xác nhận giao dịch, **phiếu YC thu/chi in A4**. |
| 3 | Quỹ vàng | Tài khoản, tồn kho custody, kiểm kê, lịch sử biến động, chuyển vàng. |
| 4 | Liên kết hóa đơn | Liên kết hóa đơn bán/mua với các giao dịch Quỹ tiền và Quỹ vàng. |
| 5 | Chuyển tiền | Chuyển giữa hai Quỹ tiền, chứng từ A4 `CTCT-…`, xác nhận bên nhận. |
| 6 | Hủy hóa đơn | Giao dịch đảo tiền/vàng đúng tài khoản gốc, chống hoàn trùng. |
| 7 | Admin quản lý quỹ | Theo dõi tài khoản, số dư, lịch sử và hoạt động của các tài khoản quỹ. |
| 8 | Kiểm tra tổng thể | Kiểm tra tương thích Flag bật/tắt và các luồng nghiệp vụ liên quan. |

### Nguyên tắc kiểm tra

- Sử dụng POS build hiện tại để triển khai và kiểm tra.
- Hoàn thành và kiểm tra từng module trước khi triển khai module tiếp theo.
- Tập trung kiểm tra các trường hợp đặc biệt ảnh hưởng đến nghiệp vụ cốt lõi.
- Không cần kiểm tra tràn lan các thao tác đơn giản không ảnh hưởng đến logic nghiệp vụ.
- Đặc biệt kiểm tra các trường hợp nhiều lần thanh toán, nhiều tài khoản cùng tham gia một hóa đơn, chuyển tiền chưa xác nhận, chuyển vàng, hủy hóa đơn và bật/tắt Feature Flag.

---

# PHẦN F — ĐIỀU KIỆN HOÀN THÀNH

P10 được xem là hoàn thành khi đáp ứng các điều kiện sau:

1. Feature Flag bật/tắt đúng và không làm hỏng luồng AS-IS.
2. Nhân viên bán hàng không thể tự xác nhận thu/chi vào Quỹ tiền.
3. Quỹ tiền chỉ cập nhật số dư sau khi nhân viên quỹ xác nhận yêu cầu thu/chi.
4. Quỹ vàng có đúng 4 tab: Tồn kho, Kiểm kê, Lịch sử biến động, Chuyển vàng.
5. Tài khoản quỹ không có quyền cộng/trừ số dư thủ công.
6. Nghiệp vụ bán hàng giảm đúng tồn kho chung và Quỹ vàng của nhân viên thực hiện.
7. Chuyển tiền có chứng từ A4, chờ bên nhận xác nhận mới cập nhật số dư.
8. Chuyển vàng cập nhật đúng hai tài khoản; có chứng từ `CTCV-…` in A4 (mẫu giống CTCT) và lịch sử hai phía.
9. Hủy hóa đơn hoàn đúng từng khoản tiền và đúng tài khoản đã phát sinh.
10. Không ghi nhận trùng tiền giữa Quỹ nhân viên và CASH-001/BANK-001 khi Flag bật.
11. Không thay đổi công thức giá, nghiệp vụ nhập kho P8/P9 và các module ngoài phạm vi.
12. Toàn bộ lịch sử giao dịch có thể truy ngược về hóa đơn hoặc giao dịch liên quan.
13. In được **PHIẾU YÊU CẦU THU/CHI** A4 theo Phần G (chờ xác nhận / đã xác nhận / từ chối).

---

# PHẦN G — PHIẾU YÊU CẦU THU/CHI (IN A4)

> Nguồn mẫu: ảnh đính kèm 2026-11-19 — layout tham chiếu THĂNG LONG KIM VIỆT.  
> Khác với chứng từ chuyển tiền `CTCT-…` (Câu 8 / D5).

## G1. Mục đích

Hiển thị và in phiếu yêu cầu để Quỹ tiền thực hiện thu hoặc chi theo nghiệp vụ giữa tài khoản Quỹ tiền và Quỹ vàng (liên kết hóa đơn bán/mua).

## G2. Phạm vi in phiếu

- Yêu cầu **thu** khi bán hàng.
- Yêu cầu **chi** khi mua hàng.
- (Chuyển tiền giữa hai Quỹ tiền dùng chứng từ `CTCT-…`, không dùng mã `YC-THU`/`YC-CHI`.)

## G3. Bố cục chung

- Kế thừa header/footer công ty đang dùng trên chứng từ nội bộ (logo, tên, địa chỉ, hotline).
- Khổ **A4**, in trình duyệt (cùng hướng Câu 8).
- Đủ thông tin yêu cầu + dòng chữ ký.

## G4. Cấu trúc nội dung (theo mẫu)

| Khối | Nội dung |
|------|----------|
| Tiêu đề | **PHIẾU YÊU CẦU THU/CHI** + ngày lập |
| Thông tin chung | Mã yêu cầu; Loại (THU TIỀN / CHI TIỀN); Trạng thái; Tài khoản thực hiện (Quỹ tiền); Tài khoản liên quan (Quỹ vàng / NV bán); Khách hàng; CCCD; Số phiếu mua/hóa đơn bán |
| Ghi chú yêu cầu | Ví dụ: đề xuất Quỹ tiền chi trả khách theo nghiệp vụ mua vàng |
| Bảng hàng | STT, Tên hàng, Hàm lượng, ĐVT, KL, Đơn giá, Thành tiền |
| Tổng hợp | Tổng đề xuất (số + chữ); Hình thức TT; Lý do |
| Chữ ký | Người yêu cầu (Quỹ vàng / bán) **để trống ký tay** — không in email/tên TK đăng nhập · Nhân viên Quỹ tiền xác nhận (ký + thời điểm) |

## G5. Quy tắc nghiệp vụ phiếu

1. **Mã yêu cầu:** `YC-THU-000001` hoặc `YC-CHI-000001` theo loại.
2. **Loại:** Thu tiền / Chi tiền.
3. **Trạng thái:** Chờ xác nhận → Đã xác nhận / Từ chối.
4. **Số dư Quỹ tiền** chỉ cập nhật khi trạng thái **Đã xác nhận** (khớp Câu 5 / D3–D4).
5. **Bắt buộc liên kết** hóa đơn bán hoặc phiếu mua tương ứng.
6. **In:** Cho phép in khi **Chờ xác nhận** hoặc **Đã xác nhận**; in lại từ danh sách yêu cầu; khổ A4.

Ví dụ mẫu trên ảnh: `YC-CHI-000001`, CHI TIỀN, Chờ xác nhận, Quỹ tiền Trần Văn Minh, Quỹ vàng Nguyễn Thị Bích Ngọc, phiếu mua `PM-000123`, tổng 39.660.000 đ tiền mặt.

---

# PHẦN H — BẢNG TÓM TẮT QUYẾT ĐỊNH

| # | Chủ đề | Chốt |
|---|--------|------|
| 1 | Tiền vào quỹ NV vs CASH/BANK | **A** — chỉ quỹ NV; không kép |
| 2 | Schema | **A** — nhóm bảng mới |
| 3 | Quỹ vàng | **A** — custody trên tồn cửa hàng |
| 4 | Ai confirm tiền / trừ vàng | **2026-11-21** — chỉ QT+Admin confirm tiền; QV trả vàng sau QT ([P10-03](./P10-03-TWO-STEP-CONFIRM-FLOW.md)) |
| 5 | F9 / lưu đơn | **2026-11-21** — lưu đơn + in A4 đầu + YC; trừ kho ở bước QV xác nhận trả vàng |
| 6 | Số quỹ / NV | **A** — tối đa 1+1; cho phép kiêm |
| 7 | Feature Flag | **C** — DB + Admin UI; ENV ép tắt; key `pos_employee_fund_enabled` |
| 8 | Chuyển tiền | **A** — print A4; mã `CTCT-…`; xác nhận 1 lần |
| 9 | Nhập kho / sửa giá bán | **A** — ngoài P10; P9§5 vẫn hoãn |
| 10 | Hủy HĐ | **A** — hoàn đúng từng lần / đúng quỹ |
| — | Cộng/trừ thủ công NV | **Cấm** (Phần C) |
| — | Admin cộng/trừ | **Cho phép** (Q3) — lịch sử đối ứng 2 tài khoản |
| — | Tab Quỹ vàng | Đúng 4: Tồn kho, Kiểm kê, Lịch sử, Chuyển vàng |
| — | Phiếu YC thu/chi | In A4; mã `YC-THU-…` / `YC-CHI-…` (Phần G) |

---

# PHẦN I — Q1–Q8 (ĐẦU VÀO TRIỂN KHAI MODULE)

> Ngày chốt: 2026-11-19. Dùng làm đầu vào prompt triển khai; Module hiện tại chỉ làm **Module 1 — Feature Flag**.

| Câu | Lựa chọn | Quyết định |
|---|---|---|
| Q1 | A | Production mặc định Feature Flag **OFF**; deploy không tự đổi luồng AS-IS |
| Q2 | Đồng ý | ENV `TLKV_EMPLOYEE_FUND_FORCE_OFF=1` chỉ ép tắt; không có ép bật |
| Q3 | Cập nhật | Admin tạo/gán Quỹ tiền & Quỹ vàng; được cộng/trừ; lịch sử đối ứng Admin ↔ NV |
| Q4 | A + P10-03 | Flag ON: lưu đơn + YC, **không** INSERT payment CASH/BANK; QT/Admin confirm tiền; QV xác nhận trả vàng sau đó (không trừ kho lúc lưu đơn) |
| Q5 | A | Hàng đợi chung; người xác nhận nhận giao dịch vào quỹ của mình |
| Q6 | A | Từ chối YC: không đổi TT hóa đơn; cho tạo YC mới (mã riêng) |
| Q7 | A | Prompt hiện tại **chỉ Module 1** Feature Flag; chưa làm quỹ/payment |
| Q8 | A | Chỉ NV được gán đúng loại quỹ + Admin được truy cập; kiểm tra Backend |

### Module 1 — phạm vi đã triển khai

1. Bảng `pos_app_settings` + seed `pos_employee_fund_enabled = false`.
2. RPC `pos_get_app_setting_bool` / `pos_set_app_setting_bool`.
3. Helper `src/shared/lib/feature-flags.ts` + gate `isEmployeeFundEnabled()`.
4. UI `/settings` bật/tắt (Admin); ADMIN_VIEWER chỉ xem.
5. ENV `TLKV_EMPLOYEE_FUND_FORCE_OFF` (xem `.env.example`).

**Hard-test Module 1 (2026-11-19):** `/settings` mặc định TẮT; Admin bật/tắt OK; DB ghi `updated_by`; để lại **OFF** trên production. ENV force-off đã cấu hình helper + `.env.example` (chưa bật trên máy hard-test).

**Module 2a (2026-11-19) — Quỹ tiền nền tảng:** bảng `pos_employee_cash_accounts` / `pos_employee_cash_ledger`; RPC tạo TK / nạp vốn Admin / phân bổ đối ứng; UI `/fund-cash`; menu hiện khi Flag ON + quyền.

**Module 2b (2026-11-19) — CTCT:** `pos_employee_cash_transfers`; tạo PENDING → in A4 → xác nhận mới post ledger 2 phía; hủy PENDING; idempotent confirm. Hard-test `CTCT-000001` (QT-000001→QT-000002, 500.000). **Chưa:** hàng đợi YC thu/chi, đổi POS/payment, Quỹ vàng.

**Module 3 (2026-11-19) — Quỹ vàng:** bảng `pos_employee_gold_accounts` / `_stock` / `_ledger` / `_transfers` / `_counts`; RPC tạo TK / nạp vốn Admin / phân bổ đối ứng / chuyển CTCV (immediate) / kiểm kê record-only; UI `/fund-gold` đúng 4 tab; menu theo Flag + gán Quỹ vàng. Custody tracking — không mutate `pos_inventory_stock` trong Module 3.

**Hard-test Module 3 (2026-11-19):** `QV-000001` (Dung), `QV-000002` (NV TLKV); nạp Admin 5 × `bac-brtl1-1`; phân bổ 3 → QV-000002 (Admin còn 2); `CTCV-000001` chuyển 1 QV-000002→QV-000001 (2 / 1); `KKV-000001` đếm 1 vs HT 2 (Δ −1) — tồn quỹ không đổi; tồn cửa hàng SKU vẫn 3.

**Module 4a (2026-11-19) — YC thu/chi + link HĐ:** bảng `pos_employee_cash_requests`; RPC list/get/confirm/reject/create_from_sale|buy; UI hàng đợi `/fund-cash` + in A4 Phần G. Confirm → quỹ người xác nhận (Admin → QT-ADMIN). Reject không đổi TT HĐ (Q6). Hard-test queue: `YC-THU-000001` ← `HD003854` 2.554.000 → QT-ADMIN 8.000.000→10.554.000; CASH-001 không đổi.

**Module 4b (2026-11-19) — Hook Flag ON:** `pos_private.complete_sale` + `collect_sale_payment` khi `employee_fund_flag_on()`: không INSERT `pos_sale_payments`; tạo YC-THU (+ `fund_request_codes`); SALE soft-trừ custody vàng (`SALE_CUSTODY`, NOTICE nếu thiếu). Flag OFF = AS-IS. **Hard-test F9 E2E 2026-11-21:** `HD004138` → `YC-THU-000002` 148.700 confirm → QT-ADMIN↑; `pos_sale_payments`=0; CASH-001 không đổi. **YC-CHI buy (2026-11-22):** `pos_complete_buy_melt` + `collect_buy_payment` Flag ON → tạo YC-CHI PENDING, **không** INSERT `pos_buy_payments` (không đụng CASH-001); **nhận kho vẫn AS-IS** (P10-01 D4). UI skip-melt: `pos_create_buy_intake` (không payment) → `pos_buy_skip_melt` → `pos_complete_buy_melt` (YC). Legacy `pos_private.complete_buy` Flag ON cũng không CASH + tạo YC-CHI (one-shot COMPLETED).

**Module 6 (2026-11-22) — Hủy HĐ đảo quỹ:** `void_sale_invoice` / `void_buy` gọi `employee_cash_reverse_requests_for_source` (YC CONFIRMED → `REVERSED` + `VOID_REVERSAL` đúng TK; PENDING → REJECTED) và `employee_gold_reverse_sale_custody` (bán đã trả vàng). Migration `20261122060000_p10_void_reverse_employee_fund`.

> **Lệch P10-03 (2026-11-21):** Module 4b đang trừ custody / coi HĐ hoàn tất giao vàng ngay F9 — **sai** so với Câu 4/5 mới. Cần tách «lưu đơn + YC» khỏi «QV xác nhận trả vàng»; chỉ QT/Admin confirm tiền. Xem [`P10-03`](./P10-03-TWO-STEP-CONFIRM-FLOW.md).

**Rollback hard-test P10 (2026-11-19):** Đảo số dư Quỹ NV bằng `VOID_REVERSAL` (giữ sổ gốc): tiền CTCT/phân bổ/nạp vốn/`YC-THU-000001`; vàng CTCV/phân bổ/nạp vốn `bac-brtl1-1`. Số dư QT/QV về **0**. Feature Flag `pos_employee_fund_enabled` = **OFF** (AS-IS CASH-001/BANK-001). Không sửa CASH-001/BANK-001 vì hard-test Quỹ NV không trừ quỹ cửa hàng; tồn cửa hàng `bac-brtl1-1` không đổi.

**Rollback hard-test Quỹ tiền func (2026-11-21):** `VOID_REVERSAL` đảo QT-ADMIN / QT-000002 / QT-000003 về **0**; ẩn `QT-000003` + `QV-000003`; Flag OFF. CASH-001 = 32.142.301 (không đụng). HĐ test còn: `HD004138` (ISSUED) — có thể void tay khi cần; `CTCT-000002` / `YC-THU-000002` giữ sổ gốc.

---

# KẾT LUẬN

P10 triển khai mô hình tách biệt nghiệp vụ vàng và tiền theo từng nhân viên:

- Nhân viên bán hàng quản lý hóa đơn và Quỹ vàng của mình.
- Nhân viên Quỹ tiền tiếp nhận, xác nhận các yêu cầu thu/chi từ hóa đơn (có phiếu YC in A4).
- Admin quản lý tài khoản, phân quyền, theo dõi lịch sử và được cộng/trừ tiền/vàng theo Q3 (lịch sử đối ứng).
- Nhân viên không được tự ý cộng/trừ hoặc điều chỉnh số dư.
- Giao dịch chuyển giữa các tài khoản là nghiệp vụ riêng, phải có liên kết và lịch sử rõ ràng.
- Quỹ vàng chỉ có 4 tab được xác định trong tài liệu.
- Feature Flag bảo đảm hệ thống có thể chuyển đổi giữa nghiệp vụ mới và AS-IS mà không làm mất dữ liệu cũ.

P10 không phải đợt thay đổi toàn bộ POS, kho hoặc công thức giá. Phạm vi chỉ tập trung vào tài khoản quỹ nhân viên, quy trình xác nhận thu/chi, quản lý vàng theo nhân viên, chuyển giữa các tài khoản và liên kết với hóa đơn.

---

## Lịch sử file

| Ngày | Nội dung |
|------|----------|
| 2026-11-18 | Bản hỏi đáp / AS-IS lần đầu |
| 2026-11-19 | Gộp thắc mắc một file |
| 2026-11-19 | **Chốt** Câu 1–10 + Phần C–F theo bản nghiệp vụ đã duyệt; thêm Phần G phiếu YC thu/chi |
| 2026-11-19 | **Chốt** Q1–Q8; cập nhật Admin cộng/trừ (Q3); Module 1 Feature Flag |
| 2026-11-19 | Module 2a/2b Quỹ tiền + CTCT; Module 3 Quỹ vàng schema/RPC/UI `/fund-gold` |
| 2026-11-22 | CTCT + CTCV in A4 khớp mẫu chứng từ chuyển giữa tài khoản quỹ; D6 bổ sung in A4 (vẫn cập nhật tồn ngay) |
