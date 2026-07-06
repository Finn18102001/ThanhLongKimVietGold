# Technical Review - Investigation Direction Adjustment

## Background

Sau khi review thêm thông tin từ frontend và kết quả trên Chrome
DevTools, cần điều chỉnh hướng điều tra để tập trung vào các nguyên nhân
có khả năng gây ra Cache Egress cao thay vì giả định nguyên nhân đến từ
Image Storage.

------------------------------------------------------------------------

## 1. Tạm thời giảm mức độ nghi ngờ đối với Image Storage

Đã xác nhận:

-   Ảnh được convert sang WebP (\~300--400KB).
-   Sử dụng `getPublicUrl()`, không phải Signed URL.
-   Chrome DevTools cho thấy phần lớn request ảnh được lấy từ **Disk
    Cache**, chỉ có một số request nhận **304 Not Modified** trước khi
    sử dụng cache.

Điều này cho thấy browser cache đang hoạt động tương đối đúng.

Với quy mô hiện tại:

-   Khoảng 4 người dùng nội bộ.
-   Không có lượng truy cập lớn từ bên ngoài.
-   Chỉ có một số banner và hình ảnh dung lượng lớn.

**Kết luận tạm thời**

Chưa có đủ bằng chứng để khẳng định Image Storage là nguyên nhân chính
tạo ra khoảng **25GB Cache Egress trong vòng 10 ngày**.

------------------------------------------------------------------------

## 2. Chuyển trọng tâm sang Data Egress

Hệ thống đang sử dụng **SSE (Server-Sent Events)** để đồng bộ dữ liệu
realtime.

Điều cần xác minh không phải là:

> SSE có tiêu tốn RAM hay không?

Mà là:

> Sau mỗi SSE Event, hệ thống đang phát sinh những request nào và tổng
> dung lượng dữ liệu truyền đi là bao nhiêu.

Ví dụ:

``` text
Admin cập nhật dữ liệu

↓

SSE Broadcast

↓

Frontend nhận Event

↓

Refetch API

↓

Payload bao nhiêu KB?

↓

Một ngày lặp lại bao nhiêu lần?
```

Nếu mỗi Event đều kéo theo việc refetch payload lớn thì tổng Data Egress
hoàn toàn có thể tăng rất nhanh mặc dù số lượng user không nhiều.

------------------------------------------------------------------------

## 3. Investigation tập trung vào Request Pattern

Cần thống kê:

### API được gọi sau mỗi SSE Event

Ví dụ:

-   Endpoint
-   Response Size
-   Request Frequency

Mục tiêu:

-   API nào được gọi nhiều nhất.
-   Response trung bình bao nhiêu KB.
-   Tổng dung lượng truyền tải mỗi ngày.

------------------------------------------------------------------------

## 4. Phân tích Payload

Không chỉ xem số lượng request.

Quan trọng hơn là:

``` text
Request Frequency

×

Average Response Size
```

Ví dụ:

``` text
300KB

×

10.000 request

≈ 3GB
```

Đây mới là chỉ số cần tối ưu.

------------------------------------------------------------------------

## 5. Review Implementation của SSE

Cần xác nhận:

-   SSE chỉ dùng để notify?
-   Có invalidate toàn bộ React Query hay không?
-   Có refetch toàn bộ bảng giá sau mỗi Event hay không?
-   Có thể patch local state thay vì refetch không?

Mục tiêu:

Một Event thực tế tạo ra bao nhiêu traffic.

------------------------------------------------------------------------

## 6. Xác minh đúng loại Usage trên Supabase

Cần kiểm tra chính xác dashboard:

-   Storage Usage
-   Storage Egress
-   Cache Egress
-   Database Egress
-   Realtime Usage (nếu có)

Nếu chưa xác định đúng metric thì chưa thể kết luận nguyên nhân.

------------------------------------------------------------------------

# Action Items

## Priority 1

Kiểm tra Supabase Usage Dashboard.

**Deliverables**

-   Screenshot Usage Dashboard.
-   Breakdown từng loại Usage.

------------------------------------------------------------------------

## Priority 2

Thống kê toàn bộ API được gọi khi website hoạt động.

Bao gồm:

-   Endpoint
-   Response Size
-   Request Count
-   Tổng Bandwidth

------------------------------------------------------------------------

## Priority 3

Review luồng SSE.

Mục tiêu:

-   Một Event sinh ra bao nhiêu API.
-   Có đang refetch dư thừa hay không.
-   Có thể patch local state thay vì refetch.

------------------------------------------------------------------------

## Priority 4

Sau khi loại trừ Data Layer mới tiếp tục tối ưu Image Layer.

Bao gồm:

-   Thumbnail.
-   Lazy Loading.
-   Cache Header.
-   Multi-size Images.
-   CDN Strategy.

------------------------------------------------------------------------

# Kết luận

Từ những dữ liệu hiện tại, chưa có đủ bằng chứng để kết luận Image
Storage là nguyên nhân chính gây ra mức Cache Egress khoảng **25GB trong
10 ngày**.

Ưu tiên investigation nên chuyển sang **Data Layer**, tập trung vào:

-   Tần suất request sau mỗi SSE Event.
-   Kích thước payload của các API.
-   Loại Usage thực tế đang tăng trên Supabase.

Sau khi có các số liệu này, nhóm có thể xác định chính xác thành phần
gây phát sinh chi phí và đề xuất phương án tối ưu phù hợp.
