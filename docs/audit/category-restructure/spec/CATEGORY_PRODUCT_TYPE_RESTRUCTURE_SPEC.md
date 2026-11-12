# TLKV – Category & Product Type Restructure
## Pre-audit, Architecture Assessment & Big Change Implementation Plan

## 1. Objective

Thực hiện đánh giá toàn diện và chuẩn bị kế hoạch tái cấu trúc mô hình dữ liệu Brand – Category – Product Type – Product/SKU trong hệ thống TLKV.

Mục tiêu:

- Chuẩn hóa danh mục sản phẩm, loại bỏ các Category đang mang bản chất tên dòng sản phẩm hoặc Product Type.
- Giảm số lượng Category trùng lặp hoặc phân loại quá chi tiết.
- Hỗ trợ một Category được sử dụng bởi nhiều Brand.
- Giữ nguyên tính chính xác của Price Mapping và logic tính giá mua/bán.
- Không ảnh hưởng tồn kho, SKU, giao dịch lịch sử, báo cáo, tem nhãn và website.
- Chuẩn bị phương án migration có thể kiểm chứng và rollback.

**Đây là thay đổi kiến trúc dữ liệu có phạm vi ảnh hưởng lớn. Không bắt đầu implementation trong giai đoạn này.**

---

# 2. Target Business Direction

## 2.1. Proposed hierarchy

Mô hình nghiệp vụ mục tiêu:

Brand → Category → Product Type → Product/SKU

Ý nghĩa:

| Entity | Vai trò | Ví dụ |
|---|---|---|
| Brand | Thương hiệu sở hữu hoặc cung cấp sản phẩm | TLKV, BTMH, BTMC, Phú Quý, Vàng Thị Trường |
| Category | Nhóm sản phẩm cấp cao | Vàng 24K, Vàng 10K, Bạc Tích Trữ |
| Product Type | Phân loại cụ thể trong Category | Dây Chuyền, Lắc Tay, Nhẫn, Charm |
| Product | Sản phẩm cụ thể | Nhẫn vàng 24K mẫu A |
| SKU | Đơn vị mã hàng phục vụ nghiệp vụ kho/POS | SKU thực tế |

Đây là mô hình mục tiêu để đánh giá, chưa phải quyết định schema.

Không mặc định Product Type phải là một bảng riêng. Hãy so sánh bảng riêng, thuộc tính phân loại và phương án khác dựa trên dữ liệu hiện tại.

## 2.2. Brand–Category mapping đã xác nhận

Sử dụng mapping dưới đây làm business requirement để đối chiếu.

| Category | Brand |
|---|---|
| GRIF Kim Gia Bảo 24K | Bảo Tín Mạnh Hải |
| Vàng Tích Trữ | Bảo Tín Mạnh Hải |
| Quà Tặng 24K | Bảo Tín Mạnh Hải, Thăng Long Kim Việt |
| Vàng 24K | Bảo Tín Mạnh Hải, Thăng Long Kim Việt |
| Nhẫn Trơn | Bảo Tín Mạnh Hải, Thăng Long Kim Việt, Bảo Tín Minh Châu |
| Phụ Kiện | Thăng Long Kim Việt |
| Bạc Trang Sức | Thăng Long Kim Việt |
| Vàng 10K | Thăng Long Kim Việt, Vàng Thị Trường |
| V24K Dây Chuyền | Thăng Long Kim Việt – dự kiến chuyển thành Product Type |
| V24K Lắc Tay | Thăng Long Kim Việt – dự kiến chuyển thành Product Type |
| V24K Nhẫn | Thăng Long Kim Việt – dự kiến chuyển thành Product Type |
| V24K Charm | Thăng Long Kim Việt – dự kiến chuyển thành Product Type |
| V10K Khuyên Tai | Thăng Long Kim Việt – dự kiến chuyển thành Product Type |
| Bạc Tích Trữ | Bảo Tín Minh Châu, Phú Quý |

Business constraints:

- Vàng Thị Trường là Brand độc lập.
- Phú Quý là Brand cần kiểm tra và bổ sung vào mô hình sau khi được duyệt; hiện chưa có trong bảng `brands`.
- Không tự tạo Brand.
- Không tự thêm Brand khác ngoài mapping được xác nhận.
- Phải phát hiện sản phẩm thuộc Brand khác hoặc thiếu `brand_id` so với mapping.
- Một Category có thể được nhiều Brand sử dụng.

