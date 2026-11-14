# TLKV POS — Đặc tả nghiệp vụ và checklist audit chức năng in tem theo 2 phương thức mã

> **Mục tiêu:** Chuẩn hóa toàn bộ nghiệp vụ in tem sau khi khách xác nhận mã sản phẩm có sẵn có thể được dùng chung cho nhiều sản phẩm vật lý cùng loại và cùng trọng lượng. Tài liệu này thay thế cách hiểu cũ rằng mọi mã nhập tay đều phải duy nhất.
>
> **Phạm vi:** POS → chọn SKU → tạo/in tem; bao gồm UI, dữ liệu, RPC/backend, Unit–MSP U1, lịch sử in, kiểm tra dữ liệu và test cases.
>
> **Trạng thái:** Đặc tả nghiệp vụ để audit và thiết kế. Chưa phải phê duyệt triển khai SQL, migration, RPC hoặc production.

---

## 1. Kết luận nghiệp vụ đã xác nhận

Khi user chọn một SKU, hệ thống cung cấp **2 phương thức tạo nội dung mã trên tem**:

1. **Sử dụng mã sản phẩm có sẵn:** User tự nhập/đối chiếu mã loại sản phẩm và số sản phẩm. Hệ thống không mint MSP tự động, không tăng Global Sequence. Mã có sẵn có thể được dùng chung cho nhiều sản phẩm vật lý nếu chúng cùng loại và cùng trọng lượng.
2. **Tạo mã sản phẩm tự động:** Hệ thống tự tạo MSP theo Brand Prefix + Global Sequence. User không được sửa mã tự sinh.

Ví dụ khách đã xác nhận: cửa hàng có 5 sản phẩm charm cùng loại, cùng trọng lượng thì cả 5 sản phẩm đều có thể dùng chung mã `CHARM766HHH`.

**Hệ quả bắt buộc:** Không tạo unique constraint trên mã dùng chung `CHARM766HHH`; không chặn thao tác chỉ vì mã này đã xuất hiện trên tem hoặc bản ghi trước đó.

## 2. Thuật ngữ — phải phân biệt rõ

| Thuật ngữ | Ý nghĩa |
|---|---|
| SKU | Mẫu/mặt hàng trong danh mục POS. |
| Unit | Một sản phẩm vật lý cụ thể trong tồn kho U1; mỗi Unit có `unit_id` riêng. |
| MSP tự động | Mã định danh được hệ thống mint cho một Unit; theo U1, một MSP chỉ liên kết tối đa một Unit. |
| Mã sản phẩm có sẵn | Mã mô tả loại sản phẩm/đặc tính như loại charm và trọng lượng; có thể dùng chung cho nhiều Unit. |
| Mã loại sản phẩm (`type_code`) | Phần mã thể hiện loại/nhóm sản phẩm theo quy ước cửa hàng. |
| Số sản phẩm (`product_number`) | Phần thông tin số do user nhập/đối chiếu theo quy ước mã có sẵn. Cần audit định dạng thực tế và cách ghép mã. |
| Nội dung mã in | Chuỗi mã cuối cùng được in trên tem; có thể là MSP tự động hoặc mã sản phẩm có sẵn. |
| Lượt in | Một lần yêu cầu in tem; phải có lịch sử để phân biệt in mới và in lại. |

### Lưu ý kiến trúc quan trọng

Mã `CHARM766HHH` được phép dùng chung nên **không thể đồng thời được coi là MSP duy nhất của từng sản phẩm vật lý** theo U1.

Vì vậy:
- Phương thức tự động tạo MSP: tiếp tục tuân thủ quan hệ MSP ↔ Unit theo U1.
- Phương thức dùng mã có sẵn: lưu/in mã sản phẩm dùng chung như một loại mã khác; không gán chuỗi mã dùng chung vào trường MSP có unique constraint hoặc vào quan hệ MSP 1:1 với Unit.
- Không được làm mất định danh từng Unit chỉ vì nhiều Unit in cùng một mã sản phẩm có sẵn.

Nếu giao diện hiện tại gọi cả hai loại là “MSP”, cần đổi nhãn hoặc thêm mô tả để tránh hiểu nhầm nghiệp vụ. Tên hiển thị có thể do chủ sản phẩm quyết định, nhưng mô hình dữ liệu phải phân biệt hai loại mã.

---

## 3. Luồng UI tổng thể

### 3.1. Chọn SKU

Sau khi user chọn một SKU, hiển thị hai lựa chọn:

- **Sử dụng mã có sẵn**
- **Tạo mã sản phẩm tự động**

Không tự động chọn hoặc chuyển phương thức mà không thể hiện rõ cho user.

### 3.2. Phương thức A — Sử dụng mã có sẵn

Mục đích: in tem dùng mã sản phẩm đã được cửa hàng quy định; nhiều sản phẩm vật lý cùng loại và cùng trọng lượng được phép sử dụng chung một mã.

