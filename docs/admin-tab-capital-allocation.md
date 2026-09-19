# Phân bổ vốn SRS — tab `/admin` (Website :5190)

Tài liệu tổng hợp logic hiện tại. Cursor rule đồng bộ: [`.cursor/rules/admin-capital-allocation.mdc`](../.cursor/rules/admin-capital-allocation.mdc).

## Mục tiêu

- `% Vàng / Tổng vốn quy vàng`, `% Bạc / Tổng vốn quy bạc`
- `% vốn` từng dòng / thương hiệu (cùng mẫu số kim loại)
- KPI giá trị tồn thị trường (tách biệt, không làm mẫu số SRS)

## Single Calculation Engine

```
POS / bảng giá / tiền / công nợ
        ↓
TLKVGoldInventoryCapital.calculateInventoryCapital()  ← SSoT
        ↓
KPI · rows · brands · reconciliation  (chỉ consume snapshot)
```

| Module | Path |
|--------|------|
| Engine | `js/admin/gold-inventory-capital.js` |
| UI wire | `js/admin-app.js` |
| Markup / CSS | `admin/index.html`, `admin/admin.css` |

Snapshot tối thiểu: `gold` / `silver` (avg, inventoryConverted, receivable, payable, metalActual, moneyConverted, totalCapital, percent), `rows[]`, `brands[]`, `reconciliation`, `unclassifiedObligationCount`.

## Công thức

### Giá TB dòng
- Brand: `(mua + bán) / 2`
- Thị trường: `mua`

### Portfolio avg (chỉ inventory đúng metal)
`avg = Σ(qtyChi × pricePerChi) / Σ(qtyChi)` — không gồm tiền hay AR/AP kim loại; không làm tròn trung gian.

### Giá 1 chỉ
`pricePerChi = listedAvg / boardUnitChi` (board = 0.1 / 0.2 / 0.5 / 1 …)

### Tiền
`moneyActual = cash + bank + recv − debt` (missing = 0)  
`moneyConverted = moneyActual / avgMetal` — cùng moneyActual cho cả hai metal; **không** phân bổ xuống row/brand.

### Kim loại thực tế & tổng vốn
```
metalActual = inventoryConverted + recv − pay
totalCapital = metalActual + moneyConverted
% metal = metalActual / totalCapital × 100
```

### % dòng / brand
```
shareChi = inventoryConverted + allocatedRecv − allocatedPay
% = shareChi / totalCapital(metal) × 100
brandShare = Σ shareChi (cùng brand + metal)
```

## Unclassified vs Unallocated

| Trường hợp | Hành vi |
|------------|---------|
| **Unclassified** (`metal` unknown) | Loại khỏi cả hai pool; `unclassifiedObligationCount++`; không fallback Gold |
| **Unallocated** (metal known, không map product) | Vẫn vào `metalActual` / `totalCapital`; vào `unallocatedReceivable/PayableChi`; không gán row/brand |

## Double-count (audit POS)

- Receivable mua: kho tăng khi nhận → cộng AR OK  
- Payable PREORDER/DEPOSIT: chỉ trừ kho khi `SALE` → trừ AP OK  
Re-audit nếu đổi RPC kho/fulfill. Không “sửa” bằng UI.

## Reconciliation (đơn vị chỉ)

```
Σ shareChi + unallocRecv − unallocPay + moneyConverted = totalCapital
```

Lệch → `ok=false` + warn; không normalize/% giả.

## Không clamp

Cho phép âm / >100%. `totalCapital === 0` → `0.0%` (không NaN/Infinity).

## UI (presentation only)

Footer bảng giá tách 2 dòng:

1. **Tổng giá trị tồn (thị trường)** ← `snapshot.marketInventoryValue`
2. **Tỷ trọng vốn: Vàng X% · Bạc Y%** ← `snapshot.gold.percent` / `snapshot.silver.percent`

Không gộp % vào cùng ô với market value.

Đối soát luôn liệt kê:

- Tồn theo sản phẩm
- Phải thu (đã phân bổ) / Phải thu chưa phân bổ
- Phải trả (đã phân bổ) / Phải trả chưa phân bổ
- Tiền quy kim loại
- Tổng vốn quy kim loại

Unallocated = known metal, chưa map product (vẫn trong capital).  
Unclassified = không biết metal → cảnh báo ⚠, không vào pool.

KPI `% Vàng` / `% Bạc` có tooltip ⓘ: tỷ lệ có thể >100% hoặc <0%, không clamp.

`admin-app.js` chỉ format snapshot — không tính lại %.

## Port

Website `/admin`: **5190**. POS: **3000** (không test SRS admin ở đây).

## Self-check

```bash
node -e "console.log(require('./js/admin/gold-inventory-capital.js').selfCheck())"
```
