# P6 — Audit & update: Export Excel, Filter/Dropdown, Nhập kho Mã hàng, In MSP, Brand Prefix

> Mở: 2026-11-14 · Yêu cầu: tuananh18101@gmail.com · Trạng thái: **Audit xong; đã nhận trả lời một phần §6 (14/11) — chưa code**  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) · Backup: [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md)  
> Liên quan: [`P5-00-CATALOG-POS.md`](./P5-00-CATALOG-POS.md), [`P1-04-EXPORT-PURITY.md`](./P1-04-EXPORT-PURITY.md), [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md), [`../LABEL_PRINT.md`](../LABEL_PRINT.md)

## 0. Nguyên tắc (đã chốt trong yêu cầu)

1. **Audit trước, báo cáo, hỏi điểm chưa rõ, rồi mới code.**
2. Không tự suy diễn Brand Prefix, sequence, quan hệ MSP–đơn vị sản phẩm.
3. Không chạy migration / cập nhật production cho P6 cho đến khi có xác nhận.
4. Không commit/push trước khi review xong.
5. Không đổi logic giá / tồn / thanh toán ngoài phạm vi trực tiếp.
6. Giữ dữ liệu lịch sử; không xóa cứng; không tự đổi MSP cũ hàng loạt.

---

## 1. Yêu cầu (nguyên văn đã chốt — tóm tắt)

| # | Hạng mục | Mục tiêu |
|---|----------|----------|
| 1 | Export Excel/CSV | Brand/Category xuất đúng theo Product hiện tại sau mapping mới |
| 2 | Filter / Dropdown / Options | Không hiện Brand/Category/Type/Product/SKU đã ẩn trong luồng tạo mới; Category theo `brand_categories` |
| 3 | Nhập kho · Mã hàng | Chỉ chọn/lưu SKU còn hoạt động; backend phải chặn lại |
| 4 | In mới vs In lại MSP | Tách 2 nghiệp vụ; mỗi đơn vị 1 MSP; in lại không cấp mã mới |
| 5 | Brand Prefix MSP | `[BRAND_ABBREVIATION]-[SEQUENCE]` ví dụ `TLKV-000001` từ cấu hình Brand; không hardcode; MSP cũ giữ nguyên |

Chi tiết đầy đủ từng mục: giữ nguyên trong tin nhắn yêu cầu 2026-11-14 (Export §1, Filter §2, Nhập kho §3, In MSP §4, Prefix §5, Audit §6, Nghiệm thu §7).

---

## 2. Module boundary (khi triển khai)

| Hạng mục | Allowed (dự kiến) | Forbidden trừ khi xác nhận |
|----------|-------------------|----------------------------|
| Export | `reporting`, `invoice`, `inventory` (export), RPC `pos_export_*` | Đổi cột ngoài Brand/Category; đổi `.xlsx` nếu chưa chốt |
| Filter | `pos`, `purchase`, `inventory`, `label-print`, `reporting` (options) | Đổi dữ liệu lịch sử / snapshot |
| Nhập kho | `inventory` receive + `pos_private.receive_purchase` | Logic giá vốn / tồn ngoài guard `is_active` |
| MSP / Prefix | `label-print` + migration bảng/RPC tem; có thể cần cột trên `brands` (chạm catalog) | Đổi sequence scope; rewrite MSP cũ; gắn MSP vào bán/nhập |

Cross-module (`brands` abbreviation): **dừng, liệt kê impact, chờ xác nhận** (Rule isolation).

---

## 3. Báo cáo audit — hiện trạng (2026-11-14)

### 3.1 Export Excel/CSV

**Định dạng:** Toàn bộ nút "Xuất Excel" trên POS admin đều ra **CSV** (UTF-8 BOM) qua `downloadCsv` (`src/shared/lib/csv.ts`). Không có file `.xlsx` thật.

**Brand / Category trong export:**