UI cần:
- Cho phép nhập/chọn `type_code`.
- Cho phép nhập `product_number`.
- Hiển thị chuỗi mã cuối cùng trước khi in.
- Cho phép user kiểm tra/đối chiếu thông tin loại sản phẩm và số sản phẩm.
- Không hiển thị mã MSP tự động như thể hệ thống vừa mint.
- Không tăng Global Sequence.
- Không tạo MSP mới trong `pos_label_pieces`.
- Cho phép dùng lại một mã đã từng được in cho các Unit khác.
- Lưu lịch sử từng lượt in và thông tin Unit/SKU liên quan nếu nghiệp vụ yêu cầu in cho hàng vật lý cụ thể.

Không được:
- Báo lỗi trùng chỉ vì mã đã tồn tại.
- Tự động đổi mã đã nhập thành mã khác.
- Tự động mint MSP thay thế.
- Gán mã dùng chung vào `pos_label_pieces.msp` nếu trường này đại diện MSP duy nhất.
- Dùng chuỗi mã dùng chung làm khóa định danh Unit.

### 3.3. Phương thức B — Tạo mã sản phẩm tự động

Mục đích: hệ thống mint MSP mới theo kiến trúc U1.

UI/backend:
- User chọn phương thức tạo mã tự động.
- Hệ thống lấy Brand Prefix hợp lệ từ cấu hình thương hiệu đã được xác nhận.
- Hệ thống cấp số từ Global Sequence hiện tại.
- Định dạng MSP mới: `{BRAND_PREFIX}-{lpad(serial, 6, '0')}`, ví dụ `TLKV-000001`.
- User không được sửa MSP tự động.
- MSP mới phải gắn với đúng một Unit hợp lệ theo U1.
- Mint phải kiểm tra và khóa Unit hợp lệ ở backend trong cùng transaction với thao tác tạo MSP.
- Không mint nếu không có Unit đủ điều kiện.
- Không tính giới hạn mint bằng `current_stock - count(MSP)`.

Không được:
- Tin `unit_id` tùy ý do client gửi lên nếu backend có thể tự xác định Unit.
- Cho phép một Unit có nhiều MSP.
- Cho phép một MSP mới liên kết nhiều Unit.
- Cấp số sequence ở client.
- Tạo MSP rồi mới tìm Unit ở một transaction khác.

---

## 4. Quy tắc kiểm tra trùng

### 4.1. Mã sản phẩm có sẵn

**Không áp dụng kiểm tra trùng theo hướng cấm dùng lại.**

Ví dụ:
- Unit A: `CHARM766HHH`
- Unit B: `CHARM766HHH`
- Unit C: `CHARM766HHH`

Cả ba đều hợp lệ nếu cửa hàng xác nhận chúng cùng loại và cùng trọng lượng.

Có thể kiểm tra:
- Trường bắt buộc có dữ liệu.
- Định dạng hợp lệ theo quy ước cửa hàng.
- SKU/loại sản phẩm/đặc tính có nhất quán với dữ liệu user nhập hay không, nếu có rule nghiệp vụ đã xác nhận.
- Ký tự thừa, khoảng trắng đầu/cuối và chuẩn hóa chuỗi để tránh lỗi nhập liệu.

Không được:
- `UNIQUE(code)` trên mã dùng chung.
- `SELECT EXISTS(code)` rồi từ chối khi đã tồn tại.
- Dùng số lần xuất hiện của mã để tự suy ra đây là in lại.

### 4.2. MSP tự động

MSP tự động vẫn phải duy nhất theo cơ chế sequence hiện tại:
- Global Sequence không được cấp trùng khi nhiều user mint đồng thời.
- Có unique constraint phù hợp cho MSP.
- Việc mint và gắn Unit phải atomic.
- Nếu transaction thất bại, không để lại Piece/Unit liên kết dở dang.

### 4.3. Phân biệt trùng mã và in lại

Hai khái niệm không được nhập làm một:

- **Mã trùng/lặp nội dung:** Nhiều tem có cùng mã sản phẩm có sẵn là hợp lệ.
- **In lại:** In thêm lần nữa cho một bản ghi/đối tượng tem đã được tạo trước đó.

Phân biệt in mới/in lại bằng định danh bản ghi tem hoặc lịch sử lượt in, không chỉ dựa vào nội dung chuỗi mã.

---

## 5. Liên kết với Unit–MSP U1

### 5.1. Phương thức tự động

- Một Unit vật lý được tạo khi nhập kho theo U1.
- Khi mint MSP, backend chọn/lock một Unit `IN_STOCK`, chưa có MSP và đúng SKU.
- Tạo MSP và gắn `unit_id` trong cùng transaction.
- Unique partial index trên `pos_label_pieces.unit_id` (nếu đã được duyệt trong schema) phải bảo đảm một Unit tối đa một MSP.
- Unit đã `SOLD`, `VOIDED_RECEIPT` hoặc trạng thái không hợp lệ không được mint.

