# P10 — Quỹ tiền / Quỹ vàng (tài khoản nhân viên) + Feature Flag

> Nhận SRS: 2026-11-18 · Trạng thái: **đã chốt quyết định 2026-11-19 — sẵn sàng triển khai theo thứ tự module**  
> Nguồn: SRS Phần 1–6 + bản chốt nghiệp vụ + mẫu PHIẾU YÊU CẦU THU/CHI  
> **AS-IS + quyết định chốt (file duy nhất):** [`P10-01-AS-IS-AND-DECISIONS.md`](./P10-01-AS-IS-AND-DECISIONS.md)

Contract chung: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) · Backup: [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md) · Build: [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md)

---

## 1. Mục tiêu (đã chốt trong SRS)

Tách vận hành cửa hàng thành hai nhóm tài khoản khi Feature Flag bật:

| Vai trò | Trách nhiệm |
|---------|-------------|
| **Bán hàng (Quỹ vàng)** | Tạo HĐ mua/bán, quản lý/giao nhận vàng thuộc tài khoản, theo dõi trạng thái thu/chi; **không** thao tác thu/chi tại quỹ tiền |
| **Quỹ tiền** | Hàng đợi yêu cầu thu/chi từ HĐ, xác nhận thanh toán, số dư + sổ biến động; **không** quản lý vàng |
| **Admin** | Tạo/gán tài khoản, phân bổ tiền/vàng, dashboard, tra cứu, chứng từ chuyển tiền A4 |

**Không đổi:** công thức tính tiền/giá, đặt cọc / TT một phần / TT đủ, hủy HĐ (chỉ đảo đúng tài khoản), in HĐ A5 (chỉ bổ sung mã liên kết nếu có).

**Feature Flag bắt buộc:** bật = luồng mới; tắt = luồng cũ (CASH-001/BANK-001 + tồn SKU toàn cửa hàng như hiện tại). Đổi flag không mất dữ liệu.

---

## 2. Baseline hiện tại (audit 2026-11-18)

### 2.1 Quỹ tiền hiện có = quỹ **cửa hàng**, không phải quỹ nhân viên

| Thành phần | Hiện trạng |
|------------|------------|
| Bảng | `pos_cash_accounts` (`CASH-001`, `BANK-001`), `pos_cash_ledger` |
| Post tiền | Trigger khi `INSERT` payment → `pos_private.cash_post` **ngay** |
| Transfer | `pos_cashflow_transfer` — trừ/cộng **ngay**, admin-only; **không** chờ bên nhận xác nhận |
| UI | `/cashflow` — admin; không hàng đợi yêu cầu từ POS |
| Phân quyền | STAFF **không** vào cashflow |

### 2.2 Tồn kho / “Quỹ vàng”

| Thành phần | Hiện trạng |
|------------|------------|
| Tồn | `pos_inventory_stock` — **một pool / SKU**, không theo nhân viên |
| Sổ kho | `pos_inventory_transactions` + `apply_stock_change` (actor = audit, không phải ví vàng) |
| `/gold-management` | Nghĩa vụ **chi khách/NCC** (PREORDER/DEPOSIT…), **không** phải ví vàng nhân viên |

### 2.3 Feature Flag

Chưa có flag nghiệp vụ tập trung. Chỉ có `HIDDEN_RELEASE_HREFS`, cờ cột SKU, draft `pos_app_settings` (P6, chưa wire).

### 2.4 Khoảng trống so với SRS

| SRS | Gap |
|-----|-----|
| Nhiều tài khoản Quỹ tiền / Quỹ vàng theo NV | Không có `staff_id` trên cash; không có ví vàng |
| Hàng đợi yêu cầu thu/chi từ Bán hàng → Quỹ tiền | Payment post ngay; không queue |
| Chuyển tiền A4 + **Đã xác nhận** bên nhận rồi mới cộng/trừ | Transfer hiện tại tức thì |
| Tồn vàng theo tài khoản NV | Stock global |
| Liên kết HĐ ↔ quỹ tiền + quỹ vàng | Payment có `received_by_staff_id` (attribution), không chọn quỹ |
| Feature Flag bật/tắt song song | Chưa có |

---

## 3. Nguyên tắc triển khai (bắt buộc)

1. **Module isolation:** mỗi nhóm chức năng = module + router riêng; không sửa module ngoài phạm vi giai đoạn đang làm.
2. **Reuse trước khi tạo mới:** ledger pattern (`balance_before`/`after`, idempotency, `transfer_group_id`) lấy cảm hứng từ `pos_cash_ledger`; **không** gắn `staff_id` lên `CASH-001`/`BANK-001` khi flag tắt.
3. **Không đổi công thức giá / trạng thái TT / hủy HĐ UI** — chỉ đảo đúng tài khoản khi flag bật.
4. **Schema:** SRS nói tận dụng bảng hiện có; audit cho thấy **không đủ** cho quỹ NV → mọi bảng/RPC mới phải được **chốt ở §4** rồi mới migration + GRANT §32.1 + snapshot `tlkv_backup_*`.
5. **Triển khai lần lượt + hard-test** từng module trước khi sang module sau (SRS P6 §7).
6. **P9 §5** (sửa giá bán ngoài CRUD) vẫn **hoãn** — không nằm trong P10 dù SRS P6 §6.5 nhắc “chỉnh sửa giá bán thủ công”.

---

