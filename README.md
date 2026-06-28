## Thăng Long Kim Việt — demo site

### Chạy local (khuyến nghị)

Cài dependency và bật Express (router gọn: public / admin / api):

```bash
cd /Users/eco0692_anhnt/Documents/ThanhLongKimVietGold
npm install
npm start
```

Mặc định: `http://127.0.0.1:5190`

### Deploy — biến môi trường

- **Không commit** `.env` / `.env.local` (đã có trong `.gitignore`). Key thật chỉ đặt trên máy chủ hoặc tab *Environment variables* của nền tảng deploy.
- Sao chép `.env.example` → tạo `.env.local` trên máy dev; trên production thêm cùng tên biến trên host.
- **`GOLDAPI_KEY`**: bắt buộc nếu cần API giá vàng thế giới (`/api/world-xau-usd`, widget XAU/USD). Lấy key tại [goldapi.io/dashboard](https://www.goldapi.io/dashboard).
- **Supabase** (nếu dùng): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY` (hoặc bộ `SUPABASE_*` tương đương trong `.env.example`).

- `/` — Trang chủ (bảng giá đọc `data/gold-table.json` hoặc `localStorage` sau admin)
- `/gioithieu` — Giới thiệu (placeholder, header/footer giữ nguyên)
- `/sanpham` — Sản phẩm (danh sách mock từ `data/products.json` + `localStorage`)
- `/sanpham/gia-vang` — Giá vàng chi tiết (bảng + biểu đồ)
- `/admin` — Admin: **admin** / **tlkv_admin_2026** (demo, không bảo mật server)
- `/admin/news.html` — Admin News CMS (Editor.js + Supabase, xem mục **News CMS** bên dưới)
- `/tin-tuc` — Danh sách tin tức (lấy từ bảng `news` trên Supabase)
- `/tin-tuc/:slug` — Trang chi tiết bài viết (block renderer + SEO meta + JSON-LD)
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

- Admin lưu bảng giá (`tlkv_gold_table_v1`) và sản phẩm (`tlkv_products_v1`) trong **localStorage**; nút tải lại JSON xóa bản local tương ứng.
- `gia-vang-hom-nay.html` chuyển hướng tới `/sanpham/gia-vang`.

---

## News CMS (Tin tức)

Module CMS tin tức được tách rời, không ảnh hưởng module **Giá vàng** / **Sản phẩm**.
Toàn bộ nội dung lưu **JSON khối** (Editor.js) trên Supabase, render qua block-renderer.

### Cài đặt một lần

1. **Chạy SQL schema**: mở Supabase → SQL Editor → dán & RUN từng file:
   - `supabase/news-schema.sql` — tạo bảng `news`, `news_categories`, `news_tags`, `news_tag_relations`,
     `news_change_log`, indexes, triggers `updated_at` + `published_at`, RLS policies, và RPC `tlkv_news_increment_view`.
   - `supabase/news-storage.sql` — tạo bucket `news-media` (public read) cùng RLS cho storage.
   - **Quan trọng**: đổi email `tuananh18101@gmail.com` trong cả 2 file thành email admin thực tế của bạn (cùng email đang dùng ở `rls-admin-email.sql`).

2. Trên dashboard Supabase → **Storage** → mở bucket `news-media` để xác nhận đã có. Có thể tạo trước hai thư mục `thumbnails/` và `content/` (không bắt buộc — sẽ tự sinh khi upload).

3. Đăng nhập `/admin/news.html` bằng tài khoản admin (qua Supabase Auth). Vào tab **Tin tức** từ `/admin/` cũng được — chỉ là một link sang trang riêng.

### Cấu trúc thư mục (CMS)

```
/tin-tuc/
  index.html                         # listing shell
  chi-tiet.html                      # detail shell (SEO meta placeholders)

/css/
  news.css                           # public list + detail
  news-admin.css                     # admin dashboard

/js/news/                            # PUBLIC feature module
  news-api.js                        # Supabase data layer (list/detail/related/views)
  news-sanitize.js                   # inline HTML allow-list sanitizer
  news-renderer.js                   # JSON blocks → DOM (extensible registry)
  news-list-page.js                  # /tin-tuc controller (search/category/pager)
  news-detail-page.js                # /tin-tuc/:slug controller (SEO + breadcrumb + related)

/js/admin/                           # ADMIN feature module
  news-storage.js                    # Supabase Storage upload abstraction
  news-editor.js                     # Editor.js wrapper (block tools + image uploader)
  news-admin.js                      # CRUD controller (list / form / publish / search / paginate)

/admin/news.html                     # Admin entry (auth + dashboard shell)
/supabase/news-schema.sql            # PASTE INTO SUPABASE SQL EDITOR
/supabase/news-storage.sql           # PASTE INTO SUPABASE SQL EDITOR
```

### Frontend routes

- `GET /tin-tuc` → danh sách (hero featured + grid + pagination, có search & lọc chuyên mục).
- `GET /tin-tuc/:slug` → chi tiết. Slug bị validate `[a-z0-9-]{2..200}` ở Express; sai → 404 thật (không vào HTML shell).
- View counter: client gọi RPC `tlkv_news_increment_view(slug)` sau khi render xong (fire-and-forget).

### Lưu nội dung dạng JSON khối

`news.content` là JSONB, theo schema của Editor.js:

```json
{
  "time": 1758739200000,
  "version": "2.30.7",
  "blocks": [
    { "type": "header",    "data": { "text": "Tiêu đề chính", "level": 2 } },
    { "type": "paragraph", "data": { "text": "Nội dung… với <b>bold</b> và <a href=\"…\">link</a>" } },
    { "type": "list",      "data": { "style": "unordered", "items": ["Mục 1", "Mục 2"] } },
    { "type": "quote",     "data": { "text": "Trích dẫn", "caption": "Tác giả" } },
    { "type": "delimiter", "data": {} },
    { "type": "image",     "data": { "file": { "url": "https://…/news-media/content/…" }, "caption": "Ảnh minh hoạ" } },
    { "type": "embed",     "data": { "service": "youtube", "embed": "https://www.youtube.com/embed/…" } }
  ]
}
```

### Block renderer (mở rộng dễ)

Để thêm 1 block mới (vd: `callout`), chỉ cần:

```js
TLKVNewsRenderer.registerBlock("callout", function (data) {
  var el = document.createElement("div");
  el.className = "tlkv-news-block tlkv-news-callout";
  el.appendChild(TLKVNewsSanitize.sanitizeInline(data && data.text));
  return el;
});
```

…rồi đăng ký tool tương ứng trong `news-editor.js`. Không cần đụng controller list/detail.

### SEO

`/tin-tuc/:slug` chèn động `<title>`, `<meta description/keywords>`, đầy đủ Open Graph + Twitter,
`<link rel=canonical>`, JSON-LD `NewsArticle` + `BreadcrumbList`. Có sẵn `<noscript>` fallback và
`<meta name="robots" content="noindex">` khi bài không tồn tại (tránh đẩy URL rỗng lên index).

> Lưu ý: site hiện chưa SSR. Googlebot vẫn execute JS và đọc được meta + JSON-LD,
> nhưng nếu muốn snapshot HTML cho mạng xã hội (Facebook/Zalo) trong giây đầu thì có thể
> bổ sung Cloud Function/Vercel Edge prerender ở giai đoạn sau — kiến trúc data layer
> (`TLKVNewsAPI.getBySlug`) đã sẵn sàng cho server-side.

### Bảo mật

- RLS **bật** trên cả 4 bảng + change log. Anon chỉ `SELECT` được bài `status='published'`; admin email full quyền.
- Storage bucket `news-media` public read (để `<img src>` hoạt động không cần signed URL), nhưng INSERT/UPDATE/DELETE chỉ admin email.
- Trình renderer **không** chèn HTML thô — text chạy qua `TLKVNewsSanitize` (allow-list `<b/i/u/em/strong/mark/code/br/a/span>` với `rel="nofollow noopener noreferrer" target="_blank"` cho `<a>`).
- Slug bị validate cả ở client (regex), Express (regex 404), và DB (`unique`).
- Upload ảnh giới hạn 10 MB, chỉ MIME jpg/png/webp/gif/svg (bucket-level + client-side).

### Hiệu năng

- Listings dùng `range(from, to)` (LIMIT/OFFSET) với index `idx_news_status_published_at`.
- `count: 'exact'` chỉ chạy khi cần render pager (controller truyền `withCount`).
- Trigram indexes (`pg_trgm`) trên `title` và `short_description` để `ILIKE %q%` không full-scan.
- `<img loading="lazy" decoding="async">` mặc định cho mọi ảnh nội dung.
- Skeleton loaders trong khi fetch; CSS variables giữ tốc độ paint.
- Editor.js + plugins tải qua jsDelivr CDN, version pin để cache HTTP dài hạn.

### Audit log

Mọi thao tác create/update/delete/publish/unpublish được ghi vào `news_change_log` với:
`action`, `entity_name`, `entity_id`, `summary`, `payload (before/after)`, `actor_email`, `created_at`.
Có thể đọc về sau theo cùng pattern `TLKVAudit.fetchProductLog` để dựng tab lịch sử nếu cần.

### Mở rộng tương lai

- Thêm bảng `news_tag_relations` đã có sẵn → bật UI gắn tag là dùng được.
- Bật `pg_trgm` trên `news` đã cho phép viết RPC `search_news(q, page)` chạy server-side (FTS) nếu site lớn lên.
- Có thể chuyển Editor.js → Tiptap mà không phải đổi schema: chỉ cần adapter trong `news-editor.js` và thêm các block tương ứng vào `TLKVNewsRenderer._registry`.
