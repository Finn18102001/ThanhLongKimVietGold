# Cổng local: Website vs POS

Hai app chạy **cùng repo**, **khác cổng**. Đừng test website trên 3000 và đừng mở POS trên 5190.

| App | Lệnh | Cổng | URL | Dùng cho |
|-----|------|------|-----|----------|
| **Website** (Express, catalog, bảng giá, `/admin` sản phẩm) | `npm start` | **5190** | http://127.0.0.1:5190 | Trang chủ, `/sanpham`, `/admin` (tab Giá vàng / Sản phẩm / Tin tức) |
| **POS / admin Next.js** (bán hàng, kho, HĐ, KH) | `npm run dev` | **3000** | http://localhost:3000 | `/pos`, `/products`, `/inventory`, `/invoices`, `/login` |

Nếu 5190 đang bận, Express tự thử **5191, 5192**, … (tối đa 25 cổng). Log khi start ghi đúng URL, ví dụ `TLKV site: http://127.0.0.1:5191`. Không có route website `/1/2` — đó là các cổng fallback, không phải path.

## Kiểm tra nhanh

- Website admin sản phẩm (dòng bảng giá, `price_source`): http://127.0.0.1:5190/admin
- POS: http://localhost:3000/pos
- Đăng nhập website `/admin` và POS `/login` đều dùng Supabase Auth (cùng user), nhưng **session cookie khác origin/port**.

## Không nhầm

1. Form **Thêm/Sửa sản phẩm + Dòng bảng giá** nằm ở website `/admin` (cổng 5190), không phải trang placeholder cũ trên POS.
2. POS cổng 3000 có menu Sản phẩm tại `/products` (Next.js). Đó là catalog POS, không thay Express `/admin`.
3. Khi debug giá homepage / thẻ sản phẩm, mở cổng **5190**, không phải 3000.
