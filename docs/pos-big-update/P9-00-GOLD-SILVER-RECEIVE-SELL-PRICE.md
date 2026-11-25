# P9 — Công thức giá vàng/bạc, tiền công nhập/bán, tab Nhập vàng/Nhập bạc

> Chốt yêu cầu: 2026-11-18 · Cập nhật chốt 2026-11-20  
> Nguồn: BIG CHANGE – cập nhật công thức giá vàng, giá bạc và nhập kho  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) §9, §13, §21  
> Liên quan: [`P8-00-ORDER-LABEL-RECEIVE.md`](./P8-00-ORDER-LABEL-RECEIVE.md), [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md), [`P7-00-PRERECEIPT-LABELING.md`](./P7-00-PRERECEIPT-LABELING.md)  
> Trạng thái: **UI nhập kho 3 khu vực + tiền công bán tại kho + heso board_sell + bạc manual** (2026-11-20). Mục §5 **hoãn**.

## 0. Phạm vi round này vs hoãn

| Mục | Nội dung | Round này |
|-----|----------|-----------|
| 1–4, 6–7 | Công thức nhập vàng + tiền công nhập; tab Nhập vàng/Nhập bạc ở 3 khu vực; công thức bán vàng/bạc; tách công nhập ≠ công bán; giữ link bảng giá tùy chọn; UI tái dùng template | **Làm** |
| Tiền công bán tại kho | Nhập tại form nhập kho → lưu `pos_skus.labor_fee_dong` → prefill HĐ (vẫn sửa được) | **Làm** (2026-11-20) |
| Vàng tây heso | `(TL × HL × board_sell + công bán) × hệ số` — không dùng spot 24K | **Làm** |
| Bạc | Giá mua/bán thủ công; tắt autofill bảng giá; giữ link DB nếu có | **Làm** |
| Audit giá bán | Kiểm tra `products.price_numeric` / Product–SKU–Unit–MSP trước khi thêm `list_price_dong` | **Audit xong** — chưa thêm cột mới |
| **5** | Cho phép cập nhật giá bán độc lập với CRUD sản phẩm | **Chưa làm** — ghi sổ, không code UI/RPC riêng |

Khi code P9: không triển khai màn/API “sửa giá bán ngoài CRUD sản phẩm”. Nếu đụng giá bán trên form nhập/bán chỉ theo công thức §3–§4 và snapshot hiện có.

## 1. Mục tiêu

1. Cập nhật công thức **giá nhập vàng** theo trọng lượng × hàm lượng × giá nguyên liệu 24K/9999 + **tiền công nhập**.
2. Tách **tiền công nhập** (cộng giá vốn) và **tiền công bán** (lưu SKU → prefill HĐ).
3. Cập nhật công thức **giá bán vàng** (link / heso board_sell) và **giá bán bạc** (manual).
4. Phân tab **Nhập vàng** / **Nhập bạc** trong ba khu vực nhập kho hiện có (không module mới).
5. Giữ liên kết bảng giá hiện tại: **tùy chọn**, không bắt buộc.
6. (Hoãn) Sửa giá bán độc lập CRUD sản phẩm — xem §5 / §0.

## 2. Nhập kho — tab Nhập vàng / Nhập bạc

### 2.1. Ba khu vực (sub-tab bên trong, không module mới)

1. Nhập kho Order (`inventory` receive / Order).
2. In tem kiêm nhập kho (`label-print` mode combined).
3. Nhập từ tem đã in (P7 draft receive).

Mỗi khu vực: hai tab **Nhập vàng** | **Nhập bạc**. Trường hiển thị theo loại hàng. Giữ xác nhận nhập, tạo SKU/Unit/MSP, in tem như hiện tại (P7/P8).

Trên **Draft P7**: tab được bật lại (2026-11-20). Người dùng chọn kim loại khi nhập; **không** lọc list draft theo tab; **không** suy luận vàng ta/tây từ Brand/Category/tên/HL; snapshot draft giữ nguyên.

### 2.2. Nhập vàng — công thức

Trường bắt buộc nghiệp vụ:

- Trọng lượng vàng thực tế (không gồm đá / ngọc trai / phụ kiện).
- Hàm lượng vàng (% → quy đổi thập phân khi tính).
- Giá vàng nguyên liệu 24K/9999 trên mỗi chỉ.
- Tiền công nhập (user nhập trên form nhập kho).
- Tiền công bán (user nhập trên form nhập kho — lưu SKU).

```text
Tiền vàng nhập = Trọng lượng vàng × Hàm lượng vàng × Giá vàng nguyên liệu 24K/9999
Tổng tiền nhập = Tiền vàng nhập + Tiền công nhập
```

