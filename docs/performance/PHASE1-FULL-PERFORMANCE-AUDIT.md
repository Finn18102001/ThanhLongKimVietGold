# Phase 1 — Full Performance Audit Report

**Project:** Thăng Long Kim Việt POS  
**Repo:** `Finn18102001/ThanhLongKimVietGold`  
**Phase:** 1 — AUDIT ONLY  
**Date:** 2026-11-24 (Asia/Ho_Chi_Minh)  
**Status:** Complete — chờ user duyệt trước khi Phase 2  
**Code/schema/Production writes:** Không có

---

## 0. Measurement environment (bắt buộc đọc trước khi so số)

| Mục | Giá trị |
|---|---|
| App | `npm run dev` → `http://localhost:3000` (Next.js Turbopack **development**) |
| DB | Supabase project `yrdqnmsvwovwhepmhigv` · region **ap-northeast-2** |
| Account | hard-test `tuananh18101@gmail.com` (ADMIN) |
| Dataset (approx) | `pos_skus` 441 · catalog POS scope 400 · active non-market 250 · sales COMPLETED 3704 · invoices 4037 · customers 2950 · sale_items 4734 · label_pieces 761 |
| Method | Code trace + read-only SQL `EXPLAIN ANALYZE` + Chrome DevTools RSC/HTML timing |
| Caveat | **Dev mode** làm chậm compile/chunk; số ms không phải SLA production. Payload size, số round-trip Supabase, và waterfall code **vẫn đúng** trên prod. |

P95 trong bảng dưới = **chưa có sample ≥20 lần**. Ghi **N/A** hoặc dùng 2 pass đo được (pass1 / warm). Không suy diễn P95 từ 1–2 lần.

---

## 1. Executive Summary

### 1.1. Tổng quan

Hệ thống chậm chủ yếu ở **server data-loading + RSC payload**, không phải query Postgres đơn lẻ “nặng”. Join catalog ~400 SKU trên DB chỉ **~19 ms**. Nhưng mở `/pos` (HTML hoặc soft RSC) mất **~10 s** wall-clock trên máy audit vì:

1. Nhiều round-trip PostgREST/RPC tuần tự tới Seoul.
2. Serialize **toàn bộ catalog** (~400 object) vào Flight/HTML (~240–320 KB text).
3. Waterfall shell quỹ (`resolveCashClerkShellMode`) + duplicate `listMarketGoldClassPrices` / fund flag.
4. Sidebar `prefetch={false}` → mỗi lần đổi tab là full RSC fetch (không warm prefetch mặc định).

Dataset còn nhỏ (hàng nghìn sales, không phải triệu). Bottleneck hiện tại là **architecture of fetching**, chưa phải thiếu index trên bảng lõi catalog.

### 1.2. Khu vực chậm nhất (có số liệu)

| # | Khu vực | Evidence |
|---:|---|---|
| 1 | **Bán hàng `/pos`** | RSC ~10.6 s / 9.8 s; HTML document ~10.0 s; payload ~241k chars · 400 `skuId` |
| 2 | **Mua vào `/purchase`** | RSC ~1.5–1.9 s; ~144k chars · 250 SKU |
| 3 | **Quản lý vàng** | RSC ~1.5 s; **~388k chars** (limit 500 receipts + 500 preorder/deposit sales + embeds) |
| 4 | **Dashboard `/`** | LCP lab 1.32 s · TTFB 1.16 s (trace reload); RSC ~1.0–1.5 s |
| 5 | **Kho `/inventory`** | RSC ~1.0–1.1 s nhưng payload lớn (~206k · 429 SKU) — DB nhẹ, serialize + full list |

### 1.3. Root cause đã xác nhận (CONFIRMED)

