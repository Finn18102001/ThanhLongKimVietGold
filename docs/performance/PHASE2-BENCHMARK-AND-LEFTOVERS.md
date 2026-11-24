# Phase 2 — Benchmark & leftovers

**Date:** 2026-11-24  
**Env:** `npm run dev` · localhost:3000 · DB `ap-northeast-2` · account ADMIN hard-test  
**Method:** Full RSC fetch (`RSC:1`, no Prefetch header) — same as Phase 1 baseline

---

## 1. Done checklist

| Item | Status |
|---|---|
| Instrumentation (`withPerfSpan` / `[tlkv-perf]`) | Done — `src/shared/lib/perf-span.ts` |
| Remove confirmed duplicate request | Done — PERF-001 market prices shared Promise |
| Shell/fund gates without wrong ACL | Done — React.cache + parallel layout gates; cash_clerk rules unchanged |
| MSP load without wrong search | Done — PERF-012 parallel full map; piece-first then unit; no invented MSP |
| Dashboard / invoice filter business results | Dashboard: instrument only (same queries). Invoice: same FR-06 match; date-range narrows scan only |
| Indexes only with EXPLAIN proof | Done — payment_method Seq Scan ~135ms → Index Only Scan ~1.8ms |
| Before/after benchmark table | Below |
| No business regression (smoke) | POS RSC still 400 SKU; invoices page loads; tsc/lint clean on touched files |
| Leftovers → Phase 3 | Section 4 |

---

## 2. Changes shipped

| ID | Change | Files |
|---|---|---|
| PERF-015 | Request-scoped spans, log when `TLKV_PERF_LOG=1` or `NODE_ENV=development` | `src/shared/lib/perf-span.ts` + call sites |
| PERF-001 | One `pos_market_gold_class_prices` per POS load | `PosPage.tsx`, `pos/query.ts` |
| PERF-002 | `cache()` on fund flag + cash/gold access/gates; layout gates `Promise.all` | `settings/query.ts`, `fund-cash/*`, `fund-gold/query.ts`, `layout.tsx` |
| PERF-012 | MSP map parallel with catalog (no serial stage) | `pos/query.ts` |
| PERF-007 | Instrument only (RPC fold deferred) | `dashboard/query.ts` |
| PERF-010 | Date-range narrows payment sale_id scan; + indexes | `invoice/query.ts`, migration |
| PERF-011 | `pos_sale_payments_method_sale_idx`, transfer partial index | `20261124120000_perf_sale_payments_method_idx.sql` (applied) |

**Rollback**

- Code: revert commits / files above  
- Index: `drop index if exists public.pos_sale_payments_method_sale_idx;`  
  `drop index if exists public.pos_sale_payments_transfer_account_sale_idx;`

---

## 3. Before / after benchmark

### 3.1 Soft RSC wall-clock (ms)

| Route | Phase 1 pass1 | Phase 1 pass2 | Phase 2 pass1 | Phase 2 pass2 | Δ warm |
|---|---:|---:|---:|---:|---:|
| `/` dashboard | 1456 | 1040 | 1514 | 1001 | ~flat |
| **`/pos`** | **10607** | **9769** | **984** | **1106** | **≈ −9 s (−89%)** |
| `/purchase` | 1479 | 1934 | 996 | 949 | ≈ −0.5–1 s |
| `/inventory` | 1093 | 1016 | 891 | — | small |
| `/invoices` | 924 | 954 | 752 | 725 | small |

Payload size for `/pos` unchanged (~242k chars · ~400 `skuId`) — win is **RTT/waterfall**, not catalog shrink (PERF-003 still Phase 3).

### 3.2 DB: payment_method filter

| | Before | After |
|---|---|---|
| Plan | Seq Scan | Index Only Scan `pos_sale_payments_method_sale_idx` |
| Execution | ~134.8 ms | **~1.8 ms** |

---

## 4. Leftovers → Phase 3 (and beyond)

| ID | Why still open | Suggested Phase |
|---|---|---|
| **PERF-003** | Full catalog still in RSC (~240k) — dominant remaining POS risk as SKU grows | Phase 3 (High Impact) |
| **PERF-004** | `prefetch={false}` still on sidebar | Phase 3 |
| **PERF-005** | Inventory/purchase/label full-list pattern | Phase 3 |
| **PERF-006** | Gold management fat nested select (~388k) | Phase 3 |
| **PERF-007** | Fold dashboard follow-ups into `pos_private.get_dashboard` (needs SQL migration) | Phase 2.5 / 3 |
| **PERF-008** | Double `auth.getUser` (proxy + layout) | Phase 3 |
| **PERF-009** | MSP typeahead debounce on POS/StockTable | Phase 3 |
| **PERF-010** | Without date filter still up to 5000 payment rows; optional RPC join later | Phase 3 |
| **PERF-013** | Broad `revalidatePath` blast | Phase 3/4 |
| **PERF-014** | Export caps / streaming | Phase 3 |
| Production build P95 | All numbers are **dev**; re-measure on `next start` / Vercel | Phase 4 |

---

## 5. Regression notes (manual)

- Cash-clerk shell rules unchanged (flag off → `none`; admin / no staff cash account → `normal`; gold staff → `normal`).
- MSP: piece.msp still wins over unit shared code; empty MSP stays empty.
- Invoice payment filter: still based on real `pos_sale_payments` rows (FR-06); date range only reduces candidates, does not change match predicate.
- Dashboard KPI queries unchanged.

**Stop:** Phase 2 complete for approved Low/Medium set. Do not start PERF-003 until user approves Phase 3 scope.
