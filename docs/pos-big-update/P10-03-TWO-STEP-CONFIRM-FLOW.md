# P10-03 — Flow 2 bước xác nhận (Quỹ tiền → Quỹ vàng)

> Chốt: **2026-11-21** · Đè Câu 4/5 cũ trong [`P10-01`](./P10-01-AS-IS-AND-DECISIONS.md)  
> Liên quan: [`P10-00`](./P10-00-FUND-ACCOUNTS-SRS.md) · [`P10-01`](./P10-01-AS-IS-AND-DECISIONS.md) · [`P10-02`](./P10-02-UI-UX-HARDTEST.md)

---

## 1. Mục tiêu

Khi Feature Flag `pos_employee_fund_enabled` **ON**, mỗi lần thu/chi gắn hóa đơn/đơn đi qua **đúng 2 bước xác nhận tuần tự**:

1. **Quỹ tiền** (hoặc Admin) xác nhận đã nhận/chi tiền thực tế → cập nhật số dư QT + ký chứng từ giấy.
2. **Quỹ vàng** xác nhận trả/giao vàng (= «xác nhận hóa đơn» phía QV) → trừ kho/custody theo nghiệp vụ hiện tại + in chứng từ thanh toán cuối.

P10 **không** redesign điều kiện/thời điểm hóa đơn được coi là **hoàn thành** (cọc / một phần / đủ). Logic đó giữ nguyên POS hiện tại. Future chỉ **tách** mua/bán thành 2 bước xác nhận trên 2 tài khoản.

Flag **OFF** = hành vi POS AS-IS (không đổi).

---

## 2. Câu 4 (chốt lại 2026-11-21) — Ai được xác nhận tiền?

**Chỉ Admin và tài khoản Quỹ tiền** được xác nhận nhận/chi tiền của hóa đơn (kể cả đặt cọc hoặc thanh toán một phần).

- **Quỹ vàng không có quyền** xác nhận thu/chi tiền, không bật nút «Đủ / nhận tiền» thay QT.
- Mỗi khoản thanh toán phát sinh sau (cọc tiếp / thu thêm) = YC riêng; không một lần confirm thay cho các khoản sau.

---

## 3. Câu 5 (chốt lại 2026-11-21) — Flow F9 / lưu đơn / xác nhận

### 3.1 Bán thông thường (và cùng khung cho cọc / một phần)

```text
QV tạo HD (form hiện tại)
  → Tạo chứng từ A4 đủ thông tin HĐ (form đã có) → in chứng từ ban đầu
  → Lưu đơn (không giữ màn hình chờ; được làm giao dịch khác)
  → QT nhận card chờ thu/chi (YC) → QT/Admin Xác nhận tiền + ký giấy
  → Nút «Xác nhận hóa đơn / trả vàng» phía QV mới ENABLE
  → QV chọn đơn đã lưu → Xác nhận trả vàng
  → In chứng từ thanh toán cuối
  → Hoàn thành theo logic POS hiện tại (cọc/một phần/đủ không đổi)
```

### 3.2 Ý nghĩa từng bước

| Bước | Ai | Hệ thống làm gì | Không được |
|------|----|-----------------|------------|
| Tạo + in A4 đầu + lưu đơn | QV | Lưu đơn; tạo YC cho QT; chứng từ ban đầu in được | Trừ kho/custody QV; coi đã giao vàng; cộng QT |
| Xác nhận tiền | QT hoặc Admin | Cộng/trừ QT; YC → CONFIRMED; mở khóa bước QV | Thay bước trả vàng của QV |
| Xác nhận HĐ / trả vàng | QV | Trừ kho + custody theo loại HĐ hiện tại; cho in chứng từ cuối | Chạy trước khi QT confirm |
| Hoàn thành HĐ | Logic POS cũ | Cọc / một phần / đủ như hiện tại | P10 không đặt rule hoàn thành mới |

### 3.3 Quy tắc khóa

