# TLKV Website — Feature Map

> **Phạm vi:** Website công khai + Admin CMS (Express + vanilla JS).  
> **Không phải** bản đồ POS Next.js (`src/modules/*`) — POS dùng `docs/SYSTEM_DEVELOPMENT_RULES.md` + module isolation.  
> **Nguồn:** inventory source 2026-11-26. Không suy đoán path.  
> **Harness:** `ENGINEERING-PLAYBOOK.md` + `.cursor/rules/tlkv-quality-first.mdc`.  
> **DB chung Website/POS:** mọi thay đổi schema/table dùng chung → bắt buộc đánh giá impact POS trước khi code.

---

## 0. Cách dùng map này (Agent)

| Nhu cầu | Làm gì |
|---|---|
| Bug “tính năng X hỏng” | Mục **§5 Bug → Code** → mở file Primary → reproduce → fix nhỏ nhất → verify theo **§6** |
| Thêm/sửa UI public | Mục **§1 Navigation** + **§2 Module** + selectors **§3** |
| Thêm/sửa API | Mục **§2** cột API + `routes/*` |
| Cache / egress | `rule-and-technical/*` + `lib/http-cache.js` |
| POS task | **Không** dùng file này — dùng `docs/SYSTEM_DEVELOPMENT_RULES.md` |

**Understand Anything:** phù hợp để sinh Knowledge Graph / Dashboard (`.understand-anything/`) như lớp tra cứu phụ. **Không thay** file Markdown này. Hiện repo chưa có graph commit sẵn — chạy `/understand` khi cần deep architecture, không bắt buộc mỗi bugfix.

---

## 1. Feature Navigation (URL → shell)

Local mặc định: `npm start` → `http://127.0.0.1:5190` (`server.js`, `PORT` hoặc 5190+).

| Feature | URL sạch | HTML shell | Router |
|---|---|---|---|
| Trang chủ | `/` | `index.html` | `routes/web.js` |
| Giới thiệu | `/gioithieu` | `gioi-thieu/index.html` | `routes/web.js` |
| Vàng trang sức (catalog) | `/sanpham/vang-trang-suc` | `san-pham/index.html` | `routes/web.js` |
| Vàng tích lũy | `/sanpham/vang-tich-luy` | `san-pham/vang-tich-luy.html` | `routes/web.js` |
| Giá vàng chi tiết | `/sanpham/gia-vang` | `san-pham/gia-vang.html` | `routes/web.js` |
| Danh mục SP | `/sanpham/danh-muc/:categorySlug` | `san-pham/index.html` | `routes/web.js` |
| Chi tiết SP | `/sanpham/:categorySlug/:productSlug` | `san-pham/chi-tiet.html` | `routes/web.js` |
| Thương hiệu | `/thuong-hieu/:brandSlug` | `thuong-hieu/index.html` | `routes/web.js` |
| Tin tức landing | `/tin-tuc` | `tin-tuc/index.html` | `routes/web.js` |
| Tin tức danh sách | `/tin-tuc/danh-sach` | `tin-tuc/danh-sach.html` | `routes/web.js` |
| Tin tức chi tiết | `/tin-tuc/:slug` | `tin-tuc/chi-tiet.html` | `routes/web.js` |
| TV bảng giá | `/tv-model` | `tv-model.html` | `routes/web.js` |
| Admin (giá + catalog) | `/admin` | `admin/index.html` | `routes/admin.js` |
| Admin News CMS | `/admin/news`, `/admin/news/new`, `/admin/news/edit/:id` | `admin/news.html` | `routes/admin.js` |

**Redirects quan trọng (đừng “sửa URL” lung tung):**

- `/sanpham` → 301 `/sanpham/vang-tich-luy`
- `/gioi-thieu` → `/gioithieu`; `/san-pham/*` legacy → `/sanpham/*`
- `/tin-tuc/thi-truong` → `/tin-tuc/danh-sach`
- `gia-vang-hom-nay.html` (file gốc) chuyển hướng tới giá vàng (xem README)

**Mount order** (`routes/index.js`): `/api` → `/admin` → `/` (web) → static.

---

## 2. Module Mapping

### 2.1 Server / API