### 5.2. Phương thức dùng mã có sẵn

- Mã có sẵn là mã dùng chung, không phải định danh duy nhất của Unit.
- Nhiều Unit có thể được in cùng một mã.
- Nếu cần truy vết tem theo từng sản phẩm vật lý, phải lưu `unit_id` trên **bản ghi lượt in/label job** hoặc một cấu trúc phù hợp cho phép nhiều lượt in cùng product code; không tạo quan hệ 1:1 giả giữa mã dùng chung và Unit.
- Không ghi mã dùng chung vào trường MSP duy nhất.
- Không tạo Unit mới chỉ vì user in tem.
- Không tự động gắn mã có sẵn với một Unit bất kỳ nếu user chưa chọn/luồng nghiệp vụ chưa xác định được Unit.

### 5.3. Cần audit trước khi chọn cấu trúc lưu trữ

Kiểm tra schema hiện tại:
- `pos_label_pieces` có đang đại diện cho MSP duy nhất hay đang kiêm cả dữ liệu tem nói chung?
- Những trường nào là bắt buộc để in tem?
- Print log đang tham chiếu tới `piece_id`, `msp`, `unit_id` hay chỉ lưu payload?
- Có thể lưu mã dùng chung và từng lần in mà không làm sai ý nghĩa dữ liệu lịch sử hiện tại không?
- Có cần bảng riêng cho label code/template hoặc label print job không?

Không tự quyết định thêm bảng/cột trước khi audit đầy đủ schema, RPC và các luồng đang sử dụng `pos_label_pieces`.

---

## 6. In mới, in lại và lịch sử in

### 6.1. In mới — mã có sẵn

- User chọn “Sử dụng mã có sẵn”.
- Nhập/đối chiếu `type_code` và `product_number`.
- Hệ thống tạo một lượt in mới với mã cuối cùng đã xác nhận.
- Mã có thể giống lượt in của Unit khác.
- Không mint MSP và không tăng sequence.

### 6.2. In mới — MSP tự động

- User chọn “Tạo mã sản phẩm tự động”.
- Backend mint một MSP mới và liên kết đúng Unit.
- Ghi nhận sự kiện in mới.
- Một lần mint thành công không đồng nghĩa máy in chắc chắn đã in thành công; cần phân biệt trạng thái cấp mã và trạng thái gửi/in tem nếu hệ thống hiện hỗ trợ.

### 6.3. In lại

- In lại phải tham chiếu đúng bản ghi tem/đối tượng đã được tạo trước đó.
- Với MSP tự động: in lại cùng MSP, không mint MSP mới, không tăng sequence.
- Với mã có sẵn: in lại cùng nội dung mã và tham chiếu đúng lịch sử/bản ghi tem cần in lại.
- Ghi nhận mỗi lần in lại vào lịch sử.
- Không suy ra “In lại” chỉ vì mã có sẵn đã được sử dụng bởi Unit khác.

### 6.4. Audit log tối thiểu cần xem xét

Mỗi lượt in nên truy vết được:
- Loại phương thức: `PRE_ASSIGNED_PRODUCT_CODE` hoặc `AUTO_MINTED_MSP` (tên kỹ thuật có thể điều chỉnh).
- SKU.
- Unit ID nếu có đối tượng vật lý cụ thể.
- Label/piece/job ID.
- Nội dung mã thực tế đã in.
- `type_code`, `product_number` nếu thuộc phương thức mã có sẵn.
- Người thực hiện.
- Thời điểm.
- Loại hành động: in mới / in lại.
- Trạng thái yêu cầu in nếu hệ thống có theo dõi.
- Tham chiếu tới lượt in trước đối với in lại.

Không lưu một trường `hasPrintedBefore` phía client làm nguồn sự thật duy nhất.

---

## 7. Backend/RPC — yêu cầu audit và thiết kế

### 7.1. Audit hiện trạng trước khi sửa

Đọc đầy đủ định nghĩa hiện tại của:
- `pos_mint_label_piece`
- `pos_record_label_print`
- `pos_set_label_piece_type_code`
- Các RPC/route liên quan đến lấy SKU, Unit, tồn kho và in tem.
- Các trigger, unique index, foreign key, RLS, grants liên quan đến `pos_label_pieces` và print logs.
- Toàn bộ caller phía frontend của các RPC trên.

Không tự đoán signature, tham số hoặc cấu trúc bảng. Phải lấy definition thực tế từ database/schema hiện có.

### 7.2. Backend cho phương thức mã có sẵn

