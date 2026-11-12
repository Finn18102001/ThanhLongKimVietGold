# SYSTEM IMPACT AUDIT -- TÁI CẤU TRÚC DANH MỤC

## 1. Mục tiêu và phạm vi

Danh mục là hạng mục có mức độ ảnh hưởng lớn vì cấu trúc hiện tại chưa
có quan hệ thực sự giữa Thương hiệu và Danh mục. Hai lớp đang hoạt động
gần như độc lập, dù được sử dụng xuyên suốt hệ thống để lọc/CRUD sản
phẩm và xác định dòng giá.

Mục tiêu của đợt này là khảo sát toàn bộ hệ thống trước khi thay đổi,
xác định chính xác cấu trúc dữ liệu, luồng xử lý, dependency và rủi ro.
**Chưa thực hiện thay đổi code, database, API hoặc UI trong giai đoạn
audit.**

Phạm vi khảo sát bao gồm: - Database và dữ liệu Thương hiệu, Danh mục,
Sản phẩm, Dòng giá. - CRUD danh mục, thương hiệu và sản phẩm. - Các bộ
lọc và luồng chọn sản phẩm tại Admin và POS. - Cơ chế xác định và lấy
dòng giá. - Các chức năng phụ thuộc: mua/bán, kho, chứng từ, in tem, báo
cáo, Excel, website và đồng bộ dữ liệu.

## 2. Phase 1 -- Database Audit

### 2.1. Khảo sát schema

Kiểm tra toàn bộ bảng và thành phần database liên quan: - Bảng Thương
hiệu, Danh mục, Sản phẩm và Dòng giá. - Các field định danh như
`brand_id`, `category_id`, `product_id` và các field tương đương. -
Foreign key, constraint, index và quan hệ giữa các bảng. - Các field
trạng thái hoạt động, ẩn/hiện và giá trị mặc định. - Trigger, function,
view, RLS policies và các cơ chế tự động cập nhật dữ liệu. - Các bảng
lịch sử hoặc bảng trung gian có tham chiếu đến những đối tượng trên.

### 2.2. Khảo sát dữ liệu thực tế

Thống kê và xác định: - Số lượng thương hiệu, danh mục, sản phẩm và dòng
giá. - Danh mục trùng tên giữa các thương hiệu. - Sản phẩm thiếu thương
hiệu hoặc danh mục. - Sản phẩm tham chiếu đến danh mục không còn tồn tại
hoặc không hợp lệ. - Các trường hợp dữ liệu đang lưu tên thay vì ID. -
Các quan hệ cũ được sử dụng trong giao dịch hoặc lịch sử giá.

**Deliverable:** Sơ đồ database hiện tại và báo cáo chất lượng dữ liệu,
bao gồm các trường hợp bất thường cần mapping.

## 3. Phase 2 -- CRUD Flow Audit

Truy vết luồng dữ liệu từ giao diện đến database cho từng khu vực.

  -----------------------------------------------------------------------
  Khu vực                             Nội dung cần kiểm tra
  ----------------------------------- -----------------------------------
  Admin -- Danh mục                   Tạo, sửa, xóa, hiển thị và tải danh
                                      mục

  Admin -- Thương hiệu                Tạo, sửa, xóa, hiển thị và tải
                                      thương hiệu

  Admin -- Sản phẩm                   Tạo, sửa, xóa, tìm kiếm và lọc sản
                                      phẩm

  Admin -- Kho hàng                   Tìm kiếm, lọc và hiển thị sản phẩm

  Admin -- Mua vào                    Chọn sản phẩm, thương hiệu, danh
                                      mục và lấy thông tin liên quan

  Admin -- Bán ra                     Chọn sản phẩm và lấy thông tin liên
                                      quan

  POS -- Mua hàng                     Lọc danh mục, chọn sản phẩm và lấy
                                      giá

  POS -- Bán hàng                     Lọc danh mục, chọn sản phẩm và lấy
                                      giá

  POS -- Kho hàng                     Tìm kiếm, lọc và hiển thị sản phẩm
  -----------------------------------------------------------------------

Với mỗi luồng, cần ghi nhận: 1. UI page/component khởi tạo và hiển thị
dữ liệu. 2. API/route được gọi. 3. Service, repository hoặc query truy
vấn database. 4. Cách mapping dữ liệu giữa database, API và UI. 5. Điều
kiện filter: dùng ID, tên, loại sản phẩm hay điều kiện khác. 6. Cách xử
lý khi tạo, sửa, xóa hoặc thay đổi quan hệ. 7. Các màn hình/cache/state
cần cập nhật sau khi thao tác thành công.

**Deliverable:** Danh sách file, component, API, service, query và sơ đồ
luồng CRUD liên quan.

## 4. Phase 3 -- Price Mapping Audit

