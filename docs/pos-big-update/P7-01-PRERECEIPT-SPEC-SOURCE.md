# TLKV POS -- Đặc tả nghiệp vụ: In tem trước khi nhập kho

**Phiên bản:** 1.0\
**Ngày:** 15/11/2026\
**Phạm vi:** In tem, Mua hàng/Nhập hàng, tìm kiếm MSP\
**Mục đích:** Tài liệu nghiệp vụ làm căn cứ audit và triển khai. Tài
liệu không xác nhận rằng code/database hiện tại đã đáp ứng.

## 1. Mục tiêu

Cho phép cửa hàng tạo và in tem trước khi nhập kho. Người dùng nhập
thông tin sản phẩm trực tiếp trên form tạo tem, không cần chọn SKU vì
sản phẩm chưa được tạo/liên kết SKU trong hệ thống.

Khi nhập kho sau đó, người dùng chọn lại tem đã tạo nhưng chưa nhập kho.
Hệ thống tự điền dữ liệu đã lưu vào form Nhập hàng hiện tại. Người dùng
tiếp tục nhập kho như bình thường, bao gồm chọn/liên kết dòng bảng giá.

Đây là cơ chế **lưu dữ liệu trước và tái sử dụng dữ liệu đã lưu**, không
phải một quy trình nhập kho riêng.

## 2. Phạm vi và nguyên tắc

### Trong phạm vi

1.  Tạo/in tem trước khi nhập kho, không yêu cầu chọn SKU.
2.  Nhập trực tiếp thông tin sản phẩm trên form tạo tem.
3.  Lưu toàn bộ dữ liệu đã nhập và thông tin định danh/lịch sử in.
4.  Trong form Nhập hàng, tìm kiếm/lọc và chọn các tem chưa nhập kho.
5.  Chọn tem xong, tự động điền dữ liệu vào các trường tương ứng của
    form Nhập hàng.
6.  Vẫn cho phép chọn dòng bảng giá theo luồng nhập kho thông thường.
7.  So sánh giá nhập/giá bán trên tem với giá nhập/giá bán trong form
    nhập kho; hỏi người dùng có muốn cập nhật dữ liệu gắn với MSP hay
    không.
8.  Tìm kiếm/lọc MSP tại Mua hàng, Bán hàng, Hóa đơn, Kho và Báo cáo.

### Ngoài phạm vi round này

-   Không cho phép bán sản phẩm chưa nhập kho. Chỉ sản phẩm đã có trong
    kho mới được bán.
-   Không bắt buộc thêm cột MSP vào các bảng UI của năm phân hệ trong
    round này.
-   Không bắt buộc thay đổi layout bảng chỉ để hiển thị MSP.
-   Không yêu cầu chọn SKU khi tạo tem trước nhập kho.
-   Không thay thế hoặc viết lại quy trình nhập kho hiện tại.
-   Không tự động chọn dòng bảng giá thay người dùng.

## 3. Phân biệt mã và dữ liệu tem

  -----------------------------------------------------------------------
  Khái niệm               Ý nghĩa                 Quy tắc
  ----------------------- ----------------------- -----------------------
  SKU                     Sản phẩm/dòng hàng được Không cần có ở bước tạo
                          định danh trong hệ      tem trước nhập kho
                          thống                   

  Mã sản phẩm có sẵn      Mã người dùng nhập, có  Không unique theo từng
                          thể dùng chung cho      sản phẩm vật lý
                          nhiều sản phẩm cùng     
                          loại/trọng lượng        

  MSP tự động             Mã do hệ thống cấp      Một MSP gắn với đúng
                                                  một Unit vật lý; một
                                                  Unit tối đa có một MSP

  Bản ghi tem             Dữ liệu đã lưu để in,   Có định danh riêng,
                          tìm kiếm và tái sử dụng không đồng nhất với mã
                          khi nhập kho            in trên tem
  -----------------------------------------------------------------------

Không đưa mã sản phẩm có sẵn dùng chung vào trường dữ liệu mang ý nghĩa
MSP duy nhất theo Unit. Cần audit schema hiện tại trước khi quyết định
bảng/cột lưu trữ.

## 4. Luồng A -- Tạo và in tem trước khi nhập kho

### 4.1. UI tạo tem

