# Website UI cache / version audit (Business Audit v2 §15)

> Phạm vi: nhánh **main** — website Express (`server.js` / Vercel), không phải POS Next.js.
> Nguồn đặc tả: [`TLKV_POS_Label_Two_Modes_Business_Audit_v2.md`](./TLKV_POS_Label_Two_Modes_Business_Audit_v2.md) mục **15**.

## Kết luận ngắn

| Hạng mục | Trạng thái trước sửa | Sau sửa trên main |
|---|---|---|
| Framework / bundle | Express static HTML/CSS/JS (không content-hash) | Giữ nguyên; dùng `?v=` + Cache-Control |
| Logo version trung tâm | `js/products/constants.js` = `20261114e` | Thêm `lib/ui-asset-version.js` = `20261114e` |
| Google legacy logo 301 (`vercel.json`) | **Lệch** → `?v=20261112a` | Đồng bộ → `?v=20261114e` |
| Express legacy logo 301 (`routes/web.js`) | Đúng `20261114e` | Đọc từ `lib/ui-asset-version.js` |
| `site.webmanifest` icons | **Lệch** `20261112a` | Đồng bộ `20261114e` |
| HTML Cache-Control | Thiếu trên hầu hết entry | `public, max-age=0, must-revalidate` |
| CSS/JS Cache-Control | Không đặt | `public, max-age=3600, must-revalidate` |
| Ảnh `/assets/*` | `immutable` 1 năm | Giữ nguyên (bust bằng `?v=`) |
| Service Worker / PWA worker | Không có | Không thêm |
| POS label 2 modes | Không nằm trên main (nhánh `Finn/New/POS-Future`) | Ngoài phạm vi website |

## Cơ chế hiện tại (evidence)

1. **Logo/favicon/OG/hero:** query version `?v=20261114e` trong HTML + `TLKV_LOGO_ASSET_VERSION` trong `js/products/constants.js`.
2. **API public JSON:** `lib/http-cache.js` → header `X-TLKV-Cache-Version` từ env `PUBLIC_CACHE_VERSION` / `TLKV_PUBLIC_CACHE_VERSION` (khác với logo UI version).
3. **Google / URL logo cũ:** 301 trong `vercel.json` (edge) và `routes/web.js` (origin) về mark/OG mới kèm `?v=`.
4. **Không có Service Worker** — không cần activate/cleanup cache worker.

## Checklist §15.3 (website)

- [x] Framework/build: Express + static files; không hashed bundle.
- [x] HTML entry + Cache-Control: đã đặt `max-age=0, must-revalidate`.
- [x] CSS/JS: URL cố định + query version trên HTML; header `must-revalidate`.
- [x] Version thủ công: nguồn trung tâm `lib/ui-asset-version.js` / `constants.js`.
- [x] Không tạo cơ chế version thứ hai chồng chéo lên content-hash.
- [x] Font/logo/icon: logo/OG/favicon dùng `?v=`; ảnh assets `immutable`.
- [x] CDN/Vercel: headers trong `vercel.json` + origin Express.
- [x] Không có Service Worker.
- [x] HTML mới tham chiếu đúng `?v=20261114e` (đã có trên các trang chính).
- [x] Nhận biết release: commit SHA + `TLKV_UI_ASSET_VERSION`.
- [x] Tách phạm vi website vs POS.

## Hard-test bắt buộc sau deploy

| ID | Kiểm tra |
|---|---|
| CACHE-GOOGLE-01 | `GET /assets/logo-thang-long-kim-viet.png` → 301 Location có `?v=20261114e` |
| CACHE-GOOGLE-02 | `GET /assets/og-logo-256.png` → 301 Location `og-logo-tlkv-red-v2.png?v=20261114e` |
| CACHE-HTML-01 | `GET /` → `Cache-Control: public, max-age=0, must-revalidate` |
| CACHE-HTML-02 | Body HTML chứa logo/favicon `?v=20261114e` |
| CACHE-MANIFEST-01 | `/site.webmanifest` icons dùng `20261114e` |

## Quy tắc task UI website sau này

Khi đổi UI/logo: bump `TLKV_UI_ASSET_VERSION`, đồng bộ `constants.js`, HTML `?v=`, `site.webmanifest`, `vercel.json` redirects, rồi hard-test bảng trên. Không chỉ hard refresh máy developer.