Đây là phần cần ưu tiên truy vết kỹ vì thay đổi quan hệ danh mục có thể
khiến sản phẩm lấy sai dòng giá hoặc không tìm thấy giá.

Cần xác định: - Sản phẩm hiện lấy dòng giá bằng điều kiện nào? - Dòng
giá liên kết trực tiếp với sản phẩm hay được xác định qua thương
hiệu/danh mục? - Hàm lượng vàng/bạc tham gia vào việc xác định dòng giá
như thế nào? - Có trường hợp nhiều dòng giá cùng thỏa mãn điều kiện
không? - Khi đổi thương hiệu hoặc danh mục, dòng giá được xác định/cập
nhật lại như thế nào? - Giá mua và giá bán có dùng chung cơ chế mapping
không? - POS lấy giá trực tiếp từ bảng giá hay thông qua API/service
trung gian? - Có cơ chế override giá riêng cho sản phẩm không? - Hệ
thống xử lý thế nào khi không tìm thấy dòng giá, giá bằng 0 hoặc dòng
giá bị ẩn?

Kiểm tra riêng các nhóm sản phẩm: - Bông Lúa Vàng. - Hạt Gạo Vàng. -
Nhẫn Tròn Kim Việt. - Trang sức vàng. - Vàng thị trường. - Bạc. - Sản
phẩm không có dòng giá hoặc dòng giá đang ẩn.

**Deliverable:** Sơ đồ luồng từ sản phẩm → thương hiệu/danh mục → hàm
lượng → dòng giá → giá mua/bán thực tế, kèm các điều kiện và fallback
hiện có.

## 5. Phase 4 -- Dependency & Side-effect Audit

Kiểm tra các chức năng có thể bị ảnh hưởng dù không trực tiếp hiển thị
danh mục:

-   Phiếu mua hàng, phiếu bán hàng, hóa đơn và lịch sử giao dịch.
-   Nhập kho, xuất kho, kiểm kê và điều chỉnh tồn kho.
-   Lịch sử thay đổi giá, giá vốn và giá bán.
-   In tem, SKU và MSP.
-   Báo cáo, thống kê và xuất Excel.
-   Realtime, cache và cơ chế đồng bộ dữ liệu.
-   Website và các API bên ngoài Admin/POS có sử dụng dữ liệu sản phẩm.

Đặc biệt cần xác định: - Chứng từ cũ lưu ID danh mục/thương hiệu hay lưu
snapshot tên và thông tin sản phẩm. - Giao dịch lịch sử có truy vấn
ngược dữ liệu danh mục hiện tại hay không. - Việc đổi tên, chuyển danh
mục hoặc xóa danh mục có làm thay đổi cách hiển thị dữ liệu lịch sử
không. - Có tác vụ nền hoặc consumer nào phụ thuộc vào cấu trúc hiện tại
không.

**Deliverable:** Dependency Matrix liệt kê chức năng, file/API liên
quan, dữ liệu đầu vào/đầu ra và mức độ ảnh hưởng.

## 6. Phase 5 -- Target Model Design

Sau khi hoàn thành audit mới đánh giá mô hình mục tiêu.

Mô hình nghiệp vụ dự kiến:

``` text
THƯƠNG HIỆU (Brand)
└── DANH MỤC (Category)
    └── SẢN PHẨM (Product)
```

Các quy tắc cần đánh giá và xác nhận: - Một thương hiệu có thể có nhiều
danh mục. - Một danh mục chỉ thuộc một thương hiệu. - Sản phẩm phải
thuộc đúng thương hiệu và danh mục. - Không cho phép chọn danh mục không
thuộc thương hiệu đã chọn. - Khi chọn thương hiệu, danh sách danh mục
được lọc theo thương hiệu đó. - Khi đổi thương hiệu, phải kiểm tra lại
danh mục đang chọn; không giữ một danh mục không còn hợp lệ. - Các bộ
lọc tại Admin và POS phải sử dụng cùng một quy tắc quan hệ. - Cơ chế lấy
dòng giá phải được đánh giá riêng; không mặc định rằng thay đổi cây danh
mục đồng nghĩa phải thay đổi cách liên kết giá.

Đây là mô hình mục tiêu dự kiến, chưa phải quyết định thay đổi schema.
Cần đối chiếu với dữ liệu và dependency thực tế trước khi chốt thiết kế.

**Deliverable:** Target Architecture mô tả quan hệ dữ liệu, quy tắc
validation, API contract và tác động đến các luồng hiện tại.

## 7. Phase 6 -- Migration & Risk Assessment

