# PERF-008 — Auth / session architecture audit (không đổi code)

> 2026-11-25 · Chỉ audit trước khi thay đổi (Đợt 3 / PO).

## Hiện trạng

| Bước | Nơi | Call |
|------|-----|------|
| 1 | `src/proxy.ts` | `supabase.auth.getUser()` — mọi request khớp matcher |
| 2 | `src/app/(admin)/layout.tsx` | `auth.getUser()` lại + `getPosSession()` → `pos_get_session` |
| 3 | Nhiều page | `getPosSession()` (`React.cache` — dedupe trong 1 RSC request) |

## Kết luận

- **Trùng thật:** `getUser` chạy **2 lần / navigation** (proxy + layout). `getPosSession` đã cache theo request.
- **Rủi ro nếu gộp vội:** proxy chạy Edge/Node middleware path; layout là RSC Server Component. Đưa session JWT claim vào header/cookie custom dễ lệch OTP / work-hours / fund gates.
- **Không làm ngay:** không bỏ `getUser` ở proxy (cần redirect login). Không “session context provider” toàn app khi chưa có contract header an toàn.

## Hướng khi duyệt Đợt 3

1. Giữ proxy chỉ check “có user?” (nhẹ).
2. Layout: một `getPosSession()` (đã cache); tránh `getUser` thừa nếu `getPosSession` đã đủ chứng minh session (cần verify RPC không phụ thuộc cookie refresh path).
3. Đo RTT trước/sau trên production build; không đổi ACL STAFF/Admin.

**Status:** Audit only — **chưa implement**.
