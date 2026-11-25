# Pre-SRS Audit — Quản lý ca làm việc & Phiên đăng nhập 24 giờ

**Ngày audit:** 2026-11-25 (Asia/Ho_Chi_Minh)  
**Phạm vi:** Chỉ đọc codebase + cấu hình local `supabase/config.toml` + SQL read-only trên project `WebsiteThangLongKimViet` (`yrdqnmsvwovwhepmhigv`).  
**Không làm trong giai đoạn này:** sửa code, migration, đổi Auth Production, deploy.

---

## 0. Kết luận khả thi (tóm tắt)

| Hạng mục | Khả thi? | Ghi chú ngắn |
|---|---|---|
| Future 1 — Giờ làm việc 07:00–20:00 VN cho non-Admin | **Có** | Chặn tập trung ở `pos_private.require_*` + login action + timer FE; múi giờ đã dùng `Asia/Ho_Chi_Minh` trên DB. |
| Future 2 — Phiên tuyệt đối 24h từ lúc đăng nhập | **Có, có điều kiện** | Nên dùng Auth `sessions.timebox = 24h` (Pro+) **và** kiểm tra app-level vì JWT còn sống đến hết `jwt_expiry` sau khi timebox. |
| Chỉ FE / chỉ redirect | **Không đạt SRS** | RPC vẫn gọi được bằng JWT; bắt buộc gate DB. |
| Sales Staff / Warehouse Staff riêng | **Đã chốt: dùng `STAFF`** | Không tách role. Mọi tài khoản không phải Admin-read → giới hạn 07:00–20:00. |
| Admin miễn giờ làm việc | **Đã chốt: có** | Chỉ `ADMIN` + `ADMIN_VIEWER` (+ bootstrap `tlkv_admin_emails()`). |
| Admin có miễn 24h không? | **Đã chốt: không miễn** | Mọi tài khoản (kể cả Admin / Admin chỉ xem) hết hạn phiên đúng 24h. |

**Verdict:** Future 1+2 **khả thi kỹ thuật** (quyết định §14 đã chốt; Dashboard PRO đã xác minh).  

**Bổ sung 2026-11-25:** **Future 3 — OTP email** khi 2 Admin allowlist đăng nhập (xem §16–§17). Supabase không có Email MFA native → **OTP email custom**. PO đã **từ chối** TOTP. Blocker còn lại: SMTP Production.

---

## 1. Hiện trạng Supabase Auth

### 1.1. Luồng đăng nhập / đăng xuất app POS (Next.js)

| Điểm | Hiện trạng |
|---|---|
| Login | `src/app/login/actions.ts` → `signInWithPassword({ email, password })` rồi `redirect(next)`. |
| Lỗi login | Mọi lỗi Auth đều map thành `"Email hoặc mật khẩu không đúng"` — **chưa** có nhánh “Đã hết ca làm việc.” |
| Logout | `signOut()` → `supabase.auth.signOut()` (mặc định scope local trên server client) rồi redirect `/login`. |
| Session app | `getPosSession()` → RPC `pos_get_session` (role/email/business_date từ `pos_staff` + JWT email). |
| Browser client | `src/shared/supabase/browser.ts` tồn tại nhưng **không được import** trong `src/modules/**`. POS Next chủ yếu SSR + cookie qua `@supabase/ssr`. |

### 1.2. Cookie / persistence

- Server: `createServerClient` + `cookies()` (`src/shared/supabase/server.ts`).
- Edge/proxy: `src/proxy.ts` refresh cookie khi `getUser()`.
- Hành vi đóng tab / đóng trình duyệt: cookie session SSR mặc định **persist** (không session-only) → mở lại trong thời hạn Auth vẫn vào được. **Khớp** yêu cầu “đóng browser không mất phiên” của Future 2 về phía storage.

### 1.3. Tự refresh

- `@supabase/ssr` + `proxy` gọi `getUser()` → refresh access token khi cần.
- `autoRefreshToken` mặc định bật trên client library; app Next chủ yếu refresh qua proxy/server cookie.
- **Hệ quả:** Refresh token **gia hạn access token vô hạn** nếu không có timebox / kiểm tra tuyệt đối → đúng rủi ro SRS §6.1.

### 1.4. Bảng `auth.sessions` (Production, read-only)

