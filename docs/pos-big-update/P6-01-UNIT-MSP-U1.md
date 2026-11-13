# P6-01 — U1 Unit + quan hệ Unit–MSP (thiết kế, chưa chạy SQL)

> Chốt hướng: 2026-11-14 · Trạng thái: **Bước 2 — Quyết định khóa; đặc tả kiến trúc P6-02; review SQL/RPC** (chưa chạy production)  
> Cha: [`P6-00-EXPORT-FILTER-MSP.md`](./P6-00-EXPORT-FILTER-MSP.md)  
> **Đặc tả kiến trúc (canonical):** [`P6-02-U1-ARCHITECTURE-SPEC.md`](./P6-02-U1-ARCHITECTURE-SPEC.md)  
> Draft SQL: [`sql/P6-U1-draft-schema.sql`](./sql/P6-U1-draft-schema.sql), [`sql/P6-U1-draft-verify.sql`](./sql/P6-U1-draft-verify.sql), [`sql/P6-U1-draft-rollback.sql`](./sql/P6-U1-draft-rollback.sql), [`sql/P6-U1-draft-backfill-BF-B.sql`](./sql/P6-U1-draft-backfill-BF-B.sql)

## 0. Quyết định nghiệp vụ đã chốt

| # | Quyết định |
|---|------------|
| 1 | MSP cũ đã có: **giữ** MSP + lịch sử; **không** tạo Unit thay thế; **không** đổi dữ liệu MSP |
| 2 | Backfill tồn cũ: **BF-B** (chi tiết §4) |
| 3 | Nhập kho thực tế (sau U1): **tự tạo** Unit cho từng đơn vị |
| 4 | Mint mới: **bắt buộc** gắn `unit_id`; mỗi Unit tối đa 1 MSP |
| 5 | In lại: MSP đã cấp; không tạo Unit/MSP mới |
| 6 | 56 SKU pieces > tồn: **giữ nguyên**; không auto-map |
| 7 | Sequence MSP: **global (A)**; format mới `PREFIX-######` (prefix cấu hình Brand — migration riêng hoặc cùng đợt, xem §7) |
| 8 | U1 **bắt buộc** đổi Database |
| 9 | Bán: quét/chọn MSP nếu có; không thì **FIFO server**; lưu `unit_id` xuất; không bán trùng Unit; **không** UI chọn Unit thủ công |
| 10 | Đảo nhập / trả hàng: §5 |
| 11 | Order / đặt trước: **không** Unit; chỉ tạo Unit khi **nhập kho thực tế**; Mint luôn cần Unit |
| 12 | Chưa chạy SQL / chưa sửa production cho đến khi review SQL + RPC xong và được duyệt Bước 3 |
| 13 | Bán MSP legacy (`unit_id` NULL): **cho bán như hiện tại** — §7.1 |
| 14 | Đảo nhập Unit đã Mint: **giữ FK** trên piece; Unit → void — §7.2 |

### Bảng chốt (đủ để review SQL + RPC)

| Nội dung | Quyết định |
|----------|------------|
| Backfill | **BF-B** |
| Bán hàng (có Unit U1) | Quét MSP nếu có; không thì FIFO server |
| Bán MSP legacy `unit_id` NULL | **Cho bán như hiện tại**; không tạo/ghép Unit; không FIFO Unit |
| Đảo nhập | Không xóa Unit/MSP; void + audit |
| Đảo nhập Unit đã Mint | Giữ `piece.unit_id`; Unit → `VOIDED_RECEIPT`; không bán/Mint/FIFO Unit void |
| Nhập lại sau đảo | Tạo Unit **mới** |
| Hoàn kho sau bán | **Hủy hóa đơn bán** → Unit `SOLD`→`IN_STOCK`, giữ MSP (không status `RETURNED` — xem P6-02) |
| Order | Không Unit trước khi nhập kho |
| Mint mới U1 | Bắt buộc `unit_id` |

