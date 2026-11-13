# P6 U1 — UNIT–MSP ARCHITECTURE

## Decision & Implementation Specification

> **Trạng thái:** Draft — chờ hoàn thiện review SQL/RPC và phê duyệt Bước 3  
> **Phạm vi:** POS — Unit vật lý, MSP, Mint, Print, Sales, Stock-in  
> **Nguyên tắc:** Audit trước, thiết kế sau; chỉ triển khai khi có phê duyệt rõ ràng.  
> **Chưa chạy SQL / chưa sửa production.**  
> Nguồn quyết định: [`P6-01-UNIT-MSP-U1.md`](./P6-01-UNIT-MSP-U1.md) · Audit tổng: [`P6-00-EXPORT-FILTER-MSP.md`](./P6-00-EXPORT-FILTER-MSP.md)  
> Draft SQL: [`sql/P6-U1-draft-schema.sql`](./sql/P6-U1-draft-schema.sql)

**Ghi chú biên tập (2026-11-14):** Bản user gửi bị cắt ở §5.1; phần từ §5 trở đi được hoàn thiện từ quyết định đã khóa trong P6-01 (không tự bịa rule mới). **Thay đổi so với P6-01 sớm:** không dùng status `RETURNED` — hoàn kho sau bán = **hủy hóa đơn bán** → Unit `SOLD` → `IN_STOCK`, giữ MSP.

---

# 1. Mục tiêu

Chuyển quản lý MSP từ mô hình theo số lượng SKU sang quản lý từng sản phẩm vật lý (Unit).

Hiện có `pos_label_pieces` (MSP) nhưng chưa có định danh vật lý; nhập/bán/điều chỉnh chủ yếu theo quantity.

U1 bổ sung Unit để đảm bảo:

- Mỗi sản phẩm vật lý có `unit_id` duy nhất.
- Mỗi Unit gắn tối đa một MSP; mỗi MSP gắn tối đa một Unit (MSP mới U1).
- MSP mới chỉ Mint từ Unit `IN_STOCK` chưa gắn MSP.
- Không Mint vượt số Unit đủ điều kiện (không dùng `tồn − count(MSP)`).
- Bán xác định đúng Unit (U1) hoặc luồng legacy (MSP cũ).
- Hủy hóa đơn bán: Unit về `IN_STOCK`, **giữ MSP**.
- In lại: đúng MSP đã cấp, không Mint mới.
- Truy vết nhập → Mint → in → bán → hủy HĐ / đảo nhập.

---

# 2. Các quyết định kiến trúc đã chốt

## 2.1. U1 — Mỗi sản phẩm vật lý là một Unit

Mỗi sản phẩm vật lý nhập kho thực tế có một `unit_id`.

Ví dụ SKU nhập 3:

| Unit | SKU | MSP |
|------|-----|-----|
| UNIT-001 | … | Chưa Mint |
| UNIT-002 | … | Chưa Mint |
| UNIT-003 | … | Chưa Mint |

Sau Mint: mỗi Unit một MSP (`TLKV-000001` …) theo format đã chốt.

Quy tắc:

- `unit_id` = định danh nội bộ vật lý.
- MSP = mã tem/nhận diện cấp cho Unit.
- Một Unit không gắn nhiều MSP; một MSP U1 không gắn nhiều Unit.
- Không tạo Unit vì chỉ tạo đơn đặt hàng / hàng chưa về.
- Unit chỉ khi **nhận hàng thực tế vào kho**.

## 2.2. BF-B — Backfill tồn cũ

Chỉ backfill Unit cho SKU **chưa từng có** bất kỳ `pos_label_pieces`.

SKU đã từng có MSP:

- Không tạo Unit hàng loạt từ tồn hiện tại.
- Không auto-ghép MSP cũ ↔ Unit.
- Không đổi MSP / lịch sử / 56 SKU chênh lệch đã audit.
- MSP cũ chạy legacy.
- Nhập kho **mới** sau U1 vẫn tạo Unit.

**Hệ quả:** tồn thuộc SKU đã có MSP không Mint thêm U1 cho đến đối soát riêng được duyệt.

## 2.3. MSP mới bắt buộc Unit

- Mint U1 bắt buộc `unit_id`.
- Không Mint nếu không có Unit hợp lệ.
- Không dùng `current_stock - count(MSP)`.
- Chỉ Unit `IN_STOCK` + chưa gắn piece.
- Chọn Unit + tạo MSP + gắn FK **cùng transaction** (kèm lock).

## 2.4. MSP legacy

`pos_label_pieces.unit_id = NULL`:

- Giữ nguyên dữ liệu / barcode / lịch sử in.
- Không bắt buộc migrate toàn bộ khi go-live U1.
- Bán theo luồng hiện tại.
- Không FIFO Unit cho MSP legacy không có Unit.
- Không tự tạo/ghép Unit khi bán legacy.

## 2.5. Sequence & format MSP mới