| # | Màn | File xuất | Brand | Category | Filter màn → export? |
|---|-----|-----------|-------|----------|----------------------|
| 1 | `/inventory` Tồn kho | `ton-kho.csv` | Live `pos_skus.brand_id` → `brands.name` | **Legacy** `products.category` text (`?? "Khác"`) — **không** dùng `category_id` / `categories.name` | Có (client trên `filtered`) |
| 2 | `/inventory/history` | `lich-su-bien-dong-kho.csv` | `coalesce(tx.brand_name, brands.name)` | Không có cột | Có (server + limit client) |
| 3 | `/inventory/count` | `kiem-ke-*.csv` | Live lúc xem/xuất (enrich `pos_skus`) | Không có cột (scope tạo phiên đã dùng `category_id`) | Có (client) |
| 4 | `/invoices` | `chung-tu.csv` | Sale: live SKU brand; Buy: `coalesce(bi.brand_name, brands.name)` | Không | Một phần; UI gửi `goldDelivery` nhưng RPC **không nhận** |
| 5 | `/reports` | `tlkv-giao-dich-*.csv` | Như RPC `pos_export_transactions` | Không | Chỉ khoảng ngày (+ limit client) |
| 6 | `/form02` | `phieu-02.csv` | Không | Không | Có |
| 7–8 | `/customers` | `khach-hang.csv` / `hoat-dong-*.csv` | N/A hoặc live SKU / buy snapshot | "Nhóm" = segment khách, không phải danh mục SP | Có |
| 9 | `/gold-management` | `quan-ly-vang-*.csv` | Live SKU brand | Không | Có (client) |
| 10–11 | `/cashflow` | sổ quỹ / phải thu chi | N/A | N/A | Có |
| 12 | Legacy `admin/` | gold history CSV | N/A | N/A | DOM |

**Lỗi / khoảng trống chính (Export):**

1. **Không export nào đọc `products.category_id` → `categories.name`.** Chỉ tồn kho có cột danh mục và đang dùng text cũ.
2. **Không dùng `brand_categories`** khi xuất (không validate cặp Brand–Category).
3. Export bán lấy Brand **live** từ SKU (đổi Brand sau → CSV lịch sử đổi theo); mua có snapshot `brand_name`.
4. Invoice export **bỏ qua** bộ lọc "trả vàng" (`goldDelivery`).
5. Không tự gán Brand/Category ảo — nhưng tồn kho gán `"Khác"` khi `products.category` null (text legacy).

**RPC chính:** `pos_export_documents`, `pos_export_transactions`, `pos_export_ledger`, `pos_export_form02` — định nghĩa hiện tại trong `supabase/migrations/20261110181526_export_purity_columns.sql`.

### 3.2 Filter / Dropdown / Options

| Vị trí | Brand ẩn | Category ẩn | Type ẩn | SKU ẩn | Category theo brand_categories |
|--------|----------|-------------|---------|--------|--------------------------------|
| Bán hàng (`PosTerminal`) | Lọc active ở UI | Không có dropdown Category (chip browseGroup) | `product_types.is_active` | Catalog: active (+ market gold) | N/A |
| Mua vào | Theo tên từ catalog | Chip browseGroup | Active | Active non-market | N/A |
| Tồn kho | Chip từ rows | Select **chuỗi** `products.category` | Active | includeMarketGold/order | Không |
| Nhập hàng Order (Kho + In tem) | Active only | Active + **linked** | Active | N/A (tạo mới) | **Có (P5)** |
| Nhập hàng Mã hàng | — | — | — | **Active only** (client) | — |
| In tem chọn SKU | — | Filter type | Active | Active (+ MG còn tồn) | — |
| Kiểm kê scope | — | Active categories | — | — | Không (theo category_id) |
| Lịch sử kho / Báo cáo brand | **Có thể hiện inactive** (History ghi "(ngừng)") | — | — | — | — |
| `/categories` | Hiện cả inactive (badge) | Hiện cả inactive | Hiện cả inactive | — | Chỉ xem |

**Hardcode còn lại:** chip browseGroup theo tên SP (Nhẫn, Bông lúa…); `MARKET_GOLD_*`; prefix mặc định Order `TLKVTS`.

### 3.3 Nhập kho · Mã hàng