**Lưu ý BF-B:** Hàng tồn thuộc SKU **đã có ≥1 MSP** sẽ **không** được Mint thêm theo U1 (kể cả phần tồn chưa từng dán tem). Muốn Mint lượng đó → quy trình đối soát riêng, được duyệt trước khi cấp phép.

## 1. Thứ tự triển khai

| Bước | Nội dung | Trạng thái |
|------|----------|------------|
| 1 | Audit + thiết kế schema + draft SQL | **Xong** |
| 2 | Khóa quyết định + review SQL + thiết kế RPC | **Quyết định §0–§7 khóa — đang review SQL/RPC** |
| 3 | Backup → migration cấu trúc → verify; **chưa** bật mint-limit; **chưa** backfill | Chưa (cần duyệt) |
| 4 | Code nhập/Mint/bán/Reprint + hard-test | Chưa |
| 5 | Backfill BF-B + đối soát + bật mint-limit | Chưa |

## 2. Audit hiện trạng (tóm tắt)

### 2.1 Identity

| Lớp | Hiện tại |
|-----|----------|
| Kho | `pos_inventory_stock.quantity` theo `sku_id` |
| Biến động | `pos_inventory_transactions` |
| Nhập / bán / trả | qty theo dòng chứng từ — không piece/unit |
| MSP | `pos_label_pieces` — không unit |
| In | `pos_label_print_log` theo `piece_id` |

### 2.2 Luồng (Bước 4 — chưa sửa code)

| Luồng | Impact U1 theo quyết định đã khóa |
|-------|-----------------------------------|
| Nhập kho thực tế | Insert N Unit `IN_STOCK`, `origin=RECEIPT` |
| Order / đặt hàng (chưa nhập) | **Không** tạo Unit |
| Đảo phiếu nhập | Chỉ Unit chưa bán / chưa ràng buộc giao dịch cấm đảo; Unit đã Mint → status void + audit, **giữ** piece/log; Unit đã bán → **cấm** đảo nhập, đi trả hàng/điều chỉnh |
| Bán / giao | Legacy MSP: như cũ; U1 MSP: Unit SOLD; không MSP: FIFO Unit |
| Hủy HĐ bán | Unit SOLD → IN_STOCK; giữ MSP |
| Mint | Chỉ Unit `IN_STOCK` chưa có piece; gắn `unit_id` |
| Reprint | Không tạo Unit/MSP |
| Ledger qty | Không thay bằng count(Unit) |

## 3. Schema (giữ như Bước 1)

Xem draft [`sql/P6-U1-draft-schema.sql`](./sql/P6-U1-draft-schema.sql):

- `public.pos_inventory_units` + GRANT §32.1 + RLS
- `pos_label_pieces.unit_id` NULL UNIQUE (MSP cũ = NULL)

Trạng thái Unit: `IN_STOCK` | `SOLD` | `VOIDED_RECEIPT` | `ADJUSTED_OUT` (không `RETURNED` — P6-02)

## 4. Backfill BF-B (Bước 5 — chưa chạy)

### 4.1 Quy tắc

| Điều kiện SKU | Backfill |
|---------------|----------|
| `quantity Q > 0` **và** `count(pos_label_pieces)=0` | Tạo **Q** Unit `STOCK_BACKFILL` / `IN_STOCK`; không gắn MSP |
| `count(pos_label_pieces) ≥ 1` (kể cả pieces > tồn / = / <) | **Không** tạo Unit từ tồn hiện tại |
| `Q = 0` | Không tạo |

### 4.2 Bảo vệ

- Mọi `pos_label_pieces.unit_id` của data cũ giữ **NULL**
- 56 SKU vượt tồn: không map, không xóa, không đổi msp/serial
- Sau BF-B: Mint U1 trên SKU “đã từng có MSP” **chỉ** từ Unit sinh ra bởi **nhập mới**

### 4.3 Hệ quả vận hành (chấp nhận)