- Sequence **global (A)** — `pos_label_msp_seq`.
- Format: `{BRAND_PREFIX}-{######}` ví dụ `TLKV-000001`.
- MSP cũ: **không** rewrite.
- Prefix từ cấu hình Brand (chốt cột/`brands` khi implement — P6-01 §7.3b).

## 2.6. In lại (Reprint)

- Chỉ MSP đã tồn tại.
- Không `nextval`, không tạo Unit, không đổi `unit_id`.
- Ghi log in riêng (`REPRINT` / tương đương hiện tại).

---

# 3. Vòng đời Unit

## 3.1. Trạng thái

| Status | Ý nghĩa |
|--------|---------|
| `IN_STOCK` | Đang tồn; có thể bán; nếu chưa MSP thì có thể Mint |
| `SOLD` | Đã bán thành công |
| `VOIDED_RECEIPT` | Thuộc phiếu nhập đã hủy; không bán / Mint / FIFO |
| `ADJUSTED_OUT` | Xuất giảm qua điều chỉnh kho (nếu nghiệp vụ hỗ trợ) |

**Không** dùng `RETURNED`. Hoàn hàng về kho sau bán = **hủy hóa đơn bán** (hoặc nghiệp vụ hủy tương đương đã có): `SOLD` → `IN_STOCK`, giữ MSP.

## 3.2. Chuyển trạng thái hợp lệ

| Hiện tại | Sự kiện | Mới |
|----------|---------|-----|
| (không có) | Nhập kho thực tế / backfill BF-B | `IN_STOCK` |
| `IN_STOCK` | Bán thành công (U1 Unit) | `SOLD` |
| `SOLD` | Hủy hóa đơn bán thành công | `IN_STOCK` |
| `IN_STOCK` | Hủy/đảo phiếu nhập hợp lệ | `VOIDED_RECEIPT` |
| `IN_STOCK` | Điều chỉnh giảm hợp lệ | `ADJUSTED_OUT` |

Không hợp lệ (rút gọn):

- `SOLD` / `VOIDED_RECEIPT` / `ADJUSTED_OUT`: không Mint, không FIFO, không bán lần nữa (trừ khi đã hủy HĐ đưa về `IN_STOCK`).
- Client không tự cập nhật status; chỉ RPC backend.

---

# 4. Nhập kho

## 4.1. Nhập thực tế

Khi nhận hàng thành công:

- Tạo đúng N Unit (N = số nhận), mỗi Unit một `unit_id`.
- Gắn SKU, nguồn `RECEIPT`, dòng phiếu nhập.
- Status `IN_STOCK`.
- **Không** tự Mint.

## 4.2. Đặt hàng / chưa nhận

- Không tạo Unit, không tăng “slot Mint”, không Mint từ số đặt.

## 4.3. Hủy / đảo phiếu nhập

**Unit chưa Mint:** chuyển `VOIDED_RECEIPT` (hoặc tương đương không còn dùng được); không còn trong tập bán/Mint/FIFO.

**Unit đã Mint:**

- Giữ Unit, MSP, `piece.unit_id`.
- Không xóa piece / MSP / log in.
- Unit → `VOIDED_RECEIPT` + `voided_at` / `voided_by` / `void_reason` / `void_receipt_id`.
- Cấm bán / Mint / FIFO.
- Nhập thay thế → Unit **mới**.

**Unit đã `SOLD`:** không đảo nhập; xử lý qua hủy HĐ bán / điều chỉnh theo nghiệp vụ hiện có.

---

# 5. Mint MSP

## 5.1. Điều kiện Mint

Tất cả phải đúng:

- SKU tồn tại và được phép dùng theo rule hiện tại (active / ngoại lệ MG nếu RPC hiện cho phép).
- Có Unit thuộc SKU.
- Unit `IN_STOCK`.
- Unit **chưa được gắn** `pos_label_pieces.unit_id`.
- Unit không `VOIDED_RECEIPT` / `SOLD` / `ADJUSTED_OUT`.
- (Sau khi bật flag) mint-limit U1 bật.

## 5.2. Trong transaction

1. `SELECT … FOR UPDATE` Unit (và/hoặc piece unique).
2. Assert vẫn đủ điều kiện §5.1.
3. `nextval(pos_label_msp_seq)` (global).
4. Insert `pos_label_pieces` với `msp`, `barcode`, `sku_id`, `unit_id`.
5. Commit.

Không Mint hàng loạt vượt số Unit đủ điều kiện trong một request không kiểm soát.

## 5.3. In mới vs In lại

| Thao tác | Mint? | Sequence? | Unit? |
|----------|-------|-----------|-------|
| In sản phẩm tiếp theo / Mint mới | Có | Có | Bắt buộc Unit đủ điều kiện |
| In lại | Không | Không | Dùng piece đã có |

---

# 6. Bán hàng

## 6.1. Có MSP U1 (`unit_id` NOT NULL)

- Quét/chọn MSP → resolve Unit.
- Unit phải `IN_STOCK`.
- Đánh `SOLD`, gắn tham chiếu dòng bán; không bán trùng.

## 6.2. MSP legacy (`unit_id` NULL)