| Layer | Hiện trạng |
|-------|------------|
| UI `ReceiveForm` "Sản phẩm có sẵn" | Options = `listStock()` → `pos_skus.is_active = true` |
| UI Order | Không chọn Mã hàng; tạo SKU mới |
| In tem Nhập hàng | Chỉ Order (`sku_id: null`) |
| Backend `pos_private.receive_purchase` | `FOR UPDATE` theo `sku_id`; **không kiểm `is_active`** (migration `20260908120000…` ~L442) |
| So sánh bán | `complete_sale` **có** chặn SKU inactive |

**Kết luận:** UI đã lọc; API chưa đủ — request giả / race sau khi mở màn vẫn có thể nhập SKU đã ẩn.

### 3.4 In MSP (In mới / In lại)

| Hạng mục | Hiện trạng |
|----------|------------|
| UI | **Một nút**: "In tem" / "In lại" theo client `hasPrintedBefore` |
| Cấp MSP | Nút riêng **"Tạo MSP mới"** → `pos_mint_label_piece` (1 chiếc / lần) |
| Format MSP | `type_code` (free text) + `serial` 6 số global; barcode `BC` + serial |
| Sequence | `pos_label_msp_seq` **chung toàn hệ thống** (live ~743 = số pieces) |
| Capacity vs tồn | **Không** giới hạn số piece theo `quantity`; ~56/67 SKU đã mint nhiều hơn tồn hiện tại |
| Action log | `FIRST_PRINT` / `REPRINT` (không có `NEW_PRINT`) |
| Server enforce | RPC **tin** `action_type` từ client; không khóa piece khi record |
| Đổi type_code sau in | `pos_set_label_piece_type_code` **cho phép** đổi MSP trên piece đã in (log giữ snapshot cũ) |
| Brand trên tem | Chỉ snapshot `brands.name` vào log; **không** vào MSP |

Bảng: `pos_label_pieces`, `pos_label_print_log`. Docs: `docs/LABEL_PRINT.md`.

### 3.5 Brand Prefix

| Hạng mục | Hiện trạng |
|----------|------------|
| Cột abbreviation trên `brands` | **Không có** (`id, name, slug, description, logo_url, is_active, sort_order, …`) |
| Prefix trong mint | Không đọc Brand; chỉ `p_type_code` người dùng nhập |
| Hardcode map TLKV/BTMC/… | Không có trong mint (đúng yêu cầu "không hardcode"), nhưng cũng **chưa có cấu hình chính thức** |
| MSP cũ | 743 pieces; ~46 type_code rỗng; nhiều type_code đã chứa brand/SKU thủ công |

---

## 4. Trước / sau các thay đổi đã có (P5 — liên quan Filter, chưa phải P6)

Các thay đổi dưới đây đã có trên working tree / DB (P5). **P6 chưa sửa code.**

| Hạng mục | Trước (pre-P5) | Sau (P5 hiện tại) | Ý nghĩa |
|----------|----------------|-------------------|---------|
| Lọc Loại SP | Không có trên Bán/Mua/Kho/In tem | Có ô "Loại sản phẩm" (`product_types` active) | Nhân viên lọc đúng taxonomy mới |
| Nhập Order · Danh mục | Mọi category (hoặc không ràng buộc pair) | Dropdown chỉ category **đã liên kết** brand; RPC R1 chặn pair sai | Tránh tạo SP lệch mapping |
| Nhập Order · Loại | Không ghi `product_type_id` | Optional + RPC R2 | Gắn Loại khi tạo Order |
| Thương hiệu Order | Có thể hiện brand ngừng | Chỉ brand `is_active` | Không chọn brand chết khi tạo mới |
| Kiểm kê theo danh mục | `pos_category_skus` (POS cũ) | `products.category_id` | Đồng bộ danh mục website/admin |
| Menu Danh mục POS | CRUD legacy | Chỉ xem taxonomy | Sửa master ở `/admin` website |
| Lịch sử tem nhãn cột | "Loại SP" | Đổi nhãn UI → "Danh mục" (data log vẫn `product_type` string) | Tránh nhầm thuật ngữ; **chưa** đổi nguồn dữ liệu |
| Export Brand/Category | Như mục 3.1 | **Chưa đổi** | Vẫn lỗ hổng Category legacy trên `ton-kho.csv` |
| Nhập kho guard `is_active` | Chỉ UI | **Chưa đổi backend** | Gap mục 3 |
| MSP / Prefix | type_code + seq global | **Chưa đổi** | Gap mục 4–5 |