-   Người dùng chọn chức năng tạo/in tem trước khi nhập kho.
-   Không yêu cầu chọn SKU.
-   Người dùng nhập trực tiếp các trường thông tin sản phẩm trên form.
-   Chọn một trong hai chế độ:
    1.  **Sử dụng mã có sẵn:** nhập mã; mã có thể được dùng chung cho
        nhiều sản phẩm vật lý cùng loại/trọng lượng.
    2.  **Tạo MSP tự động:** hệ thống cấp MSP theo quy tắc đã được phê
        duyệt; người dùng không sửa MSP.
-   Người dùng tạo/in tem ngay.

### 4.2. Dữ liệu cần lưu

Lưu snapshot toàn bộ thông tin có trên form tại thời điểm tạo tem, tối
thiểu: - ID bản ghi tem. - Chế độ mã và mã được in. - Tên sản phẩm. -
Thương hiệu. - Danh mục. - Loại sản phẩm (nếu có). - Dòng bảng giá (nếu
đã chọn; có thể để trống nếu chưa chọn). - Giá nhập và giá bán. - Định
lượng/số lượng và đơn vị tương ứng. - Tuổi vàng/tuổi bạc/độ tinh khiết
nếu có. - Trọng lượng và thuộc tính kỹ thuật khác nếu form có. - Giá/ghi
chú hoặc nội dung ghi chú hiện có trên form. - Unit ID đối với MSP tự
động theo thiết kế U1. - Trạng thái nhập kho. - Người tạo, thời điểm
tạo. - Lịch sử tạo tem, in mới và in lại.

Không tự điền 0 cho trường tùy chọn không có dữ liệu; phải phân biệt giá
trị trống và giá trị 0.

### 4.3. Trạng thái

Tem đã tạo nhưng chưa nhập kho phải có trạng thái chờ nhập kho, ví dụ
`PENDING_RECEIPT` hoặc trạng thái tương đương sau khi audit schema. Khi
nhập kho thành công, bản ghi tem được liên kết với phiếu nhập tương ứng
và không còn đủ điều kiện xuất hiện trong danh sách tem chờ.

Không tự tạo enum/migration trước khi kiểm tra trạng thái và schema hiện
tại.

## 5. Luồng B -- Chọn tem trong form Nhập hàng

### 5.1. Vị trí và cách hiển thị

Giữ nguyên form **Nhập hàng** hiện tại. Bổ sung một control để chọn dữ
liệu tem đã in nhưng chưa nhập kho.

Ưu tiên: - Dropdown có tìm kiếm nếu số lượng dữ liệu và không gian UI
phù hợp; hoặc - Bảng nhỏ (compact table) có tìm kiếm/lọc và chọn dòng
nếu dropdown khó tra cứu.

Danh sách cần hiển thị đủ thông tin nhận diện, tối thiểu: - Mã trên tem
(MSP/mã có sẵn). - Tên sản phẩm. - Thương hiệu. - Danh mục/loại sản phẩm
nếu có. - Giá nhập. - Giá bán. - Thời điểm tạo tem. - Trạng thái.

Chỉ hiển thị bản ghi chưa nhập kho và còn đủ điều kiện được chọn.

### 5.2. Sau khi chọn

1.  Đọc snapshot đã lưu của bản ghi tem.
2.  Tự động điền các giá trị tương ứng vào các ô nhập liệu hiện có trên
    form Nhập hàng.
3.  Giữ nguyên khả năng chỉnh sửa theo quy tắc hiện tại của form.
4.  Người dùng vẫn được chọn/liên kết dòng bảng giá như bình thường.
5.  Không tạo lại MSP, không cấp lại serial và không tạo trùng Unit.
6.  Khi xác nhận nhập kho thành công, liên kết bản ghi tem/Unit đã chọn
    với dòng nhập kho thực tế.

Không tự động suy diễn hoặc thay đổi liên kết SKU/Unit nếu người dùng
chỉnh sửa các trường định danh. Cần audit để xác định trường nào được
phép sửa sau khi chọn tem.

### 5.3. Chống nhập trùng

-   Tem đã nhập kho không xuất hiện lại trong danh sách chờ.
-   Backend phải kiểm tra trạng thái tại thời điểm xác nhận; không chỉ
    dựa vào việc UI ẩn bản ghi.
-   Nếu hai người dùng cùng chọn một tem, chỉ một thao tác được phép
    thành công.
-   Retry request không được tạo trùng Unit, MSP hoặc dòng nhập kho.

## 6. Luồng C -- So sánh giá và xác nhận cập nhật

### 6.1. Thời điểm so sánh