Backend cần:
- Nhận phương thức mã rõ ràng.
- Validate dữ liệu bắt buộc và quy tắc định dạng.
- Lưu mã dùng chung theo mô hình cho phép nhiều lượt in/Unit dùng cùng mã.
- Không gọi RPC mint MSP.
- Không tăng `pos_label_msp_seq`.
- Không áp dụng unique constraint lên mã dùng chung.
- Không ghi đè hoặc sửa MSP lịch sử.
- Ghi lịch sử in với actor và thời gian.
- Nếu in cho một Unit cụ thể, xác thực Unit thuộc đúng SKU và đang ở trạng thái được phép theo nghiệp vụ.

### 7.3. Backend cho phương thức tự động

Backend cần:
- Giữ Global Sequence theo quyết định đã chốt.
- Lấy Brand Prefix từ nguồn cấu hình chính thức, không hardcode tùy tiện.
- Mint MSP format `{PREFIX}-{6-digit serial}`.
- Chọn/lock Unit hợp lệ ở backend.
- Tạo MSP và gắn Unit atomic.
- Chặn mint nếu Unit đã có MSP hoặc không còn `IN_STOCK`.
- Chặn duplicate MSP ở database.
- Không cho client truyền mã tự sinh tùy ý.

### 7.4. RPC ghi nhận in

- Không tin `action_type` do client tự khai báo nếu backend có thể xác định từ lịch sử.
- Backend xác định in mới/in lại theo record được tham chiếu.
- Không tạo MSP mới trong thao tác reprint.
- Nếu máy in lỗi sau khi MSP đã mint, giữ nguyên MSP đã cấp; lần sau phải in lại chính MSP đó.
- Cần phân biệt mint thành công, tạo print job thành công và in thực tế thành công nếu ứng dụng có đủ khả năng ghi nhận.

### 7.5. Quyền truy cập

- Không cấp quyền INSERT/UPDATE trực tiếp rộng rãi cho `authenticated` đối với bảng Unit/MSP/print history nếu các thao tác phải qua RPC kiểm soát.
- RLS/grants phải khớp mô hình quyền hiện có.
- Kiểm tra cả đường gọi RPC và quyền thực thi function.
- Không mở rộng quyền ngoài phạm vi tính năng.

---

## 8. Quy tắc vòng đời liên quan đến bán hàng và hủy hóa đơn

Phần này giữ nguyên quyết định U1 đã thống nhất; không tạo workflow trả hàng độc lập.

### Bán hàng
- Unit có MSP U1: xác định Unit qua MSP/piece và bán đúng Unit đó.
- MSP legacy có `unit_id IS NULL`: tiếp tục luồng legacy hiện tại.
- SKU/Unit chưa có MSP: backend tự chọn Unit FIFO hợp lệ; không nhận `unit_id` tùy ý từ client.
- Unit `SOLD`, `VOIDED_RECEIPT` hoặc sai SKU: từ chối bán.

### Hủy hóa đơn bán hàng
- Khôi phục chính Unit đã bán về `IN_STOCK`.
- Giữ nguyên Unit ID và MSP.
- Không mint MSP mới.
- Không xóa Unit/MSP hoặc lịch sử bán/hủy.
- Có thể bán lại chính Unit đó với MSP cũ.
- Cần idempotency/transaction để không khôi phục Unit nhiều lần khi hủy lặp.

### Đảo nhập kho
- Nếu Unit đã mint MSP: giữ nguyên Piece và `unit_id` FK.
- Chuyển Unit sang `VOIDED_RECEIPT`, giữ actor/time/reason/receipt.
- Unit VOIDED không được bán, mint hoặc FIFO.
- Nhập thay thế phải tạo Unit mới, không tái sử dụng Unit VOIDED.

---

## 9. Brand Prefix và định dạng mã tự động

Quyết định hiện tại:
- Global Sequence: giữ nguyên sequence toàn cục.
- MSP mới: `{BRAND_PREFIX}-{lpad(serial, 6, '0')}`.
- Không viết lại MSP lịch sử.
- Prefix phải lấy từ cấu hình Brand chính thức.
- Audit nguồn lưu prefix và danh sách giá trị thực tế trước khi triển khai.
- Không tự thêm cột `brands.abbreviation` hoặc hardcode prefix nếu chưa có quyết định schema.

Mã sản phẩm có sẵn như `CHARM766HHH` không bị ép theo định dạng MSP tự động.

---

## 10. Checklist audit theo lớp

### A. Frontend/UI
- [ ] Chọn SKU hiển thị đúng hai phương thức.
- [ ] Phương thức mã có sẵn có input `type_code`.
- [ ] Phương thức mã có sẵn có input `product_number`.
- [ ] Preview chính xác mã cuối cùng trước khi in.
- [ ] Mã có sẵn đã tồn tại vẫn cho phép tiếp tục.
- [ ] Không có cảnh báo trùng gây chặn mã dùng chung.
- [ ] Phương thức tự động hiển thị MSP do hệ thống cấp.
- [ ] MSP tự động không editable.
- [ ] Phân biệt rõ In mới và In lại.
- [ ] In lại tham chiếu đúng record, không mint lại.
- [ ] Chuyển phương thức không giữ nhầm dữ liệu của phương thức trước.
- [ ] Validate phía UI chỉ hỗ trợ trải nghiệm; backend vẫn validate độc lập.

