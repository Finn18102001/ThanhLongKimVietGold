# TLKV — Tiến độ triển khai theo spec khách hàng

> Spec gốc: [`TLKV_AI_IMPLEMENTATION_SPEC.md`](./TLKV_AI_IMPLEMENTATION_SPEC.md)  
> Contract kỹ thuật: [`SYSTEM_DEVELOPMENT_RULES.md`](./SYSTEM_DEVELOPMENT_RULES.md)  
> Cập nhật: 2026-08-23 (SRS Purchase: tách catalog ±300k vs market gold nhập tay + UI mockup)  
> **Tiến độ tổng (ước lượng): ~72%**

Cách tính: `Σ(trọng_số × %_epic)`. Chỉ đánh dấu ✅ khi đã có DB + backend enforce + UI dùng được trên môi trường thật.

---

## Tóm tắt nhanh

| Epic | Trọng số | % | Impact | Độ khó | Ghi chú |
|------|----------|---|--------|--------|---------|
| A. Nền tảng hiện có (POS/SKU/Invoice/Customer cơ bản) | 15% | 92% | Cao | — | POS cache meta; stock fresh on tab |
| B. Staff CRUD + phân quyền ADMIN/STAFF | 10% | 98% | Trung | Thấp | Hard smoke STAFF pass (2026-08-23) |
| C. Purchase từ khách (BUY) | 15% | **90%** | **Rất cao** | **Cao** | UI catalog + market; smoke BUY-000002 mixed |
| D. Công nợ 2 chiều + partial payment + due date | 15% | **78%** | **Rất cao** | **Cao** | Receivable + payable entity; overdue RPC; cron phụ thuộc pg_cron |
| E. Vàng thị trường + tuổi vàng + snapshot | 10% | **85%** | Cao | Cao | Market không ±300k (SRS); thiếu SELL |
| F. Price exception ±300k/chỉ + duyệt | 8% | **70%** | Cao | Trung–Cao | Chỉ catalog; market skip BE+UI; SELL chưa |
| G. CCCD / Business customer / QR | 10% | **70%** | Trung | Trung | DB + form + ảnh CCCD + QR fallback + Excel KH |
| H. Báo cáo / Excel / doanh số NV | 10% | **55%** | Cao | Trung | Doanh số NV + Excel GD CSV; thiếu BUY/SELL split chart |
| I. Audit + RLS mở rộng + acceptance | 7% | **45%** | Trung | Trung | BUY-000002 DevTools smoke |

**Công thức:** `0.15×92 + 0.10×98 + 0.15×90 + 0.15×78 + 0.10×85 + 0.08×70 + 0.10×70 + 0.10×55 + 0.07×45` ≈ **72%**

---

## 1. Low-impact / % thấp — có thể làm song song (ít đụng core)

Các đầu mục **ít rủi ro regression** lên POS/kho/tiền, phù hợp làm song song hoặc xen kẽ khi chờ quyết định Cluster 1. Không thay thế việc làm BUY/công nợ trước.

| # | Đầu mục | Epic | % ước lượng | Vì sao low-impact | Ghi chú |
|---|---------|------|-------------|-------------------|--------|
| L1 | Business customer (loại KH doanh nghiệp) | G | 0% | Chủ yếu master data KH; không đổi tồn/tiền | Field + UI form; không cần atomic sale |
| L2 | CCCD text fields (số, ngày cấp, nơi cấp) | G | 0% | Metadata KH; chưa ảnh/QR | Schema + form; RLS read theo role |
| L3 | CCCD images (upload/storage) | G | 0% | Storage + ACL; không đụng POS | Public URL cấm; chỉ signed/private |
| L4 | QR CCCD POC / fallback | G | 0% | Có thể stub/fallback; không block bán | Spec cho phép fallback nếu POC chậm |
| L5 | Excel export KH đầy đủ cột spec | G/H | ~30% | Đọc-only export; đã có export một phần | Mở rộng cột; không đổi ledger |
| L6 | UI polish filter/search (KH, HĐ đã làm một phần) | A | — | Chỉ layout | Không tính vào epic mới |
| L7 | Acceptance checklist Staff (§55) viết test | B/I | — | Verify quyền đã có | Không đổi schema |
| L8 | Kho: đã có SL + tổng TL; còn màn hình phụ nếu spec yêu cầu | A/H | ~80% màn Kho | Đọc tồn; không mutate | Đã làm KPI + cột bảng |