## 2.3. Category consolidation proposal

Đánh giá các chuyển đổi sau:

| Category hiện tại | Category mục tiêu | Product Type mục tiêu |
|---|---|---|
| V24K Dây Chuyền | Vàng 24K | Dây Chuyền |
| V24K Lắc Tay | Vàng 24K | Lắc Tay |
| V24K Nhẫn | Vàng 24K | Nhẫn |
| V24K Charm | Vàng 24K | Charm |
| V10K Khuyên Tai | Vàng 10K | Khuyên Tai |

Các chuyển đổi trên là đề xuất, cần xác minh từng sản phẩm thực tế trước khi chốt.

### Các trường hợp phải audit riêng

**Nhẫn Trơn**
- Không tự gộp vào Product Type Nhẫn.
- Xác minh đây là Category nghiệp vụ riêng hay chỉ là Product Type.
- Kiểm tra Price Mapping và logic tồn kho có phân biệt Nhẫn Trơn hay không.

**GRIF Kim Gia Bảo 24K**
- Xác minh đây là Category, dòng sản phẩm hay Product Type.
- Không tự chuyển sang Vàng 24K nếu chưa xác minh các logic nghiệp vụ liên quan.

**Quà Tặng 24K**
- Kiểm tra có nhiều loại sản phẩm khác nhau bên trong hay không.
- Không giả định toàn bộ đều là một Product Type.

**Bạc Tích Trữ và Bạc Trang Sức**
- Không gộp thành một Category nếu có sự khác biệt về nghiệp vụ, bảng giá hoặc cách quản lý tồn kho.

**Vàng Tích Trữ**
- Thuộc BTMH theo xác nhận.
- Kiểm tra có phụ thuộc bảng giá hoặc luồng giao dịch riêng không.

## 2.4. Categories được xác nhận loại bỏ khỏi mô hình mục tiêu

- Tranh
- Trang Sức
- Bạc

Audit số lượng sản phẩm, giao dịch và dependency trước khi đề xuất deprecate.

Không xóa dữ liệu hoặc Category trong giai đoạn audit.

---

# 3. Phase 0 – Pre-audit Readiness

Trước khi audit, thực hiện preflight checklist.

## 3.1. Repository and environment

Xác định:

- Repository và branch đang được audit.
- Commit hash hiện tại.
- Working tree có thay đổi chưa commit không.
- Các repo liên quan: Website, Admin, POS, backend/API, database migrations.
- Source code nào có trong workspace và source code nào không có.
- Environment đang kết nối: local, development, staging hay production.
- Database project/ref đang truy cập.
- Có quyền đọc schema, dữ liệu, function, trigger, view, RLS và migration history không.

Không giả định các ứng dụng đang dùng cùng một database hoặc cùng một bảng Category.

## 3.2. Database safety

Kiểm tra:

- Có backup gần nhất không.
- Backup có thể khôi phục không.
- Có staging database để thử migration không.
- Có dữ liệu giao dịch đang phát sinh liên tục không.
- Có migration đang pending không.
- Có các thay đổi schema chưa được đồng bộ giữa environments không.

Không chạy DDL/DML trong pre-audit.

Nếu cần lấy dữ liệu, ưu tiên SELECT và truy vấn read-only.

## 3.3. Data inventory

Thu thập:

- Tổng số Brand, Category, Product, SKU.
- Số lượng active/inactive/archived.
- Sản phẩm thiếu Brand hoặc Category.
- SKU thiếu Price Mapping.
- Category không có sản phẩm.
- Brand không có sản phẩm.
- Product Type hoặc category text đang được lưu ở nhiều nơi.
- Dữ liệu trùng tên, trùng slug, khác ID.

## 3.4. Source completeness

Phải xác nhận source code có đủ để audit các luồng:

- Admin Brand/Category/Product CRUD.
- Website danh sách sản phẩm và bộ lọc.
- POS Mua vào, Bán ra, Kho.
- Price Mapping.
- Reports, Excel và phiếu in.
- Backend API, RPC và SQL functions.

Nếu thiếu POS UI source hoặc một repo liên quan, ghi rõ phần chưa thể xác minh và yêu cầu cung cấp source.

### Phase 0 Deliverable

`PRE_AUDIT_READINESS_REPORT.md`

Báo cáo phải có:
- Repository/branch/commit.
- Environment/database.
- Source completeness.
- Database access completeness.
- Backup/restore readiness.
- Missing dependencies.
- Audit blockers.
- Các phần có thể audit ngay và các phần cần bổ sung.