### B. Backend/RPC
- [ ] Xác định đầy đủ caller và signature thực tế của RPC hiện tại.
- [ ] Mã có sẵn không gọi mint RPC.
- [ ] Mã có sẵn không tăng sequence.
- [ ] Mã có sẵn cho phép lặp trên nhiều Unit.
- [ ] Mã tự động mint sequence ở backend.
- [ ] Mint và gắn Unit atomic.
- [ ] Lock Unit chống hai user mint cùng một Unit.
- [ ] Reprint không mint MSP mới.
- [ ] Backend tự xác định hành động in mới/in lại.
- [ ] Validate SKU, Unit status, quyền user.
- [ ] Không tin dữ liệu định danh Unit do client tùy ý gửi.
- [ ] Có xử lý retry/idempotency phù hợp.

### C. Database
- [ ] Xác định rõ bảng nào lưu MSP duy nhất.
- [ ] Xác định rõ nơi lưu mã sản phẩm dùng chung.
- [ ] Không unique mã sản phẩm có sẵn.
- [ ] MSP tự động vẫn unique.
- [ ] Unit chỉ có tối đa một MSP U1.
- [ ] Một mã có sẵn có thể liên quan nhiều Unit/lượt in.
- [ ] Print history có thể phân biệt in mới/in lại.
- [ ] FK và kiểu dữ liệu được xác minh từ schema thật.
- [ ] RLS/grants không cho client ghi trực tiếp ngoài ý muốn.
- [ ] Không sửa/xóa lịch sử MSP legacy.
- [ ] Migration có guard/recovery an toàn; không chỉ dựa vào `IF NOT EXISTS` để che schema sai.

### D. Export/Filter/Stock-in
- [ ] Các dropdown/filter không hiển thị SKU/Brand/Category đã ẩn hoặc không active theo rule hiện tại.
- [ ] Nhập kho không cho chọn SKU đã ẩn/xóa nếu backend cũng không cho phép.
- [ ] Export phản ánh đúng danh mục/Brand/Category hiện hành theo quyết định dự án.
- [ ] Export tiếp tục là CSV; không mô tả là file Excel `.xlsx` nếu thực tế chỉ xuất CSV.
- [ ] Không làm thay đổi luồng stock-in/Unit ngoài phạm vi U1 đã duyệt.

### E. Regression
- [ ] MSP cũ vẫn in lại được.
- [ ] MSP legacy `unit_id IS NULL` vẫn đi theo luồng legacy.
- [ ] Bán hàng theo MSP U1 vẫn resolve đúng Unit.
- [ ] Bán hàng legacy không bị ảnh hưởng.
- [ ] Hủy hóa đơn trả đúng Unit về `IN_STOCK`.
- [ ] Đảo nhập Unit đã mint giữ nguyên MSP và FK.
- [ ] Sequence không bị tăng bởi phương thức mã có sẵn.
- [ ] Không có thay đổi ngoài phạm vi tính năng.

---

## 11. Test cases bắt buộc

| ID | Tình huống | Kết quả mong đợi |
|---|---|---|
| TC-01 | Chọn SKU → dùng mã có sẵn `CHARM766HHH` lần đầu | Tạo lượt in; không mint MSP; sequence không đổi. |
| TC-02 | Unit khác cùng SKU dùng lại `CHARM766HHH` | Cho phép; không báo trùng; tạo lượt in riêng. |
| TC-03 | 5 Unit cùng loại/trọng lượng dùng cùng `CHARM766HHH` | Cả 5 được phép in cùng mã. |
| TC-04 | User bỏ trống `type_code` hoặc `product_number` trong khi trường đó bắt buộc | Backend từ chối với lỗi validation rõ ràng. |
| TC-05 | User nhập mã có khoảng trắng đầu/cuối | Chuẩn hóa theo rule; preview và dữ liệu lưu thống nhất. |
| TC-06 | In lại tem mã có sẵn của một record cụ thể | In đúng mã/record đã chọn; ghi nhận reprint; không mint MSP. |
| TC-07 | Dùng mã có sẵn trùng với mã đã được in cho Unit khác | Vẫn cho phép. |
| TC-08 | Chọn tạo MSP tự động, có Unit hợp lệ | Mint MSP đúng prefix/sequence; liên kết đúng một Unit. |
| TC-09 | Chọn tạo MSP tự động nhưng không còn Unit hợp lệ | Từ chối; không tạo Piece/Unit liên kết dở dang. |
| TC-10 | Hai user đồng thời mint trên cùng SKU | Không cấp cùng một Unit cho cả hai; MSP không trùng. |
| TC-11 | Hai user đồng thời mint MSP | Global Sequence không tạo MSP trùng. |
| TC-12 | Reprint MSP tự động | Dùng lại đúng MSP cũ; sequence không đổi. |
| TC-13 | Máy in lỗi sau khi MSP đã mint | Giữ MSP; retry bằng reprint, không mint MSP mới. |
| TC-14 | Unit đã SOLD hoặc VOIDED_RECEIPT yêu cầu mint | Backend từ chối. |
| TC-15 | Hủy hóa đơn bán hàng | Đúng Unit cũ về IN_STOCK; MSP giữ nguyên. |
| TC-16 | Hủy hóa đơn lặp lại | Không restore/ghi nhận tác động nhiều lần. |
| TC-17 | Đảo nhập Unit đã có MSP | Unit VOIDED_RECEIPT; Piece/MSP và FK còn nguyên. |
| TC-18 | Mã sản phẩm có sẵn được dùng chung nhưng mỗi tem thuộc Unit khác nhau | Lịch sử từng lượt in vẫn truy vết đúng Unit, không gộp nhầm thành một Unit. |