**Thứ tự gợi ý trong nhóm low-impact:** L1 → L2 → L5 → L3 → L4 → L7.

**Không xếp low-impact:** BUY, partial payment flow, receivable/payable, ±300k, market gold, report doanh thu gộp — dù % = 0 cũng **high-impact**.

---

## 2. Đánh giá lại impact / độ khó sau req khách — cluster để tránh conflict

Sau req mới, nhiều mục **không nên làm lẻ** vì cùng đụng một bộ contract: snapshot giá, payment_status, inventory event, reporting revenue.

### Ma trận dependency (đọc theo hàng → cột bị ảnh hưởng)

| Khi sửa… | → Inventory | → Invoice/HĐ | → Payment/công nợ | → Customer detail | → Reporting doanh thu | → Audit |
|----------|-------------|--------------|-------------------|-------------------|----------------------|---------|
| **POS SELL** (partial pay, pending) | OUT (đã có) | Status TT, remaining | Receivable | Sale history | Revenue gộp / filter paid | Who/when/amount |
| **POS BUY** (purchase) | **IN mới** | HĐ mua / phiếu mua | **Payable** | Buy history tách SELL | Report BUY ≠ SELL | Snapshot mua |
| **Market gold + tuổi vàng** | SKU/adhoc item | Dòng HĐ snapshot | Giá → remaining | — | Giá snapshot trong report | Snapshot fields |
| **±300k / price exception** | — | Tổng HĐ / giá dòng | Số tiền nợ | — | Doanh thu theo giá duyệt | Approval audit |
| **Payment collect remaining** | — | Update status | Ledger payment | Receivable/payable bal | Chỉ đếm tiền đã thu? | Payment events |
| **Report doanh số / Excel** | Đọc | Đọc HĐ | Đọc paid/remaining | — | **Consumes all above** | — |

### Cluster triển khai (sửa cùng plan — tránh config/conflict)

#### Cluster 1 — Core giao dịch (làm trước, một PR lớn hoặc chuỗi PR cùng contract)

**Impact: Rất cao · Độ khó: Cao · Trọng số gộp ~48% epic (C+D+E+F)**

Phải thống nhất **một lần** trước khi code UI:

| Contract | Quyết định bắt buộc |
|----------|---------------------|
| Transaction types | `SALE` giữ; thêm `PURCHASE` tách biệt (không đảo dấu SALE) |
| Money | Integer VND; paid / remaining / due_date trên cả SALE & PURCHASE |
| Payment direction | `RECEIVABLE` vs `PAYABLE` — **hai ledger**, không field `debt` gộp |
| Inventory | BUY → IN + ledger event; SELL → OUT (hiện có) — cùng pattern event |
| Snapshot | weight_chi, gold_age, unit_price, market flag tại thời điểm GD |
| Price rule | ±300k validation + approval entity; không auto-correct |
| Invoice UI | Cùng model payment_status cho bán; phiếu mua riêng hoặc cùng list có type |
| Reporting | Chỉ đọc snapshot + payment đã settle theo rule Admin |

**Thứ tự nội bộ Cluster 1 (backend → UI):**

1. DB: PURCHASE + items + payment fields + payable ledger + price_exception  
2. RPC atomic: create purchase / collect payment / approve exception  
3. RLS/permission  
4. POS UI: BUY flow + SELL partial/pending (cùng payment components)  
5. Invoice list/drawer đồng bộ status  
6. Customer detail: BUY history / SELL history / balances tách  
7. **Không** viết report doanh thu gộp cho đến khi (1)–(6) ổn định contract

**Rủi ro nếu làm lẻ:** sửa POS bán → đổi cột HĐ → report vẫn cộng “tổng hóa đơn” thay vì paid → doanh thu lệch; thêm BUY sau khi report đã hardcode SALE → phải rewrite report.

#### Cluster 2 — Reporting & Excel giao dịch (sau Cluster 1)

**Impact: Cao · Độ khó: Trung · Epic H**