Không chuyển sang kết luận kiến trúc nếu thiếu bằng chứng quan trọng.

---

# 4. Phase 1 – Current State Audit

## 4.1. Database schema

Audit các bảng liên quan:

- `brands`
- `categories`
- `products`
- `product_images`
- `gold_price_rows`
- `pos_skus`
- `pos_categories`
- Các bảng giao dịch mua/bán/kho.
- Các bảng lưu snapshot, lịch sử và báo cáo nếu có.

Tìm toàn bộ trường tương đương:

- `brand_id`
- `category_id`
- `product_type_id`
- `price_row_id`
- `category`
- `brand`
- `type`
- `purity`
- `gold_type`
- Các trường mapping khác.

Kiểm tra:

- Foreign keys.
- Unique constraints.
- Indexes.
- Triggers.
- SQL functions.
- Views.
- RLS policies.
- Realtime publications.
- RPC.
- Migration history.

Không chỉ tìm theo tên bảng đã biết. Phải tìm các reference thực tế trong toàn bộ schema.

## 4.2. Product data audit

Thống kê từng Category:

- Category ID, name, slug.
- Product count.
- Active/inactive count.
- Brand name và Brand ID.
- Số sản phẩm theo từng Brand.
- Số sản phẩm thiếu Brand.
- Số sản phẩm thiếu Category.
- SKU liên quan.
- Price Mapping liên quan.

Không chỉ báo cáo số lượng Brand bucket. Phải hiển thị đầy đủ từng Brand và số lượng sản phẩm.

Kiểm tra cả `brand_id IS NULL` riêng biệt.

## 4.3. CRUD flow audit

Trace toàn bộ:

UI → Component → Hook/ViewModel → API → Service/Query → Database.

Audit:

- Admin Brand CRUD.
- Admin Category CRUD.
- Admin Product CRUD.
- Form thêm/sửa sản phẩm.
- Brand filter.
- Category filter.
- Product Type hoặc phân loại tương đương.
- Validation khi chọn Brand và Category.
- Xử lý dữ liệu khi đổi Brand.
- Xử lý Category không còn phù hợp với Brand.

Ghi rõ file, function, API và table liên quan.

## 4.4. Price Mapping audit

Đây là hạng mục ưu tiên cao nhất.

Trace:

Product/SKU → Brand → Category → Purity/Gold Type → Price Row → Buy/Sell Calculation.

Kiểm tra:

- Cách tìm `price_row_id`.
- Có dùng Category ID/slug/name để tìm bảng giá không.
- Có dùng Brand để phân biệt bảng giá không.
- Có fallback khi không tìm được Price Row không.
- Có override giá sản phẩm không.
- Giá nào được snapshot vào giao dịch.
- Giá nào được tính lại theo bảng giá hiện tại.
- Category consolidation có thể khiến nhiều sản phẩm trỏ nhầm Price Row không.

Kiểm tra riêng:
- Vàng 24K.
- Vàng 10K.
- Vàng Thị Trường.
- Nhẫn Trơn.
- Vàng Tích Trữ.
- GRIF Kim Gia Bảo 24K.
- Bạc Tích Trữ.
- Bạc Trang Sức.

Không được dùng Category mới làm điều kiện thay thế cho Price Mapping cũ nếu chưa chứng minh tương đương.

## 4.5. POS and inventory audit

Trace các luồng:

- Mua vào.
- Bán ra.
- Đặt hàng.
- Đặt cọc.
- Nhập kho.
- Xuất kho.
- Điều chỉnh tồn kho.
- In tem.
- Quản lý SKU.
- Báo cáo.

Kiểm tra:
- Category có ảnh hưởng tới SKU không.
- SKU có lưu Category ID hay chỉ Product ID.
- Có bảng POS Category riêng không.
- POS có cache hoặc mapping riêng không.
- Các giao dịch cũ có snapshot thông tin sản phẩm không.
- Có logic hardcode theo Category hoặc Brand không.

Đặc biệt kiểm tra `price_row_id = NULL` ở các SKU còn bán được. Ghi nhận đây là vấn đề dữ liệu hiện hữu, không tự ý sửa trong dự án restructure.

---

# 5. Phase 2 – Business Mapping & Product Classification

## 5.1. Brand–Category mapping

Đối chiếu mapping nghiệp vụ tại mục 2 với database.