---

## 12. Các điểm cần xác minh khi audit — không tự suy diễn

Các điểm dưới đây chưa được kết luận chỉ từ câu trả lời “5 sản phẩm dùng chung mã”:

1. `product_number` là trường user nhập độc lập hay là phần được ghép vào `type_code`?
2. Quy tắc ghép `type_code` + `product_number` thành chuỗi cuối cùng là gì? Ví dụ `CHARM` + `766HHH` → `CHARM766HHH` chỉ là cách minh họa, cần xác nhận với dữ liệu thực tế.
3. Một lượt in mã có sẵn có bắt buộc chọn một Unit cụ thể không, hay có thể in theo số lượng mà không chọn Unit?
4. Nếu in theo số lượng, hệ thống có phải tạo một print item cho từng tem để truy vết không?
5. Mã có sẵn có được sửa sau khi đã in không? Nếu sửa, có tạo version/lịch sử mới không?
6. Có cần kiểm tra mã có phù hợp với SKU/Brand/đặc tính sản phẩm không, và nguồn rule nằm ở đâu?
7. Các trường mã hiện tại trong `pos_label_pieces` có thể tái sử dụng không, hay phải tách riêng mô hình mã sản phẩm dùng chung?
8. Print log hiện tại có lưu đủ dữ liệu để hỗ trợ cả hai phương thức không?
9. Brand Prefix chính thức được lưu ở đâu và các Brand hiện có đang dùng prefix nào?
10. `type_code` hiện là free text hay có danh mục/validation ở nơi khác?

Không chặn toàn bộ audit chỉ vì các câu hỏi này; hãy đọc schema/code hiện trạng, ghi rõ evidence và đề xuất phương án. Không tự chốt thay nghiệp vụ đối với các điểm chưa có câu trả lời.

---

## 13. Ràng buộc triển khai và an toàn dữ liệu

- Đây là tài liệu audit/đặc tả; chưa phải lệnh cho phép triển khai.
- Không chạy DDL/DML trên production khi chưa có phê duyệt rõ ràng.
- Không tự reset database, không xóa hoặc rewrite MSP lịch sử.
- Không tự tạo migration/RPC dựa trên signature suy đoán.
- Không sửa POS checkout, invoice, inventory hoặc các module ngoài phạm vi, trừ phần tích hợp bắt buộc đã được chỉ rõ.
- Không refactor diện rộng.
- Trước khi sửa code: audit caller, schema, RPC, RLS/grants, test hiện tại; báo cáo file/function/table cụ thể.
- Trình bày thiết kế dữ liệu và RPC hoàn chỉnh để duyệt trước khi chuyển sang bước migration.
- Bảo toàn thay đổi sẵn có trong working tree; không tự commit/push/deploy.

## 14. Tiêu chí hoàn thành audit

Audit chỉ được xem là hoàn thành khi có đủ:

1. Sơ đồ hai luồng UI từ chọn SKU đến in tem.
2. Bảng so sánh đầy đủ phương thức mã có sẵn và MSP tự động.
3. Mapping schema hiện tại: bảng, cột, index, constraint, FK, RLS, grants.
4. Danh sách RPC/route và signature/body thực tế cùng toàn bộ caller.
5. Thiết kế lưu mã dùng chung không phá mô hình MSP–Unit U1.
6. Thiết kế mint MSP tự động atomic và an toàn concurrency.
7. Thiết kế in mới/in lại và audit history cho cả hai phương thức.
8. Kết quả đánh giá regression theo test cases ở mục 11.
9. Danh sách điểm còn thiếu evidence hoặc cần khách xác nhận.
10. Đề xuất thay đổi tối thiểu theo từng file/function/table; tách rõ audit finding và implementation proposal.