| ID | Root cause | Evidence |
|---|---|---|
| C1 | POS/Purchase/Inventory **load full catalog/stock list** vào RSC, UI chỉ paginate client (`PAGE_SIZE=8`) | `pos/query.ts` `fetchPosCatalogMeta` không `range`; `PosTerminal` filter client; đo 400 `skuId` trong RSC |
| C2 | POS critical path có **nhiều round-trip** + waterfall quỹ | `PosPage` + `resolveCashClerkShellMode` + `loadMspBySkuIds` sau meta |
| C3 | **Duplicate** `listMarketGoldClassPrices` trên cùng request POS | `listPosCatalog` gọi bên trong; `PosPage` gọi lại trong `Promise.all` |
| C4 | Auth/session gates lặp trên layout: `getUser` (proxy + layout) + fund cash/gold tuần tự | `proxy.ts`, `(admin)/layout.tsx` |
| C5 | Nav **không prefetch** mặc định | `AdminShell` `prefetch={false}` — chỉ prefetch hover/focus |
| C6 | Core SQL catalog **không** là bottleneck | `EXPLAIN ANALYZE` join POS catalog **Execution Time 18.6 ms** |
| C7 | Không có React Query/SWR/Realtime catalog; cache app gần như không có (chỉ `React.cache` cho `getPosSession`) | Grep codebase |
| C8 | Gold management nhúng deep select limit 500×2 → payload lớn nhất | `gold-management/query.ts` + đo 388k chars |

### 1.4. Giả thuyết (HYPOTHESIS — chưa đo đủ)

| ID | Hypothesis | Cách xác minh Phase 2 prep |
|---|---|---|
| H1 | RTT VN→`ap-northeast-2` ~150–350 ms/request là phần lớn wall-clock POS | Log duration từng `supabase.from/rpc` server-side |
| H2 | `tlkv_has_pos_access()` trong RLS trên mọi row select làm chậm khi dataset lớn | `EXPLAIN` với role `authenticated` + so sánh `SET row_security` |
| H3 | Dev Turbopack làm phóng đại 10 s; prod build có thể ~3–5 s nhưng vẫn vượt target | Đo lại `next start` / Vercel preview cùng account |
| H4 | Invoice filter payment method `limit(5000)` sẽ chậm khi payments tăng | Seed/staging + EXPLAIN khi >50k payments |
| H5 | MSP search không debounce trên POS/StockTable spam RPC khi gõ | Network panel khi type search |

### 1.5. Severity & ưu tiên

| Priority | Hạng mục |
|---|---|
| **P0** | POS tab open (C1–C3, C5) — hiện tượng 3–4 s user báo cáo khớp hướng; đo được ~10 s (dev) |
| **P1** | Layout auth/fund waterfall (C4); full-list Inventory/Purchase/Label; Gold payload (C8) |
| **P2** | Dashboard phụ query ngoài RPC; invoice payment prefilter; unindexed FKs advisor |
| **P3** | Unused indexes cleanup; MSP debounce; revalidatePath blast radius |

---

## 2. Architecture data-flow map

```text
Browser
  └─ AdminShell (client Link prefetch=false)
       └─ Soft nav → GET /{route}?_rsc=…  (text/x-component, chunked)
            │
proxy.ts ─── auth.getUser()  (mọi request matched)
            │
(admin)/layout.tsx
  ├─ auth.getUser() again
  ├─ getPosSession() → rpc pos_get_session   [React.cache]
  ├─ canOpenEmployeeCashModule() → flag + rpc   [sequential try]
  └─ canOpenEmployeeGoldModule() → flag + rpc   [sequential try]
            │
Page (RSC)
  └─ module query/actions → createServerSupabase() → PostgREST / RPC
       └─ DB public.* (+ SECURITY DEFINER RPCs)
```

**Modules in scope (code):**  
`pos`, `purchase`, `inventory`, `label-print`, `invoice`, `customer`, `product`, `dashboard`, `reporting`, `gold-management`, `fund-cash`, `fund-gold`, `cashflow`, `employee`, `settings`, `sale-deposit`, `category`, `audit`, `form02`, `shared/auth`, `shared/supabase`, `shared/search`, `proxy`.