| Module | Trách nhiệm | Files | Endpoints / notes |
|---|---|---|---|
| Boot | Express entry | `server.js` | Listen `PORT` / 5190 |
| Route registry | Mount + boot env JS | `routes/index.js` | `/js/boot-supabase-env.js`, `/js/gold-data.js`, `/js/tv-gold-board.js` (no-store) |
| Web pages | HTML sạch | `routes/web.js` | Bảng §1 |
| Admin static | CMS shells | `routes/admin.js` | `/admin/*` |
| API core | Health + JSON file fallback | `routes/api.js` | `GET /api/health/supabase-products`, `GET /api/gold-table`, `GET /api/products` |
| Public CDN reads | Cache-friendly proxy | `routes/api-public.js` | `GET /api/public/brands`, `/news`, `/news/hero`, `/news/version` |
| News image upload | Authenticated upload | `routes/api-news-image.js` | `POST` (mounted under `/api`) |
| Product image upload | Authenticated upload | `routes/api-product-image.js` | `POST` (mounted under `/api`) |
| HTTP cache helpers | Cache-Control / version | `lib/http-cache.js`, `lib/immutable-cache.js` | Dùng bởi public API |
| Supabase env helpers | Public URL/key | `lib/supabase-public-env.js`, `lib/supabase-public-defaults.js` | Inject qua boot script |

### 2.2 Client — public

| Module | Global / entry | Files chính | Data / events |
|---|---|---|---|
| Supabase client | `TLKVSupabase` | `js/tlkv-supabase-client.js`, `js/supabaseClient.js`, `js/boot-supabase-env.js` | Env từ server inject — **không hardcode key trong docs** |
| Site nav / mobile menu | — | `js/site-nav.js` | `#mb-menu`, `.header-gr-item`, `.menu-mb-section` |
| Hero slider | — | `js/hero-slider.js` | Homepage |
| Skeleton | — | `js/tlkv-skeleton.js`, `css/tlkv-skeleton.css` | Loading shape |
| Image CDN | — | `js/image-cdn.js`, `lib/image-cdn.js` | `NEXT_PUBLIC_IMAGE_CDN` |
| Gold table (public) | `TLKVGold` | `js/gold-data.js`, `js/gold-pricing-layout.js` | Storage `tlkv_gold_table_v1`; events `tlkv:gold-table-changed`, `tlkv:gold-rows-updated`, `tlkv:gold-push-ui` |
| World / XAU | — | `js/world-gold-xau.js` | Bổ sung giá |
| TV board | — | `js/tv-gold-board.js` | `/tv-model` only |
| Catalog API | `TLKVCatalogApi` (pattern) | `js/products/catalog-api.js` | Session cache; listen `tlkv:brands-changed`, `tlkv:products-changed` |
| Catalog pages | — | `catalog-page.js`, `catalog-filters.js`, `catalog-archive.js`, `brand-page.js`, `vang-tich-luy-page.js`, `product-detail-page.js` | Shells `san-pham/*`, `thuong-hieu/*` |
| Product cards / price | — | `product-card.js`, `product-card-layout.js`, `product-grid.js`, `product-price-engine.js`, `constants.js` | Giá derived từ gold rows |
| Featured home | — | `featured-products-section.js`, `brand-section.js` | Homepage sections |
| Legacy products JSON | `TLKVProducts` | `js/products-data.js` | `data/products.json` + localStorage (admin tab cũ vẫn tham chiếu) |
| News API / pages | `TLKVNews*` | `js/news/news-api.js`, `news-list-page.js`, `news-detail-page.js`, `news-home-preview.js`, `news-renderer.js`, `news-sanitize.js`, `news-prefetch.js` | Event `tlkv:news-changed`; sanitize bắt buộc trước render |
| Analytics | — | `js/vercel-analytics.js` | Vercel |

### 2.3 Client — Admin CMS

| Module | Global | Files | UI entry |
|---|---|---|---|
| Admin shell / gold CRUD | — | `js/admin-app.js` | `/admin` — `#login-panel`, `#admin-panel`, tabs gold/products |
| Admin access split | `TLKVAdminAccess` | `js/admin/admin-access.js` | Email-based tab visibility (UI-only, không RBAC POS) |
| Audit log | `TLKVAudit` | `js/admin-audit.js` | Gold/product change history |
| Catalog admin | `TLKVCatalogAdmin` | `js/admin/catalog-admin.js` | Tab sản phẩm |
| Product form | `TLKVProductFormAdmin` | `js/admin/product-form-admin.js`, `product-storage.js` | CRUD product |
| Product CRUD helper | — | `js/products/product-crud.js` | Shared write helpers |
| News admin | — | `js/admin/news-admin.js`, `news-editor.js`, `news-form-lifecycle.js`, `news-storage.js` | `/admin/news*` |
| Styles | — | `admin/admin.css`, `css/*`, `local.css` | — |

### 2.4 Database (Website-facing SQL)

