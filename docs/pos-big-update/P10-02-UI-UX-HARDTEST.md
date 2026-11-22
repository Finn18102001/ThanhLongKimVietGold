# P10-02 — UI/UX Quỹ tiền · Quỹ vàng + hard-test giao diện

> Nhánh: `Finn/Future/Manager-Gold-Money`  
> Nguyên tắc round này: **UI/UX 100% trước → func/nghiệp vụ → nghiệm thu**.  
> Hard-test DevTools ưu tiên **nhìn thấy / click được / layout đúng template**; chưa bắt buộc chứng minh sổ tiền/vàng đúng hết.

Liên quan: [`P10-00`](./P10-00-FUND-ACCOUNTS-SRS.md) · [`P10-01`](./P10-01-AS-IS-AND-DECISIONS.md) · [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md)

---

## 1. Thứ tự ưu tiên UI (làm trước phần còn thiếu)

| Ưu tiên | Hạng mục | Mục tiêu UX | Trạng thái round này |
|--------|----------|-------------|----------------------|
| P0 | Quỹ tiền — shell Bán/Mua | NV chỉ có Quỹ tiền: `/pos` = card YC-THU; `/purchase` = card YC-CHI; click → chi tiết xác nhận | Đã code |
| P0 | Quỹ tiền — tab Chuyển + Ca | Trong `/fund-cash` (NV): CTCT + lịch sử / đầu–cuối ca | Đã code |
| P1 | Quỹ vàng — tab Ca | Thêm tab «Ca làm việc»: tồn đầu ca / biến động / cuối ca (UI từ ledger) | Đã code |
| P1 | Admin lối vào | Banner từ «Quản lý dòng tiền» → Quỹ tiền NV; từ «Quản lý vàng» → Quỹ vàng NV | Đã code |
| P1 | Tạo TK có chữ **test** | Ô tên khi tạo QT/QV; gợi ý `… quỹ tiền test` / `… quỹ vàng test` | Đã code |
| P2 | Func F9/YC-CHI/void E2E | Sau khi UI ổn | F9→YC-THU + QV gold **OK**; YC-CHI buy **OK**; **void đảo YC Quỹ tiền/vàng** (P10 M6 `20261122060000`) |
| P2 | Đầu/cuối ca “đóng ca” RPC | UI hiển thị trước; RPC đóng ca sau | Chưa |

---

## 2. Role shell (hiển thị)

| Vai | Bán hàng `/pos` | Mua vào `/purchase` | Menu quỹ |
|-----|-----------------|---------------------|----------|
| Admin | Catalog POS như cũ | Catalog mua như cũ | QUẢN TRỊ: Quỹ tiền NV / Quỹ vàng NV |
| NV chỉ Quỹ tiền | **Card YC-THU** chờ duyệt | **Card YC-CHI** chờ duyệt | Quỹ tiền (CTCT + ca) |
| NV chỉ Quỹ vàng | Catalog POS | Catalog mua | Quỹ vàng (4 tab + Ca) |
| Kiêm cả hai | Catalog POS (+ vào Quỹ tiền để duyệt) | Catalog mua | Cả hai menu |

Template: Be Vietnam, card `rounded-[12px]`, `--tlkv-red`, denseness admin hiện có — không invent layout lạ.

---

## 3. Data test — đặt tên & dọn

**Quy ước tên tài khoản quỹ (bắt buộc hard-test UI):**

- Quỹ tiền: `{Tên NV} tài khoản quỹ tiền test` — ví dụ `Dương tài khoản quỹ tiền test`
- Quỹ vàng: `{Tên NV} tài khoản quỹ vàng test` — ví dụ `Dương tài khoản quỹ vàng test`

**Ghi nhận trước/sau round**

| Loại | Ghi mã | Sau hard-test UI |
|------|--------|------------------|
| Tài khoản QT/QV có chữ `test` | code QT-… / QV-… | **Ẩn** (`is_active=false`) hoặc để Admin đánh dấu; không xóa vật lý nếu đã có ledger |
| CTCT / YC tạo khi chơi UI | mã chứng từ | Hủy PENDING; YC reject hoặc VOID_REVERSAL nếu đã confirm (round nghiệp vụ) |
| Không tạo HĐ bán/mua thật ở round UI-only | — | Tránh đụng CASH-001 khi Flag OFF |

Local = DB production → chỉ tạo object có chữ **test** khi có thể.

### Log round UI 2026-11-21