Sau khi chọn tem và dữ liệu được điền vào form, so sánh: - Giá nhập lưu
trên tem với giá nhập hiện tại trong form nhập kho. - Giá bán lưu trên
tem với giá bán hiện tại trong form nhập kho.

Thực hiện so sánh trước khi hoàn tất nhập kho. Chỉ hiển thị các trường
có giá trị khác nhau.

### 6.2. Ví dụ cảnh báo

**Thông tin nhập kho khác với thông tin đã lưu trên tem**

  Trường        Trên tem    Nhập kho
  ---------- ----------- -----------
  Giá nhập     8.500.000   8.600.000
  Giá bán      9.000.000   9.200.000

Thông báo hỏi người dùng có muốn cập nhật giá mới vào dữ liệu gắn với
MSP tương ứng không.

### 6.3. Lựa chọn của người dùng

**Có -- Cập nhật dữ liệu MSP** - Cập nhật giá mới vào dữ liệu hiện hành
gắn với đúng MSP/Unit. - Lưu lịch sử giá trị trước/sau, người thực hiện,
thời điểm và nguồn thay đổi (phiếu nhập). - Không cập nhật các MSP/Unit
khác chỉ vì cùng SKU hoặc cùng mã sản phẩm có sẵn.

**Không -- Giữ dữ liệu trên tem/MSP** - Không ghi đè giá đã lưu trên
MSP. - Vẫn tiếp tục nhập kho theo giá trị trên phiếu nhập kho. - Giá
nhập và giá bán của chứng từ phải được lưu theo dữ liệu giao dịch thực
tế.

### 6.4. Tách biệt dữ liệu

Không dùng chung một trường dữ liệu để đại diện cho cả giá hiện hành gắn
với MSP/Unit và giá giao dịch trên phiếu nhập: - Snapshot tem: dữ liệu
tại thời điểm tạo tem. - Giá phiếu nhập: dữ liệu giao dịch nhập kho. -
Giá hiện hành gắn với MSP/Unit: chỉ cập nhật khi người dùng đồng ý. -
Lịch sử thay đổi: lưu trước/sau, actor, timestamp và nguồn.

Với mã sản phẩm có sẵn được dùng chung, cập nhật không được làm thay đổi
hàng loạt sản phẩm khác cùng dùng mã. Đối tượng cập nhật phải là bản ghi
tem/đơn vị cụ thể.

Nếu giá không thay đổi thì không hiển thị cảnh báo. Nếu chỉ một giá thay
đổi, chỉ hiển thị trường đó.

## 7. Liên kết với mô hình Unit -- MSP

Giữ nguyên các nguyên tắc U1: 1. Mỗi sản phẩm vật lý thuộc phạm vi U1 có
Unit riêng. 2. MSP tự động gắn với đúng một Unit; một Unit tối đa có một
MSP. 3. Nếu tạo MSP tự động trước nhập kho, MSP vẫn phải gắn đúng Unit
ngay khi được cấp. 4. Khi nhập kho, tái sử dụng Unit/MSP đã tạo; không
mint lại. 5. Sản phẩm chưa nhập kho không được bán. 6. Hủy phiếu bán
theo nghiệp vụ đã thống nhất phải trả đúng Unit/MSP về tồn kho; không
tạo MSP mới. 7. Mã sản phẩm có sẵn có thể dùng chung; không ràng buộc
một mã có sẵn -- một Unit. 8. Không tự ghép MSP lịch sử chưa có Unit vào
Unit mới nếu chưa có quy tắc backfill được duyệt.

**Điểm bắt buộc audit:** nếu Unit hiện tại bắt buộc phải có
`origin_receipt_item_id` hoặc liên kết receipt ngay khi tạo, thiết kế
cần xử lý trường hợp Unit được tạo trước phiếu nhập. Xác định cách liên
kết receipt về sau mà không tạo Unit/MSP lần hai. Không tự sửa FK hoặc
schema khi chưa kiểm tra migration/RPC hiện tại.

## 8. Tìm kiếm/lọc MSP tại năm phân hệ

Các tab cần hỗ trợ tìm kiếm/lọc MSP: - Mua hàng. - Bán hàng. - Hóa
đơn. - Kho. - Báo cáo.

### 8.1. Phạm vi round này

-   Bổ sung khả năng tìm/lọc MSP trong logic truy vấn và bộ lọc của từng
    phân hệ, theo mức độ dữ liệu hiện tại hỗ trợ.