- Đơn vị trọng lượng: chỉ/phân theo dữ liệu SP.
- Tổng tiền nhập / giá vốn ghi nhận: integer VND (Rule 7).
- **Không** copy tiền công nhập → tiền công bán.

### 2.3. Nhập bạc

- Tab riêng trong cả 3 khu vực.
- Giá mua nhập thủ công; giá bán nhập thủ công.
- Không bắt buộc liên kết bảng giá.
- **Tắt autofill** giá từ bảng giá kể cả khi SP bạc đang có liên kết.
- Liên kết cũ giữ nguyên trong DB — không tham gia tính giá / ghi đè giá thủ công.
- **Không** lấy giá vàng để tính giá bạc.

### 2.4. Tiền công nhập ≠ tiền công bán (bắt buộc)

| | Nhập | Bán |
|---|------|-----|
| Trường | Tiền công nhập trên form nhập kho | Tiền công bán: nhập tại kho → `pos_skus.labor_fee_dong`; HĐ prefill từ SKU (vẫn sửa được) |
| Vai trò | Cộng vào tổng tiền nhập / giá vốn nhận hàng | Cộng vào tổng tiền bán (công thức HĐ hiện tại giữ nguyên) |
| Cấm | Map công nhập → công bán; dùng chung một field | Dùng `last_cost` làm giá bán |

Nếu SP chưa có `labor_fee_dong` lưu → HĐ xử lý theo logic mặc định hiện tại (0 / fallback).

### 2.5. Phân biệt vàng ta / vàng tây (không thêm field)

Không tự nhận diện. Dùng lựa chọn **cách tính giá bán** đã có trên form:

- **Theo giá link không hệ số** → vàng ta.
- **Theo giá link có hệ số** → vàng tây.

Không bổ sung field phân loại; không suy luận Brand/Category/tên/HL.

## 3. Giá bán vàng (gợi ý trên form nhập)

### 3.1. Vàng ta — theo giá link không hệ số

```text
Giá bán gợi ý = board_sell (quy đổi / chỉ × TL) + Tiền công bán
```

### 3.2. Vàng tây — theo giá link có hệ số

```text
Giá bán gợi ý = (Trọng lượng vàng × Hàm lượng vàng × board_sell_per_chi + Tiền công bán) × Hệ số
```

- TL tính theo chỉ; HL chuẩn hóa (610 → 0.61).
- **`board_sell`** của dòng bảng giá đã liên kết — **không** dùng spot 24K.
- Tiền công bán cộng **trước** khi nhân hệ số.
- Hệ số nhập tay trên form (UI-only round này).

### 3.3. Trên hóa đơn bán

Giữ nguyên công thức tính tiền HĐ hiện tại. Chỉ bổ sung: khi đưa SP vào HĐ, prefill TextField tiền công từ `labor_fee_dong` đã lưu; user vẫn chỉnh sửa được.

## 4. Giá bán bạc

- Giá mua / giá bán nhập tay trên form nhập.
- Không autofill / ghi đè từ bảng giá.
- Trên HĐ: giữ logic bán hiện tại; công bán prefill từ `labor_fee_dong` nếu có.

## 5. Cập nhật giá bán độc lập CRUD sản phẩm — HOÃN + audit

Yêu cầu đã ghi nhận (làm round sau nếu cần):

- Xem giá bán hiện tại; nhập/sửa giá bán thủ công mọi SP.
- Không bắt buộc liên kết bảng giá.
- Sửa giá bán không đổi thông tin SP / giá vốn nhập.

**Audit 2026-11-20 (trước khi thêm `list_price_dong`):**

1. `products.price_numeric` — fallback catalog / hiển thị; **không** phải SoT giá bán POS cho jewelry đã link bảng giá.
2. Product ↔ SKU (`catalog_product_id`) ↔ Unit ↔ MSP (pieces): giá bán vận hành chính ở **SKU** (`labor_fee_dong` + board + đá) và snapshot dòng bán.
3. MSP/Unit cùng SKU: dùng chung thành phần bán của SKU (không giá bán riêng từng MSP trong AS-IS).
4. Draft P7: snapshot `cost_price_dong` / `sell_price_dong` / `labor_fee_dong` tại thời điểm in tem — giữ nguyên.
5. Màn mua/bán: đọc board + `labor_fee_dong` từ SKU; catalog có thể đọc `price_numeric` khi không có link.
6. **Không** dùng `last_cost` làm giá bán.
7. **Chưa** thêm `list_price_dong` trên `pos_skus` — tái sử dụng nguồn hiện có cho đến khi audit chứng minh thiếu.

**Round này: không thiết kế UI/RPC mục §5; không migration `list_price_dong`.**

## 6. Liên kết bảng giá (giữ nguyên hướng P8)