Có cột liên quan thời hạn: `created_at`, `refreshed_at`, `not_after`, `refresh_token_*`.  
Có ~61 session rows tại thời điểm audit.  
Có thể dùng `session_id` trong JWT ↔ `auth.sessions.id` để app kiểm tra tuổi phiên.

---

## 2. Cấu hình Access Token và Refresh Token

### 2.1. Local `supabase/config.toml` (repo)

| Setting | Giá trị | Ý nghĩa |
|---|---|---|
| `auth.jwt_expiry` | `3600` (1 giờ) | Access token sống tối đa 1h giữa các lần refresh. |
| `enable_refresh_token_rotation` | `true` | Refresh một lần / reuse interval. |
| `refresh_token_reuse_interval` | `10` | Cho phép reuse trong 10s (SSR). |
| `[auth.sessions] timebox` | **commented** `# timebox = "24h"` | Chưa bật trong config local. |
| `inactivity_timeout` | commented | Không dùng. |

### 2.2. Production

- Audit **không** đổi Auth Dashboard / Management API trong giai đoạn này.
- Dashboard đã xác minh (2026-11-25, `main` PRODUCTION, plan **PRO**):
  - Access token expiry = **3600** giây.
  - Time-box user sessions = **0** (never) — chưa bật.
  - Inactivity timeout = **0**; Enforce single session = off.
- Plan **PRO** đủ điều kiện bật timebox; vẫn **chưa** đổi Production cho đến cửa sổ triển khai (§14.7).

### 2.3. Hành vi timebox (theo docs / GoTrue)

- Timebox = tuổi tuyệt đối từ lúc **tạo session** (đăng nhập), không reset khi user thao tác.
- Kiểm tra chính khi **refresh token grant**.
- Session không bị xóa proactive đúng giây hết hạn; JWT còn hiệu lực đến hết `jwt_expiry` → **độ trễ tối đa ≈ jwt_expiry** nếu chỉ dựa Auth.
- SRS yêu cầu “đúng 24 giờ” + backend từ chối → **không đủ** nếu chỉ bật timebox; cần gate app/DB đọc `auth.sessions.created_at` (hoặc `not_after`).

---

## 3. Hiện trạng middleware và API protection

### 3.1. Proxy (thay middleware Next)

File: `src/proxy.ts`

- Chỉ kiểm tra `supabase.auth.getUser()`:
  - Không user → redirect `/login`.
  - Có user + đang ở `/login` → redirect `/`.
- **Không** kiểm tra role, giờ làm việc, hay tuổi phiên 24h.
- **Không** bảo vệ PostgREST/RPC (client gọi thẳng Supabase URL bằng JWT).

### 3.2. Layout admin

`src/app/(admin)/layout.tsx`: bắt buộc Auth user + `getPosSession()` (có `pos_staff` active).  
Vẫn **không** kiểm tra giờ làm việc.

### 3.3. Server Actions / query

- Mutating nghiệp vụ (POS/mua/bán/…) chủ yếu `"use server"` + `createServerSupabase().rpc(...)`.
- Một số action gọi `assertAdminWrite` / `assertStaffMutate` (TS); nhiều action POS/purchase **ủy quyền hoàn toàn cho RPC**.
- Edge Function `staff-admin`: chỉ `getUser` + `tlkv_is_admin` — Admin-only, ít liên quan giờ làm NV; vẫn nên tôn trọng 24h nếu áp dụng toàn cục.

### 3.4. RPC / DB gates (Production)

| Quan sát | Số liệu / ví dụ |
|---|---|
| `public.pos_%` security definer | ~157 |
| Body chứa `require_pos_user` | ~70 (ước lượng qua `pg_get_functiondef`) |
| Body chứa `require_admin*` | ~34 |
| Nhiều wrapper `public.pos_*` ủy quyền `pos_private.*` | Ví dụ `pos_complete_sale` → `pos_private.complete_sale` |
| Overload / path chưa đồng đều | Có overload `pos_private.complete_sale` **không** chứa `require_pos_user` trong def — cần audit chi tiết khi implement |

**Hệ quả:** Chặn giờ làm việc / hết phiên **chỉ an toàn** nếu nhúng vào:

1. `pos_private.require_pos_user()`
2. `pos_private.require_admin()`
3. `pos_private.require_admin_reader()` (ADMIN_VIEWER đọc)
4. Cộng checklist các RPC mutate gọi path khác / helper riêng / Edge Function

Không đủ: chỉ thêm check trong vài Server Action.

---

## 4. Cách lưu và khôi phục session

```text
Đăng nhập → Auth cookies (access + refresh) → proxy refresh
                ↓
         getPosSession() / pos_get_session
                ↓
         role từ pos_staff / tlkv_admin_emails
```

| Tình huống | Hiện trạng |
|---|---|
| Reload trang | Cookie còn → proxy refresh → vào lại. |
| Đóng tab / browser | Cookie còn → mở lại trong hạn Auth vẫn vào. |
| Hết access token, còn refresh | Auto refresh → phiên Auth tiếp tục (vô hạn nếu không timebox). |
| Nhiều tab | Cùng cookie jar → cùng phiên Auth; chưa có BroadcastChannel logout đồng bộ UI. |
| Nhiều thiết bị | Nhiều `auth.sessions` / user được phép (không single-session). |
| Phát hiện hết hạn UI | Chỉ khi `getUser`/`getPosSession` fail → redirect login; **không** có timer 20:00 / 24h. |

---

## 5. Cơ chế phân quyền hiện tại

### 5.1. Nguồn sự thật role

| Nguồn | Dùng cho |
|---|---|
| `public.pos_staff.role` (`ADMIN` \| `STAFF` \| `ADMIN_VIEWER`) + `is_active` | Role nghiệp vụ |
| `public.tlkv_admin_emails()` | Bootstrap Admin (email list) → coi như ADMIN |
| `tlkv_staff_role()` / `tlkv_is_admin()` / `tlkv_can_admin_read()` / `tlkv_has_pos_access()` | Gate SQL |
| `StaffRole` TS + `permissions.ts` | UI route / assert |

**Không** suy role từ display name. Đúng yêu cầu SRS §6.4.

### 5.2. Production `pos_staff` (2026-11-25)

| Role | Tổng | Active |
|---|---:|---:|
| ADMIN | 4 | 4 |
| ADMIN_VIEWER | 1 | 1 |
| STAFF | 12 | 12 |

**Không có** role `SALES_STAFF` / `WAREHOUSE_STAFF` trong schema.

### 5.3. Map SRS → hệ thống

| SRS | Hệ thống |
|---|---|
| Admin | `ADMIN` hoặc email trong `tlkv_admin_emails()` |
| Admin chỉ xem | `ADMIN_VIEWER` |
| Sales Staff / Warehouse Staff / role khác không phải Admin | `STAFF` (và mọi role không thuộc Admin-read) |

**Miễn giờ làm việc:** dùng `tlkv_can_admin_read()` / `canAdminRead(role)` (= ADMIN ∪ ADMIN_VIEWER ∪ bootstrap admin).

---

## 6. Múi giờ

| Thành phần | Hiện trạng |
|---|---|
| Postgres `TimeZone` | `UTC` |
| Nghiệp vụ VN | `(timezone('Asia/Ho_Chi_Minh', now()))::date` / `at time zone 'Asia/Ho_Chi_Minh'` đã dùng rộng (business_date, báo cáo, …) |
| Đồng hồ client | Chỉ hiển thị; **không** dùng làm nguồn gate |

**Đề xuất check giờ làm việc (server):**

```sql
-- Ví dụ: trong khoảng [07:00, 20:00) theo VN
v_local time := (timezone('Asia/Ho_Chi_Minh', now()))::time;
-- allowed iff v_local >= time '07:00' AND v_local < time '20:00'
```

Không phụ thuộc timezone máy NV.

---

## 7. Các điểm cần thay đổi (khi được duyệt triển khai)

### 7.1. Future 1 — Ca làm việc

