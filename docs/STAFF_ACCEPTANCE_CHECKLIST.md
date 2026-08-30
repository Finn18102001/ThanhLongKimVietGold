# TLKV — Staff acceptance checklist (§55)

> Spec: [`TLKV_AI_IMPLEMENTATION_SPEC.md`](./TLKV_AI_IMPLEMENTATION_SPEC.md) §55  
> Cập nhật: 2026-08-23

Đăng nhập bằng tài khoản **STAFF** (role `STAFF`, `is_active = true`).

## Kỳ vọng

| # | Kiểm tra | Kỳ vọng | Backend |
|---|----------|---------|---------|
| 1 | Vào `/` hoặc dashboard | Redirect / không vào được | `canAccessPath` + `pos_get_session` |
| 2 | Vào `/reports`, `/reports/revenue` | 403 / Access denied | `PermissionGate` + RPC admin-only |
| 3 | Vào `/employees` | 403 / Access denied | `pos_list_staff` → `require_admin` |
| 4 | Vào `/audit` | 403 / Access denied | Route admin-only |
| 5 | Vào `/pos` | OK | `require_pos_user` |
| 6 | Vào `/customers` | OK (list/create theo quyền POS) | `require_pos_user` trên customer RPC |
| 7 | Vào `/invoices` | OK (đọc list) | POS user |
| 8 | Menu sidebar | Không thấy Báo cáo, Nhân viên, Audit | `nav.ts` filter STAFF |
| 9 | Gọi trực tiếp API admin | `Forbidden` 42501 | RPC `require_admin` |

## Ghi chú

- STAFF **được** dùng module Khách hàng (spec §26).
- STAFF **không** xem doanh số tổng / dashboard tài chính.
- Kiểm tra API: dùng session STAFF gọi `pos_list_staff`, `pos_customer_directory_stats` (admin-only stats vẫn pos_user sau migration identity).

## Trạng thái (2026-08-23)

- [x] UI gate route + menu ẩn
- [x] `pos_list_staff` / staff CRUD → admin only
- [x] Customer RPC → `require_pos_user` (STAFF được list/get/create)
- [ ] Formal automated test suite
- [x] DevTools smoke pass ghi nhận bên dưới

### Smoke log

| Ngày | Tester | Kết quả | Ghi chú |
|------|--------|---------|---------|
| 2026-08-23 | tuananh18101 (ADMIN) | PASS | Form DN + CCCD + ảnh upload UI + export |
| 2026-08-23 | tuanss1811 (STAFF, NV-0004 Nguyễn Tuấn Anh Quầy) | **PASS** | Login → `/pos`; menu chỉ POS/Kho/KH/HĐ; `/employees` + `/reports` Access denied; partial sale HD000010 (10M/29M) → collect 19M → PAID; stock 6→5; inventory ledger ghi tuanss1811 |