| Concern | Schema / SQL files | Tables / RPC (tên trong SQL) | POS impact? |
|---|---|---|---|
| News CMS | `supabase/news-schema.sql`, `news-storage.sql`, `news-detail-lookup-index.sql` | `news`, `news_categories`, `news_tags`, …; RPC `tlkv_news_increment_view`; bucket `news-media` | Thấp (POS ít dùng news) |
| Products catalog | `supabase/products-catalog-schema.sql`, `products-*.sql`, `products-storage.sql` | `products`, `brands`, … | **Cao** — POS catalog/POS big-update cũng đụng |
| Gold price rows | `supabase/gold-*.sql` | `gold_price_rows` (+ meta/version) | **Cao** — POS pricing / P9 |
| Admin RLS email | `supabase/rls-admin-email.sql`, `tlkv-admin-rls.sql` | `tlkv_is_admin` pattern | Trung bình — email allowlist |
| Audit | `supabase/admin-change-history.sql` | Change history | Thấp–trung bình |
| Data API GRANT | `supabase/data-api-grants.sql` + SYSTEM_DEVELOPMENT_RULES §32.1 | — | **Bắt buộc** khi CREATE/ALTER |

Static fallback JSON: `data/gold-table.json`, `data/products.json`.

---

## 3. Element Selection (UI → handler)

### 3.1 Public chrome

| Element / selector | Vai trò | Xử lý |
|---|---|---|
| `#mb-menu` | Mobile menu panel | `js/site-nav.js` |
| `.header-gr-item > a.nav-link[href="/sanpham"]` | Mega menu Sản phẩm (desktop) | `js/site-nav.js` |
| `.menu-mb-section > li` / `.has-sub > a` | Mobile accordion | `js/site-nav.js` |
| `.mega-subs-title` | Mega submenu titles | `js/site-nav.js` |

### 3.2 Admin `/admin`

| Element id | Vai trò | Xử lý |
|---|---|---|
| `#login-panel`, `#login-form`, `#login-user`, `#login-pass` | Supabase password login | `js/admin-app.js` + `TLKVAdminAccess` |
| `#admin-panel`, `#btn-logout`, `#btn-change-password` | Shell sau login | `js/admin-app.js` |
| `#tab-btn-gold`, `#tab-btn-products`, `#tab-btn-news` | Tab switch / link News | `js/admin-app.js`, `admin-access.js` |
| `#admin-tab-gold`, `#meta-form`, `#row-form`, `#admin-rows` | CRUD bảng giá | `js/admin-app.js` + `TLKVGold` |
| `#btn-gold-thay-doi`, `#btn-export-excel` | Commit thay đổi / export | `js/admin-app.js` |
| `#gold-hist-search`, `#gold-history-rows`, `#gold-hist-pagination` | Lịch sử giá | `js/admin-app.js` + `TLKVAudit` |
| `#btn-reset-json` | Clear local gold cache | `js/admin-app.js` → `TLKVGold.clearStorage` |

News admin selectors nằm trong `admin/news.html` + `js/admin/news-*.js` (SPA hash/path trên cùng shell).

### 3.3 Custom events (cross-module)

| Event | Khi nào | Ai listen |
|---|---|---|
| `tlkv:gold-table-changed` | Meta/table remount | UI giá, derived pricing |
| `tlkv:gold-rows-updated` | Rows realtime/push | Product cards price patch |
| `tlkv:gold-push-ui` | Push UI hint | Gold layout |
| `tlkv:brands-changed` | Admin brand write | `catalog-api.js` clear cache |
| `tlkv:products-changed` | Admin product write | `catalog-api.js` clear cache |
| `tlkv:news-changed` | News write | News clients |

---

## 4. Shortcuts / lệnh kích hoạt

| Mục đích | Lệnh / đường |
|---|---|
| Chạy Website local | `npm start` (hoặc `npm run serve`) → `:5190` |
| Chỉ static (hạn chế route sạch) | `python3 -m http.server 5173` từ root — **không** đủ rewrite `/gioithieu` |
| POS Next (cùng repo) | `npm run dev` → `:3000` — xem `docs/pos-big-update/POS-DEV-BUILD.md` |
| Unit test Website | `node --test tests/` (thư mục `tests/` **chưa có** trong tree hiện tại — tạo khi có logic cần cover) |
| Lint | `npm run lint` |
| Env mẫu | `.env.example` → `.env.local` (không commit secret) |
| Deploy ignore | `.vercelignore`, `vercel.json` |

Không có keyboard shortcut product riêng ngoài browser defaults; admin kích hoạt qua click tab / form submit.

---

## 5. Bug → Code Mapping