| Lớp | Thay đổi |
|---|---|
| SQL | Helper `pos_private.assert_work_hours()` (hoặc tương đương): nếu **không** `tlkv_can_admin_read()` và ngoài [07:00, 20:00) → `raise exception` mã rõ (vd. `P0001` / custom) message `Đã hết ca làm việc.` |
| SQL | Gọi helper từ `require_pos_user` (và quyết định có gọi từ `require_admin*` không — Admin miễn → **không** gọi trong admin gates). |
| Login | Sau `signInWithPassword` thành công: đọc role (RPC nhẹ / `pos_get_session`); nếu non-Admin ngoài giờ → `signOut` + redirect error đúng câu SRS. |
| Proxy / layout | Optional early redirect ngoài giờ (UX); **không** thay thế gate SQL. |
| FE | Timer/server-derived `msUntilEndOfShift` trong shell: tới 20:00 → khóa UI + `signOut` + message. Đồng bộ multi-tab (BroadcastChannel hoặc cookie event). |
| Message | Chỉ non-Admin; Admin/Admin viewer **không** thấy “Đã hết ca làm việc.” khi đăng nhập ngoài giờ. |

### 7.2. Future 2 — Phiên 24h

| Lớp | Thay đổi |
|---|---|
| Auth (Pro+) | Bật `sessions.timebox = 24h` (Dashboard hoặc `config.toml` rồi sync) — chặn refresh sau 24h từ tạo session. |
| SQL / app | Kiểm tra `auth.sessions.created_at + interval '24 hours' <= now()` (qua `session_id` JWT) trong `require_pos_user` **và** `require_admin` / `require_admin_reader` (Admin cũng 24h — đã chốt). |
| FE / proxy | Khi hết hạn: signOut, clear cookie, về login. |
| Không làm | Không reset 24h vì refresh trang / vì user đang thao tác. |

### 7.3. Việc **không** nên làm

- Chỉ ẩn nút / disable UI.
- Chỉ dựa JWT `exp` (1h) như “phiên 24h”.
- Đổi `jwt_expiry` thành 24h (làm access token quá dài — chống SRS security).
- Tự thay 24h bằng hết hạn 00:00.

---

## 8. Ảnh hưởng database / RPC / middleware / frontend

| Thành phần | Mức độ | Ghi chú |
|---|---|---|
| DB schema bảng nghiệp vụ POS | Thấp | Có thể **không** cần bảng mới nếu dùng `auth.sessions` + helper SQL. |
| `pos_private.require_*` | Cao | Điểm chặn thống nhất. |
| Toàn bộ RPC mutate | Trung bình–cao | Cần inventory overload/path thiếu `require_*`. |
| `src/proxy.ts` | Trung bình | UX redirect + optional session age. |
| `login/actions.ts`, login UI | Trung bình | Message hết ca. |
| `AdminShell` / client timer | Trung bình | Force logout 20:00 / 24h. |
| Module mua/bán/kho nghiệp vụ | Thấp (nếu gate đúng chỗ) | Không đổi logic giao dịch. |
| Auth Production config | Cao (cấu hình) | Timebox — cần duyệt + Pro plan. |

**GRANT §32.1:** Nếu tạo bảng app-session riêng thì phải GRANT trong cùng migration. Phương án `auth.sessions` (security definer đọc) có thể tránh bảng public mới.

---

## 9. Rủi ro và trường hợp chưa xử lý

| # | Rủi ro | Mức | Hướng xử lý đề xuất |
|---|---|---|---|
| R1 | Auth timebox chỉ enforce lúc refresh → JWT còn tới ~1h sau 24h | Cao | App/DB check `created_at+24h` trên mọi mutate. |
| R2 | Timebox Pro-only / chưa xác nhận plan | Cao | Xác nhận plan trước; fallback: chỉ app-level 24h (vẫn cần revoke/signOut). |
| R3 | RPC/overload không qua `require_pos_user` | Cao | Inventory + patch trước hard-test. |
| R4 | Request bắt đầu 19:59:50, commit 20:00:05 | Trung bình | Gate ở **đầu** RPC (entry `require_*`). Giao dịch atomic: reject trước mutate → không partial money/stock. Request đã qua gate và đang chạy trong transaction: cho hoàn tất (tránh half-write). |
| R5 | Form đang mở lúc 20:00 | Trung bình | FE force logout; submit sau đó bị RPC reject. |
| R6 | Multi-tab lệch UI | Trung bình | Broadcast logout; cookie clear là nguồn sự thật. |
| R7 | Mất mạng, reconnect sau hết ca | Trung bình | Proxy/layout/RPC từ chối; không “queue” mutate offline. |
| R8 | Admin thu hồi quyền (`is_active=false`) | Đã có một phần | `tlkv_has_pos_access` / `getPosSession` null; bổ sung message nếu cần. |
| R9 | Shared POS counter email / `is_shared` | Thấp–TB | Vẫn là STAFF → bị giờ làm việc; xác nhận nghiệp vụ. |
| R10 | Message login: Auth OK nhưng hết ca | Thấp | Sign-out ngay sau check để không để session “treo”. |
| R11 | Timebox global áp dụng Admin | Đã chốt | Admin cũng 24h. Miễn chỉ giờ làm việc. |
| R12 | Legacy `js/*` admin (nếu còn dùng) | Thấp | Ngoài Next POS; không nằm scope nếu chỉ ship Next app — ghi nhận nếu còn traffic. |