-   Chưa bắt buộc thêm cột MSP vào bảng UI.
-   Không bắt buộc thay đổi layout bảng.
-   Không làm hỏng hoặc loại bỏ filter hiện có.

### 8.2. Quy tắc

-   Hỗ trợ tìm chính xác và tìm theo một phần MSP.
-   Cho phép kết hợp với các filter hiện tại.
-   Truy vấn dựa trên quan hệ dữ liệu thật giữa MSP, Unit, dòng giao
    dịch và chứng từ.
-   Không suy diễn MSP từ SKU, tên sản phẩm hoặc mã sản phẩm dùng chung.
-   Không tự ghép MSP vào giao dịch lịch sử nếu dữ liệu nguồn không có
    liên kết đáng tin cậy.
-   Không coi mã sản phẩm có sẵn dùng chung là MSP tự động.
-   Nếu một tab chưa có quan hệ dữ liệu đủ để tìm MSP chính xác, ghi rõ
    giới hạn trong audit; không trả kết quả giả.

### 8.3. Nội dung audit cho từng tab

1.  Nguồn dữ liệu hiện tại.
2.  Quan hệ từ record đến SKU/Unit/MSP.
3.  Filter hiện tại được xử lý ở frontend hay backend.
4.  Cách thêm điều kiện MSP mà không phá filter cũ.
5.  Dữ liệu lịch sử nào không thể tìm MSP do thiếu liên kết.
6.  Có cần index hay không, căn cứ query và execution plan; không thêm
    index theo phỏng đoán.

## 9. Quy tắc trường dữ liệu bạc trên form nhập hàng

Theo yêu cầu nghiệp vụ:

**Bắt buộc:** - Tên sản phẩm. - Thương hiệu. - Danh mục. - Số lượng/định
lượng theo ý nghĩa trường hiện tại. - Giá nhập. - Giá bán.

**Tùy chọn:** - Loại sản phẩm, trừ khi có quy tắc nghiệp vụ cụ thể yêu
cầu bắt buộc. - Tuổi bạc/độ tinh khiết. - Trọng lượng. - Các thuộc tính
kỹ thuật khác chưa được xác định là bắt buộc.

Không áp dụng validation đặc thù của vàng cho bạc nếu không có yêu cầu
tương ứng. Không thay giá trị trống bằng 0.

Ảnh form hiện tại hiển thị trường "Định lượng (chỉ)". Cần audit mapping
thực tế của trường này trong UI/API/database; không tự đổi tên hoặc diễn
giải lại khi chưa xác định.

## 10. Yêu cầu audit kỹ thuật trước khi code

### UI

-   Component tạo/in tem và phân biệt in mới/in lại.
-   Form Nhập hàng hiện tại.
-   Cách chọn thương hiệu, danh mục, loại sản phẩm, dòng bảng giá.
-   Các trường giá, định lượng, tuổi vàng/bạc, trọng lượng, ghi chú.
-   Cơ chế validation, xác nhận và hiển thị lỗi.

### Database

-   Bảng MSP và lịch sử in.
-   Bảng SKU/sản phẩm, thương hiệu, danh mục, dòng bảng giá.
-   Bảng Unit nếu U1 đã được triển khai.
-   Bảng phiếu nhập và dòng phiếu nhập.
-   FK, unique/check constraints, trigger, RLS.
-   Trạng thái tem chờ nhập kho/đã nhập kho.
-   Khả năng tạo Unit trước khi có receipt item.

### API/RPC

-   Tạo MSP.
-   Tạo tem/in mới/in lại.
-   Nhập kho.
-   Cập nhật giá và audit history.
-   Query/filter MSP cho từng phân hệ.
-   Transaction, row locking, idempotency và concurrency.

### An toàn triển khai

-   Không tự chạy migration/DDL/DML trên production.
-   Không sửa schema/RPC trước khi audit định nghĩa hiện tại.
-   Không xóa hoặc sửa MSP lịch sử.
-   Không thay đổi logic bán hàng ngoài yêu cầu; sản phẩm chưa nhập kho
    vẫn không được bán.
-   Không refactor phân hệ không liên quan.
-   Không tự commit, push hoặc deploy.

