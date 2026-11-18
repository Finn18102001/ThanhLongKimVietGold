# P9 — Công thức giá vàng/bạc, tiền công nhập/bán, tab Nhập vàng/Nhập bạc

> Chốt yêu cầu: 2026-11-18 · Nguồn: BIG CHANGE – cập nhật công thức giá vàng, giá bạc và nhập kho  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) §9, §13, §21  
> Liên quan: [`P8-00-ORDER-LABEL-RECEIVE.md`](./P8-00-ORDER-LABEL-RECEIVE.md) (link giá, In tem kiêm nhập kho), [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md) (tiền công bán), [`P7-00-PRERECEIPT-LABELING.md`](./P7-00-PRERECEIPT-LABELING.md)  
> Trạng thái: **UI nhập kho 3 khu vực đã code + hard-test Order** (2026-11-18). Mục §5 **không làm trong round này**.

## 0. Phạm vi round này vs hoãn

| Mục | Nội dung | Round này |
|-----|----------|-----------|
| 1–4, 6–7 | Công thức nhập vàng + tiền công nhập; tab Nhập vàng/Nhập bạc ở 3 khu vực; công thức bán vàng/bạc; tách công nhập ≠ công bán; giữ link bảng giá tùy chọn; UI tái dùng template | **Làm** (sau khi chốt DB/RPC nếu cần) |
| **5** | Cho phép cập nhật giá bán độc lập với CRUD sản phẩm | **Chưa làm** — ghi sổ, không code UI/RPC riêng trong round này |

Khi code P9: không triển khai màn/API “sửa giá bán ngoài CRUD sản phẩm”. Nếu đụng giá bán trên form nhập/bán chỉ theo công thức §3–§4 và snapshot hiện có.

## 1. Mục tiêu

1. Cập nhật công thức **giá nhập vàng** theo trọng lượng × hàm lượng × giá nguyên liệu 24K/9999 + **tiền công nhập**.
2. Tách **tiền công nhập** (form nhập kho) và **tiền công bán** (hóa đơn bán).
3. Cập nhật công thức **giá bán vàng** và **giá bán bạc**.
4. Phân tab **Nhập vàng** / **Nhập bạc** trong ba khu vực nhập kho hiện có (không module mới).
5. Giữ liên kết bảng giá hiện tại: **tùy chọn**, không bắt buộc.
6. (Hoãn) Sửa giá bán độc lập CRUD sản phẩm — xem §5 / §0.

## 2. Nhập kho — tab Nhập vàng / Nhập bạc

### 2.1. Ba khu vực (sub-tab bên trong, không module mới)

1. Nhập kho Order (`inventory` receive / Order).
2. In tem kiêm nhập kho (`label-print` mode combined).
3. Nhập từ tem đã in (P7 draft receive).

Mỗi khu vực: hai tab **Nhập vàng** | **Nhập bạc**. Trường hiển thị theo loại hàng. Giữ xác nhận nhập, tạo SKU/Unit/MSP, in tem như hiện tại (P7/P8).

### 2.2. Nhập vàng — công thức

Trường bắt buộc nghiệp vụ:

- Trọng lượng vàng thực tế (không gồm đá / ngọc trai / phụ kiện).
- Hàm lượng vàng (% → quy đổi thập phân khi tính).
- Giá vàng nguyên liệu 24K/9999 trên mỗi chỉ.
- Tiền công nhập (user nhập trên form nhập kho).

```text
Tiền vàng nhập = Trọng lượng vàng × Hàm lượng vàng × Giá vàng nguyên liệu 24K/9999
Tổng tiền nhập = Tiền vàng nhập + Tiền công nhập
```

- Đơn vị trọng lượng: chỉ/phân theo dữ liệu SP.
- Tổng tiền nhập / giá vốn ghi nhận: integer VND (Rule 7).
- **Không** hiển thị / ghi **tiền công bán** trên form nhập kho.
- **Không** copy tiền công nhập → tiền công bán của SKU/sản phẩm.

### 2.3. Nhập bạc

- Tab riêng trong cả 3 khu vực.
- Thông tin phù hợp nghiệp vụ bạc hiện tại; có thể lấy giá từ bảng giá liên kết **hoặc** nhập tay.
- **Không** áp công thức giá bán bạc vào giá vốn nhập.
- Công thức giá vốn nhập bạc: **chưa được khách chốt đầy đủ** → không tự bịa; giữ hành vi hiện tại / nhập tay cho đến khi chốt thêm.

### 2.4. Tiền công nhập ≠ tiền công bán (bắt buộc)

| | Nhập | Bán |
|---|------|-----|
| Trường | Tiền công nhập trên form nhập kho | Tiền công bán trên hóa đơn bán |
| Vai trò | Cộng vào tổng tiền nhập / giá vốn nhận hàng | Cộng vào tổng tiền bán |
| Cấm | Hiện công bán trên form nhập; tự map công nhập → công bán | — |

## 3. Giá bán vàng

### 3.1. Vàng 9999 / 999 / 24K

```text
Tổng tiền bán = Trọng lượng vàng × Giá vàng hiện tại + Tiền công bán
```