---

## 10. Kiến trúc đề xuất

```text
                    ┌─────────────────────────────┐
   Browser          │  Cookie Auth (SSR)          │
                    │  + FE timer (20:00 / 24h)    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  proxy.ts: getUser +         │
                    │  optional work-hours/24h UX  │
                    └──────────────┬──────────────┘
                                   │
          Server Actions / RSC     │     (JWT trực tiếp PostgREST)
                    ┌──────────────▼──────────────┐
                    │  pos_private.require_pos_user│
                    │   ├─ authenticated?          │
                    │   ├─ pos access / role?      │
                    │   ├─ session age ≤ 24h?      │
                    │   └─ work hours? (non-admin) │
                    └──────────────┬──────────────┘
                                   │
                          RPC nghiệp vụ atomic
```

**Thứ tự ưu tiên điều kiện (SRS §4.4):** Auth OK ∧ phiên &lt; 24h ∧ (Admin-read **hoặc** trong [07:00,20:00)) ∧ account active ∧ ACL hiện tại.

**Login ngoài giờ (STAFF):** Auth password đúng → kiểm tra giờ → fail → `signOut` → `"Đã hết ca làm việc."`

---

## 11. So sánh phương án thời hạn phiên

| Tiêu chí | Đúng 24h từ lúc đăng nhập (SRS ưu tiên) | Hết hạn lúc 00:00 VN |
|---|---|---|
| Thời hạn | Cố định 24h từ `auth.sessions.created_at` | Phụ thuộc giờ login (login 23:00 → ~1h) |
| Lưu hết hạn riêng | Auth timebox +/hoặc check `created_at` | Có thể chỉ so sánh `business_date` / local date |
| Kiểm tra khi refresh | Bắt buộc (timebox) | Vẫn cần nếu muốn chặt |
| Đóng/mở browser | Giữ đến hạn 24h | Giữ đến 00:00 |
| Độ phức tạp | Cao hơn (Auth + app) | Thấp hơn |
| Khớp SRS | **Có** | Không — chỉ so sánh audit |
| Admin | Timebox global ảnh hưởng Admin | Có thể code miễn Admin dễ hơn |

**Đã chốt:** Giữ **24h tuyệt đối** từ lúc đăng nhập. Không dùng hết hạn 00:00.

**Đã chốt Admin × 24h:** Mọi tài khoản hết hạn phiên sau 24h. Admin chỉ được miễn giới hạn giờ làm việc.

---

## 12. Ảnh hưởng nghiệp vụ đang chạy (SRS §6.6)

| Tình huống | Quyết định (đã chốt 2026-11-25) |
|---|---|
| Đang nhập form lúc 20:00 | FE khóa + logout; dữ liệu form chưa commit bị mất (chấp nhận). |
| RPC bắt đầu **sau** 20:00 | Gate từ chối (`Đã hết ca làm việc.`). |
| RPC đã qua gate và vào transaction **trước** 20:00 | Cho phép hoàn tất. |
| Sau 20:00 — request mới của nhân viên | Tất cả bị chặn. |
| Refresh token đúng lúc hết 24h | Auth trả `session_expired` (nếu có timebox) → app logout; app-level vẫn reject. |
| Mutate với JWT còn sống nhưng `created_at+24h` đã qua | DB reject (app-level) dù Auth chưa refresh. |
| Idempotency key retry sau hết ca | Reject; không tạo giao dịch mới / không double-complete nếu lần đầu đã commit. |

---

## 13. Acceptance mapping — gap hiện tại

### Future 1