| Thời điểm | Object | Mã / tên | Ghi chú |
|-----------|--------|----------|---------|
| 2026-11-21 ~22:35 | TK quỹ tiền | `QT-000003` · Dương tài khoản quỹ tiền test | Tạo UI; **đã ẩn** `is_active=false` |
| 2026-11-21 ~22:36 | TK quỹ vàng | `QV-000003` · Dương tài khoản quỹ vàng test | Tạo UI; **đã ẩn** `is_active=false` |
| 2026-11-21 | Flag | `pos_employee_fund_enabled` BẬT khi hard-test UI | Tắt lại sau round |

### Log round func Quỹ tiền 2026-11-21 (~22:44–22:50)

| Thời điểm | Object | Mã | Kết quả |
|-----------|--------|-----|---------|
| ~22:44 | Nạp QT-ADMIN | 100.000 đ | OK |
| ~22:45 | Phân bổ → QT-000003 | 50.000 đ | OK (Admin 50k / QT-000003 50k) |
| ~22:46 | CTCT | `CTCT-000002` 10.000 QT-000003→QT-000002 | Confirm OK (Admin 50k / 003 40k / 002 10k) |
| ~22:48 | F9 bán Flag ON | `HD004138` · TLKVTS000020 · 148.700 đ · KH E2E Ngày VN Test | Invoice ISSUED; `pos_sale_payments` = **0** |
| ~22:48 | YC auto | `YC-THU-000002` PENDING 148.700 ← HD004138 | OK |
| ~22:49 | Confirm YC | Admin → QT-ADMIN 50.000→**198.700** | UI: «Đã xác nhận YC-THU-000002 → QT-ADMIN» |
| — | CASH-001 | 32.142.301 | **Không đổi** (baseline giữ) |
| ~22:50 | Rollback | `VOID_REVERSAL` QT-ADMIN/002/003 → 0; ẩn QT-000003 + QV-000003; Flag **OFF** | CASH-001 vẫn 32.142.301 |
| — | YC-CHI | — | **Skip**: buy melt chưa hook `employee_fund` |
| ~22:54 | Hủy HĐ test | `HD004138` → **VOIDED** | Kho hoàn; CASH-001 không đổi (không có `pos_sale_payments`) |
| — | `HD003854` | ISSUED + có payment 2.554.000 | **Không hủy** — void sẽ đụng CASH-001 |
| ~22:55 | Self-test TK | `QT-000004` · Linh tài khoản quỹ tiền test | Active · 0 đ |
| ~22:55 | Self-test TK | `QV-000004` · Linh tài khoản quỹ vàng test | Active · NV Linh |
| ~22:55 | Flag | `pos_employee_fund_enabled` | **ON** (để self-test UI/UX) |

### Log self-test 2 TK + E2E bán 2026-11-21 (~23:10–23:25)

| Thời điểm | Object | Mã | Kết quả |
|-----------|--------|-----|---------|
| ~23:10 | STAFF + QT | `testquytien@gmail.com` · `QT-000005` · Tài khoản test quỹ tiền | Pass `1234567`; shell Quỹ tiền |
| ~23:12 | STAFF + QV | `testquyvang@gmail.com` · `QV-000005` · Tài khoản test quỹ vàng | Pass `1234567`; shell Quỹ vàng + catalog |
| ~23:12 | UI | Password NV min **7**; banner cashflow/gold → «Quản lý Quỹ … NV» | OK |
| ~23:12 | Port | Stop + rebuild `npm run dev` :3000 | Hard-test DevTools |
| ~23:18 | F9 bán (quyvang) | `HD004139` · TLKVTS000020 · 148.700 · KH002868 | ISSUED; không ghi CASH-001 |
| ~23:18 | YC auto | `YC-THU-000003` PENDING ← HD004139 | OK |
| ~23:20 | Confirm (quytien) | `YC-THU-000003` → **CONFIRMED** · QT-000005 **0→148.700** | CASH-001 **32.142.301** giữ |
| ~23:22 | Mua vào UI | quyvang: form mua đầy đủ; quytien: shell card YC-CHI | **Không chốt buy** — melt chưa hook YC-CHI (tránh đụng CASH) |

### Log E2E bán+mua P10-03 Flag ON 2026-11-22 (~00:00–00:45)