**Thứ tự làm việc:** Audit hiện trạng → báo cáo evidence/gap → thiết kế UI/schema/RPC → review và xin duyệt → mới lập migration/kế hoạch triển khai. Không bỏ qua bước duyệt.


---

# 15. BẮT BUỘC AUDIT VÀ QUẢN LÝ VERSION/CACHE KHI UPDATE UI WEBSITE

> **Yêu cầu bổ sung:** Mỗi lần cập nhật UI website phải kiểm tra cơ chế version/cache để thiết bị đã truy cập website từ trước nhận được giao diện mới. Không mặc định deploy code mới đồng nghĩa mọi thiết bị sẽ tải UI mới.

## 15.1. Vấn đề cần xử lý

Đã ghi nhận tình huống sau khi UI được cập nhật, một số thiết bị từng truy cập website vẫn hiển thị giao diện cũ do trình duyệt hoặc lớp cache tiếp tục sử dụng tài nguyên đã lưu.

Mỗi lần có thay đổi UI cần kiểm tra:
- HTML/document entry point có được tải lại phiên bản mới không.
- CSS và JavaScript có bị browser cache giữ lại không.
- Bundle/chunk được tham chiếu từ HTML có đúng phiên bản build mới không.
- Font, logo, icon, hình ảnh và các tài nguyên UI khác có bị cache cũ không.
- CDN/reverse proxy có đang trả về tài nguyên cũ không.
- Nếu website có Service Worker/PWA: Cache Storage và quy trình activate/update có giữ bản cũ không.
- Thiết bị đã mở website từ trước, tab mở lâu ngày hoặc quay lại website sau một thời gian có nhận bản mới không.

## 15.2. Nguyên tắc versioning bắt buộc

Mục tiêu là bảo đảm thiết bị tải đúng bộ tài nguyên thuộc cùng một release.

1. **Ưu tiên content-hashed assets/build output** nếu framework/build system hỗ trợ: tên file CSS/JS thay đổi theo nội dung/build để browser không dùng nhầm file cũ.
2. HTML/document entry point phải có cache policy phù hợp để trình duyệt kiểm tra phiên bản mới thay vì giữ HTML cũ quá lâu.
3. Nếu website dùng query version hoặc biến version thủ công, cập nhật version tại đúng nguồn trung tâm cho release UI mới; không sửa rời rạc từng URL hoặc component.
4. Tài nguyên không có content hash (ví dụ logo/font/image dùng URL cố định) phải có chiến lược invalidation/version phù hợp khi nội dung thay đổi.
5. Nếu có Service Worker/PWA, audit manifest, cache name/version, precache list, activation và cleanup cache cũ. Không tự thêm Service Worker nếu dự án hiện không dùng.
6. Kiểm tra CDN/reverse proxy cache rules và purge/invalidation khi cần. Không purge toàn bộ CDN tùy tiện nếu chỉ cần invalidate đúng tài nguyên.

**Không tăng query version máy móc cho mọi component hoặc mọi request.** Phải xác định cơ chế cache thực tế của website trước, sau đó cập nhật version ở đúng nguồn quản lý hoặc dùng cơ chế build chuẩn. Tránh HTML mới tham chiếu bundle cũ hoặc CSS mới đi cùng JavaScript cũ.

## 15.3. Checklist audit cơ chế hiện tại trước khi sửa

- [ ] Xác định framework/build tool và cách sinh CSS/JS bundle của website.
- [ ] Kiểm tra HTML entry point và response headers `Cache-Control`, `ETag`, `Last-Modified`, `Expires` (nếu có).
- [ ] Kiểm tra asset CSS/JS có filename content hash hay đang dùng URL cố định.
- [ ] Kiểm tra version/query parameter hiện tại (nếu có), xác định nguồn khai báo và toàn bộ nơi sử dụng.
- [ ] Tìm tất cả cơ chế cache busting/versioning đang tồn tại; không tạo thêm cơ chế thứ hai nếu không cần.
- [ ] Kiểm tra cache headers của font, logo, icon, ảnh và static assets.
- [ ] Kiểm tra CDN/reverse proxy/cache layer và quy tắc cache theo đường dẫn.
- [ ] Kiểm tra Service Worker, PWA, Web App Manifest và Cache Storage; xác nhận có hay không trước khi kết luận.
- [ ] Kiểm tra HTML có thể tham chiếu asset của build trước sau khi deploy hay không.
- [ ] Xác định cách nhận biết build/release hiện tại (build ID, commit SHA, version string hoặc manifest).
- [ ] Ghi rõ file cấu hình, entry point, nơi khai báo version và các đường dẫn asset liên quan.
- [ ] Phân biệt cache website public với cache POS hoặc ứng dụng khác; không sửa phạm vi không liên quan.

## 15.4. Checklist bắt buộc cho mỗi lần update UI