| AC | Hiện trạng | Gap |
|---|---|---|
| Non-Admin bị giới hạn giờ | Chưa | SQL + login + FE |
| Admin / Admin viewer không bị | N/A | Dùng `tlkv_can_admin_read` |
| Login chỉ 07:00–&lt;20:00 | Chưa | Login action |
| Message đúng câu | Chưa | |
| Tới 20:00 chặn + logout | Chưa | FE timer + SQL |
| Backend từ chối | Chưa | `require_*` |
| TZ Việt Nam | Sẵn sàng | Dùng pattern hiện có |

### Future 2

| AC | Hiện trạng | Gap |
|---|---|---|
| 24h từ login | Refresh vô hạn | Timebox + app check |
| Refresh trang không reset | Đúng với Auth session | Giữ nguyên |
| Đóng tab/browser giữ phiên | Đúng (cookie) | Giữ nguyên |
| Hết 24h logout | Chưa | |
| Refresh không kéo quá 24h | Chưa | Timebox |
| Backend từ chối phiên hết hạn | Chưa | SQL |
| Multi-tab nhất quán | Một phần (cookie) | Thêm sync logout |

---

## 14. Quyết định nghiệp vụ — trạng thái

### 14.1–14.4 Đã chốt (2026-11-25)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Admin dùng chung 24h? | **Có.** Mọi tài khoản (Admin, Admin chỉ xem, STAFF) hết hạn phiên đúng 24h. Admin chỉ miễn giờ làm việc. |
| 2 | Sales/Warehouse = STAFF? | **Có.** Không tách role. Mọi tài khoản không phải Admin (`tlkv_can_admin_read` = false) áp dụng 07:00–20:00. |
| 3 | Plan Pro+ / timebox Production? | **Đã xác minh Dashboard (2026-11-25):** project **PRO**; Sessions → Time-box = **0 (never)**; Access token expiry = **3600s**; single session / inactivity = off. **Chưa bật** timebox Production. App-level 24h vẫn bắt buộc. |
| 4 | Request cắt 20:00? | **Gate tại entry.** Sau 20:00 reject request mới; RPC đã qua gate + vào transaction trước 20:00 cho hoàn tất. |

### 14.7 Khi nào bật Auth timebox + giờ làm việc FE/BE (chốt hướng dẫn)

**Auth Time-box user sessions = 24 (giờ)** trên Dashboard:

- **Không bật ngay** chỉ vì đã thấy PRO / đang audit.
- Bật **cùng cửa sổ triển khai Future 2** (sau khi app-level 24h + gate SQL đã sẵn sàng / hoặc ngay trước hard-test 24h), kèm thông báo user đang login (phiên cũ hết hạn dần lúc refresh).
- Đơn vị Dashboard là **hours** → nhập `24` (không phải giây). `0` = never (hiện tại).
- Timebox **không** thay thế app-level check: JWT còn sống tới ~`jwt_expiry` (3600s) sau khi hết 24h; mutate vẫn cần `require_*` đọc `auth.sessions.created_at`.
- Không bật inactivity timeout / single-session trừ khi PO yêu cầu thêm (ngoài SRS).

**Giờ làm việc 07:00–20:00:**

- Auth Sessions **không** có setting theo khung giờ trong ngày → **bắt buộc triển khai riêng**.
- **BE/SQL bắt buộc** (`require_pos_user` + login action): nguồn sự thật, chặn RPC/API trực tiếp.
- **FE bắt buộc** (timer logout + message + khóa thao tác): UX đúng SRS lúc 20:00; không đủ nếu chỉ FE.
- Admin / Admin chỉ xem: miễn giờ làm việc; **không** miễn 24h.

### 14.5 Còn mở (không chặn thiết kế core)

5. **Phạm vi legacy `js/admin`** có còn dùng song song Next POS không? (Ghi nhận khi hard-test; ưu tiên Next app.)

### 14.6 Điều kiện được phép bắt đầu code

- [x] §14.1 Admin × 24h  
- [x] §14.2 Role STAFF  
- [x] §14.4 Gate 20:00  
- [x] §14.3 Dashboard PRO đã xác minh; timebox Production vẫn = 0 — chỉ bật khi đến cửa sổ triển khai Future 2 (xem §14.7)  
- [ ] §16 Future 3 OTP email — SMTP Production + thiết kế challenge allowlist 2 Gmail  
- [ ] PO/tech lead duyệt bắt đầu implementation (Future 1+2 ± Future 3)  