- Bán như luồng hiện tại.
- Không tạo/ghép Unit; không FIFO Unit.

## 6.3. Không MSP

- Server FIFO: Unit `IN_STOCK` của SKU, `ORDER BY created_at`, bỏ Unit void/sold.
- Ghi `unit_id` đã xuất.
- Không bắt NV chọn Unit trên UI.

## 6.4. Hủy hóa đơn bán

- Unit đã `SOLD` thuộc HĐ → `IN_STOCK`.
- **Giữ** MSP và `piece.unit_id`.
- Đồng bộ với hoàn kho ledger hiện có (`SALE_VOID` …).

---

# 7. Quan hệ dữ liệu (logic)

```text
pos_skus 1 ── * pos_inventory_units
pos_inventory_units 1 ── 0..1 pos_label_pieces   (qua pieces.unit_id UNIQUE)
pos_label_pieces 1 ── * pos_label_print_log
pos_inventory_stock.quantity  —— song song (ledger); không thay bằng count(Unit) giai đoạn đầu
```

MSP legacy: piece không có Unit.

---

# 8. Schema (tham chiếu draft)

Chi tiết: [`sql/P6-U1-draft-schema.sql`](./sql/P6-U1-draft-schema.sql)

- `pos_inventory_units` (+ cột void)
- `pos_label_pieces.unit_id` NULL + UNIQUE partial
- GRANT §32.1 + RLS
- Status check: `IN_STOCK | SOLD | VOIDED_RECEIPT | ADJUSTED_OUT` (**không** `RETURNED`)

Backfill: [`sql/P6-U1-draft-backfill-BF-B.sql`](./sql/P6-U1-draft-backfill-BF-B.sql)  
Verify / rollback: cùng thư mục `sql/`.

---

# 9. RPC chạm (thiết kế — chưa code)

| RPC | Hướng thay đổi |
|-----|----------------|
| `receive_purchase` / `pos_receive_*` | Sau nhập: N Unit `IN_STOCK` |
| Void/reverse purchase | Unit → `VOIDED_RECEIPT`; giữ piece FK; cấm nếu `SOLD` |
| `pos_mint_label_piece` | Bắt buộc Unit; transaction + lock; format prefix |
| `pos_record_label_print` | Reprint không Mint |
| `complete_sale` / fulfill | U1 Unit SOLD; legacy như cũ; FIFO nếu không MSP |
| `void_sale_invoice` | Unit SOLD → IN_STOCK; giữ MSP |
| `apply_stock_change` | Giữ qty; Unit đổi ở RPC nghiệp vụ |

Chi tiết chữ ký trước/sau + md5: soạn khi review RPC (có thể tách `P6-03-U1-RPC.md`).

---

# 10. Thứ tự triển khai

| Bước | Nội dung | Trạng thái |
|------|----------|------------|
| 1 | Audit + draft | Xong ([P6-01](./P6-01-UNIT-MSP-U1.md)) |
| 2 | Khóa quyết định + review SQL/RPC | Quyết định khóa; **đang review** |
| 3 | Backup → migration cấu trúc → verify; chưa mint-limit; chưa backfill | Chờ duyệt |
| 4 | Code nhận/Mint/bán/in + hard-test | Chưa |
| 5 | Backfill BF-B → đối soát → bật mint-limit | Chưa |

---

# 11. Tiêu chí nghiệm thu (U1)

| Hạng mục | Đạt khi |
|----------|---------|
| Nhập thực tế | Đúng N Unit; Order chưa nhập = 0 Unit |
| Mint | Chỉ từ Unit IN_STOCK chưa MSP; 1–1; cùng transaction |
| Legacy | MSP cũ bán được; không bị ép Unit |
| Bán U1 | Đúng Unit; không bán đôi |
| Hủy HĐ bán | Unit về IN_STOCK; MSP giữ |
| Đảo nhập đã Mint | Unit void; piece giữ FK; không xóa MSP |
| Reprint | Không tăng sequence |
| BF-B | Chỉ SKU chưa từng có MSP; 56 SKU / MSP cũ không bị sửa |
| Qty ledger | Vẫn đúng; không thay bằng count(Unit) giai đoạn đầu |

---

# 12. Còn mở nhẹ (không chặn phê duyệt kiến trúc)

1. Brand prefix: cột `brands` — cùng migration U1 hay tách.  
2. RLS siết theo role.  
3. Điều chỉnh kho (`ADJUSTED_OUT`): phạm vi RPC adjust nào bắt buộc gắn Unit ở Bước 4.  
4. Module `pos_returns` hiện có trên codebase: U1 **không** thêm status `RETURNED`; nếu sau này dùng trả hàng, map về hủy HĐ / hoàn Unit → `IN_STOCK` theo §6.4 trừ khi có quyết định mới.

---

# 13. Lịch sử

| Ngày | Nội dung |
|------|----------|
| 2026-11-14 | Tạo P6-02 từ bản Decision & Implementation Spec (user); hoàn thiện phần bị cắt §5+; bỏ `RETURNED`; đồng bộ P6-01 / draft schema. Chưa chạy production. |