1. Xác định toàn bộ CSS/JS/font/image/component asset bị ảnh hưởng.
2. Xác định cơ chế version/cache đang áp dụng cho từng nhóm tài nguyên.
3. Nếu dùng version thủ công: cập nhật version tại nguồn trung tâm theo quy ước release của dự án.
4. Nếu dùng content hash: xác nhận build tạo asset hash mới và HTML mới tham chiếu đúng asset đó; không tự tăng version thủ công nếu không cần.
5. Nếu thay đổi tài nguyên URL cố định: thực hiện cache invalidation/versioning cho đúng tài nguyên.
6. Nếu có Service Worker/PWA: cập nhật cache version/precache theo quy trình hiện tại và xác nhận client chuyển sang cache mới.
7. Kiểm tra cache policy của HTML và static assets sau build/deploy.
8. Ghi nhận build/release identifier để có thể xác minh thiết bị đang chạy bản nào.
9. Không coi hard refresh trên máy developer là bằng chứng tất cả thiết bị đã nhận UI mới.

## 15.5. Test matrix sau deploy

| ID | Trạng thái thiết bị/trình duyệt | Kết quả mong đợi |
|---|---|---|
| CACHE-01 | Thiết bị mới truy cập website lần đầu | Tải UI và asset của release mới. |
| CACHE-02 | Thiết bị đã truy cập website trước khi update, đóng tab rồi mở lại | Nhận UI mới mà không cần hướng dẫn user tự xóa cache. |
| CACHE-03 | Tab website mở từ trước và vẫn hoạt động trong lúc deploy | Khi reload/navigation theo thiết kế phải tải đúng release mới, không trộn asset giữa hai build. |
| CACHE-04 | Thiết bị quay lại website sau thời gian dài | HTML kiểm tra phiên bản mới và tải asset tương ứng. |
| CACHE-05 | Browser cache đang bật | Không sử dụng asset cũ ngoài chính sách cache đã thiết kế. |
| CACHE-06 | CDN/reverse proxy cache đang hoạt động | Response trả đúng HTML/asset release mới sau deploy/invalidation. |
| CACHE-07 | Service Worker/PWA có tồn tại | Client cập nhật worker/cache đúng quy trình; không mắc kẹt ở cache cũ. |
| CACHE-08 | CSS, JavaScript, font, logo/image được cập nhật cùng release | Tài nguyên hiển thị đồng bộ, không xảy ra UI mới nhưng CSS/JS cũ hoặc ngược lại. |
| CACHE-09 | Reload thông thường (không hard refresh) | Nhận bản mới theo cache policy dự kiến. |
| CACHE-10 | Nhiều thiết bị/browser khác nhau | Tất cả nhận cùng release; không phụ thuộc riêng cache của máy developer. |

## 15.6. Tiêu chí nghiệm thu

Chỉ xác nhận hoàn tất UI release khi:
- HTML/document entry point trả về phiên bản mới theo cache policy dự kiến.
- CSS/JS bundle được tham chiếu đúng build mới.
- Tài nguyên thay đổi có URL/hash/version hoặc cache invalidation phù hợp.
- Không có asset cũ bị giữ lại ngoài chủ đích.
- Đã kiểm tra ít nhất một thiết bị/browser đã truy cập website trước release bằng reload thông thường.
- Đã kiểm tra thiết bị/browser mới.
- Nếu có CDN hoặc Service Worker, đã xác minh cơ chế cập nhật tương ứng.
- Có thể xác định build/release đang chạy để đối chiếu khi phát sinh lỗi.

## 15.7. Quy tắc phải đưa vào mọi task Cursor/UI về sau

Khi thực hiện bất kỳ yêu cầu cập nhật UI website nào, phải thêm bước:

> **Audit và cập nhật UI asset version/cache:** Kiểm tra cơ chế versioning và caching hiện tại của website trước khi sửa. Sau khi thay đổi UI, bảo đảm HTML và toàn bộ CSS/JS/font/image assets liên quan được phân phối theo đúng release mới. Cập nhật version tại nguồn trung tâm nếu dự án dùng version thủ công; nếu dùng content-hashed build assets thì xác minh hash và HTML manifest/reference đã đổi đúng. Kiểm tra CDN và Service Worker/PWA nếu có. Test bằng reload thông thường trên thiết bị đã truy cập website trước đó, không chỉ hard refresh trên máy developer. Không bỏ qua bước này và không tự tạo cơ chế version/cache mới khi chưa audit cơ chế hiện tại.

**Lưu ý về phạm vi xác minh:** Đây là yêu cầu và checklist được bổ sung vào đặc tả. Chưa có source code/config/deployment headers của website trong yêu cầu hiện tại để kết luận cơ chế cache thực tế đang dùng hoặc xác nhận đã sửa lỗi. Khi audit implementation phải kiểm tra bằng chứng từ code, build output và HTTP response thực tế.