| Triệu chứng (ví dụ) | Module | Đọc / sửa trước | Verify |
|---|---|---|---|
| Trang chủ không load / 404 route | Web router | `routes/web.js`, `routes/index.js`, `server.js` | `curl -I http://127.0.0.1:5190/` |
| Nav / mobile menu hỏng | Site nav | `js/site-nav.js`, `index.html` header | DevTools click `#mb-menu` |
| Bảng giá sai / không realtime | Gold | `js/gold-data.js`, `js/gold-pricing-layout.js`, SQL `supabase/gold-*.sql` | Network + `tlkv:gold-rows-updated`; **impact POS pricing** |
| TV board trắng | TV | `tv-model.html`, `js/tv-gold-board.js` | `/tv-model` no-store |
| Catalog / brand / detail sai | Products | `js/products/catalog-*.js`, `product-detail-page.js`, `brand-page.js` | `/sanpham/...`; cache sessionStorage |
| Giá card SP không theo giá vàng | Price engine | `product-price-engine.js` + listen gold events | Đổi giá admin → card update |
| Tin list/detail / SEO | News | `js/news/*`, `tin-tuc/*.html`, `supabase/news-schema.sql` | `/tin-tuc`, slug regex trong `web.js` |
| Admin không vào / tab ẩn | Admin access | `js/admin/admin-access.js`, `js/admin-app.js` | Login `/admin` |
| Lưu giá vàng fail | Admin gold + RLS | `admin-app.js`, `gold-data.js`, RLS SQL | Console + Supabase logs |
| Upload ảnh news/product fail | Upload routes | `routes/api-news-image.js` / `api-product-image.js`, storage SQL | Network POST `/api/...` |
| Public API không cache / egress | Cache | `routes/api-public.js`, `lib/http-cache.js`, `rule-and-technical/*` | Response `Cache-Control` |
| Boot thiếu Supabase URL trên browser | Env inject | `routes/index.js` (`/js/boot-supabase-env.js`), `.env.local` | View-source boot script |

---

## 6. Testing Guide

### 6.1 Unit / Integration (Node)

| Area | File / lệnh | Ghi chú |
|---|---|---|
| Runner (playbook) | `node --test tests/` | `ENGINEERING-PLAYBOOK.md` §4 |
| Pattern được nêu trong playbook | `tests/product-price-engine.test.js` | **Hiện chưa có file trong repo** (2026-11-26) — khi thêm logic thuần / bugfix phải tạo `tests/<chu-de>.test.js` theo pattern đó |
| Trạng thái verified | — | Chưa chạy được suite vì thiếu `tests/` — ghi nhận gap; không bịa test path |

### 6.2 Self-test thủ công (Website)

1. `npm start` → mở `/`, `/sanpham/gia-vang`, `/sanpham/vang-tich-luy`, `/tin-tuc`, `/tv-model`.
2. Admin: `/admin` → login → sửa 1 dòng giá → reload public → giá đổi; tab khác cùng account không bị ảnh hưởng ngoài phạm vi Website.
3. News: `/admin/news` → draft/publish → `/tin-tuc/:slug`.
4. Cache: DevTools → `/api/public/brands` hoặc `/api/public/news` có `Cache-Control` (trừ bypass).

### 6.3 DevTools / Browser

| Mục | Cách |
|---|---|
| UI layout / selector | Snapshot + click thật trên `#…` trong §3 |
| Network | Xác nhận endpoint §2.1; không gọi `select=*`` thừa |
| Storage | `sessionStorage` / `localStorage` keys `tlkv_*_vN` |
| Auth admin | Application → cookies/session Supabase sau login `/admin` |
| Hard-test POS | **Khác port/flow** — `docs/pos-big-update/POS-DEV-BUILD.md` + rule `tlkv-devtools-hardtest.mdc` |

---

## 7. Out of scope (cố ý)

| Khu vực | Ghi chú |
|---|---|
| `src/modules/*`, `src/app/(admin)/*` | POS Next — Feature Map riêng không tạo trong task này |
| `docs/pos-big-update/*` | POS big update SRS |
| Multi-Agent / rewrite kiến trúc | Cấm theo harness Quality First |
| Đổi Auth Dashboard / production schema | Chỉ khi có yêu cầu + §32.1 |

---

## 8. Maintenance

Khi thêm feature Website:

1. Cập nhật hàng trong §1 (URL), §2 (module), §3 (selector nếu UI), §5–§6 (bug/test).
2. Giữ naming `TLKV*`, `tlkv:*`, `tlkv_*_vN` (`ENGINEERING-PLAYBOOK.md` §2.1).
3. Nếu chạm table dùng chung POS → ghi rõ **POS impact** trong PR/báo cáo.