---

## 15. Định nghĩa xong giai đoạn audit

- [x] Hiện trạng Supabase Auth / login / logout / refresh  
- [x] JWT / refresh / timebox (local + docs; Production Dashboard cần xác nhận khi triển khai)  
- [x] Middleware/proxy + API/RPC protection  
- [x] Session cookie / khôi phục  
- [x] Role source + map SRS  
- [x] Timezone VN  
- [x] Điểm cần đổi + ảnh hưởng + rủi ro  
- [x] Kiến trúc đề xuất  
- [x] So sánh 24h vs 00:00  
- [x] Verdict khả thi  
- [x] Ghi nhận quyết định §14.1 / 14.2 / 14.4  

**Không** bắt đầu implementation cho đến khi §14.6 đủ tick (tối thiểu: xác nhận chiến lược Pro+/timebox vs app-level-only + lệnh bắt đầu code).

---

## 16. Future 3 (bổ sung) — Xác thực bước 2 khi Admin đăng nhập

**Nguồn:** PO bổ sung 2026-11-25; chốt chi tiết cùng ngày (12:10).

### 16.1. Quyết định đã chốt

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | `ADMIN_VIEWER` bắt OTP/MFA? | **Không.** |
| 2 | Ai bắt buộc bước 2? | **Allowlist cố định 2 email Admin thật:** `tuananh18101@gmail.com`, `thanglongkimviet@gmail.com`. Không áp dụng theo mọi `role=ADMIN`. |
| 3 | Mỗi lần login hay thiết bị mới? | **Mỗi lần đăng nhập.** |
| 4 | Thông số mã | 6 số; TTL 5–10 phút; rate-limit resend ≥ 60s (áp dụng nếu dùng email OTP). |
| 5 | Google Authenticator / TOTP? | **Không chọn.** PO chốt **OTP email** (2026-11-25 12:16). TOTP chỉ là phương án dự phòng đã từ chối. |
| 6 | SMTP Production | **Chưa xác minh** — cần check Dashboard (bắt buộc nếu chọn email OTP; **không bắt buộc** nếu chọn TOTP). |

**Production `pos_staff` Admin hiện có (2026-11-25):**

| Email | Role | Future 3 |
|---|---|---|
| `tuananh18101@gmail.com` | ADMIN | **Bắt buộc** bước 2 |
| `thanglongkimviet@gmail.com` | ADMIN | **Bắt buộc** bước 2 |
| `ketoan02@gmail.com` | ADMIN | Không (ngoài allowlist) |
| `linh@123gmail.com` | ADMIN | Không (ngoài allowlist) |
| `quantrivientlkv@gmail.com` | ADMIN_VIEWER | Không |

STAFF: không MFA bước 2 (chỉ password + giờ làm việc + 24h).

### 16.2. Hiện trạng kỹ thuật

| Hạng mục | Hiện trạng |
|---|---|
| Login | Chỉ `signInWithPassword` — chưa MFA |
| Supabase MFA | TOTP / Phone; **không** có Email MFA factor |
| Google Authenticator | Là app **TOTP** chuẩn (`otpauth://`) — tương thích Supabase MFA TOTP (cùng chuẩn với Authy, 1Password, …) |
| SMTP | Repo `[auth.email.smtp]` comment; Production **cần check** nếu giữ email OTP |

### 16.3. Phương án đã chốt — OTP email custom (A)

```text
Mỗi lần login (2 email allowlist):
  email + password OK
  → tạo OTP 6 số (hash + TTL 5–10 phút), gửi email
  → UI nhập mã; resend ≥ 60s
  → đúng → session thành công (bắt đầu 24h)
  → sai/hết hạn → không vào app / signOut
```

**TOTP / Google Authenticator:** khả thi kỹ thuật nhưng PO **đã từ chối** (2026-11-25 12:16).

**BE bắt buộc:** proxy/layout/`require_*` từ chối allowlist chưa verify OTP (tránh dùng JWT bỏ qua bước 2).

### 16.4. Impact (OTP email — đã chốt)