Xuất ma trận:

| Category | Expected Brands | Actual Brands | Product Count | Missing Brand Count | Status |
|---|---|---|---:|---:|---|

Trạng thái:
- Confirmed.
- Pending User Confirmation.
- Data Conflict.
- Missing Brand.
- Deprecated Candidate.

Không tự động cập nhật quan hệ.

## 5.2. Product Type mapping

Với từng sản phẩm thuộc các Category dự kiến gộp, xác định Product Type.

Ví dụ:
- V24K Dây Chuyền → Dây Chuyền.
- V24K Lắc Tay → Lắc Tay.
- V24K Nhẫn → Nhẫn.
- V24K Charm → Charm.
- V10K Khuyên Tai → Khuyên Tai.

Mỗi sản phẩm phải có:
- Product ID.
- Product name.
- Brand.
- Current Category.
- Proposed Category.
- Proposed Product Type.
- Evidence.
- Confidence/Status.

Phân loại:
- Can be mapped automatically.
- Requires user confirmation.
- Cannot be classified reliably.

Không tự suy luận từ tên nếu dữ liệu không đủ.

## 5.3. Naming normalization

Đánh giá tên Brand, Category, Product Type:

- Chữ hoa/thường.
- Dấu tiếng Việt.
- Khoảng trắng.
- Ký tự đặc biệt.
- Trùng tên khác ID.
- Trùng slug.
- Tên khác nhau nhưng cùng ý nghĩa nghiệp vụ.

Đề xuất chuẩn hóa Title Case.

Không đổi ID hoặc slug trong giai đoạn audit.

---

# 6. Phase 3 – Target Architecture Design

So sánh ít nhất ba phương án.

### Option A – Giữ mô hình hiện tại

- Brand và Category độc lập.
- Product tiếp tục tham chiếu Brand/Category.
- Product Type bổ sung riêng.

### Option B – Brand–Category nhiều-nhiều

- Có quan hệ Brand–Category.
- Một Category có thể dùng bởi nhiều Brand.
- Product tham chiếu Brand và Category.
- Product Type là phân loại riêng.

### Option C – Category hierarchy

- Category cấp cao.
- Subcategory/Product Type.
- Product tham chiếu cấu trúc phân cấp.
- Brand–Category có quan hệ nhiều-nhiều.

Với từng phương án, phân tích:

- Schema cần thay đổi.
- Tương thích dữ liệu hiện tại.
- Ảnh hưởng CRUD.
- Ảnh hưởng Price Mapping.
- Ảnh hưởng POS.
- Ảnh hưởng Website.
- Khả năng mở rộng.
- Độ phức tạp migration.
- Rủi ro rollback.

**Không mặc định chọn phương án có ít bảng nhất.** Ưu tiên mô hình rõ nghĩa nghiệp vụ, tránh trộn Category với Price Group hoặc Product Type.

Đề xuất phương án cuối cùng kèm lý do và bằng chứng.

---

# 7. Phase 4 – Dependency & Impact Assessment

Lập dependency matrix cho:

| Module | Current Dependency | Proposed Change | Impact | Required Action |
|---|---|---|---|---|
| Admin Brand | | | | |
| Admin Category | | | | |
| Admin Product | | | | |
| Website Product List | | | | |
| Website Category Filter | | | | |
| POS Purchase | | | | |
| POS Sales | | | | |
| POS Inventory | | | | |
| SKU/Label | | | | |
| Price Mapping | | | | |
| Reports/Excel | | | | |
| Receipts/Invoices | | | | |
| Realtime/Cache | | | | |

Mỗi dependency phải có evidence cụ thể.

Phân biệt:
- Verified.
- Partially Verified.
- Not Available.
- Unknown.

Không đánh dấu Verified nếu chỉ suy luận từ tên hoặc cấu trúc database.

---

# 8. Phase 5 – Migration Plan

Chuẩn bị migration proposal theo nguyên tắc additive-first.

Các bước đề xuất:

1. Backup schema và dữ liệu liên quan.
2. Kiểm tra khả năng restore backup trên staging.
3. Tạo schema bổ sung nếu được duyệt.
4. Tạo mapping Brand–Category.
5. Tạo Product Type mapping.
6. Backfill dữ liệu theo danh sách đã xác nhận.
7. Kiểm tra dữ liệu thiếu và dữ liệu không hợp lệ.
8. Chạy thử Price Mapping trên staging.
9. Chạy thử POS purchase/sales/inventory.
10. Chuyển Admin CRUD sang mô hình mới.
11. Chuyển Website và POS sang mô hình mới.
12. Theo dõi và đối chiếu dữ liệu.
13. Chỉ deprecate dữ liệu cũ khi toàn bộ consumer đã được xác nhận không còn sử dụng.