- Liên kết **tùy chọn**, không bắt buộc hoàn tất nhập kho.
- Vàng: có thể lấy giá gợi ý từ dòng bảng giá visible; vẫn nhập tay.
- Bạc: liên kết không tham gia autofill / tính giá.
- Không xóa liên kết hiện có.

## 7. UI

- Tái dùng template `--tlkv-*`, tab/form/modal hiện có; không design system mới.
- Ba khu vực đều có Nhập vàng | Nhập bạc; trường đúng loại hàng.
- Form nhập có **tiền công nhập** (vàng) và **tiền công bán** (vàng + bạc / catalog).
- Cách tính giá bán: link / heso — user chọn tay.

## 8. Module boundary (khi code)

| Allowed | Forbidden (round này) |
|---------|------------------------|
| `inventory/**` (ReceiveForm, DraftReceivePanel, PriceLinkControls, priceLink, applySkuSellLabor*) | Màn/API sửa giá bán độc lập CRUD (§5) |
| `label-print/**` (CombinedReceivePrintPanel) | Đổi công thức tính tiền HĐ hiện tại |
| Docs P9 + README + SYSTEM_DEVELOPMENT_RULES §13/§21.2 | Invent cột `list_price_dong` khi chưa cần |
| | Refactor ngoài phạm vi |

## 9. Logic cũ phải giữ

- P7: draft → nhận qty=1, mint Unit/MSP, in tem; chọn draft → autofill → diff → nhập; **không** viết lại luồng Draft.
- P8: UI In tem 2 tab to + 3 mode; combined receive + workbench in; link giá tùy chọn / sửa tay.
- P4: đá, snapshot thành phần bán; HĐ vẫn cho sửa công.
- Không phá RPC nhận hàng đã có mà không migration + backup `tlkv_backup_20261110`.

## 10. Quan hệ với P8

P8 đã chốt: giá vốn gợi ý = `buy × TL` (không hệ số).  
P9 **thắng** P8 đối với **nhập vàng** khi áp công thức §2.2 (TL × HL × giá nguyên liệu + công nhập).  
Link bảng giá vẫn dùng để gợi ý / điền giá nguyên liệu hoặc board_sell khi phù hợp; không bắt buộc.

## 11. Hard-test (khi có code)

- Account/port: [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md).
- Order / In tem kiêm nhập / Nhập từ tem: tab Vàng vs Bạc; vàng tính đúng §2.2; công bán lưu `labor_fee_dong`; công nhập không đổ vào labor bán.
- Heso: dùng `board_sell`, cộng công bán trước nhân hệ số.
- Bạc: không autofill board.
- Bán: prefill công từ SKU; công thức HĐ không đổi; vẫn sửa được.
- Không test mục §5 trong round này.
- Sau hard-test: void / ẩn SKU test, ghi mã chứng từ.

## 12. Lịch sử

- 2026-11-25: nối end-to-end giá bán bạc — `applySkuManualSell*` → RPC `pos_set_sku_manual_sell`; POS đọc `manual_sell_dong` (bạc không dùng board). Vá SKU cũ: Nhập kho → Sản phẩm có sẵn → điền Giá bán / chiếc > 0.
- 2026-11-18: tạo sổ từ BIG CHANGE; §5 đánh dấu hoãn; chưa code.
- 2026-11-18: code tab Nhập vàng/Nhập bạc + công thức nhập vàng + tiền công nhập trên ReceiveForm / Combined / DraftReceive; gợi ý bán P9 (không map công nhập → labor_fee). Hard-test Order: `PN000128` / `TLKVTS000025` → đã void + ẩn SKU.
- 2026-11-19: trên **Nhập từ tem draft (P7)** — tạm **ẩn** tab Nhập vàng/Nhập bạc.
- 2026-11-20: chốt lại SRS — tiền công bán nhập tại kho → `labor_fee_dong`; heso dùng `board_sell`; ta/tây = link/heso; bạc manual no autofill; audit không thêm `list_price_dong`; **bật lại** tab P9 trên DraftReceivePanel (không lọc list, không đổi luồng Draft).
- 2026-11-20 hard-test Order: `PN000140` / `TLKVTS000031` — công nhập 100.000 trong giá vốn 12.667.420; công bán 250.000 → `labor_fee_dong=250000` (tách đúng); gợi ý bán link = board_sell 12.720.000 + 250.000 = 12.970.000. Đã đảo phiếu + ẩn SKU/sản phẩm.
- 2026-11-20 hard-test bổ sung (không tạo phiếu): heso UI `(1×0,61×12.720.000+200.000)×1,3 = 10.346.960` (board_sell, ≠ spot); bạc chọn dòng bảng → cost/sell trống; Combined có tab + công bán; POS prefill `labor_fee` 333.000 trên `tlkv-000137-0.61` (đã restore 0). Fix: Order đổi tab vàng/bạc reset `sellLaborDong`.