| Thời điểm | Object | Mã | Kết quả |
|-----------|--------|-----|---------|
| ~00:10 | Flag | `pos_employee_fund_enabled` | **ON** — flow mới (không CASH-001) |
| ~00:20 | F9 bán (quyvang) | `HD004141` · 148.700 · SALE-003617 | ISSUED; `pos_sale_payments`=0; fulfillment chờ QV |
| ~00:20 | YC auto | `YC-THU-000005` PENDING ← HD004141 | OK |
| ~00:25 | Confirm tiền (quytien) | `YC-THU-000005` → **CONFIRMED** · QT-000005 ↑ | CASH-001 **66.180.000** giữ |
| ~00:30 | Confirm vàng (quyvang) | `pos_employee_sale_confirm_gold` | SALE **DELIVERED**; kho trừ sau QT |
| ~00:39 | Mua vào (quyvang) | `BUY-000509` · 140.700 · THỊNH QUANG KH BUÔN | COMPLETED; nhận kho AS-IS; `pos_buy_payments`=0 |
| ~00:39 | YC auto | `YC-CHI-000001` PENDING ← BUY-000509 | OK |
| ~00:45 | Confirm chi (quytien) | `YC-CHI-000001` → **CONFIRMED** · QT-000005 **297.400→156.700** | CASH-001 **66.180.000** không đổi |

**Mã chờ hủy / dọn (không xóa vật lý):**

| Mã | Loại | Ghi chú void |
|----|------|--------------|
| `HD004139` | HĐ bán | **Đã VOIDED** (2026-11-22) — kho hoàn + `YC-THU-000003` REVERSED |
| `YC-THU-000003` | YC thu ← HD004139 | **REVERSED** · QT-000005 OUT 148.700 |
| `HD004141` | HĐ bán | **Đã VOIDED** (2026-11-22) — kho hoàn + `YC-THU-000005` REVERSED |
| `YC-THU-000005` | YC thu ← HD004141 | **REVERSED** · QT-000005 OUT 148.700 |
| `BUY-000509` | Phiếu mua | **Đã VOIDED** (2026-11-22) — kho đảo + `YC-CHI-000001` REVERSED |
| `YC-CHI-000001` | YC chi ← BUY-000509 | **REVERSED** · QT-000005 IN 140.700 |
| `HD004140` | HĐ bán | **Đã VOIDED** |
| `YC-THU-000004` | YC thu PENDING ← HD004140 | Reject/đóng PENDING (HĐ đã void) |
| `BUY-000511` | Mua có nấu · AWAITING_CONFIRM | Đã bump intended=total (hotfix); tiếp Đồng ý → In phiếu |
| `BUY-000512` | Mua skip-melt | **Đã VOIDED** (2026-11-22): In phiếu `YC-CHI-000003` → QT confirm → complete `BK20261122-643` → void |
| `YC-CHI-000003` | YC chi ← BUY-000512 | **REVERSED** (backfill P10 M6) — QT-000005 hoàn 140.700 |
| `YC-CHI-000002` | YC chi PENDING ← BUY-000510 | Dọn / reject nếu test thừa |

### % hoàn thành (2026-11-22)

| Kế hoạch | Ước % | Ghi chú |
|----------|------:|---------|
| **UI code** (P10-02 §1 P0–P1) | **100%** | Shell card, banner, tab Ca, tên test — đã code |
| **Hard-test UI checklist** (§4) | **~95%** | YC-THU + YC-CHI card thật OK |
| **Func/nghiệp vụ** (F9→YC-THU→QV gold · mua→YC-CHI) | **~98%** | E2E + void đảo YC (M6) OK; còn RPC đóng ca |
| **P10 tổng (UI + func round này)** | **~93%** | Flag ON full flow mới; mã test ghi sẵn để hủy |

### Production AS-IS ép tắt (2026-11-22)

Hệ thống cũ còn người dùng → **không** để Flag ON trên live:

| Lớp | Trạng thái | Ghi chú |
|-----|------------|---------|
| DB `pos_employee_fund_enabled` | **OFF** | `updated_by=system:force-off-live-users-2026-11-22` — RPC `employee_fund_flag_on()` chỉ đọc DB |
| ENV `TLKV_EMPLOYEE_FUND_FORCE_OFF` | **`1`** | Vercel production/preview/development + `.env.example` / local — app layer ép AS-IS |
| Branch push | `Finn/New/POS-Future` | Code P10 giữ nguyên; Flag OFF = luồng CASH-001/BANK-001 |

---

## 4. Checklist hard-test UI (DevTools)

Port 3000 · login theo [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md) · **bật Flag** tại Cài đặt trước.

