# Technical Review - Phân tích nguyên nhân Cache Egress tăng cao

## Background

Hiện tại hệ thống có các đặc điểm:

-   Database: Supabase (Free/Pro)
-   Storage: Supabase Storage
-   Ảnh upload được convert sang WebP (\~300--400KB)
-   Ảnh được truy cập thông qua `getPublicUrl()`
-   Frontend sử dụng SSE để cập nhật realtime dữ liệu
-   Khi nhận SSE chỉ refresh lại bảng giá, không reload toàn bộ dữ liệu

Mặc dù đã tối ưu kích thước ảnh và có cơ chế cache, nhưng **Cache Egress
vẫn tăng rất nhanh**, dẫn đến vượt quota của Supabase.

## Mục tiêu

Xác định nguyên nhân khiến Cache Egress tăng và đề xuất giải pháp tối ưu
cả về kiến trúc lẫn implementation.

## Các hạng mục cần kiểm tra

### 1. Kiểm tra chính sách Cache của Storage (Ưu tiên cao)

**Mục tiêu**

Xác nhận browser/CDN có thực sự cache ảnh hay không.

**Cần kiểm tra**

-   Cache-Control
-   ETag
-   Age
-   CF-Cache-Status
-   Content-Length

**Kỳ vọng**

``` text
Cache-Control: public, max-age=31536000, immutable
```

Nếu cache header chưa tối ưu, browser/CDN sẽ revalidate hoặc tải lại ảnh
thường xuyên mặc dù URL không thay đổi.

### 2. Kiểm tra React Render Cycle (Ưu tiên cao)

**Mục tiêu**

Đảm bảo việc cập nhật giá không làm Image Component bị mount lại.

**Kiểm tra**

-   Sau khi nhận SSE
-   Sau khi refetch bảng giá

Image component có:

-   remount không?
-   rerender không?
-   request ảnh mới không?

Đặc biệt kiểm tra:

-   key của component
-   React.memo
-   useMemo
-   useCallback (nếu cần)

### 3. Kiểm tra Network Request của ảnh

Quan sát khi:

-   Mở trang
-   Nhận SSE
-   Refresh bảng giá

Kiểm tra:

-   Có request mới tới file `.webp` hay không
-   Status Code
-   Size
-   From Memory Cache
-   From Disk Cache
-   From CDN

### 4. Đánh giá việc sử dụng ảnh theo từng màn hình

Đề xuất tạo nhiều kích thước:

``` text
thumbnail.webp (~20KB)
medium.webp (~80KB)
large.webp (~300KB)
```

  Màn hình    Ảnh nên dùng
  ----------- --------------
  Table       Thumbnail
  Danh sách   Medium
  Chi tiết    Large

### 5. Kiểm tra Lazy Loading

Đảm bảo Image Component sử dụng:

-   `loading="lazy"`
-   `decoding="async"`

### 6. Đánh giá lượng Traffic thực tế

Thống kê:

-   Số user online đồng thời
-   Số tab trung bình
-   Số ảnh mỗi trang
-   Kích thước trung bình mỗi ảnh

Ví dụ:

``` text
400KB/image
100 images/page
40MB/page
50 users
≈ 2GB cho một lần reload đồng thời
```

### 7. Kiểm tra Bot Traffic

Kiểm tra log để xác định bot crawl ảnh:

-   Googlebot
-   Bing
-   GPTBot
-   Ahrefs
-   Semrush

### 8. Kiểm tra Storage Usage và Cache Egress

Xác nhận chính xác metric đang tăng:

-   Storage Usage
-   Egress
-   Cache Egress

### 9. Đánh giá kiến trúc lưu trữ ảnh

Hiện tại:

``` text
Client
  │
  ▼
Supabase Storage
```

Đề xuất đánh giá:

``` text
Client
  │
  ▼
Cloudflare CDN
  │
  ▼
Cloudflare R2
```

Database vẫn sử dụng Supabase.

## Deliverables

Developer cần cung cấp:

1.  Screenshot Usage Dashboard (Storage/Egress/Cache Egress).
2.  Response Headers của request ảnh.
3.  Network Log khi mở trang, nhận SSE và cập nhật giá.
4.  React Profiler hoặc kết quả kiểm tra Image Component có
    remount/rerender.
5.  Thống kê số lượng ảnh, kích thước và request phát sinh.
6.  Đề xuất phương án tối ưu sau khi hoàn thành phân tích.

## Kỳ vọng

-   Xác định nguyên nhân chính làm tăng Cache Egress.
-   Đảm bảo cập nhật realtime không kéo theo việc tải lại static assets.
-   Tối ưu băng thông và chi phí vận hành.
-   Đề xuất kiến trúc lưu trữ phù hợp khi hệ thống mở rộng.