---

## 5. Đề xuất xử lý (chờ xác nhận — chưa code)

### 5.1 Export

| Việc | Đề xuất | Cần chốt |
|------|---------|----------|
| A1 | `ton-kho.csv`: cột Danh mục = `categories.name` qua `products.category_id`; null → để trống (không tự gán "Khác" nếu rule chốt vậy) | Giữ cột text cũ song song hay thay? Snapshot vs live? |
| A2 | (Tuỳ chọn) thêm Category vào `chung-tu` / `giao-dich` nếu nghiệp vụ cần | Có cần cột mới không (phá layout Excel kế toán)? |
| A3 | Truyền `goldDelivery` vào `pos_export_documents` | Đồng ý sửa RPC? |
| A4 | Báo cáo định dạng: giữ CSV; ghi rõ trong UI "xuất CSV" nếu cần | Có bắt buộc `.xlsx` thật không? |

### 5.2 Filter

| Việc | Đề xuất |
|------|---------|
| B1 | Thống nhất: luồng **tạo mới** chỉ active Brand/Category/Type/SKU |
| B2 | Lịch sử / báo cáo: cho phép hiện inactive kèm nhãn "(ngừng)" (đã có một phần) |
| B3 | Tồn kho filter Category: chuyển sang `categories` + `category_id` (không còn distinct text legacy) |
| B4 | Reporting brand dropdown: lọc active như POS |

### 5.3 Nhập kho

| Việc | Đề xuất |
|------|---------|
| C1 | Trong `receive_purchase`: sau `FOR UPDATE`, nếu `not is_active` → raise rõ ràng |
| C2 | Giữ UI `listStock()` active-only | Không đổi giá vốn / tồn |

### 5.4–5.5 MSP + Prefix / U1

Đã chốt sequence A + quy tắc mint + **U1**. Thiết kế: [`P6-01-UNIT-MSP-U1.md`](./P6-01-UNIT-MSP-U1.md). **Chưa chạy SQL / chưa code** đến hết Bước 2 duyệt.

---

## 6. Trả lời / quyết định đã nhận (2026-11-14) + câu hỏi còn mở

### 6.1 Đã chốt

| # | Nội dung | Quyết định |
|---|----------|------------|
| Sequence | Global vs Brand | **A — Global** (`pos_label_msp_seq` chung; MSP mới `PREFIX-######`) |
| Format MSP mới | Separator | **`TLKV-000001`** (dấu `-`) |
| MSP cũ | Rewrite? | **Giữ nguyên** toàn bộ (kể cả 56 SKU pieces > tồn) |
| Export file | `.xlsx`? | **Không** — chỉ CSV |
| Mint limit | Quy tắc | Xem bảng dưới (không dùng tồn làm trần trực tiếp) |

**Quyết định giới hạn Mint MSP (đã chốt):**

1. Chỉ Mint mới khi còn **đơn vị sản phẩm hợp lệ chưa được cấp MSP**.
2. **Không** lấy `tồn kho hiện tại` làm giới hạn trực tiếp (hàng đã bán vẫn có thể giữ MSP hợp lệ).
3. Backend kiểm số đơn vị chưa cấp + cấp mã **cùng transaction**, an toàn concurrent.
4. Reprint chỉ MSP đã có; không cấp mới; không giới hạn theo tồn.
5. Giữ nguyên 56 SKU vượt tồn: không xóa / thu hồi / đổi mã / reset seq / sửa lịch sử.
6. Tồn = 0: không Mint mới nếu không còn đơn vị hợp lệ chưa có MSP.
7. Sau nhập thêm: chỉ Mint cho **đơn vị mới** chưa có MSP.
8. Trước triển khai: audit nguồn nhận diện từng đơn vị (tránh chỉ so `quantity` vs `count(MSP)`).
9. Báo cáo case không xác định được số đơn vị chưa cấp; không suy luận / không sửa data cũ.

### 6.2 Sequence — đã chọn A

Giữ `pos_label_msp_seq` global. MSP mới: `{brand_abbrev}-{lpad(nextval,6,'0')}`. Serial/barcode tiếp tục unique toàn hệ thống. Không reset.

