# TLKV Engineering Playbook

> Quy chuẩn bắt buộc cho **mọi task, bug, refactor** trên repo này.
> Tham khảo khung [Microsoft Code-With Engineering Playbook](https://github.com/microsoft/code-with-engineering-playbook),
> điều chỉnh cho stack thực tế: **Express + vanilla JS + Supabase + Vercel**.
>
> Nguyên tắc gốc: *chất lượng và độ chính xác quan trọng hơn "làm cho xong"*.
> Nếu playbook sai hoặc thiếu — sửa playbook, đừng lách nó.

---

## 0. Bản đồ dự án (đọc trước khi làm bất cứ gì)

Kiến trúc chia 7 layer (theo knowledge graph `/understand`):

| Layer | Nằm ở | Ghi chú |
|---|---|---|
| Server API | `server.js`, `routes/`, `lib/` | Express routes, SSE gold hub, proxy `/api/public/*` |
| Client logic | `js/` | Module pattern global `TLKV*`, không bundler |
| Frontend pages | `*.html`, `tin-tuc/`, `san-pham/`, `admin/` | Static shell + JS controller |
| Styling | `css/`, `local.css` | CSS variables, không framework |
| Database | `supabase/*.sql` | Schema, RLS, RPC — chạy tay trên SQL Editor |
| Data & config | `data/`, `vercel.json`, `.env*` | JSON tĩnh + deploy config |
| Documentation | `README.md`, `docs/`, `rule-and-technical/` | Kiến trúc + technical review |

Tài liệu phải đọc theo phạm vi task:

- Sản phẩm / catalog → `docs/products-catalog-architecture.md`, `docs/products-crud-architecture.md`
- Giá derived / realtime → `docs/products-derived-pricing.md`
- Cache / egress / Supabase quota → `rule-and-technical/*.md`
- UI landing / redesign → skill `.agents/skills/design-taste-frontend/SKILL.md`

---

## 1. Quy trình chuẩn cho MỌI task

Không được bỏ bước. Task nhỏ thì mỗi bước ngắn lại, không phải biến mất.

### Bước 1 — Phân loại & xác định phạm vi

Trả lời được 3 câu trước khi viết code:

1. Đây là **feature / bug / perf / refactor / docs**?
2. Task chạm layer nào? (theo bảng ở mục 0)
3. Module nào **không được** đụng vào? (vd: task news không import module gold TV; `tv-model` luôn out-of-scope với catalog)

### Bước 2 — Khảo sát trước, code sau

- Đọc code hiện có của module liên quan **trước khi** viết dòng mới. Không đoán API nội bộ.
- Kiểm tra pattern đã tồn tại: nếu repo đã có cách làm (cache key, event, factory router...) thì **dùng lại pattern đó**, không phát minh cách thứ hai cho cùng một việc.
- Với thay đổi > 2 file: viết plan ngắn (danh sách file + lý do đổi từng file) trước khi implement.

### Bước 3 — Implement theo quy ước (mục 2)

### Bước 4 — Test (mục 4)

### Bước 5 — Self-review theo Definition of Done (mục 6)

### Bước 6 — Báo cáo

- Nêu rõ: **đã đổi gì, tại sao, đã verify bằng cách nào**.
- Thay đổi kiến trúc / trade-off đáng kể → ghi vào `docs/` hoặc `rule-and-technical/` (theo format các file sẵn có: Background → Mục tiêu → Hạng mục → Kết luận).

---

## 2. Quy ước code (bắt buộc)

### 2.1 Naming — namespace TLKV

| Loại | Convention | Ví dụ |
|---|---|---|
| Global module (client) | `window.TLKV<Ten>` | `TLKVNewsAPI`, `TLKVCatalogApi`, `TLKVGold` |
| Custom event | `tlkv:<ten-su-kien>` kebab-case | `tlkv:gold-rows-updated`, `tlkv:products-changed`, `tlkv:brands-changed` |
| Storage key (local/session) | `tlkv_<ten>_v<N>` | `tlkv_gold_table_v1`, `tlkv_products_v1` |
| Biến nội bộ module (private) | tiền tố `__` | `__goldPollBootstrapTimer` |
| SQL function / RPC | `tlkv_<ten>` | `tlkv_news_increment_view`, `tlkv_is_admin` |
| File JS | kebab-case theo feature | `news-list-page.js`, `catalog-admin.js` |

Đổi schema dữ liệu trong storage key → **tăng version suffix** (`_v1` → `_v2`), không ghi đè format cũ.

### 2.2 Cấu trúc module

- **Client:** mỗi feature 1 thư mục (`js/news/`, `js/products/`, `js/admin/`). Data layer (`*-api.js`) tách khỏi controller (`*-page.js`) tách khỏi render (`*-renderer.js`, `*-section.js`). Render layer **chỉ hiển thị** — không chứa business filter.
- **Server:** route mới đặt trong `routes/`, export dạng factory `module.exports = function xxxRouter() {...}`, mount qua `routes/index.js` hoặc `routes/api.js`. Helper dùng chung đặt trong `lib/`.
- **Không circular dependency giữa module.** Giao tiếp chéo module dùng custom event `tlkv:*`, không gọi thẳng hàm nội bộ của module khác.
- File mới bắt đầu bằng comment 1–3 dòng nói rõ file làm gì (theo pattern `lib/http-cache.js`, `routes/api-public.js`).

### 2.3 Dữ liệu & Supabase

- `select()` **chỉ những cột cần** — cấm `select('*')` trên bảng public.
- List luôn phân trang bằng `range(from, to)` với index hỗ trợ; `count: 'exact'` chỉ khi thực sự render pager.
- Filter chạy **server-side** (PostgREST query), không fetch-all rồi filter client — trừ khi có lý do được ghi lại (vd: homepage brand sections tạm thời).
- Giá tiền: **integer VND**, không float accumulation (xem `docs/products-derived-pricing.md`).
- Schema mới = file `.sql` trong `supabase/` + hướng dẫn chạy trong README. Mọi bảng mới **bật RLS ngay từ đầu**: anon chỉ SELECT dữ liệu published/active; write qua `tlkv_is_admin()`.

### 2.4 Cache (rule nghiêm ngặt nhất của repo)

Cache Egress từng vượt quota Supabase — mọi request mới phải trả lời chuỗi câu hỏi:

1. **Có cache được không?** Data đọc nhiều ghi ít → bắt buộc cache (sessionStorage TTL hoặc `/api/public/*` + Cache-Control).
2. **TTL bao nhiêu?** Theo tần suất thay đổi thật: brands (gần như tĩnh) dài; news trung bình; gold có Realtime nên TTL dài + refresh-on-change.
3. **Invalidate thế nào?** Mọi admin CRUD **phải** clear cache liên quan + dispatch event `tlkv:*-changed` ngay sau khi ghi thành công. Không có invalidation = không được merge.
4. **Version key?** Cache key đổi theo version động khi cần bust CDN (pattern news version).

Cấm:

- Polling lặp khi đã có Realtime/SSE cho cùng data.
- Thêm endpoint public không set `Cache-Control` (dùng helper `lib/http-cache.js`, không hardcode header).
- Fetch lại data mà tab hiện tại vừa tự ghi (dùng write-through suppress, pattern `gold-data.js`).

### 2.5 Bảo mật

- **Không commit secret.** `.env` / `.env.local` trong `.gitignore`; key mới thêm vào `.env.example` (giá trị rỗng/placeholder).
- User input phải validate ở **cả 3 tầng** khi áp dụng: client (regex/UX) → Express (regex, sai trả 404/400 thật) → DB (constraint/unique). Pattern chuẩn: slug `[a-z0-9-]`.
- Render nội dung user-generated: **luôn** qua sanitizer allow-list (`TLKVNewsSanitize`), không bao giờ `innerHTML` HTML thô.
- Upload: giới hạn dung lượng + MIME whitelist ở cả client và bucket-level.
- Log 400 lạ trên Supabase (dò `.aws/credentials`, `env.json`...) = scanner bên ngoài, không phải bug — nhưng nhắc lại rule: **bucket public chỉ chứa media, không bao giờ chứa config/env**.

### 2.6 Frontend / UI

- Task landing page, portfolio, redesign giao diện → **bắt buộc đọc và làm theo** `.agents/skills/design-taste-frontend/SKILL.md` (design read, dials, pre-flight check).
- Mọi UI fetch data phải có đủ 3 state: **loading (skeleton đúng shape) / empty / error**. Không spinner tròn generic.
- Ảnh: `loading="lazy" decoding="async"` mặc định; ảnh upload convert WebP.
- Không đổi URL slug, nav label, form field name khi chưa được duyệt (ảnh hưởng SEO + analytics).
- Contrast WCAG AA tối thiểu cho text/CTA.

---

## 3. Quy trình xử lý BUG (nghiêm ngặt hơn task thường)

1. **Reproduce trước khi sửa.** Chưa reproduce được (hoặc chưa có evidence: log, screenshot, DevTools trace) → chưa được viết fix. "Sửa mù" bị cấm.
2. **Tìm root cause, không vá triệu chứng.** Trả lời được: *tại sao bug tồn tại, tại sao bây giờ mới lộ ra*. Một signal giống lỗi đã biết vẫn có thể do nguyên nhân khác — phải verify.
3. **Fix nhỏ nhất có thể.** Không refactor kèm trong cùng thay đổi fix bug. Muốn refactor → tách việc riêng.
4. **Viết regression test** tái hiện bug (fail trước fix, pass sau fix) trong `tests/`.
5. **Verify bằng runtime thật:** chạy `node --test tests/`, và với bug UI/network thì check bằng DevTools/CDP (request thật, header thật, sessionStorage thật) — không chỉ đọc code rồi kết luận.
6. **Báo cáo:** nguyên nhân gốc → fix → bằng chứng verify. Bug do quy trình thiếu (vd: thiếu invalidation rule) → cập nhật playbook này luôn.

---

## 4. Testing

- Test runner: **`node:test` built-in** (`node --test tests/`). Không thêm framework test mới (Jest/Mocha) khi chưa có quyết định chung.
- File test: `tests/<chu-de>.test.js`, dùng `node:assert/strict`.
- Module client (không bundler) test bằng cách load qua `node:vm` với `window` giả — theo pattern `tests/product-price-engine.test.js`.
- Quy tắc coverage tối thiểu:
  - Logic thuần (tính giá, cache key, TTL, parser) → **bắt buộc có test**.
  - Bug fix → **bắt buộc có regression test**.
  - Thay đổi cache/egress → test cả nhánh hit, miss, invalidate.
- Toàn bộ test phải xanh trước khi kết thúc task. Test đỏ không liên quan → báo cáo, không im lặng bỏ qua.

---

## 5. Git & review

- **Commit:** message ngắn gọn, mô tả *tại sao* thay đổi; một commit = một mục đích. Không commit `.env`, credentials, file build.
- **Không force-push** nhánh chung; không amend commit đã push.
- **Diff nhỏ để review được.** Thay đổi lớn → chia theo layer (schema → server → client → test).
- Code review (kể cả self-review) đọc theo checklist mục 6, không đọc lướt.

---

## 6. Definition of Done — checklist cuối cùng

Không tick đủ = chưa xong. Checklist này là filter cuối, giống Pre-Flight Check của tasteskill và [Engineering Fundamentals Checklist](https://microsoft.github.io/code-with-engineering-playbook/) của Microsoft.

### Mọi task

- [ ] Phạm vi đúng như đã khai báo ở Bước 1 — không đụng module out-of-scope
- [ ] Naming đúng convention mục 2.1 (`TLKV*`, `tlkv:*`, `tlkv_*_vN`, `__private`)
- [ ] Pattern tái sử dụng từ code sẵn có, không tạo cách làm thứ hai cho cùng một việc
- [ ] `node --test tests/` xanh toàn bộ
- [ ] Không secret / key trong diff
- [ ] Báo cáo cuối nêu: đã đổi gì, tại sao, verify bằng gì

### Nếu chạm data / Supabase

- [ ] `select` cột tối thiểu, có phân trang, filter server-side
- [ ] RLS đúng cho bảng/bucket liên quan
- [ ] Trả lời đủ 4 câu hỏi cache (mục 2.4): cache được? TTL? invalidate? version?
- [ ] Admin CRUD → clear cache + dispatch `tlkv:*-changed` ngay sau khi ghi

### Nếu chạm UI

- [ ] Đủ 3 state: loading skeleton / empty / error
- [ ] Không đổi slug, nav label, form field name khi chưa duyệt
- [ ] Contrast WCAG AA; ảnh lazy; không layout shift do thiếu reserve space
- [ ] Task landing/redesign: đã chạy Pre-Flight Check của `design-taste-frontend`

### Nếu là bug fix

- [ ] Đã reproduce với evidence trước khi sửa
- [ ] Root cause được nêu rõ (không phải mô tả triệu chứng)
- [ ] Có regression test fail-trước-pass-sau
- [ ] Verify runtime thật (test + DevTools/CDP nếu là bug UI/network)

---

## 7. Tài liệu tham chiếu

- Kiến trúc catalog / CRUD / pricing: `docs/*.md`
- Điều tra cache & egress: `rule-and-technical/*.md`
- Design system & anti-slop UI: `.agents/skills/design-taste-frontend/SKILL.md`
- Khung engineering fundamentals gốc: [microsoft/code-with-engineering-playbook](https://github.com/microsoft/code-with-engineering-playbook)