| Việc | Phụ thuộc |
|------|-----------|
| Report BUY vs SELL tách | PURCHASE entity sống |
| Doanh số nhân viên (Admin only) | Staff role + sale.staff_id ổn |
| Excel giao dịch / công nợ | payment_status + receivable/payable |
| Cột “Số chỉ” top SP | Đã có một phần (enrich query) |

Làm **một đợt** với cùng định nghĩa “doanh thu” (gross vs collected) — tránh config lại filter.

#### Cluster 3 — Customer identity (song song được với Cluster 1 nếu không đụng form POS checkout)

**Impact: Trung · Độ khó: Trung · Epic G**

CCCD / business / QR / ảnh — độc lập tương đối với inventory money. Chỉ cần chạm POS khi bắt buộc gắn CCCD trước thanh toán (nếu khách confirm rule đó).

#### Cluster 4 — Hardening

**Impact: Trung · Độ khó: Trung · Epic I**

Acceptance §48–55, concurrency, atomicity tests, RLS review — chạy sau mỗi cluster, không chờ cuối cùng mới test.

---

## 3. Plan triển khai đề xuất (tránh sửa 2–3 lần cùng config)

```text
NOW (song song low-impact)
  └─ L1 Business customer, L2 CCCD fields, L5 Excel KH cột
  └─ L7 Staff acceptance checklist

NEXT — Cluster 1a (Payment hoàn thiện trên SELL hiện có)
  └─ Collect remaining + payment history + receivable
  └─ Pending / overdue / due date enforce backend
  └─ Invoice drawer + Customer receivable UI
  └─ Không đụng PURCHASE chưa

THEN — Cluster 1b (BUY + market gold + ±300k cùng contract)
  └─ Migration PURCHASE + snapshot + market gold type
  └─ Inventory IN + payable
  └─ ±300k + price exception trên BUY (và SELL nếu cùng rule)
  └─ POS Purchase UI + Invoice type BUY

THEN — Cluster 2 (Report / Excel / doanh số NV)
  └─ Định nghĩa revenue = ? (đã thu vs tổng HĐ)
  └─ BUY/SELL split + staff sales + permission

ONGOING — Cluster 4 tests sau mỗi milestone
```

---

## 4. Checklist theo spec

### B. Staff / Permission (§25–26, §40, §55)

- [x] Bảng / entity nhân viên (`pos_staff`)
- [x] Create staff account (Auth + profile)
- [x] View staff list
- [x] Edit staff
- [x] Enable / Disable
- [x] Assign role `ADMIN` | `STAFF`
- [x] STAFF không vào Staff management (UI + API)
- [x] STAFF không xem doanh số / dashboard tài chính (ẩn menu + gate route)
- [x] Permission enforced ở RPC/RLS (require_admin vs require_pos_user)
- [x] Acceptance test §55 hard smoke (DevTools, STAFF tuanss1811@gmail.com)

### C. Purchase / BUY (§6–…) — Cluster 1b

- [x] Flow mua từ khách (`/purchase`)
- [x] `pos_buys` / `pos_buy_items` / `pos_buy_payments`
- [x] Inventory IN từ BUY (`PURCHASE_RECEIVED` + `CUSTOMER_BUY`)
- [x] Snapshot giá / tuổi / trọng lượng lúc mua (market gold)
- [x] Thêm dòng mua từ SKU catalog trên UI (niêm yết/chỉ + ±300k)
- [x] Tách rõ catalog vs vàng thị trường (SRS + mockup + live invoice preview)
- [x] Smoke BUY-000002: catalog trong band + market 20M/chỉ (không exception)

### D. Công nợ & thanh toán (§2.2) — Cluster 1a/1b

- [x] Customer Receivable entity (`pos_receivables`, sync từ SALE)
- [x] Customer Payable (`pos_payables`, sync từ BUY)
- [x] `payment_status` + `paid_dong` / `remaining_dong` / `due_date` trên `pos_sales` (DB)
- [x] Cột + filter trạng thái TT trên list hóa đơn (UI)
- [x] Flow thu tiếp (partial → paid) — `pos_collect_sale_payment` atomic
- [x] Partial payment lúc bán (Đủ / Một phần / Chờ TT) — POS UI + `pos_complete_sale`
- [x] Payment history — `pos_sale_payments` + drawer lịch sử
- [x] Flow trả tiếp payable — `pos_collect_buy_payment`
- [x] `pos_mark_overdue_debts` (RPC; schedule nếu có pg_cron)
- [ ] Verify overdue cron trên production schedule