SKU đã có MSP + còn tồn vật lý chưa tem: **không Mint U1** cho đến đối soát riêng. Tránh Unit trống → mint vượt.

Draft logic: [`sql/P6-U1-draft-backfill-BF-B.sql`](./sql/P6-U1-draft-backfill-BF-B.sql) — **DRAFT ONLY**.

## 5. Đảo nhập / trả hàng / bán (chi tiết đã khóa)

### 5.1 Bán

| Loại | Hành vi |
|------|---------|
| MSP **legacy** (`pos_label_pieces.unit_id` IS NULL) | Bán **như luồng hiện tại**; ghi MSP/SKU/qty/xuất kho; **không** tạo Unit; **không** ghép Unit; **không** FIFO Unit |
| MSP **U1** (`unit_id` NOT NULL) | Xuất đúng Unit gắn piece; Unit → `SOLD`; không bán trùng |
| Không MSP / không chọn piece | FIFO: `FOR UPDATE` Unit `IN_STOCK` (loại trừ Unit void) `ORDER BY created_at`; gắn `sale_item_id` |
| Unit `VOIDED_RECEIPT` / `SOLD` | Không vào FIFO; không bán |

### 5.2 Đảo nhập

| Unit | Cho phép đảo nhập? |
|------|---------------------|
| `IN_STOCK`, chưa Mint | Có — Unit → `VOIDED_RECEIPT` (hoặc xóa mềm theo cùng status void) + audit theo phiếu |
| `IN_STOCK`, đã Mint | **Có điều kiện đảo phiếu** nếu chưa bán: **không** xóa piece/MSP; **giữ** `piece.unit_id`; Unit → `VOIDED_RECEIPT` + lý do / actor / thời gian / `receipt_id`; Unit void **cấm** bán, Mint lại, FIFO |
| `SOLD` | **Không** đảo nhập; trả hàng / điều chỉnh |
| Nhập lại hàng | Luôn tạo Unit **mới**; không tái sử dụng Unit void |

### 5.3 Hoàn kho sau bán (không status RETURNED)

- **Hủy hóa đơn bán** thành công: Unit `SOLD` → `IN_STOCK`; **giữ** MSP và `piece.unit_id`.
- Module trả hàng độc lập trên codebase: không thêm status `RETURNED` trong U1; nếu dùng sau này phải map về hoàn Unit → `IN_STOCK` (P6-02 §12).

### 5.4 Order / MG

- Order chưa nhập kho: không Unit  
- Nhập thực tế (kể cả Order jewelry / MG vào kho): tạo Unit  
- Mint: luôn cần Unit  

## 6. Mint-limit (bật cuối Bước 5)

```text
Unit IN_STOCK + chưa có piece.unit_id
→ nextval global → insert piece với unit_id
```

Feature flag `u1_mint_requires_unit` default false đến khi backfill + code xong.

## 7. Quyết định kỹ thuật §7 (đã khóa 2026-11-14)

### 7.1 Bán MSP legacy (`unit_id` IS NULL)

| Nội dung | Quyết định |
|----------|------------|
| Cho bán như hiện tại? | **Có** |
| Bắt buộc gắn `unit_id` cho MSP lịch sử? | **Không** |
| Tự tạo / ghép Unit khi bán legacy? | **Không** |
| FIFO Unit khi bán legacy? | **Không** |
| Unit bắt buộc | Chỉ MSP **mới** Mint theo U1 |

### 7.2 Đảo nhập Unit đã Mint

| Nội dung | Quyết định |
|----------|------------|
| Xóa piece / clear `unit_id` / cấp lại MSP? | **Không** |
| `piece.unit_id` | **Giữ** FK → Unit |
| Unit sau đảo | `VOIDED_RECEIPT` + lý do, actor, thời gian, phiếu nhập |
| Unit void | Không bán, không Mint lại, không FIFO |
| Nhập lại | Tạo Unit **mới** |