## 4. Quyết định đã chốt

Xem bảng tóm tắt **Phần H** và chi tiết Câu 1–10 / Phần C–G tại:

→ [`P10-01-AS-IS-AND-DECISIONS.md`](./P10-01-AS-IS-AND-DECISIONS.md)

Điểm chính: quỹ NV bảng mới; tiền chỉ vào quỹ NV (không kép CASH/BANK); custody vàng; F9/lưu đơn → YC thu/chi; **2 bước xác nhận** QT tiền → QV trả vàng ([`P10-03`](./P10-03-TWO-STEP-CONFIRM-FLOW.md)); phiếu `YC-THU`/`YC-CHI` + chuyển tiền `CTCT`; cấm cộng/trừ thủ công; Flag `pos_employee_fund_enabled` (DB + ENV ép tắt).

---

## 5. Thứ tự module (đã chốt — bám P10-01 Phần E)

| # | Module / router | Nội dung | Hard-test trọng tâm |
|---|-----------------|----------|---------------------|
| 0 | `shared` / settings | Feature Flag đọc/ghi; nav ẩn hiện | Flag off = POS/cashflow cũ |
| 1 | `fund-cash` | CRUD tài khoản Quỹ tiền, phân bổ Admin, sổ + kiểm kê | Số dư before/after, idempotent |
| 2 | `fund-cash` transfer | Chứng từ A4, chờ xác nhận, cộng/trừ 1 lần | Double-confirm blocked |
| 3 | `fund-gold` | CRUD Quỹ vàng, phân bổ, tồn custody, kiểm kê, lịch sử, chuyển vàng | Không âm hạn mức; đúng SKU |
| 4 | `fund-admin` | Dashboard + tra cứu tổng hợp | Tổng = sum tài khoản, không số dư ảo |
| 5 | `pos` / `purchase` / `invoice` (flag on) | Chọn quỹ; tạo payment request; UI trạng thái tiền; không bắt NV bán vào màn quỹ tiền | Flag off regression |
| 6 | Queue xác nhận Quỹ tiền | Confirm → ledger + link HĐ | Không tạo HĐ mới chỉ để thu/chi |
| 7 | Void / hủy | Đảo đúng quỹ đã post | Không double-refund |

Mỗi bước: snapshot DB theo `00-BACKUP-ROLLBACK.md` trước migration; GRANT §32.1 cùng migration.

---

## 6. Module boundary (dự kiến)

| Module | Allowed | Forbidden (không chạm khi chưa đến bước) |
|--------|---------|------------------------------------------|
| `fund-cash` | `src/modules/fund-cash/**`, `src/app/(admin)/fund-cash/**`, RPC/migration quỹ tiền | Đổi trigger payment cũ khi flag off; sửa công thức giá |
| `fund-gold` | `src/modules/fund-gold/**`, route riêng | Đổi `gold-management` nghĩa vụ chi; đổi P9 công thức |
| `fund-admin` | `src/modules/fund-admin/**` hoặc tab trong admin | Duplicate UI chi tiết đã có trong fund-* |
| Flag | `src/shared/lib/feature-flags.ts` (+ settings nếu QD-5A) | Rải `if (flag)` lung tung không qua helper |

Cross-module: chỉ qua contract/query đã publish — không đọc bảng nội bộ module khác.

---

## 7. Logic cũ phải giữ nguyên (regression khi flag OFF)

1. Payment bán/mua → trigger → `CASH-001`/`BANK-001` như hiện tại.
2. `pos_cashflow_transfer` tức thì (admin).
3. Tồn `pos_inventory_stock` một pool; kiểm kê/báo cáo/P9 nhận hàng không đổi.
4. Đặt cọc / một phần / đủ; PREORDER fulfill stock timing.
5. Hủy HĐ / đảo phiếu: hoàn tiền sổ cửa hàng như hiện tại.
6. `/gold-management` vẫn là nghĩa vụ chi — **không** đổi tên/nghĩa thành ví NV.
7. DongInput / format VND đã chuẩn hóa — mọi input tiền mới phải dùng chung.

---

## 8. Tiêu chí hoàn thành (rút từ SRS P6 §6)

- [ ] Flag on/off; off = luồng cũ ổn
- [ ] Admin CRUD + phân bổ Quỹ tiền / Quỹ vàng
- [ ] Queue thu/chi từ HĐ; confirm cập nhật đúng quỹ; link HĐ
- [ ] Chuyển tiền A4 + xác nhận 1 lần; lịch sử 2 chiều
- [ ] Quỹ vàng: tồn/kiểm kê/lịch sử/chuyển; bán-mua-hủy đúng tài khoản
- [ ] Admin dashboard tổng = dữ liệu tài khoản thật
- [ ] Hủy HĐ: đảo đúng quỹ; giữ lịch sử gốc; không hoàn trùng
- [ ] Hard-test từng module trên port 3000 (`POS-DEV-BUILD.md`)

---

## 9. Lịch sử thay đổi

| Ngày | Nội dung |
|------|----------|
| 2026-11-18 | Tiếp nhận SRS P1–P6; audit baseline; **chưa code** |
| 2026-11-18 | Thêm `P10-01-AS-IS-AND-DECISIONS.md` (AS-IS + câu hỏi) |
| 2026-11-19 | Chốt Câu 1–10 + quyền quỹ + phiếu YC thu/chi; sẵn sàng code theo Phần E |