### 6.3 Còn mở (chưa trả lời)

1. Brand abbreviation: cột trên `brands`? Giá trị chính thức từng Brand?
2. Barcode: giữ `BC`+serial global?
3. `type_code` free-text: bỏ / giữ khi đã có Brand Prefix?
4. In mới UI: 1 click = mint 1 + in 1?
5. Đổi tên `FIRST_PRINT` → `NEW_PRINT` hay giữ enum?
6. Cấm sửa MSP/`type_code` sau khi đã có log in?
7. Nguồn đơn vị: **đã chọn U1** — chi tiết triển khai [`P6-01-UNIT-MSP-U1.md`](./P6-01-UNIT-MSP-U1.md) (Bước 1 xong; chờ Bước 2 duyệt BF-A/B/C + UX bán).

### 6.4 Phân loại 56 SKU: pieces (MSP đã cấp) > tồn hiện tại

**Tổng quan (production 2026-11-14):**

| Chỉ số | Giá trị |
|--------|---------|
| Tổng MSP (`pos_label_pieces`) | 743 |
| SKU có ≥1 MSP | 67 |
| SKU có pieces > tồn | **56** |
| MSP trùng / barcode trùng | **0** |
| Piece không gắn SKU (orphan) | **0** |
| Piece không có dòng tồn | **0** |

**Phân loại nguyên nhân (56 SKU):**

| Nhóm | SKU | Pieces | Tồn tổng | Ý nghĩa nghiệp vụ |
|------|-----|--------|----------|-------------------|
| `ACTIVE_ZERO_STOCK` | 33 | 641 | 0 | SKU vẫn active, tồn 0, nhưng đã mint nhiều (đa số SKU “mẫu” cũ `vtst-*` / `btst-*` không brand; đã bán hết hoặc chưa bao giờ gắn tồn đúng) |
| `ORDER_ZERO_STOCK` | 17 | 17 | 0 | Order jewelry (BCHARM / TLKVTS test) đã đảo phiếu / ẩn, tồn 0, còn 1 MSP lịch sử mỗi mã |
| `OVER_MINT_VS_POSITIVE_STOCK` | 4 | 71 | 7 | Còn tồn >0 nhưng mint nhiều hơn tồn: `tlkv-v24klt-1.9895` (57 vs 1), `btmc-brtl1-1-2` (7 vs 2), `tlkv-000137-0.61` (5 vs 3), `TLKVTS000004` (2 vs 1) |
| `MG_SOLD_OR_ZERO_STOCK` | 2 | 2 | 0 | Market gold đã bán/hủy, tồn 0, còn MSP |

**Không thuộc “vượt tồn” (để đối chiếu):** MATCH 5 SKU; UNDER_MINT 6 SKU (còn tồn nhưng mint ít hơn — bình thường nếu chưa in đủ).

**Kết luận:** không có MSP trùng / orphan. Chênh lệch do V1 **không gắn MSP vào kho/bán**. Quyết định §6.1: giữ 56 SKU; mint mới theo “đơn vị chưa cấp MSP”, không theo `tồn` trần trực tiếp — xem §6.6.

### 6.5 Catalog tree — data cũ vs mới & % (snapshot 2026-11-14)

Mô hình mới: Brand ↔ Category (`brand_categories`) → Product (`brand_id`, `category_id`, `product_type_id`) → SKU.

| Thành phần | Số liệu | % / ghi chú |
|------------|---------|-------------|
| Brands | 7 (6 active) | Master sẵn |
| Categories | 21 (13 active) | Master sẵn |
| Product types | 5 (5 active) | Master sẵn |
| brand_categories | 20 link | Mapping Brand–Category đã dựng (P5) |
| Products có Brand | 170/170 | **100%** |
| Products có `category_id` | 168/170 | **98,8%** |
| Products text `category` = tên theo `category_id` | 156/170 | **91,8%** khớp |
| Products text ≠ id (lệch legacy) | 12/170 | **7,1%** — chủ yếu Bạc: text `"Bạc"` vs id `"Bạc Tích Trữ"`; 2 QUÀ TẶNG 24K vs GRIF |
| Products chỉ text, không id | 1/170 | **0,6%** |
| Products có `product_type_id` | 10/170 (**5,9%**); active: 9/145 có type | **Loại SP gần như chưa gắn hàng loạt** |
| SKU brand ≠ product brand | 0 | **100%** đồng bộ brand SKU–Product |

