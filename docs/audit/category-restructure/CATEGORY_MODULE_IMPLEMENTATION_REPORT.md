# Category Module: Implementation Report

> **Đã bị thay thế (13/11/2026).** Trang thử nghiệm `/admin/danh-muc.html` và repository mock đã bị xóa; quy tắc được đưa vào `/admin`. Xem `PRODUCT_CATALOG_PHASE0_AUDIT.md` và `PRODUCT_CATALOG_IMPLEMENTATION_REPORT.md`.

Ngày: 13/11/2026. Nhánh: `Finn/New/Category-Restructure-Future` (chưa commit, chưa push).

Báo cáo audit trước khi code: `CATEGORY_MODULE_PRE_IMPLEMENTATION_AUDIT.md`.

## 1. Tổng quan

Đã xây module quản lý Brand, Category, Product Type mới tại trang riêng `/admin/danh-muc.html`. Module chạy trên dữ liệu thử nghiệm lưu trong trình duyệt (`localStorage`), không đọc hay ghi bảng dữ liệu nào trên Supabase. Supabase chỉ được dùng để kiểm tra đăng nhập, cùng phiên với `/admin`.

Trang không được link từ `/admin` hiện tại. Truy cập bằng URL. Không file nào của `/admin`, website hay POS bị sửa nội dung.

## 2. Giao diện Brand

- Danh sách: tên + slug, chip Category liên kết (tối đa 3, phần còn lại hiện "+n"), số sản phẩm (mô phỏng), trạng thái, thời gian cập nhật, thao tác Xem, Sửa, Ngừng dùng hoặc Kích hoạt.
- Bộ lọc: tìm theo tên hoặc slug (không phân biệt dấu), trạng thái, Category liên kết (kể cả "Chưa liên kết danh mục"), sắp xếp theo tên A-Z, Z-A, mới tạo, mới cập nhật. Phân trang 10 dòng.
- Form thêm/sửa dùng chung một component: tên (bắt buộc), slug, mô tả, trạng thái, chọn nhiều Category có ô lọc và chip.
- Drawer chi tiết: thông tin, trạng thái, số sản phẩm tham chiếu, danh sách Category liên kết kèm số sản phẩm theo từng cặp.

## 3. Giao diện Category

Như Brand, đổi chiều quan hệ: cột "Thương hiệu sử dụng", lọc theo Brand (kể cả "Chưa có thương hiệu"), form chọn nhiều Brand.

## 4. Giao diện Product Type

Danh sách gồm tên, slug, mô tả, số sản phẩm, trạng thái, thời gian cập nhật. Form và drawer không có ô chọn Brand hay Category, chỉ có ghi chú "dùng chung toàn hệ thống".

Trạng thái giao diện có đủ cho cả ba tab:

- Đang tải: skeleton, tắt hiệu ứng khi `prefers-reduced-motion`.
- Chưa có dữ liệu: kèm nút thêm mới.
- Không có kết quả: kèm nút "Xóa bộ lọc".
- Lỗi tải: kèm "Thử lại", và "Khôi phục dữ liệu mẫu" nếu dữ liệu thử nghiệm bị hỏng.
- Lỗi thao tác: hiện ngay dưới trường hoặc ở đầu form.
- Thành công: toast.

## 5. CRUD đã triển khai

| Thao tác | Hành vi |
|---|---|
| Tạo | Validate ở UI và ở service; chuẩn hóa khoảng trắng; kiểm tra trùng tên và trùng slug; slug để trống thì tự sinh theo cùng quy tắc `slugifySimple` hiện có; không tạo bản ghi liên quan nào |
| Đọc | Danh sách có tìm kiếm, lọc, sắp xếp, phân trang ở tầng repository; chi tiết kèm quan hệ và số sản phẩm |
| Sửa | Chỉ ghi `name`, `slug`, `description`, `status` và quan hệ. Slug bị khóa khi sửa; muốn đổi phải bật "Cho phép sửa slug" và xác nhận. Có kiểm tra xung đột: nếu bản ghi đã bị sửa ở nơi khác thì từ chối thay vì ghi đè |
| Ngừng dùng / Kích hoạt | Có hộp xác nhận nêu số sản phẩm tham chiếu và số liên kết; giữ nguyên liên kết; không xóa bản ghi |
| Xóa cứng | Không triển khai, vì quy tắc và tác động chưa được chốt |

Form giữ dữ liệu khi lưu thất bại, chặn submit liên tục, hỏi xác nhận khi đóng form còn thay đổi chưa lưu (bằng nút Hủy, nút ×, click nền hoặc phím Escape). Lỗi của từng trường tự xóa khi người dùng sửa trường đó.

Quy tắc trùng tên:

- So khớp không phân biệt hoa/thường và khoảng trắng, nhưng phân biệt dấu ("Bạc" khác "Bác").
- Chỉ kiểm tra khi tạo mới hoặc khi đổi tên. Bản ghi cũ đang trùng tên vẫn sửa được các trường khác và không bị gộp.

## 6. Quan hệ Brand - Category

- Nhiều-nhiều, hai chiều nhất quán: sửa từ phía Brand hay phía Category đều cập nhật cùng một tập liên kết.
- Brand không có Category và Category không có Brand đều hợp lệ. Category vẫn tồn tại khi bị bỏ hết liên kết.
- Liên kết mới chỉ được trỏ tới bản ghi đang dùng. Liên kết cũ tới bản ghi đã ngừng dùng được giữ lại.
- Trước khi lưu thay đổi có bỏ liên kết, hộp xác nhận liệt kê từng liên kết bị bỏ và số sản phẩm đang dùng cặp đó, kèm ghi chú: không đổi Brand/Category của sản phẩm, SKU, bảng giá hay tồn kho.
- Lưu bản ghi và quan hệ trong một lần ghi (không có trạng thái ghi dở).

## 7. Product Type dùng chung

Product Type không có trường hay liên kết tới Brand/Category. Service bỏ qua `linkedIds` nếu gửi kèm. Không có thao tác nào gán Product Type cho sản phẩm. Dữ liệu mẫu có sản phẩm không có Product Type.

## 8. Kiến trúc

| Tầng | File | Trách nhiệm |
|---|---|---|
| Domain | `js/admin/catalog-v2/domain.js` | Kiểu dữ liệu, trạng thái, chuẩn hóa tên, khóa tìm kiếm không dấu, slug, validation thuần, mã lỗi |
| Repository (local) | `js/admin/catalog-v2/local-repository.js` | Đọc/ghi `localStorage`, dữ liệu mẫu, truy vấn có phân trang, đếm sản phẩm mô phỏng |
| Data source | `js/admin/catalog-v2/data-source.js` | Chọn repository theo cấu hình; adapter Supabase giữ chỗ |
| Service | `js/admin/catalog-v2/service.js` | Quy tắc nghiệp vụ; các hàm `getBrands`, `getBrandById`, `createBrand`, `updateBrand`, `deactivateBrand`, `activateBrand`, tương tự cho Category và Product Type; `getBrandCategories`, `updateBrandCategories`, `getCategoryBrands`, `updateCategoryBrands`; `previewUpdate`, `previewStatusChange` |
| UI | `js/admin/catalog-v2/ui.js`, `admin/danh-muc.html`, `css/admin-catalog-v2.css` | Render, form, xác nhận, drawer, toast, focus, phím tắt. Chỉ gọi service |

UI và service không chứa tên bảng hay tên cột database. Hợp đồng repository được ghi ở đầu `local-repository.js`. Khi có schema mới, chỉ cần viết adapter Supabase theo hợp đồng đó và trỏ `data-source.js` sang, không phải sửa UI hay service.

Giao diện dùng lại class sẵn có của `admin/admin.css` và `css/admin-catalog.css` (bảng, field, tab, phân trang, modal, toast, badge). CSS mới chỉ bổ sung phần còn thiếu, đặt trong file riêng.

## 9. Mock/Local Repository

- Mặc định: `localStorage`, key `tlkv-catalog-v2-mock`. Thêm `?source=memory` để dùng bộ nhớ tạm (mất khi tải lại). `?source=supabase` báo lỗi rõ ràng "schema chưa Migration".
- `?latency=0` tắt độ trễ giả lập (mặc định 250ms mỗi lần gọi repository, dùng để thấy trạng thái đang tải).
- Banner vàng cố định trên trang ghi rõ đây là dữ liệu thử nghiệm. Cột số sản phẩm ghi "(mô phỏng)". Nút "Khôi phục dữ liệu mẫu" có xác nhận.
- ID mẫu có tiền tố `mock-` nên không thể trùng UUID production.
- Không có fallback âm thầm: dữ liệu `localStorage` hỏng thì báo lỗi và giữ nguyên dữ liệu hỏng cho tới khi người dùng chọn khôi phục; trình duyệt chặn `localStorage` thì báo lỗi.

Dữ liệu mẫu lấy theo mapping Brand - Category đã xác nhận ở spec mục 2.2 để dễ đối chiếu, cộng thêm các trường hợp spec yêu cầu:

- quan hệ nhiều-nhiều (Nhẫn Trơn có 3 Brand, TLKV có 6 Category);
- trùng tên khác ID ("Nhẫn Trơn" và "Nhẫn trơn");
- bản ghi ngừng dùng ở cả ba loại;
- Brand "Bạc" không có Category, Category "Tranh" không có Brand;
- Product Type "Mặt Dây Chuyền" chưa dùng, "Nhẫn" được 3 sản phẩm dùng;
- sản phẩm không có Product Type.