| Thành phần | Mức | Ghi chú |
|---|---|---|
| Login UI | Cao | Sau password (allowlist) → màn nhập OTP email |
| Gửi mail OTP | Cao | Edge Function / mailer + SMTP Production (**blocker**) |
| DB challenge (nếu bảng mới) | TB | GRANT §32.1 cùng migration |
| `proxy` / layout / `require_*` | Cao | Allowlist chưa OTP → không vào app / reject RPC |
| SMTP | **Cao — blocker** | Check Dashboard trước code |
| Future 1–2 | Thấp–TB | 24h sau OTP thành công; work hours không đụng 2 Admin này |
| Admin ngoài allowlist / VIEWER / STAFF | Thấp | Password-only (+ Future 1–2 theo role) |

### 16.5. Quan hệ Future 1–2–3

```text
STAFF:
  password → trong [07:00,20:00)? → session → 24h + work-hours gates

ADMIN allowlist (2 Gmail):
  password → OTP gửi email → nhập đúng → session thành công → 24h (không work hours)

ADMIN khác / ADMIN_VIEWER:
  password → session → 24h (không work hours, không MFA bước 2)
```

### 16.6. Việc còn lại trước code Future 3

- [x] Chốt ADMIN_VIEWER = không MFA  
- [x] Chốt allowlist 2 email  
- [x] Chốt mỗi lần login  
- [x] Chốt thông số 6 số / TTL / resend (email)  
- [x] **PO chọn phương án A — OTP email** (không dùng Google Authenticator)  
- [ ] Check SMTP Production (Dashboard → Auth → SMTP) — **blocker** Future 3  
- [ ] Duyệt bắt đầu implementation Future 3

## 17. Tổng hợp yêu cầu đã chốt (Future 1 + 2 + 3)

*Cập nhật 2026-11-25 — nguồn SRS + quyết định PO trong audit này.*

### Future 1 — Ca làm việc 07:00–20:00 (Asia/Ho_Chi_Minh)

- Áp dụng: mọi tài khoản **không** Admin-read (`STAFF`; Sales/Warehouse = STAFF, không tách role).
- Miễn: `ADMIN`, `ADMIN_VIEWER`, bootstrap `tlkv_admin_emails()`.
- Login ngoài ca (STAFF): từ chối + message **"Đã hết ca làm việc."**
- Đang dùng đến 20:00: chặn thao tác + bắt buộc logout + cùng message; BE/RPC từ chối request mới.
- Gate tại **đầu** RPC; RPC đã vào transaction trước 20:00 được hoàn tất.
- FE + BE đều bắt buộc (Auth Sessions không có khung giờ).

### Future 2 — Phiên đăng nhập 24 giờ

- Mọi tài khoản (kể Admin / Admin chỉ xem) hết hạn đúng 24h từ lúc đăng nhập thành công.
- Refresh trang / thao tác không gia hạn; đóng browser không mất phiên trong hạn.
- Auth Dashboard: PRO; Time-box hiện = 0; bật `24` (hours) trong cửa sổ triển khai Future 2.
- App/SQL check `auth.sessions.created_at + 24h` bắt buộc (JWT còn ~1h sau timebox).
- Không dùng hết hạn 00:00.

### Future 3 — OTP email Admin (allowlist)

- Phương án triển khai: **OTP email custom** (không TOTP / Google Authenticator).

- Chỉ 2 email: `tuananh18101@gmail.com`, `thanglongkimviet@gmail.com`.
- Không áp dụng: ADMIN_VIEWER, ADMIN khác ngoài allowlist, STAFF.
- Mỗi lần login: password đúng → gửi OTP email → nhập đúng mới vào app.
- Thông số: 6 số; TTL 5–10 phút; resend ≥ 60s.
- Không dùng Google Authenticator / TOTP (đã từ chối).
- Blocker: xác minh SMTP Production trước khi code.
- Điểm bắt đầu đếm 24h: sau OTP thành công (khuyến nghị / cần giữ khi implement).

### Thứ tự điều kiện phiên hợp lệ

`Auth OK` ∧ (`không cần OTP` ∨ `OTP đã verify`) ∧ `tuổi phiên < 24h` ∧ (`Admin-read` ∨ `trong [07:00,20:00)`) ∧ account active ∧ ACL.

### Chưa được phép tự ý

- Đổi Auth Production timebox / SMTP / MFA khi chưa tới cửa sổ triển khai.
- Migration / code trước khi PO duyệt bắt đầu implementation.