## 11. Tiêu chí nghiệm thu

  -----------------------------------------------------------------------
  ID                                  Tiêu chí
  ----------------------------------- -----------------------------------
  PRE-01                              Tạo tem trước nhập kho không cần
                                      chọn SKU

  PRE-02                              Nhập trực tiếp thông tin sản phẩm
                                      trên form tạo tem

  PRE-03                              Lưu đầy đủ snapshot dữ liệu đã nhập

  PRE-04                              Tìm/lọc được tem chưa nhập kho

  PRE-05                              Chọn tem trong form Nhập hàng hiện
                                      tại

  PRE-06                              Chọn tem tự điền đúng các trường
                                      tương ứng

  PRE-07                              Vẫn chọn dòng bảng giá như luồng
                                      thông thường

  PRE-08                              Nhập kho thành công liên kết tem
                                      với chứng từ và loại khỏi danh sách
                                      chờ

  PRE-09                              Không tạo trùng Unit/MSP khi nhập
                                      kho tem đã tạo

  PRE-10                              Không thể nhập cùng một tem thành
                                      công hai lần

  PRICE-01                            So sánh giá nhập trên tem với giá
                                      nhập trong form

  PRICE-02                            So sánh giá bán trên tem với giá
                                      bán trong form

  PRICE-03                            Chỉ cảnh báo trường có thay đổi

  PRICE-04                            Chọn cập nhật thì cập nhật đúng
                                      MSP/Unit và lưu lịch sử

  PRICE-05                            Chọn không cập nhật thì giữ giá MSP
                                      nhưng vẫn lưu giá chứng từ

  SEARCH-01                           Mua hàng tìm/lọc được MSP

  SEARCH-02                           Bán hàng tìm/lọc được MSP

  SEARCH-03                           Hóa đơn tìm/lọc được MSP

  SEARCH-04                           Kho tìm/lọc được MSP

  SEARCH-05                           Báo cáo tìm/lọc được MSP

  SEARCH-06                           Không bắt buộc thêm cột MSP vào
                                      bảng UI trong round này

  SILVER-01                           Bạc bắt buộc tên, thương hiệu, danh
                                      mục, số lượng/định lượng, giá nhập,
                                      giá bán

  SILVER-02                           Thuộc tính bạc còn lại tùy chọn,
                                      trừ quy tắc cụ thể đã xác nhận

  SALE-01                             Sản phẩm chưa nhập kho không thể
                                      bán
  -----------------------------------------------------------------------

## 12. Test cases tối thiểu

1.  Tạo tem MSP tự động trước nhập kho, không chọn SKU.
2.  Tạo tem bằng mã có sẵn và dùng chung mã cho nhiều sản phẩm vật lý
    cùng loại/trọng lượng.
3.  Tạo nhiều tem; tìm/lọc và chọn một số tem trong form Nhập hàng.
4.  Chọn tem và xác nhận các trường được điền đúng.
5.  Chọn tem và vẫn thay đổi/chọn dòng bảng giá theo luồng bình thường.
6.  Giá không đổi: không hiện cảnh báo.
7.  Chỉ giá nhập đổi: chỉ cảnh báo giá nhập.
8.  Chỉ giá bán đổi: chỉ cảnh báo giá bán.
9.  Cả hai giá đổi: cảnh báo cả hai.
10. Chọn cập nhật: giá đúng MSP/Unit thay đổi, có lịch sử.
11. Chọn không cập nhật: giá MSP giữ nguyên, giá chứng từ vẫn lưu đúng.
12. Hai người cùng chọn một tem: chỉ một thao tác nhập kho thành công.
13. Retry request: không tạo trùng Unit/MSP/dòng nhập.
14. Tem đã nhập không còn trong danh sách chờ.
15. Sản phẩm chưa nhập kho không thể bán.
16. Tìm MSP tại từng tab trả về đúng dữ liệu liên kết.
17. Tìm mã dùng chung không nhầm với MSP tự động.
18. Bạc bỏ trống trường tùy chọn vẫn lưu được nếu trường bắt buộc hợp
    lệ.

## 13. Kết luận

Luồng cần triển khai là:

**Tạo tem trước (không cần SKU) → lưu toàn bộ dữ liệu → in tem → mở form
Nhập hàng → chọn tem chưa nhập kho → tự điền dữ liệu vào form hiện tại →
người dùng chọn dòng bảng giá như bình thường → so sánh giá → người dùng
quyết định có cập nhật giá gắn với MSP hay không → xác nhận nhập kho.**

Round này đồng thời bổ sung tìm kiếm/lọc MSP ở Mua hàng, Bán hàng, Hóa
đơn, Kho và Báo cáo; chưa bắt buộc thêm cột MSP vào bảng UI.

Không cho phép bán sản phẩm chưa nhập kho.