Đây không phải mapping sẽ áp dụng khi Migration.

## 10. File tạo mới

| File | Mục đích |
|---|---|
| `admin/danh-muc.html` | Trang module mới |
| `css/admin-catalog-v2.css` | CSS bổ sung |
| `js/admin/catalog-v2/domain.js` | Domain |
| `js/admin/catalog-v2/local-repository.js` | Repository local |
| `js/admin/catalog-v2/data-source.js` | Chọn nguồn dữ liệu |
| `js/admin/catalog-v2/service.js` | Service |
| `js/admin/catalog-v2/ui.js` | UI |
| `tests/catalog-v2.test.js` | Test nghiệp vụ (`node --test`) |
| `docs/audit/category-restructure/CATEGORY_MODULE_PRE_IMPLEMENTATION_AUDIT.md` | Audit Bước 0 |
| `docs/audit/category-restructure/CATEGORY_MODULE_IMPLEMENTATION_REPORT.md` | Báo cáo này |

## 11. File chỉnh sửa

- `docs/audit/category-restructure/README.md`: thêm mục tiến độ.

`git status` còn báo `admin/admin.css`, `js/admin-app.js`, `js/admin/catalog-admin.js` là đã sửa. Nội dung ba file này không đổi (`git diff --ignore-cr-at-eol` rỗng), chỉ bị đổi xuống dòng CRLF sang LF lúc 14:16 ngày 13/11, trước khi bắt đầu công việc này. Tôi không đụng và không revert.

## 12. Kết quả kiểm thử

**Test tự động:** `node --test tests/catalog-v2.test.js`, 11/11 đạt. Các test phủ:

- dữ liệu mẫu đủ các trường hợp spec yêu cầu;
- tạo Brand: bắt buộc tên, lưu liên kết, không tự tạo Category hay Product Type, không đổi sản phẩm;
- chặn trùng tên/slug với bản ghi mới, cho phép sửa bản ghi cũ đang trùng tên, không gộp;
- khóa slug khi sửa, kiểm tra định dạng và trùng khi mở khóa;
- bỏ liên kết không xóa Category, không ảnh hưởng Brand khác, không đổi sản phẩm; Category còn tồn tại khi không còn Brand nào;
- chặn liên kết mới tới bản ghi ngừng dùng, giữ liên kết cũ;
- Product Type không có liên kết, được phép chưa dùng, chặn trùng tên;
- ngừng dùng giữ liên kết, kích hoạt lại được;
- tìm kiếm không dấu, lọc trạng thái, lọc quan hệ (kể cả chưa liên kết), phân trang và giới hạn trang;
- từ chối ghi đè khi bản ghi đã bị sửa ở nơi khác;
- adapter Supabase và dữ liệu hỏng đều báo lỗi, không fallback, không ghi đè dữ liệu hỏng.

**Test trình duyệt:** trình duyệt trong Cursor, server local `npm start` cổng 5190, đăng nhập bằng tài khoản admin được cung cấp. Đã xác nhận:

- Đăng nhập, tự đăng nhập lại bằng phiên cũ khi tải lại trang.
- Brand:
  - báo lỗi khi bỏ trống tên;
  - báo trùng tên với "bảo  tín MINH châu" và "BẠC";
  - tạo "Thương Hiệu Thử Nghiệm" với 2 Category;
  - sửa TLKV bỏ "Nhẫn Trơn", hộp xác nhận nêu đúng 1 sản phẩm mô phỏng; nhánh Hủy giữ nguyên form;
  - phía Category cập nhật đúng chiều ngược lại.
- Category:
  - phân trang 2 trang;
  - tìm "nhan tron" ra cả 2 bản ghi trùng tên;
  - trạng thái "không có kết quả" và nút "Xóa bộ lọc".
- Product Type:
  - ngừng dùng "Nhẫn" có cảnh báo 3 sản phẩm;
  - drawer chi tiết hiển thị đúng; kích hoạt lại từ drawer và drawer tự cập nhật;
  - tạo "Vòng Tay" với slug tự sinh.
- Form và lỗi:
  - chặn submit liên tục (nút "Đang lưu…");
  - xác nhận khi đóng form chưa lưu;
  - trả focus về nút gọi sau khi đóng form; Escape đóng drawer;
  - dữ liệu hỏng hiện trạng thái lỗi; "Khôi phục dữ liệu mẫu" chạy đúng.
- Hiển thị ở các viewport 1920px, 1280px và 390px.
- Mạng: trang chỉ gọi `/auth/v1/user`, không có request nào tới `/rest/`.
- Database (`SELECT` sau khi test): `brands` sửa lần cuối 01/11, `categories` lần cuối 05:27 UTC 13/11, `products` lần cuối 07:20 UTC 13/11 (trước khi bắt đầu test trình duyệt lúc 07:29 UTC); không có bảng mới.