### 7.3 Còn lại (không chặn thiết kế RPC; chốt khi implement)

| # | Việc | Ghi chú |
|---|------|---------|
| a | RLS siết theo role | Draft hiện `authenticated` + session |
| b | Brand prefix trên `brands` | Cùng đợt hay migration riêng |
| c | Cột audit đảo trên Unit | Đủ dùng `origin_note` + audit_log, hay thêm `voided_at` / `void_reason` / `voided_by` / `void_receipt_id` trên bảng Unit (khuyến nghị thêm cột void rõ ràng trong schema trước Bước 3) |

**Khuyến nghị schema bổ sung (review trước Bước 3):** trên `pos_inventory_units` thêm nullable `voided_at`, `voided_by`, `void_reason`, `void_receipt_id` để khớp quyết định 7.2 mà không nhét hết vào `origin_note`.

## 8. Checklist review SQL (Bước 2)

- [ ] `P6-U1-draft-schema.sql` — GRANT, RLS, FK, unique `unit_id`  
- [ ] Bổ sung cột void trên Unit (§7.3c) vào draft nếu đồng ý  
- [ ] verify + rollback — guard khi đã có data  
- [ ] backfill BF-B — `NOT EXISTS piece`  
- [ ] Không UPDATE MSP/`unit_id` legacy trong schema/backfill  
- [ ] Impact §2.2 + §5 chấp nhận  

## 8b. Khung review thiết kế RPC (Bước 2 → chuẩn bị Bước 4 — **chưa code**)

| RPC / điểm chạm | Thay đổi dự kiến | Ghi chú |
|-----------------|------------------|---------|
| `receive_purchase` / `pos_receive_*` | Sau cộng tồn: insert N Unit `IN_STOCK` `origin=RECEIPT` | Order chưa nhập: không Unit |
| Reverse / void purchase | Unit chưa bán → `VOIDED_RECEIPT` + audit; giữ piece FK; cấm nếu `SOLD` | |
| `pos_mint_label_piece` | Bắt buộc `p_unit_id` (hoặc chọn Unit IN_STOCK chưa mint); gắn `unit_id`; cấm Unit void | Flag tắt đến hết Bước 5 |
| `pos_record_label_print` | Reprint: không đổi Unit/MSP | |
| `complete_sale` / fulfill | Legacy MSP: như cũ; U1 MSP: SOLD Unit; không MSP: FIFO Unit | Không bán Unit void |
| `void_sale_invoice` | Unit SOLD → IN_STOCK; giữ MSP | Không status RETURNED |
| `apply_stock_change` | Giữ qty ledger; Unit cập nhật ở RPC nghiệp vụ | Không thay quantity bằng count(Unit) |

Đặc tả đầy đủ: [`P6-02-U1-ARCHITECTURE-SPEC.md`](./P6-02-U1-ARCHITECTURE-SPEC.md). Chữ ký RPC chi tiết: soạn sau duyệt schema (có thể `P6-03-U1-RPC.md`).

## 9. Definition of Done

| Bước | DoD |
|------|-----|
| 1 | Audit + draft schema — **xong** |
| 2 | Mọi quyết định §0–§7 khóa; SQL + khung RPC sẵn review — **quyết định xong** |
| 3+ | Chỉ sau duyệt tường minh; chưa chạy SQL lúc này |

## 10. Lịch sử

| Ngày | Nội dung |
|------|----------|
| 2026-11-14 | Tạo P6-01 + draft schema/verify/rollback. |
| 2026-11-14 | Khóa **BF-B**, bán FIFO/MSP, đảo/trả, Order không Unit; draft backfill BF-B. |
| 2026-11-14 | Khóa §7: bán legacy như hiện tại; đảo Mint giữ FK + Unit void; khung review RPC; chưa chạy production. |
| 2026-11-14 | Đồng bộ **P6-02** architecture spec; bỏ `RETURNED`; hủy HĐ bán → Unit về IN_STOCK. |