1. Admin: Cài đặt → bật `pos_employee_fund_enabled`.
2. Admin → Quỹ tiền NV: tạo TK tên `… quỹ tiền test`; thấy list + form nạp/phân bổ.
3. Admin → Quỹ vàng NV: tạo TK tên `… quỹ vàng test`; 5 tab (Tồn / Kiểm kê / Lịch sử / Chuyển / **Ca**).
4. Quản lý dòng tiền: thấy banner link Quỹ tiền NV.
5. Quản lý vàng: thấy banner link Quỹ vàng NV.
6. (NV Quỹ tiền test) Login → Bán hàng: lưới **card** YC-THU (không catalog SP); click card → panel chi tiết.
7. (NV Quỹ tiền test) Mua vào: card YC-CHI tương tự.
8. Quỹ tiền (NV): tab/khối Chuyển CTCT + Ca/lịch sử đọc được.
9. Sau round: tắt Flag về OFF nếu không tiếp tục; ghi mã TK test để ẩn.

---

## 5. Lịch sử

| Ngày | Nội dung |
|------|----------|
| 2026-11-21 | Khởi tạo P10-02; ưu tiên UI shell Quỹ tiền/vàng + quy ước tên test |
| 2026-11-21 | Code UI: CashRequestCards shell, CashFundClerkWorkspace, FundGold tab Ca + tên test, banner cashflow/gold-management |
| 2026-11-21 | Hard-test UI: Flag ON → tạo QT-000003 / QV-000003 (… test) → banner OK → tab Ca OK → ẩn TK + Flag OFF. Fix list hiện `name` thay vì `staffName` |
| 2026-11-21 | Hard-test func Quỹ tiền: nạp/phân bổ + CTCT-000002 + F9 HD004138 → YC-THU-000002 confirm → QT-ADMIN↑ CASH-001 giữ; rollback VOID_REVERSAL + Flag OFF. YC-CHI chưa sẵn sàng |
| 2026-11-21 | Hủy `HD004138`; tạo self-test `QT-000004` / `QV-000004` (Linh … test); Flag ON; ghi % UI/func |
| 2026-11-21 | Self-test: `testquytien`/`testquyvang` + QT/QV-000005; rebuild port; E2E bán HD004139→YC-THU-000003→QT-000005; mua skip (YC-CHI hook) |
| 2026-11-21 | Chốt lại Câu 4/5 → [`P10-03`](./P10-03-TWO-STEP-CONFIRM-FLOW.md): chỉ QT+Admin confirm tiền; QV lưu đơn + in A4 đầu; trả vàng sau QT; HD004140 = lệch Module 4b |
| 2026-11-22 | Code P10-03: Flag ON F9 không trừ kho; RPC `pos_employee_sale_confirm_gold` + panel QV; inventory ẩn tab kho cho NV quỹ; gỡ tab Trả hàng |
| 2026-11-22 | Hard-test E2E Flag ON: `HD004141`→`YC-THU-000005`→QV gold DELIVERED; `BUY-000509`→`YC-CHI-000001` confirm; QT-000005 156.700; CASH-001 66.180.000 giữ. **Mã chờ hủy:** HD004141, YC-THU-000005, BUY-000509, YC-CHI-000001; reject YC-THU-000004 (HD004140 đã VOIDED) |
| 2026-11-22 | UX wire §5.1 P10-03: bán In phiếu→Đơn đã lưu; mua In phiếu+Kiểm tra trạng thái. Hotfix intended_paid sau nấu (`BUY-000511` unlock). RPC `pos_buy_issue_fund_request` / gate complete. **Còn hard-test UI In phiếu đầy đủ sau khi picker KH ổn.** Mã kẹt: BUY-000511 AWAITING_CONFIRM; BUY-000512 INVOICE_ISSUED |
| 2026-11-22 | `BUY-000512`: issue `YC-CHI-000003` → QT-000005 confirm → complete → **VOIDED**. Gap void↔quỹ đã vá P10 M6 |
| 2026-11-22 | **P10 Module 6:** void bán/mua đảo YC (`REVERSED` + `VOID_REVERSAL` đúng TK confirm) + đảo custody QV; backfill YC gắn chứng từ đã VOIDED. Rule: P10-01 D7 · P10-03 §5.2 |
| 2026-11-22 | Hủy nốt hard-test còn lại: `BUY-000509`+`YC-CHI-000001`, `HD004141`+`YC-THU-000005` → QT-000005 về **148.700** (= đầu ca) |
| 2026-11-22 | Hủy `HD004139` + `YC-THU-000003` REVERSED · kho hoàn · QT-000005 → **0** |
| 2026-11-22 | **AS-IS ép tắt live:** DB Flag OFF + Vercel/local `TLKV_EMPLOYEE_FUND_FORCE_OFF=1`; push `Finn/New/POS-Future` |