Các lỗi giao diện tìm thấy khi test và đã sửa:

- dòng báo lỗi đăng nhập cũ không xóa khi thử lại;
- khung phân trang trống vẫn hiện khi chỉ có 1 trang;
- badge trạng thái xuống dòng;
- khối trạng thái trống bị canh trái;
- nút trên thanh tiêu đề mất viền;
- ô Mô tả dùng sai font;
- lỗi của trường không tự xóa;
- nhãn tab xuống dòng trên điện thoại.

Về môi trường test (không phải lỗi của trang):

- Khi tab trình duyệt ở chế độ khóa của công cụ tự động hóa, click giả lập bằng script bị chặn.
- Sau khi bật rồi tắt giả lập thiết bị di động, tab đó ngừng nhận sự kiện click. Mở tab mới thì hoạt động bình thường.
- Công cụ gõ phím đôi khi làm mất giá trị ô nhập. Bộ ghi sự kiện cho thấy trang không xóa ô.

## 13. Lỗi còn tồn tại

- Mỗi lần tải trang gọi `/auth/v1/user` vài lần (mỗi sự kiện auth gọi `resolveFromSupabase` một lần), giống cách `/admin` hiện tại đang làm. Ảnh hưởng nhỏ, chưa xử lý.
- Danh sách chọn nhiều trong form cuộn trong khung 200px; khi có nhiều bản ghi cần dùng ô lọc để tìm nhanh.

## 14. Phần chưa hoàn thành

- Adapter Supabase thật: chưa thể làm vì chưa có schema (giữ chỗ trong `data-source.js`).
- Xóa cứng: không làm theo spec, vì quy tắc chưa chốt.
- Chưa có link vào trang từ `/admin`: cố ý, để không đổi màn hình production.
- Chưa kiểm thử bằng trình đọc màn hình. Đã có các thuộc tính `role`, `aria-*`, giữ focus trong modal, Escape và phím mũi tên trên tab.
- Trường `logo_url`, `sort_order` của bảng hiện tại chưa có trong domain model mới (xem mục 15).

## 15. Dependency cần xử lý ở giai đoạn Migration

1. Schema: bảng Product Type, bảng nối Brand - Category, cột `products.product_type_id` (cho phép NULL), `categories.description`, ánh xạ `is_active` sang `status`.
2. Quyết định giữ hay bỏ `brands.logo_url` (đang dùng ở trang chủ và `/api/public/brands`) và `sort_order` (đang dùng để sắp xếp website và POS). Nếu giữ thì bổ sung vào domain và form trước khi chuyển sang dữ liệu thật.
3. RLS cho các bảng mới. Cần một RPC để ghi bản ghi và thay tập liên kết trong cùng một transaction.
4. Adapter Supabase theo hợp đồng repository: phân trang bằng `range`, tìm kiếm không dấu (`unaccent` + `ILIKE`), đếm sản phẩm từ `products`, kiểm tra xung đột bằng `updated_at`.
5. POS đọc trực tiếp `categories` với `is_active = true` (`inventory/query.ts`, `label-print/query.ts`). Ngừng dùng một Category trên dữ liệu thật sẽ làm nó biến mất khỏi dropdown POS ngay. Cần thống nhất trước khi nối module vào database.
6. Đổi slug trên dữ liệu thật ảnh hưởng URL `/thuong-hieu/:slug`, `/sanpham/danh-muc/:slug`; cần chính sách redirect.
7. Chỉ thay sub-tab Thương hiệu/Danh mục cũ trong `/admin` sau khi Migration xong và đã kiểm thử.
8. Mapping Brand - Category và Product Type từ spec mục 2.2, 2.3 chỉ áp dụng ở giai đoạn Migration, không lấy từ dữ liệu mẫu.

## 16. Xác nhận không thay đổi production data

- Không chạy migration, DDL hay DML. Mọi truy vấn database trong giai đoạn này đều là `SELECT`.
- Module không gửi request nào tới `/rest/` của Supabase (đã kiểm tra bằng danh sách request mạng của trình duyệt).
- Không đổi `products.brand_id`, `products.category_id`, SKU, `price_row_id`, tồn kho, lịch sử giao dịch.

## 17. Xác nhận không ảnh hưởng POS

- Không sửa file nào ở nhánh POS. Chỉ đọc bằng `git show`/`git grep`.
- Không sửa trigger, function, RPC hay API.
- Không sửa `admin/index.html`, `js/admin-app.js`, `js/admin/catalog-admin.js`, `js/products-data.js`, `js/products/*`, `routes/*`.