**Tóm tắt % “đã lên tree mới” (ước lượng có trọng số):**

| Trục | % xong | Chưa xong |
|------|--------|-----------|
| Brand trên Product/SKU | ~100% | — |
| Category id trên Product | ~99% | 2 SP thiếu id |
| Category text đồng bộ id | ~92% | 12 SP lệch text (export tồn kho đang đọc **text** → dễ sai tên) |
| Product Type gắn Product | ~6% | ~94% SP chưa có Loại |
| Export đọc Category mới | **0%** | `ton-kho.csv` vẫn `products.category` text |
| Filter POS theo tree | ~70% (P5 Loại + Order brand_categories) | Tồn kho filter Category vẫn text; History brand inactive |

**Không phải cây parent/child lồng nhau:** `categories` hiện là danh sách phẳng + liên kết nhiều-nhiều với Brand; `product_types` dùng chung, không phải node con trong Category.

### 6.6 Audit nguồn “đơn vị sản phẩm” (điểm 8–9) — **blocker trước khi code mint**

#### Mô hình hiện tại (đã xác nhận bằng schema + docs)

| Lớp | Identity | Gắn MSP? |
|-----|----------|----------|
| Kho / bán / nhập / trả | `sku_id` + **quantity** (`pos_inventory_stock`, ledger) | **Không** |
| Tem | `pos_label_pieces` (1 row = 1 MSP), FK `sku_id` | Có — nhưng **không** trỏ tới dòng nhập / dòng bán / “chiếc” trong kho |
| Bảng unit/serial riêng | **Không có** (chỉ `pos_label_pieces` / log) | — |

`docs/LABEL_PRINT.md` §2: quantity-based, **không serial**; V1 không gắn MSP vào vòng đời nhập/bán.

#### Vì sao không được chỉ so `quantity` vs `count(MSP)`

Ví dụ: tồn = 3, đã mint = 5 (2 đã bán vẫn giữ MSP hợp lệ — đúng quyết định điểm 2).  
Trong 3 chiếc đang nằm kho, **không có dữ liệu** cho biết chiếc nào đã có MSP trong 5 mã, chiếc nào chưa.  
Công thức `max(0, tồn − pieces)` cho 0 → có thể **chặn nhầm** nếu trong kho còn hàng chưa dán tem; hoặc nếu dùng `tồn` trần sẽ **mâu thuẫn** điểm 2.

#### Nhóm không xác định được số “đơn vị chưa cấp MSP” (không sửa data)

| Nhóm | Quy mô (active/có tồn hoặc có MSP) | Vì sao không xác định |
|------|-------------------------------------|------------------------|
| pieces > stock (kể cả 56 SKU + 4 còn tồn) | 56 SKU; trong đó 4 còn tồn > 0 | Không biết MSP nào “đang trên hàng trong kho” vs “đã bán mang theo” |
| stock > 0 và pieces = 0 | 45 SKU | Biết còn tồn nhưng **không có** bản ghi đơn vị; chỉ biết “chưa mint bao nhiêu chiếc” nếu chấp nhận proxy quantity (bị điểm 8 cấm làm nguồn duy nhất) |
| stock > pieces > 0 | 6 SKU (~939 “ổ trống” nếu trừ số) | Cùng vấn đề: trừ số chỉ là ước lượng, không gắn từng chiếc |
| stock = pieces > 0 | 5 SKU | Khớp số lượng, vẫn **không** có identity từng đơn vị gắn giao dịch |

**Kết luận audit (điểm 9):** Với schema hiện tại, **không thể xác định chính xác** tập “đơn vị hợp lệ chưa được cấp MSP” theo nghĩa từng chiếc. Chỉ có hai tập số độc lập: `pos_inventory_stock.quantity` và `count(pos_label_pieces)`.