1. QV tạo HĐ/đơn + chứng từ ban đầu.
2. QT nhận card và xác nhận khoản tiền thực tế.
3. **QT chưa confirm → QV không được xác nhận trả vàng** (nút disable).
4. Chỉ sau QT confirm, QV mới xác nhận trả vàng.
5. Sau QV xác nhận → cho in chứng từ thanh toán cuối.
6. In chứng từ ban đầu ≠ giao dịch đã hoàn tất.
7. QT confirm ≠ thay bước trả vàng của QV.
8. Không gộp 2 xác nhận thành một thao tác.
9. Không bắt NV chờ trên màn tạo HĐ trong lúc QT xử lý.

---

## 4. Đặt cọc / thanh toán một phần

- Vẫn dùng form + trạng thái TT của POS hiện tại (Đủ / Đặt cọc / Chờ TT).
- Mỗi lần phát sinh khoản tiền → card/YC tương ứng → **chỉ QT/Admin** confirm.
- Sau mỗi lần QT confirm khoản đó, QV mới được xác nhận trả vàng **tương ứng** (nếu lần đó có giao vàng).
- Khi nào HĐ «hoàn thành» = logic POS hiện tại; P10 không suy diễn.

---

## 5. UI tối thiểu

**Quỹ vàng:** form tạo HĐ như cũ; in chứng từ A4 ban đầu; danh sách đơn đã lưu + trạng thái «chờ QT»; nút xác nhận trả vàng **enable sau QT**; in chứng từ cuối sau xác nhận QV.

**Quỹ tiền / Admin:** card chờ theo từng YC; link HĐ; Xác nhận; In phiếu YC A4; ký tay trên giấy sau confirm.

**Quỹ vàng không thấy / không dùng** thao tác xác nhận tiền trên HĐ khi Flag ON.

---

## 5.1 UX wire chốt 2026-11-22 (đè implementation lệch)

> Flag **ON** only. Flag OFF = AS-IS (F9 / Đồng ý / Xác nhận HĐ như cũ).

### Bán — modal «Xác nhận đơn hàng»

Footer QV:

| Nút | Trạng thái ban đầu | Ý nghĩa |
|-----|--------------------|---------|
| Quay lại | Always | Đóng modal, giữ giỏ |
| **In phiếu** | Enabled | Tạo HD + YC-THU PENDING → **mở xem trước phiếu A4** (giống xem HĐ bán) → NV kiểm tra rồi bấm «In phiếu»; đơn vào **«Đơn đã lưu»** chờ QT. **Không** mở hộp thoại in máy ngay |
| **Xác nhận & thanh toán F9** | **Disabled** trên lần tạo mới | Chỉ **enable** khi mở lại đơn từ «Đơn đã lưu» **và** YC-THU đã **CONFIRMED** → F9 = **xác nhận trả vàng** (trừ kho / DELIVERED), không phải chốt tiền |

Sau F9 trả vàng thành công: **mở màn thành công → chuyển xem/in hóa đơn bán** như luồng AS-IS (PosPaymentSuccess → trang HĐ, In hóa đơn F9). Không chỉ hiện toast.

Quy tắc:

1. Phiếu yêu cầu thu/chi **xem + in từ tài khoản quỹ vàng** ở bước này (không chờ QT in trước).
2. **Luôn xem trước nội dung phiếu** rồi mới in (mua và bán giống nhau; cùng pattern HĐ bán / Phiếu 02).
3. Không bắt QV ngồi chờ trên modal trong lúc QT xử lý — sau xem/in phiếu → «Đơn đã lưu».
4. Một chỗ UI cho đơn chờ: **«Đơn đã lưu»** (không panel «chờ trả vàng» tách rời).
5. Sau QT confirm + QV F9 trả vàng → **in hóa đơn cuối** như bán thường.

### Mua — bước `INVOICE_ISSUED` («Xác nhận hóa đơn → Phiếu 02»)

> **Đè 2026-11-25 (P10 M1):** dùng section **«Đơn mua đang chờ xác nhận»** dưới form Mua (mirror «Đơn đã lưu» bán) — không giữ NV trên modal trong lúc QT xử lý.