Lập phương án xử lý cho từng trường hợp dữ liệu:

  -----------------------------------------------------------------------
  Trường hợp                          Nội dung cần xác định
  ----------------------------------- -----------------------------------
  Danh mục cũ chưa có thương hiệu     Quy tắc mapping vào thương hiệu phù
                                      hợp

  Sản phẩm thiếu danh mục             Quy tắc bổ sung hoặc xử lý dữ liệu
                                      thiếu

  Danh mục trùng tên                  Mapping dựa trên ID và ngữ cảnh,
                                      không chỉ dựa vào tên

  Sản phẩm có quan hệ không hợp lệ    Xác định và sửa mapping trước khi
                                      chuyển đổi

  Dòng giá đang phụ thuộc dữ liệu cũ  Bảo toàn mapping và kết quả lấy giá

  Giao dịch lịch sử                   Giữ nguyên snapshot và khả năng tra
                                      cứu

  API cũ đang được POS sử dụng        Đảm bảo tương thích trong quá trình
                                      chuyển đổi
  -----------------------------------------------------------------------

Nguyên tắc migration:

**Backup → Add → Migrate → Verify → Switch → Cleanup**

Yêu cầu: - Backup dữ liệu trước khi migration. - Ưu tiên bổ sung cấu
trúc mới trước, chưa xóa cấu trúc cũ. - Script migration phải có khả
năng kiểm tra trước khi chạy và tránh tạo dữ liệu trùng khi chạy lại. -
Có báo cáo số lượng bản ghi trước/sau và danh sách bản ghi không mapping
được. - Chỉ chuyển consumer sang cấu trúc mới sau khi xác minh dữ
liệu. - Chỉ cleanup field/quan hệ cũ khi xác nhận không còn consumer sử
dụng. - Có phương án rollback rõ ràng cho từng bước.

**Deliverable:** Data Mapping, Migration Plan, Verification Plan và
Rollback Plan.

## 8. Phase 7 -- Implementation Plan

Chỉ lập kế hoạch implementation chi tiết sau khi hoàn thành các phase
audit và thiết kế.

Các tài liệu bắt buộc: 1. **Current Architecture Map:** Cấu trúc
database và luồng xử lý hiện tại. 2. **CRUD Flow Map:** Luồng
tạo/sửa/xóa/lọc danh mục, thương hiệu và sản phẩm. 3. **Price Mapping
Flow:** Cơ chế xác định dòng giá và lấy giá thực tế. 4. **Dependency
Matrix:** Các màn hình, API, service và chức năng bị ảnh hưởng. 5.
**Data Mapping:** Mapping dữ liệu cũ sang mô hình mới. 6. **Target
Architecture:** Thiết kế quan hệ Thương hiệu → Danh mục → Sản phẩm. 7.
**Migration Plan:** Thứ tự chuyển đổi, xác minh, backup và rollback. 8.
**Regression Checklist:** Các luồng cần kiểm thử trước và sau thay đổi.

Sau đó chia implementation thành các đợt nhỏ, có thể kiểm soát phạm vi,
xác minh độc lập và rollback khi cần.

## 9. Implementation Gate -- Điều kiện trước khi sửa code

Chỉ được bắt đầu thay đổi khi tất cả điều kiện sau đã được xác nhận:

-   [ ] Đã xác định toàn bộ nơi sử dụng `brand_id`, `category_id` và các
    field tương đương.
-   [ ] Đã truy vết luồng CRUD từ UI đến database.
-   [ ] Đã truy vết luồng lấy dòng giá từ Admin đến POS.
-   [ ] Đã xác định các chức năng và consumer chịu ảnh hưởng.
-   [ ] Đã thống kê dữ liệu cũ và các trường hợp mapping bất thường.
-   [ ] Đã thống nhất mô hình dữ liệu mục tiêu.
-   [ ] Đã có phương án migration và xác minh dữ liệu.
-   [ ] Đã có phương án rollback.
-   [ ] Đã có regression checklist cho các luồng liên quan.
-   [ ] Không còn dependency quan trọng chưa được xác định hoặc đánh
    giá.

## 10. Quy tắc thực hiện Audit

Trong toàn bộ giai đoạn này: - Không tự ý refactor code. - Không thay
đổi schema/database. - Không sửa API hoặc query đang chạy. - Không chỉnh
sửa UI hoặc hành vi hiện tại. - Không xóa, đổi tên hoặc migrate dữ
liệu. - Chỉ đọc, truy vết, phân tích và lập tài liệu. - Mọi kết luận
phải có bằng chứng từ source code, schema, query hoặc dữ liệu thực tế. -
Nếu không xác định được một dependency, phải ghi rõ là chưa xác minh;
không được suy đoán là không bị ảnh hưởng.

**Mục tiêu cuối cùng:** Nắm được toàn bộ các luồng có liên quan đến Danh
mục trước khi thay đổi, hiểu rõ tác động đến CRUD sản phẩm, Admin, POS,
kho hàng và cơ chế lấy dòng giá. Không bắt đầu implementation chỉ dựa
trên giả định về cấu trúc hiện tại.
