## Thăng Long Kim Việt — demo site

### Chạy local (khuyến nghị)

Cài dependency và bật Express (router gọn: public / admin / api):

```bash
cd /Users/eco0692_anhnt/Documents/ThanhLongKimVietGold
npm install
npm start
```

Mặc định: `http://127.0.0.1:5190`

- `/` — Trang chủ (bảng giá đọc `data/gold-table.json` hoặc `localStorage` sau admin)
- `/gioithieu` — Giới thiệu (placeholder, header/footer giữ nguyên)
- `/sanpham` — Sản phẩm (danh sách mock từ `data/products.json` + `localStorage`)
- `/sanpham/gia-vang` — Giá vàng chi tiết (bảng + biểu đồ)
- `/admin` — Admin: **admin** / **tlkv_admin_2026** (demo, không bảo mật server)
- `/api/gold-table`, `/api/products` — JSON (đọc file trong `data/`)

Cấu trúc route server xem `server.js` và thư mục `routes/` (`web.js`, `admin.js`, `api.js`).

Đường dẫn cũ `/gioi-thieu/`, `/san-pham/`, `/san-pham/gia-vang.html` được redirect 301 sang URL mới.

### Chỉ dùng `python3 -m http.server`

Vẫn chạy được nếu mở từ **gốc site** (để các URL tuyệt đối `/js/`, `/data/` hoạt động):

```bash
python3 -m http.server 5173
```

Mở `http://localhost:5173/`. Trang `/gioithieu` cần server có hỗ trợ rewrite (Python simple server **không** có route `/gioithieu` → file); khi đó dùng `npm start` hoặc mở file tương ứng trong thư mục.

### Ghi chú

- CSS giao diện một phần từ [baotinmanhhai.vn](https://baotinmanhhai.vn/).
- Admin lưu bảng giá (`tlkv_gold_table_v1`) và sản phẩm (`tlkv_products_v1`) trong **localStorage**; nút tải lại JSON xóa bản local tương ứng.
- `gia-vang-hom-nay.html` chuyển hướng tới `/sanpham/gia-vang`.