| Nút | Trạng thái | Ý nghĩa |
|-----|------------|---------|
| **In phiếu** | Enabled | Tạo YC-CHI PENDING → **mở xem trước phiếu A4** → sau đó đóng drawer; phiếu vào list chờ QT. Chưa nhập kho / chưa CASH |
| **Kiểm tra trạng thái** | Enabled (khi mở lại từ list) | Poll YC-CHI theo `buy_no` — nếu QT đã CONFIRMED → unlock nút xác nhận |
| **Xác nhận hóa đơn → Phiếu 02** | **Disabled** đến khi YC-CHI CONFIRMED | Complete Form02 + nhập kho AS-IS (P10-01 D4); không INSERT `pos_buy_payments` khi Flag ON |

Server **gate** complete: Flag ON → từ chối `pos_complete_buy_melt` nếu chưa có YC-CHI CONFIRMED (không tin UI).
List RPC: `pos_list_buys_awaiting_fund` (Flag ON).

### Lệch code cần gỡ (2026-11-22)

- `GoldAwaitingConfirmPanel` tách khỏi «Đơn đã lưu» → gộp / thay bằng trạng thái trên held list.
- F9 trên checkout vẫn = `complete_sale` ngay → đổi: In phiếu = tạo HD+YC; F9 sau QT = `confirm_gold`.
- YC-CHI tạo lúc `pos_complete_buy_melt` → **dời** sang bước In phiếu; complete chỉ sau QT confirm.

---

## 5.2 Rule hủy HĐ / phiếu mua (chốt 2026-11-22)

Khi **hủy hóa đơn bán** hoặc **hủy phiếu mua COMPLETED** (Flag ON):

1. Đảo **đúng Quỹ tiền** đã confirm từng YC-THU/YC-CHI gắn chứng từ (`VOID_REVERSAL`; YC → `REVERSED`).
2. YC còn `PENDING` → tự `REJECTED` (không đổi số dư).
3. Bán đã QV xác nhận trả vàng → đảo custody Quỹ vàng gốc + hoàn kho AS-IS.
4. Không hoàn trùng; không đổ vào QT của người đang hủy.
5. Flag OFF: AS-IS CASH-001/BANK-001 qua payment rows.

Chi tiết: [`P10-01` D7](./P10-01-AS-IS-AND-DECISIONS.md) · Module 6.

---

## 5.3 Phương thức TT + «Trạng thái thu» do Quỹ tiền (chốt 2026-11-28)

> Đè một phần [`P10-01` A4](./P10-01-AS-IS-AND-DECISIONS.md) / D3 bước 8 về **nơi chọn** phương thức & trạng thái thu khi Flag ON. Công thức tổng HĐ / cọc / một phần **không** đổi — chỉ đổi **ai chọn** và **khi nào ghi nhận**.

Khi `pos_employee_fund_enabled` **ON**:

| Hạng mục | Quỹ vàng (POS / Mua) | Quỹ tiền (xác nhận YC-THU / YC-CHI) |
|----------|----------------------|-------------------------------------|
| Hình thức thanh toán (TM / CK / Thẻ / MIXED + TK nhận) | **Không** chọn trên form tạo HĐ/phiếu — ẩn section | **Bắt buộc chọn** khi Xác nhận thu/chi; ghi vào YC + sổ QT (`money_kind`) |
| «Trạng thái thu» (Đủ / Đặt cọc / Chờ TT) + số tiền thu | QV chỉ nhập **tổng HĐ / số tiền dự kiến** để tạo YC (nếu cần) — không chốt trạng thái TT cuối | QT/Admin quyết định trạng thái thu thực tế + số tiền confirm; cập nhật `payment_status` / paid trên chứng từ sau confirm |
| In phiếu YC A4 | QV vẫn in phiếu yêu cầu (xem trước) như §5.1 | QT in lại / ký giấy sau confirm |

Flag **OFF** = AS-IS: QV chọn hình thức + trạng thái thu trên POS/Mua như hiện tại.

### Implementation note (2026-11-28 → code 2026-11-28)

