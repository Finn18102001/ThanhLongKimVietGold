# Quản lý vàng — Module tracking nghĩa vụ giao nhận

> Cập nhật: 2026-09-15  
> SRS nguồn: yêu cầu «Quản lý vàng» (Tổng quan / Phải thu / Phải trả)  
> Contract: [`SYSTEM_DEVELOPMENT_RULES.md`](./SYSTEM_DEVELOPMENT_RULES.md)

## 1. Mục tiêu

Lớp **theo dõi nghĩa vụ** vàng phải thu / phải trả theo từng sản phẩm và số chỉ.  
**Không** phải kho độc lập, **không** tạo Product Card mới, **không** đổi logic tồn kho / hóa đơn / thanh toán / dòng tiền.

| Tab | Nguồn dữ liệu thực | Công thức |
|-----|-------------------|-----------|
| Phải thu | `pos_purchase_receipts` + `pos_purchase_items` (đặt hàng kho / nhập) | `phải thu = expected − settled`; khi `goods_status = NOT_RECEIVED` thì settled = 0 |
| Phải trả | `pos_sales` PREORDER/DEPOSIT + `pos_sale_items` | `phải trả = quantity − qty_delivered` |
| Tổng quan | Gộp 2 nguồn trên | Cùng bộ lọc / Excel |

## 2. Module boundary

| Hạng mục | Giá trị |
|----------|---------|
| Module | `src/modules/gold-management/**` |
| Route | `/gold-management` (`ROUTES.goldManagement`) |
| Menu | MAIN_NAV «Quản lý vàng» |
| Quyền | ADMIN + STAFF (read) |
| DB write | **Không** — chỉ đọc; số dư đổi khi nghiệp vụ nguồn (nhận hàng / giao vàng) chạy |
| Shared touch | `routes.ts`, `nav.ts`, `permissions.ts` |
| Cross-module | `revalidatePath("/gold-management")` khi nhận hàng / fulfill / cancel preorder / deposit |

### Allowed files (đã chạm)

- `src/modules/gold-management/**`
- `src/app/(admin)/gold-management/**`
- `src/shared/navigation/routes.ts`
- `src/shared/layout/nav.ts`
- `src/shared/auth/permissions.ts`
- Revalidate one-liners: `inventory/actions`, `pos/actions`, `invoice/actions`, `sale-deposit/actions`
- `docs/GOLD_MANAGEMENT.md` (file này)

### Forbidden

- Không mutate `pos_inventory_stock` từ module này
- Không tạo bảng «gold stock» song song
- Không đổi RPC nhận hàng / fulfill

## 3. UI

Phong cách **Kho hàng**: KPI cards, tab pill, filter grid, bảng, Xuất Excel (CSV UTF-8 BOM), pagination client.

`design-taste-frontend`: admin data UI → **out of scope** marketing dials. Match TLKV tokens (`--tlkv-*`), VARIANCE 3 / MOTION 2 / DENSITY 7.

## 4. Before / After

### Trước

| Hạng mục | Trạng thái |
|----------|------------|
| Menu Quản lý vàng | Không có |
| Đối chiếu đặt hàng kho chưa nhận | Phải mở Kho → Đặt hàng / Nhập hàng / lịch sử thủ công |
| Đối chiếu PREORDER/DEPOSIT chưa giao | Lọc Hóa đơn «Chưa trả vàng» — không có bảng theo sản phẩm + chỉ |
| Excel nghĩa vụ vàng | Không |
| KPI tổng chỉ phải thu/trả | Không |

### Sau (V1 — 2026-09-15)

| Hạng mục | Trạng thái |
|----------|------------|
| Menu + route `/gold-management` | Có |
| 3 tab Tổng quan / Phải thu / Phải trả | Có |
| KPI 4 ô (GD + chỉ thu/trả) | Có — phản ánh bộ lọc hiện tại |
| Filter ngày / đối tượng / NV / brand / SP / trạng thái | Có |
| Excel đúng filter, datetime `HH:mm:ss dd/MM/yyyy` | Có |
| Đồng bộ nhận hàng / giao vàng | Derive từ DB + `revalidatePath` |
| Không số âm còn lại | `Math.max(0, ordered − settled)` |
| KPI cố định tổng mở hệ thống | Có (không đổi theo tab filter) |
| Phải thu gồm partial RECEIVED (`expected > received`) | Có (VD PN000001) |

## 5. Performance (áp dụng Phase-2 patterns ngay)

Patterns đã ship trên POS Phase-2 (`881cae9`) và **áp dụng sẵn** cho tab này:

| Pattern | Cách áp dụng trên Quản lý vàng |
|---------|--------------------------------|
| Parallel fetch | `Promise.all` purchase + sale trong `listGoldObligations` |
| Một round-trip / nguồn | Select embed items + sku + brand; không N+1 |
| Limit cứng | `.limit(500)` mỗi nguồn (đủ nghiệp vụ hiện tại) |
| Client filter | Filter / tab / page trên memory — không refetch mỗi ô lọc |
| Route `loading.tsx` | Skeleton KPI + bảng |
| Hover prefetch | Nav đã `router.prefetch` trong `AdminShell` |
| Không second inventory | Không query stock riêng; không join ledger nặng |

### Đo / kỳ vọng

| Metric | Kỳ vọng V1 |
|--------|------------|
| Server queries / page load | 2 (purchase + sale) song song |
| Client refetch khi đổi filter | 0 |
| LCP mục tiêu | < 2.5s trên data hiện tại (~60 PN + ~20 open preorder) |

## 6. Future (cập nhật dần)

- [ ] **Nhận hàng một phần thật**: hiện đặt kho ghi `received_qty = expected` khi `NOT_RECEIVED`; nhận hàng flip cả phiếu. Cần RPC partial receive nếu SRS bắt buộc «đặt 10 nhận 6».
- [ ] **Đối tác** như party type riêng (bảng/master) — hiện SUPPLIER / CUSTOMER.
- [ ] **Phải thu từ khách/đối tác giao vàng** ngoài purchase (nếu có flow BUY thiếu vàng) — gắn khi có contract.
- [ ] SQL view / RPC `pos_list_gold_obligations` khi volume > vài nghìn dòng (server-side filter + index).
- [ ] Deep-link từ dòng → chi tiết PN / HĐ.
- [ ] Index gợi ý: `(goods_status, created_at)` trên receipts; `(transaction_type, fulfillment_status, created_at)` trên sales.
- [ ] Ghi số chỉ KPI «đã nhận đủ / đã giao đủ» 30 ngày gần nhất (audit đối chiếu).
- [ ] Export XLSX thật (SheetJS) nếu CSV không đủ cho kế toán.

## 7. Hard-test checklist

1. Login → sidebar **Quản lý vàng**.
2. Tab Phải thu: thấy PN `NOT_RECEIVED`, SL còn = expected, tổng chỉ = SL × định lượng.
3. Tab Phải trả: thấy PRE-/DEPOSIT `UNFULFILLED`/`READY`, SL còn = quantity − qty_delivered.
4. Filter trạng thái / brand / tên → bảng + KPI đổi; Excel khớp số dòng.
5. Nhận hàng ordered (Kho) → quay lại Quản lý vàng: dòng phải thu hết (sau revalidate).
6. Giao vàng preorder → dòng phải trả hết.
