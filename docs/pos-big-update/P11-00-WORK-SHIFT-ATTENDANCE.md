# P11 — Quản lý ca làm việc nhân viên (sổ mở/đóng ca)

> Tạo: 2026-11-25 · Contract: `SYSTEM_DEVELOPMENT_RULES.md`  
> Độc lập P10. Tái dùng Future 1 cửa sổ 07:00–20:00 VN; **không** thay cổng giờ.

## 1. Mục tiêu

Tự ghi nhận thời gian làm việc STAFF từ lúc đăng nhập đến lúc đóng ca hợp lệ. Admin (và Admin chỉ xem) theo dõi lịch sử; STAFF **không** mở được trang này.

## 2. Nghiệp vụ đã chốt

| Sự kiện | Hành vi |
|---------|---------|
| STAFF login thành công trong [07:00, 20:00) VN | Tự **mở ca** (không bấm nút). Idempotent nếu đã có ca `active`. |
| Trong ca | Dùng POS theo quyền + gate Future 1. |
| Đăng xuất chủ động | **Đóng ca**, `close_reason = logout`. |
| Tới 20:00 (tab còn mở) | FE + layout logout + message `Đã hết ca làm việc.` + đóng ca `auto_end_of_day`. |
| Đóng trình duyệt không logout | Ca vẫn `active` đến khi có sự kiện đóng hợp lệ (logout / hết giờ / reconcile stale). |
| Admin / Admin chỉ xem | Không bị giới hạn giờ; **không** mở ca nhân viên; được xem UI Quản lý ca. |

## 3. Module / router

- Module: `src/modules/work-shift/**`
- Route: `/work-shifts` (`ROUTES.workShifts`) — chỉ `canAdminRead`
- Nav: mục QUẢN TRỊ «Quản lý ca làm việc»
- Cấm sửa: fund-cash/gold «Ca làm việc» P10, Future 2/3 OTP trừ hook login/logout dùng chung

## 4. DB

- Bảng `public.pos_work_shifts` (RPC-only Data API; §32.1 GRANT `service_role` + revoke anon/authenticated)
- RPC: `pos_open_work_shift`, `pos_close_work_shift`, `pos_list_work_shifts`, `pos_work_shift_overview`
- `pos_private.reconcile_stale_work_shifts` — đóng ca treo sau hết giờ VN

## 5. UI (template admin sẵn có)

Match `AuditDirectory` / TLKV tokens (`--tlkv-*`): KPI hôm nay, bộ lọc ngày/NV/trạng thái/hình thức đóng, bảng + drawer chi tiết.

## 6. Logic cũ phải giữ

- Future 1 `assert_work_hours_for_staff` + message `Đã hết ca làm việc.`
- Future 2 session 24h
- Future 3 OTP allowlist
- Không phụ thuộc bật/tắt P10