- **Đã ship code §5.3 (MVP):** ẩn 2 section POS/Mua khi Flag ON; card QT chọn method + Đủ/Cọc + amount; RPC `pos_employee_cash_request_confirm(id, method, amount, pay_mode)` ghi ngược sale/buy; `pos_employee_fund_mark_awaiting_payment` sau In phiếu → `UNPAID`; reject → void chứng từ (A2). Migration `20261128030000_p10_53_qt_confirm_payment_fields.sql`.
- Còn mở: Q-E báo cáo quỹ; hủy «Chờ TT» từ list QV (UI reason) nếu chưa đủ parity; MIXED split lúc confirm.

---

## 5.4 Chốt bổ sung 2026-11-28 (owner QV/QT + reject + cọc/preorder)

| # | Quyết định | Chi tiết |
|---|------------|----------|
| 1–2 | Ẩn payment UI phía QV | Flag ON: QV **không** thấy / không chọn «Hình thức thanh toán» và «Trạng thái thu». |
| 4 | Move 2 section sang QT | Cả hai section nằm trên **card xác nhận YC** của Quỹ tiền (và Admin). |
| 5 | QT Reject YC = hủy draft | Giống hủy list SP: **xóa/hủy phiếu YC**; xem câu hỏi mở §5.5 về HĐ đã tạo cùng In phiếu. |
| 6 | Nhiều lần thu (cọc / nửa) | Mỗi lần QT chọn thu + cập nhật tiền + status. Khi đã thu **100%**, QV mới tìm HĐ và **in lại** HĐ cuối / hoàn tất vòng vàng theo rule §7. |
| 7 | Đặt hàng / trả một phần — tiền | Chỉ **QT + Admin** đổi status đã nhận tiền / chưa thu-chi và ± quỹ. |
| 7b | Cọc / preorder / trả vàng | **Giữ AS-IS** (fulfill như Flag OFF). Chỉ đổi **ai** được cập nhật status tiền: **QT hoặc Admin** — QV **không** được update tiền. |
| 9 | «Chờ thanh toán» | Sau In phiếu Flag ON → `payment_status=UNPAID`, UI tiếng Việt **«Chờ thanh toán»**. Không invent enum mới. |
| 9b | QV hủy đơn chờ TT | Trong list «Đơn đã lưu» / đơn `UNPAID`: mở ra được **Hủy** (giống từ chối mua), **bắt buộc lý do** không trống → void cụm (khớp A2). |
| 11 | Báo cáo doanh thu theo quỹ | Cộng dồn theo từng quỹ; filter detail thu/chi theo TK quỹ tiền / người quản lý. `payment_status` **chỉ** cập nhật khi QT/Admin xác nhận đã thu/chi. |

### 5.4.1 Mục 3 — RPC/UI confirm còn thiếu gì (chi tiết kỹ thuật)

Hiện `pos_employee_cash_request_confirm(p_request_id uuid)` **chỉ** nhận id YC → post ledger theo `payment_method` **đã gắn trên YC lúc tạo** → `CONFIRMED`. **Chưa có:**

| Thiếu | Vì sao cần |
|-------|------------|
| Input `payment_method` / `money_kind` lúc confirm | QT chọn TM/CK/Thẻ trên card (QV không chọn) |
| Input `pay_mode` / `payment_status` + `amount_dong` confirm | QT chọn Đủ / Cọc / Chờ + số tiền thực thu/chi |
| Ghi ngược `pos_sales` / `pos_buys` (`paid_dong`, `remaining_dong`, `payment_status`, `payment_method`) | §5.3 + mục 11: status tiền chỉ đổi sau QT confirm |
| UI card QT: 2 section «Hình thức TT» + «Trạng thái thu» | Mirror section đang ở POS/Mua |
| Flag ON: ẩn 2 section trên POS + form Mua | Tránh QV chốt sớm |
| Tạo YC không phụ thuộc method từ QV | YC provisional / method null đến lúc QT chọn |
| Reject → xóa/hủy YC (+ ? HĐ) | Mục 5 — chờ chốt §5.5 |
| Gate F9 trả vàng: chỉ khi `payment_status = PAID` (100%)? | Mục 7b — xung đột với cọc giao từng phần |

### 5.4.2 Mục 8 — Mua: nhập kho vs QT (detail hiện trạng)