### E. Vàng thị trường (§2.3) — Cluster 1b

- [x] Loại `VÀNG THỊ TRƯỜNG` (ref từ `gold_price_rows`)
- [x] Nhập giá mua thủ công
- [x] Nhập/sửa tuổi vàng trên dòng mua
- [x] Snapshot trên giao dịch BUY
- [ ] Market gold trên SELL (nếu spec yêu cầu)

### F. Price exception (§2.1) — Cluster 1b

- [x] Validation ±300.000đ/chỉ trên BUY **catalog only** (SRS 6.x.6)
- [x] Market gold: BE skip ±300k; UI không hiện cảnh báo chênh lệch
- [x] Warning UI + duyệt Admin + audit `pos_price_exceptions` (catalog)
- [ ] Áp dụng tương tự trên SELL (override giá)

### G. Khách hàng mở rộng — Cluster 3 / low-impact

- [x] Loại KH Cá nhân / Doanh nghiệp (INDIVIDUAL / BUSINESS)
- [x] CCCD text (số, ngày cấp, nơi cấp, quốc tịch)
- [x] Business customer (MST, tên DN, đại diện)
- [x] CCCD images (bucket private + signed URL + upload UI)
- [x] QR CCCD fallback (dán QR → preview → áp dụng form, không auto-save)
- [x] Excel export danh sách KH đủ cột identity
- [ ] Excel export lịch sử giao dịch KH (§20)

### H. Báo cáo — Cluster 2 (một phần)

- [x] Admin xem báo cáo cơ bản (revenue / top SP)
- [x] Cột “Số chỉ” trên top sản phẩm (enrich query)
- [x] Doanh số nhân viên (chỉ Admin) — `pos_report_staff_sales`
- [ ] Report BUY/SELL tách biệt (chart)
- [x] Không lộ report cho STAFF (menu + gate)
- [x] Excel giao dịch CSV — `pos_export_transactions`

### Display / Kho (§19)

- [x] Quantity + total weight trên màn Kho (KPI + cột bảng)

### I. Chất lượng — Cluster 4

- [x] Migration history (không drop DB)
- [x] Staff acceptance checklist doc (§55)
- [ ] Acceptance tests §48–55 automated
- [ ] Không regression POS hiện tại (formal)
- [ ] Atomicity tests giao dịch quan trọng

---

## 5. §58 Definition of Done — map nhanh

| Nhóm DoD | ~% | Ghi chú |
|----------|-----|--------|
| SELL / inventory OUT / staff hide report / admin report / RLS / audit / migration / data cũ | ~80–100% từng mục | Nền đã có |
| Qty + weight display | ~80% | Kho xong; màn khác theo spec nếu còn |
| Partial / due date / remaining | ~70% | Flow SELL + collect + history; thiếu receivable ledger + overdue cron |
| BUY / market gold / ±300k / CCCD / receivable-payable / payment history / report split | 0–5% | Cluster 1–3 |
| **DoD tổng (32 mục, ước lượng)** | **~38%** | Cluster 1a SELL payment bổ sung ~10pp |

---

## Nhật ký

| Ngày | Việc | % tổng |
|------|------|--------|
| 2026-08-21 | Đưa spec vào `docs/`; Staff CRUD (DB + UI + Edge Auth) | ~13% |
| 2026-08-22 | Kho: SL + tổng TL; Hóa đơn: payment status/filter (DB + UI) | ~18% → tính lại ~27% |
| 2026-08-23 | Cluster 3: Business/CCCD/QR/ảnh/Excel KH; migration `20260823073333`; Staff checklist | ~35% |
| 2026-08-23 | Cluster 1a: Payment SELL (partial/collect/history), POS stock cache, migration `20260823103534`; STAFF hard smoke | ~45% |
| 2026-08-23 | Cluster 1b: BUY/payable/receivable/market gold/±300k; report NV + Excel GD; smoke BUY-000001 | ~68% |
| 2026-08-23 | SRS Purchase: catalog vs market gold; UI mockup; BE skip ±300k market; smoke BUY-000002 | ~72% |
