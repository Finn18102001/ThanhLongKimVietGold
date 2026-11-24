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

## 6. Lịch sử lệch Module 4b (đã xử lý / đang xử lý)

Hard-test cũ `HD004139` / `HD004140`: F9 `ISSUED` + trừ custody ngay khi YC PENDING — sai P10-03 (đã tách stock sang confirm gold 2026-11-22).

Round UX 2026-11-22: wire §5.1 (In phiếu / Đơn đã lưu / Kiểm tra trạng thái mua).

2026-11-22 (sau): «In phiếu» mua+bán = **xem trước A4** rồi mới In (không auto `window.print`) — `YcPrintPreviewOverlay`.

2026-11-22 (sau): F9 trả vàng sau QT → `PosPaymentSuccess` → trang HĐ để **In hóa đơn** như AS-IS.