Hai câu trong sổ **dễ hiểu nhầm** — tách timeline:

```text
QV: … → INVOICE_ISSUED
  → In phiếu = tạo YC-CHI PENDING (+ xem A4)
      ⛔ Chưa nhập kho cửa hàng
      ⛔ Chưa trừ Quỹ tiền / CASH-001
  → QT confirm YC-CHI
  → QV bấm «Xác nhận HĐ → Phiếu 02»
      = pos_complete_buy_melt (gate: bắt buộc YC CONFIRMED)
      → nhập kho AS-IS + Form02
      → vẫn không INSERT pos_buy_payments khi Flag ON
```

**Ý «D4 nhận kho AS-IS»:** công thức/luồng nhập kho **không đổi P8/P9** — chỉ **dời thời điểm** đến sau QT confirm (wire §5.1). Không nhập kho lúc In phiếu.

---

## 5.5 Câu hỏi mở / đã chốt (2026-11-28)

### Q-A — Reject YC → **đã chốt A2**

Khi QT Reject YC: **hủy luôn HĐ bán / phiếu mua** gắn YC + hủy/xóa YC (coi cả cụm như draft bị hủy). Không để HĐ `ISSUED` treo không YC.

Implementation note: dùng luồng void hiện có (Module 6) hoặc tương đương — **không** hard-delete chứng từ đã phát hành; status `VOIDED` + YC đóng. Chi tiết RPC khi code §5.3.

### Q-B — **đã chốt (2026-11-28):** giữ AS-IS nghiệp vụ; chỉ siết quyền update tiền

- Rule cọc / preorder / fulfill / trừ kho: **như Flag OFF** (không đổi «chỉ trả vàng khi 100%»).
- **Ai được cập nhật status tiền / ± quỹ trên HĐ:** chỉ **Admin** hoặc **Quỹ tiền**. **Quỹ vàng không được** update tiền.
- QV vẫn tạo đơn / In phiếu YC / trả vàng theo gate P10 (sau QT confirm khoản tương ứng) — không phải người chốt «đã thu».

### Q-C — **đã chốt:** `UNPAID` + UI **«Chờ thanh toán»**

Flag ON + sau In phiếu → `payment_status=UNPAID`, hiển thị tiếng Việt **«Chờ thanh toán»**. QT confirm mới đổi Đủ/Cọc/… Không thêm enum workflow mới.

### Q-D — **đã chốt D1** + hủy từ QV

- Nhập kho mua: chỉ sau QT confirm + QV «Xác nhận HĐ → Phiếu 02».
- Đơn bán trên list «Đơn đã lưu» đang **«Chờ thanh toán»**: QV mở ra được **Hủy** (giống từ chối mua), **lý do bắt buộc không trống** → void cụm (A2).
- **Đơn mua** `UNPAID` / «Chờ thanh toán» (YC-CHI PENDING): QV mở chi tiết → **Hủy** + lý do bắt buộc → `pos_buy_cancel_awaiting_payment` (≡ Reject YC, phiếu `CANCELLED`, không đảo kho). QT confirm / QV hủy khóa cùng buy (advisory + `FOR UPDATE`); chỉ một thao tác thắng. Migration `20261128040000_p10_qv_cancel_buy_awaiting_payment.sql`.

### Q-E — Phạm vi báo cáo quỹ

Chưa chốt E1/E2/E3.

---

## 6. Lịch sử lệch Module 4b (đã xử lý / đang xử lý)

Hard-test cũ `HD004139` / `HD004140`: F9 `ISSUED` + trừ custody ngay khi YC PENDING — sai P10-03 (đã tách stock sang confirm gold 2026-11-22).

Round UX 2026-11-22: wire §5.1 (In phiếu / Đơn đã lưu / Kiểm tra trạng thái mua).

2026-11-22 (sau): «In phiếu» mua+bán = **xem trước A4** rồi mới In (không auto `window.print`) — `YcPrintPreviewOverlay`.

2026-11-22 (sau): F9 trả vàng sau QT → `PosPaymentSuccess` → trang HĐ để **In hóa đơn** như AS-IS.