Mỗi bước cần:
- Precondition.
- SQL/script dự kiến.
- Expected result.
- Verification query.
- Failure handling.
- Rollback procedure.

Không xóa Category cũ ngay sau khi backfill.

Không thay đổi lịch sử giao dịch.

Không tạo lại SKU hoặc thay đổi mã hàng nếu không có yêu cầu riêng.

Không re-sync toàn bộ SKU chỉ vì Category thay đổi.

---

# 9. Phase 6 – Regression Plan

Phải có checklist kiểm thử tối thiểu:

### Admin
- Tạo/sửa/xóa Brand.
- Tạo/sửa/ẩn Category.
- Tạo/sửa sản phẩm.
- Brand filter.
- Category filter theo Brand.
- Product Type filter.
- Search và pagination.
- Dữ liệu cũ vẫn hiển thị đúng.

### Website
- Danh sách sản phẩm.
- Filter Brand.
- Filter Category.
- Filter Product Type.
- Search.
- Pagination.
- Category URL và slug.
- SEO metadata.
- Giá hiển thị.
- Realtime/cache.

### POS
- Mua vào.
- Bán ra.
- Đặt hàng/đặt cọc.
- Nhập/xuất kho.
- Điều chỉnh tồn.
- In tem.
- SKU mapping.
- Price Mapping.
- Reports và export.

### Price Calculation
- Vàng 24K.
- Vàng 10K.
- Vàng Thị Trường.
- Nhẫn Trơn.
- Vàng Tích Trữ.
- GRIF Kim Gia Bảo 24K.
- Bạc Tích Trữ.
- Bạc Trang Sức.

Kiểm tra cả trường hợp:
- Price Row tồn tại.
- Price Row không tồn tại.
- SKU không có Price Mapping.
- Product có override.
- Bảng giá thay đổi.
- Giao dịch cũ.

---

# 10. Required Deliverables

Tạo một bộ tài liệu audit riêng:

1. `PRE_AUDIT_READINESS_REPORT.md`
2. `CURRENT_SCHEMA_AND_DATA_AUDIT.md`
3. `BRAND_CATEGORY_MAPPING_MATRIX.md`
4. `PRODUCT_TYPE_CLASSIFICATION_MATRIX.md`
5. `PRICE_MAPPING_IMPACT_AUDIT.md`
6. `POS_INVENTORY_IMPACT_AUDIT.md`
7. `WEBSITE_ADMIN_DEPENDENCY_AUDIT.md`
8. `TARGET_ARCHITECTURE_PROPOSAL.md`
9. `MIGRATION_ROLLBACK_PLAN.md`
10. `REGRESSION_TEST_PLAN.md`
11. `OPEN_QUESTIONS_AND_DECISIONS.md`

Mỗi kết luận phải có bằng chứng:
- File path.
- Function/component.
- API/RPC.
- Table/column.
- Query hoặc dữ liệu cụ thể.

Nếu không xác minh được, ghi rõ lý do và phần cần bổ sung.

---

# 11. Implementation Gate

Không bắt đầu implementation cho đến khi:

- Pre-audit readiness được xác nhận.
- Source code và database scope đủ để đánh giá.
- Brand–Category mapping được đối chiếu.
- Product Type mapping được xác nhận.
- Price Mapping impact được làm rõ.
- POS/Inventory impact được làm rõ.
- Target Architecture được duyệt.
- Migration và rollback được duyệt.
- Regression checklist được duyệt.

Trong giai đoạn hiện tại:

**STRICT AUDIT ONLY**
- Không sửa code.
- Không sửa schema.
- Không chạy migration.
- Không INSERT/UPDATE/DELETE dữ liệu.
- Không đổi Category ID/slug.
- Không tạo Brand/Product Type.
- Không thay đổi API, UI hoặc logic hiện tại.

Chỉ đọc, phân tích, đối chiếu, lập báo cáo và đề xuất.

Nếu phát hiện lỗi dữ liệu hoặc lỗi logic hiện hữu, ghi nhận riêng thành Existing Issue. Không tự ý sửa trong phạm vi big change này.