**Đã chọn U1 + BF-B** (2026-11-14): backfill chỉ SKU **chưa từng có MSP**; SKU đã có MSP không tạo Unit từ tồn cũ (Mint thêm chỉ sau nhập mới hoặc đối soát riêng). Bán: quét MSP / FIFO server. Order: không Unit đến khi nhập thực tế.

Chi tiết + draft SQL (chưa chạy): [`P6-01-UNIT-MSP-U1.md`](./P6-01-UNIT-MSP-U1.md).

**§7 đã khóa.** Đặc tả kiến trúc: [`P6-02-U1-ARCHITECTURE-SPEC.md`](./P6-02-U1-ARCHITECTURE-SPEC.md) (bỏ `RETURNED`; hủy HĐ bán hoàn Unit). Tiếp: review SQL + RPC; **duyệt** rồi mới Bước 3.

---

## 7. Tiêu chí nghiệm thu (copy từ yêu cầu — áp sau khi triển khai)

| Hạng mục | Đạt khi |
|----------|---------|
| Export | Brand/Category đúng nguồn mới; không gán ảo; CSV ghi rõ nếu chưa xlsx |
| Filter | Luồng tạo mới không hiện entity ngừng |
| Nhập kho | UI + backend chặn SKU ẩn |
| In mới | 1 đơn vị ↔ 1 MSP; không trùng; đủ capacity thì chặn |
| In lại | Đúng MSP đã chọn; không tăng seq |
| Lịch sử | Phân biệt mới/in lại; tra cứu được |
| Prefix | Từ cấu hình Brand; thiếu prefix → chặn mint |
| Sequence | Giữ cơ chế đã chốt; không reset |
| Dữ liệu cũ | MSP/log cũ vẫn tra cứu / in lại được |

---

## 8. File / RPC / bảng liên quan (index audit)

| Nhóm | Path |
|------|------|
| CSV helper | `src/shared/lib/csv.ts` |
| Export RPC | `supabase/migrations/20261110181526_export_purity_columns.sql` |
| Stock list / category text | `src/modules/inventory/query.ts` |
| Receive UI | `src/modules/inventory/components/ReceiveForm.tsx` |
| Receive RPC | `pos_receive_purchase` / `pos_private.receive_purchase` |
| P5 Order R1/R2 | `20261113172826_p5_catalog_order_type.sql` |
| Label UI | `src/modules/label-print/components/LabelPrintWorkspace.tsx` |
| Mint / record / type | `pos_mint_label_piece`, `pos_record_label_print`, `pos_set_label_piece_type_code` |
| Tables | `pos_label_pieces`, `pos_label_print_log`, sequence `pos_label_msp_seq`, `brands` |
| Docs cũ | `docs/LABEL_PRINT.md`, P1-01/P1-02, P4-03, P5-00 |

---

## 9. Lịch sử thay đổi

| Ngày | Nội dung |
|------|----------|
| 2026-11-14 | Tạo file từ yêu cầu audit P6; ghi hiện trạng Export / Filter / Nhập kho / MSP / Prefix; bảng trước–sau P5; danh sách câu hỏi chờ chốt. **Chưa code P6.** |
| 2026-11-14 (pm) | Ghi trả lời: MSP mới `PREFIX-######`; giữ MSP cũ; export chỉ CSV. Làm rõ câu hỏi sequence A/B. Thêm §6.4 phân loại 56 SKU; §6.5 % catalog cũ/mới. |
| 2026-11-14 (đêm) | Chốt sequence **A**; chốt 9 điểm giới hạn Mint; audit §6.6: **không có** bảng đơn vị — không thể đếm chính xác “chưa cấp MSP”; chặn code mint-limit đến khi chọn nguồn unit (U1/U2/…). |
| 2026-11-14 (đêm 2) | Chốt **U1** + 5 bước triển khai; tạo [`P6-01-UNIT-MSP-U1.md`](./P6-01-UNIT-MSP-U1.md) + draft SQL schema/verify/rollback (**chưa** apply production). |
| 2026-11-14 (đêm 3) | Khóa **BF-B**, bán FIFO/MSP, đảo/trả, Order; draft backfill BF-B; sẵn sàng review SQL. |
| 2026-11-14 (đêm 4) | Khóa §7 legacy bán + đảo giữ FK; draft schema thêm cột void; khung review RPC. |