Tiền công bán nhập trên hóa đơn bán.

### 3.2. Vàng theo hàm lượng và hệ số

```text
Tổng tiền bán = (Giá vàng nguyên liệu 24K/9999 × Trọng lượng vàng cố định × Hàm lượng vàng + Tiền công bán) × Hệ số
```

- Hàm lượng ≠ hệ số kinh doanh.
- TL = vàng thực tế (không đá/phụ kiện).
- Hệ số = hệ số kinh doanh SP; công bán trên hóa đơn.

## 4. Giá bán bạc

### 4.1. Bạc bán trực tiếp

- Giá nhập nhập trực tiếp; không tính TL × hàm lượng.
- Giá bán mặc định = giá nhập (user vẫn có thể sửa theo rule bán hiện có nếu đã có).

### 4.2. Bạc theo trọng lượng

```text
Tổng tiền bán = Trọng lượng bạc × Giá bạc + Tiền công bán
```

Có hệ số:

```text
Tổng tiền bán = (Trọng lượng bạc × Giá bạc + Tiền công bán) × Hệ số
```

Công bán trên hóa đơn, không trên form nhập kho.

## 5. Cập nhật giá bán độc lập CRUD sản phẩm — HOÃN

Yêu cầu đã ghi nhận (làm round sau):

- Xem giá bán hiện tại; nhập/sửa giá bán thủ công mọi SP.
- Không bắt buộc liên kết bảng giá.
- Sửa giá bán không đổi thông tin SP / giá vốn nhập.
- Không bắt buộc vào CRUD sản phẩm chỉ để đổi giá bán.

**Round này: không thiết kế UI, không migration/RPC, không đổi `product` CRUD vì mục này.**

## 6. Liên kết bảng giá (giữ nguyên hướng P8)

- Liên kết **tùy chọn**, không bắt buộc hoàn tất nhập kho.
- Có thể lấy giá gợi ý từ dòng bảng giá visible; vẫn nhập tay.
- Không xóa liên kết hiện có; không đổi hành vi link ngoài phần đã mô tả công thức mới ở đây.
- Trường hợp có công thức P9 cụ thể → áp P9; còn lại giữ hành vi hiện tại (P8 / P4).

## 7. UI

- Tái dùng template `--tlkv-*`, tab/form/modal hiện có; không design system mới.
- Ba khu vực đều có Nhập vàng | Nhập bạc; trường đúng loại hàng.
- Hiện rõ giá vàng/bạc, TL, hàm lượng, hệ số, tiền công **nhập** (nhập kho) / **bán** (hóa đơn).
- Không có trường tiền công bán trên mọi form nhập kho.

## 8. Module boundary (khi code)

| Allowed | Forbidden (round này) |
|---------|------------------------|
| `inventory/**` (ReceiveForm, DraftReceivePanel, price helpers) | Màn/API sửa giá bán độc lập CRUD (§5) |
| `label-print/**` (CombinedReceivePrintPanel, draft receive) | Đổi module bán ngoài công thức cần thiết |
| `pos/**` (công thức / labor bán trên HĐ nếu đụng §3–§4) | Invent công thức giá vốn bạc chưa chốt |
| Docs P9 + README + SYSTEM_DEVELOPMENT_RULES §13/§21 | Refactor ngoài phạm vi |

## 9. Logic cũ phải giữ

- P7: draft → nhận qty=1, mint Unit/MSP, in tem.
- P8: UI In tem 2 tab to + 3 mode; combined receive + workbench in; link giá tùy chọn / sửa tay.
- P4: đá, snapshot thành phần bán, không tự ghi công nhập vào `labor_fee` bán nếu P9 cấm map.
- Không phá RPC nhận hàng đã có mà không migration + backup `tlkv_backup_20261110`.

## 10. Quan hệ với P8

P8 đã chốt: giá vốn gợi ý = `buy × TL` (không hệ số).  
P9 **thắng** P8 đối với **nhập vàng** khi áp công thức §2.2 (TL × HL × giá nguyên liệu + công nhập).  
Link bảng giá vẫn dùng để gợi ý / điền giá nguyên liệu hoặc buy/sell khi phù hợp; không bắt buộc.

## 11. Hard-test (khi có code)

- Account/port: [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md).
- Order / In tem kiêm nhập / Nhập từ tem: tab Vàng vs Bạc; vàng tính đúng §2.2; không ô công bán trên nhập; công nhập không đổ vào labor bán.
- Bán: công thức §3 / §4; công bán chỉ trên HĐ.
- Không test mục §5 trong round này.

## 12. Lịch sử

- 2026-11-18: tạo sổ từ BIG CHANGE; §5 đánh dấu hoãn; chưa code.
- 2026-11-18: code tab Nhập vàng/Nhập bạc + công thức nhập vàng + tiền công nhập trên ReceiveForm / Combined / DraftReceive; gợi ý bán P9 (không map công nhập → labor_fee). Hard-test Order: `PN000128` / `TLKVTS000025` (cost 10.499.000 = 1×0,9999×10.000.000+500.000; labor_fee=0) → đã void + ẩn SKU.