**Không thấy:** Supabase Realtime channel subscriptions trong `src/` (chỉ `setInterval` countdown payment success). Không có `@tanstack/react-query` / SWR.

---

## 3. Top 20 Slowest APIs / RPCs

> Avg/P95: phần lớn **N/A** (chưa có APM). Cột **Observed** = wall-clock đo được hoặc DB EXPLAIN. Priority theo impact UX.

| # | API/RPC / Query surface | Caller | Observed | P95 | Payload | Root cause | Priority |
|---|---|---|---:|---:|---:|---|---|
| 1 | RSC `GET /pos` (aggregates catalog+gates) | Soft nav / document | **9.8–10.6 s** | N/A | ~241k chars / HTML ~320k | C1–C3 multi-RTT + full catalog | P0 |
| 2 | `fetchPosCatalogMeta` → `pos_skus` embed stock/price/product/brand | `listPosCatalog` / purchase | DB join **18.6 ms**; wall in path multi-s | N/A | ~400 rows rich | Full table read OK; cost = RTT+serialize | P0 |
| 3 | `loadMspBySkuIds` ×2 (`pos_label_pieces` + `pos_inventory_units` `.in(skuIds)`) | After catalog meta | N/A (serial after #2) | N/A | up to all SKU ids | Extra stage on critical path | P0 |
| 4 | `pos_list_market_gold_stock` | `listPosCatalog` | N/A | N/A | MG in-stock rows | Parallel OK; still +1 RTT | P1 |
| 5 | `pos_market_gold_class_prices` | `listPosCatalog` **và** `PosPage` | Duplicate ×2 / request | N/A | small JSON | C3 confirmed duplicate | P0 |
| 6 | `resolveCashClerkShellMode` chain (`pos_get_app_setting_bool` + settings row + cash access + gold gate) | POS/Purchase pages | Sequential waterfall | N/A | small | Blocks catalog start | P0 |
| 7 | RSC `GET /purchase` | Soft nav | **1.5–1.9 s** | N/A | ~144k · 250 SKU | Full pricing catalog | P1 |
| 8 | RSC `GET /inventory` | Soft nav | **~1.0–1.1 s** | N/A | ~206k · 429 SKU | `listStock` full + purity RPC | P1 |
| 9 | RSC `GET /gold-management` | Soft nav | **~1.5 s** | N/A | **~388k** | Deep embeds limit 500 | P1 |
| 10 | RSC `GET /` dashboard | Soft nav / reload | **1.0–1.5 s**; LCP TTFB **1161 ms** | N/A | ~33k | `pos_get_dashboard` + 5 follow-up queries | P1 |
| 11 | `pos_sales` 7d + `pos_sale_items` embed (dashboard best sellers) | `getDashboardSnapshot` | Index scan sales **0.85 ms** (ids only); embed cost N/A | N/A | ~411 sales/7d | Extra queries after RPC | P2 |
| 12 | RSC `GET /label-print` | Soft nav | **~1.0 s** | N/A | ~154k · 373 sku refs | Large draft/sku snapshot | P2 |
| 13 | RSC `GET /reports` | Soft nav | **~1.2 s** | N/A | ~48k | `pos_get_reporting` + weight query | P2 |
| 14 | `pos_export_transactions` | Report/export actions | N/A | N/A | can be large | VOLATILE plpgsql export | P2 |
| 15 | `listInvoices` + optional `pos_sale_payments` select limit 5000 | Invoice filters | List page RSC **~0.9 s** (light) | N/A | list small; filter path heavy | Prefilter scan hypothesis H4 | P2 |
| 16 | `pos_list_product_admin` | Products admin | RSC **~0.9 s** | N/A | paginated ~37k | Already paginated — OK pattern | P3 |
| 17 | `pos_list_customers` | Customers | RSC **~1.0 s** | N/A | ~25k | Paginated RPC — OK | P3 |
| 18 | `pos_list_sku_stock` | `refreshPosStock` client | N/A | N/A | all stock if null ids | Full map refresh on focus/visibility | P2 |
| 19 | `pos_find_sku_ids_by_msp` | POS/Stock search, invoice MSP | N/A | N/A | ≤100 ids | No debounce on POS/Stock (H5) | P2 |
| 20 | Layout fund gates `pos_employee_cash_my_access` / gold access | Every admin page | N/A ×2 sequential | N/A | tiny | C4 every navigation | P1 |

**Cách thu thập P95:** bật server timing log (Phase 2 instrumentation only) hoặc Supabase query logs + 20 soft-nav samples trên **production build**.

---

## 4. Top 10 Slowest Screens / User Journeys

| # | Screen/Journey | Total (observed) | API/RSC | Render (lab) | Main bottleneck |
|---|---|---:|---:|---:|---|
| 1 | Login → Dashboard (reload) | LCP **1319 ms** | TTFB **1161 ms** | Render delay **127 ms** | Server dashboard assembly |
| 2 | Sidebar → **Bán hàng** | Soft RSC **~10 s**; HTML **~10 s** | Dominates | UI hiện sau data (Suspense fallback ngắn) | Full catalog + multi-RTT (C1–C3) |
| 3 | POS → Search/filter (client) | Instant after load | MSP RPC nếu gõ ≥2 ký tự | Client filter 254 SP | Data đã ở memory; MSP spam H5 |
| 4 | Sidebar → Mua vào | **1.5–1.9 s** | RSC | Small | Full catalog pricing |
| 5 | Sidebar → Kho tồn | **~1.1 s** | RSC | Client table page 8 | Full stock list serialize |
| 6 | Sidebar → Quản lý vàng | **~1.5 s** | RSC | Client filter/page | Huge nested payload |
| 7 | Sidebar → Hóa đơn | **~0.9 s** | RSC | Client search debounce 350ms | OK baseline; filter payment risk |
| 8 | Sidebar → Báo cáo | **~1.2 s** | RPC + weights | — | Acceptable now; export risk |
| 9 | Sidebar → Sản phẩm | **~0.9 s** | Paginated RPC | — | Good pattern to copy |
| 10 | Inventory receive / Order / Label flows | Not timed separately | Share `listStock` / drafts | — | Same full-list pattern (code) |

**POS → Add to cart / Checkout / Thu thêm:** không benchmark ghi (Phase 1 cấm write). Trace code: mutations qua Server Actions + RPC; sau bán gọi `refreshPosStock` scoped — hợp lý.

---

## 5. Duplicate Requests Report

| API/RPC | Where | Times | Trigger | Needed? | Impact | Direction |
|---|---|---:|---|---|---|---|
| `pos_market_gold_class_prices` | `listPosCatalog` + `PosPage` | **2 / POS load** | Every POS open | No — 1 đủ | +1 RTT | Remove outer call or stop inner |
| `isEmployeeFundEnabled` / flag RPC+row | layout gates, shell mode, PosPage | **≥2–3 / request** | No `React.cache` | Cache per request OK | Extra RTT | Wrap `cache()` |
| `auth.getUser` | `proxy` + layout | **2** | Every nav | Arguably 1 | Auth overhead | Reuse claims / slim proxy |
| `canOpenEmployeeCash/Gold` | layout + shell mode | Overlap | POS/Purchase | Partial | Waterfall | Single resolved shell context |
| Full catalog vs stock refresh | SSR catalog already has qty; client may refresh on focus | 1+ | visibility/focus | Fresh stock yes; full list no | Extra RPC | Keep scoped refresh only |
| MSP `pos_find_sku_ids_by_msp` | POS + StockTable `useEffect([query])` | 1 per keystroke (≥2) | Typing | Debounced yes | Spam | Debounce 300ms like invoices |

---

## 6. Database Report

### 6.1. Confirmed

- Catalog-style join (skus⇄stock⇄price⇄products⇄brands): **Seq Scan** trên bảng nhỏ; **18.6 ms** execution; planning ~53 ms (cold plans).
- `pos_sales` 7-day by `completed_at`: **Index Scan** ~0.85 ms · 411 rows.
- Table sizes modest (largest `pos_sales` ~2.8 MB).
- RLS select policies dùng `tlkv_has_pos_access()` (STABLE SECURITY DEFINER) — đúng pattern; chi phí per-row **chưa đo** dưới role JWT (H2).
- `pos_sale_payments` policy `USING (true)` cho authenticated — không phải perf issue trực tiếp; security note riêng.

### 6.2. Advisor (performance linter)

- Nhiều **unindexed foreign keys** (140 findings liên quan `pos_*` / products…) — INFO level.
- Ưu tiên index theo query thật (buy_items.sku_id, held_order_items.sku_id, invoices.customer_id, label_drafts.*…) **sau** khi có EXPLAIN chứng minh — không thêm index hàng loạt trong Phase 1.

### 6.3. N+1

- **Không** thấy loop client gọi 1 query/SKU trên POS load.
- Có **staged queries**: catalog → MSP batch; dashboard RPC → 5 queries; reporting RPC → weights query; gold → purity fill. Đây là “N-stage” chứ không phải classic N+1.

### 6.4. Pagination / payload

| Surface | Server pagination? | UI pagination? |
|---|---|---|
| Products admin | Yes (`pos_list_product_admin`) | Yes |
| Customers | Yes | Yes |
| Invoices list | Yes (limit 5–50) | Yes |
| POS catalog | **No** | Yes (8) |
| Purchase catalog | **No** | Client |
| Inventory stock | **No** | Yes (8) |
| Gold obligations | Limit 500 hard | Client 12 |
| Dashboard sales series | Date filter, no page | Chart |

### 6.5. Triggers / nested RPC

- `pos_get_dashboard` → `pos_private.get_dashboard()` (thin wrapper) — OK.
- Mutating sale/buy RPCs không benchmark (no write).

---

## 7. Frontend Report

| Finding | Evidence | Confidence |
|---|---|---|
| Chậm tab = chờ RSC, không phải React render list lớn | Dashboard render delay 127 ms; POS hiện fallback rồi data | CONFIRMED |
| Client holds full catalog in state; filter/`useMemo` trên 250–400 items | `PosTerminal`, `StockTable` | CONFIRMED — OK at current size |
| No shared client cache across tabs | Soft nav remounts page data each time | CONFIRMED |
| Prefetch disabled | `AdminShell` | CONFIRMED |
| Images: catalog cards may request images; many SKUs `imageUrl` null in sample | Payload sample | PARTIAL |
| Bundle: Phosphor + large PosTerminal client chunk | RSC references multiple chunks | HYPOTHESIS — cần prod bundle analyze |
| Realtime: none for stock/prices | Grep | CONFIRMED |
| Stock refresh on window focus/visibility | `PosTerminal` useEffect | CONFIRMED — intentional freshness |

---

## 8. Caching & state classification

| Data class | Current | Audit note |
|---|---|---|
| Giá vàng board | Read on catalog/price rows; no realtime | Must stay fresh on sell — short TTL cache OK later with invalidation |
| Tồn kho | SSR snapshot + client RPC refresh | Do **not** stale-serve for checkout |
| Công nợ / thanh toán | Invoice/sale RPC | No aggressive cache |
| Catalog SKU meta | Full fetch every tab | Candidate for session cache / search API |
| Customer directory | Paginated RPC | OK |
| Reports | Per date range RPC | Cache by range key possible |
| Fund flags / shell mode | Re-fetched often | Request-level `cache()` safe |

---

## 9. Optimization Backlog

| ID | Module | Root cause | Evidence | Proposed solution | Expected benefit | Risk | Impact scope | Complexity | Priority | Regression tests | Rollback |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PERF-001 | pos | Duplicate market prices RPC | Code C3 | Gọi 1 lần; pass vào map catalog | −1 RTT (~0.2–0.4 s) | Low | pos only | Low | P0 | POS load prices MG groups | Revert commit |
| PERF-002 | pos / fund / settings | Waterfall shell + uncached flag | Code C2/C4 | `cache()` flag+access; parallelize shell | −0.5–1.5 s POS/Purchase | Medium (wrong shell mode) | pos, purchase, layout | Medium | P0 | Cash-clerk vs normal shell | Revert |
| PERF-003 | pos | Full catalog in RSC | Timing 10 s / 400 SKU | Search/RPC page hoặc lazy groups; keep cart pricing authoritative on add | Tab open → target ≤1–2 s | **High** (miss SKU, price drift) | pos contract | High | P0 | Search, barcode, MG picker, HESO/LINK price | Feature flag |
| PERF-004 | shared/layout | prefetch=false | AdminShell | Prefetch on intent / route groups | Faster warm tab | Medium (stale RSC) | all admin nav | Low | P1 | Tab switch warm | Revert prop |
| PERF-005 | inventory / purchase / label | Full list pattern | Payload sizes | Align with product admin pagination or shared catalog service | −payload, −RTT | High if stock wrong | inventory, purchase, label | High | P1 | Stock KPIs, export CSV, receive pickers | Flag |
| PERF-006 | gold-management | Fat nested select | 388k chars | Server filter + page; slim columns | −payload | Medium | gold-management | Medium | P1 | Obligation totals | Revert query |
| PERF-007 | dashboard | RPC + 5 queries | Code | Fold series/bestsellers into `pos_private.get_dashboard` | −4 RTT | Medium | dashboard RPC | Medium | P2 | KPI numbers vs today | SQL rollback |
| PERF-008 | admin layout | Double getUser + fund gates | proxy+layout | Single session context provider (RSC) | −auth RTT every page | Medium | layout security | Medium | P1 | Login gate, role menu | Revert |
| PERF-009 | pos / inventory | MSP no debounce | useEffect | Debounce 300ms + cancel | Fewer RPC | Low | search UX | Low | P2 | Typeahead MSP | Revert |
| PERF-010 | invoice | payments prefilter 5000 | query.ts | RPC filter join / indexed distinct sale_id | Stable as data grows | Medium | invoice list | Medium | P2 | MIXED/CASH/TRANSFER filters | Revert |
| PERF-011 | db | Unindexed FKs | Advisor | Add indexes **proven** by EXPLAIN | Join/delete speed | Low–Med | migrations §32.1 | Low | P2 | EXPLAIN before/after | Drop index |
| PERF-012 | pos | MSP stage after catalog | loadMspBySkuIds | Optional join/RPC single shot; or lazy MSP on search | −1 stage | Medium | pos query | Medium | P1 | MSP search / tem | Revert |
| PERF-013 | inventory actions | Broad `revalidatePath` | actions.ts | Narrow paths | Less cache thrash | Medium | after mutations | Low | P3 | After receive, POS still fresh enough | Revert |
| PERF-014 | reporting | Export unbounded feel | export RPC | Hard caps + streaming | Protect worker | Low | reports | Medium | P2 | CSV row counts | Revert |
| PERF-015 | observability | No timings | — | Server `performance.now` spans per query (log only) | Enables real P95 | Low | shared | Low | P0 (tooling) | Logs only | Remove logs |

**Impact classes:** PERF-001/009/015 = Low Impact · PERF-002/004/006/007/008/010 = Medium · PERF-003/005 = High Impact (cần duyệt riêng).

---

## 10. Implementation Roadmap (đề xuất — **không bắt đầu**)

### Phase 2 — Database & API (sau duyệt)

> **Status 2026-11-24:** Done — see `docs/performance/PHASE2-BENCHMARK-AND-LEFTOVERS.md`.  
> Shipped: PERF-015, 001, 002, 012, 010 (partial + index), 011; PERF-007 instrument-only (RPC fold leftover).

1. PERF-015 instrumentation  
2. PERF-001, PERF-002, PERF-012 (quick wins, measurable)  
3. PERF-007 dashboard RPC fold  
4. PERF-010 invoice payment filter  
5. PERF-011 indexes only with EXPLAIN proof + §32.1 GRANT N/A for indexes  

### Phase 3 — Frontend & data flow

1. PERF-004 prefetch strategy  
2. PERF-003 POS catalog contract redesign (search / virtualize / segment)  
3. PERF-005 inventory/purchase alignment  
4. PERF-006 gold slim  
5. PERF-009 debounce  

### Phase 4 — Realtime & hardening

1. Decide if gold board / stock needs realtime (hiện **không có**)  
2. Cache invalidation rules for bất kỳ cache mới  
3. Full regression: giá LINK/HESO, tồn, thanh toán, công nợ, RLS  
4. Benchmark before/after trên **production build**  
5. Rollback drills  

---

## 11. Journey traces (tóm tắt call chain)

### 11.1. Tab Bán hàng (critical)

```text
Click "Bán hàng"
 → Next soft nav RSC /pos
 → proxy.getUser
 → (layout may revalidate) session + fund gates
 → PosPage:
      resolveCashClerkShellMode → flag → cash access → gold gate   [SERIAL]
      Promise.all:
        listPosCatalog
          → fetchPosCatalogMeta (pos_skus embeds)
          → loadMspBySkuIds (pieces + units)                     [AFTER meta]
          → pos_list_market_gold_stock
          → pos_market_gold_class_prices                         [A]
        listPosBrands / product_types / held_orders / session
        listMarketGoldClassPrices                                [A duplicate]
        isEmployeeFundEnabled                                    [again]
      then awaiting gold (if flag) → operators (if shared)
 → Serialize PosTerminal props (400 catalog items)
 → Client hydrate; focus/visibility may refreshPosStock
```

**Split:** DB CPU nhỏ · **RTT×N + serialize** lớn · render sau data.

### 11.2. Dashboard

```text
pos_get_dashboard
 + parallel: pos_sales 7d+items, low stock, recent invoices, buys 7d, buys yesterday
 → map KPIs/series
```

### 11.3. Kho

```text
listStock(includeMarketGold, withPurity) → full pos_skus + pos_list_sku_purity
 + listLedger limit 40 + product types
 → StockTable client filter/page
```

---

## 12. Definition of Done — Phase 1 checklist

- [x] Audit modules in scope (code + sampled timings)
- [x] Architecture data-flow map
- [x] Main API/RPC inventory (Top 20 table)
- [x] Important journeys traced (POS emphasis + dashboard/kho/mua/vàng/HĐ)
- [x] Baseline measurable (dev localhost ↔ prod DB)
- [x] Top 20 API/RPC with limits called out (P95 N/A)
- [x] Top 10 screens/journeys
- [x] Duplicate requests
- [x] N+1 / query plan / RLS / indexes / RPC overhead
- [x] Frontend rendering & state
- [x] Caching & realtime
- [x] Root cause confidence tags
- [x] Optimization backlog + roadmap + risk/rollback
- [x] **No** code/schema/Production mutation in this phase

---

## 13. Stop rule

**Phase 1 dừng tại báo cáo này.**  
Không implement PERF-* cho đến khi user review và chỉ định phạm vi Phase 2.

**Khuyến nghị duyệt Phase 2 đợt 1 (Low/Medium, reversible):** PERF-015 → PERF-001 → PERF-002 → PERF-012 → PERF-004.  
Giữ PERF-003/005 (đổi contract catalog) cho quyết định kiến trúc riêng.
