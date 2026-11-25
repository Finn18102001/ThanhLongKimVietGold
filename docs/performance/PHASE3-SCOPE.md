# Phase 3 — Frontend & data flow

**Cập nhật:** 2026-11-25  
Nguồn: `PHASE1-FULL-PERFORMANCE-AUDIT.md` §10 + `PHASE2-BENCHMARK-AND-LEFTOVERS.md` §4.

## Mục tiêu

Giảm payload / fetch khi đổi tab, tối ưu list lớn và search UX. Không đổi giá LINK/HESO, tồn, thanh toán, công nợ, RLS.

## Đợt theo PO (2026-11-25)

| Đợt | Mục | Quyết định | Status |
|-----|-----|------------|--------|
| 1 | PERF-009 Debounce MSP | Ít impact → **làm** | Code+build OK; clear-race fixed — xem `PERF-009-004-CASHFLOW-VERIFICATION.md` (**chưa claim ≥98%** thiếu Network trong ca) |
| 1 | PERF-004 Selective prefetch | Ít impact → **làm** | Code+allowlist assert OK; once-per-href — Network hover còn thiếu |
| 2 | Cashflow parallel | Ít impact → **làm** | Parallel **sau** overview; loadWarnings; `cache(overview)` — KPI SoT không đổi |
| 2 | PERF-006 Gold slim/page | Medium impact / rủi ro tổng công nợ → **park** | Chưa làm — cần SRS riêng |
| 3 | PERF-007 Dashboard RPC fold | Migration SQL / Med → **park** | Chưa làm |
| 3 | PERF-008 Auth/session | Audit trước → **audit only** | Done audit: `PERF-008-AUTH-SESSION-AUDIT.md` |
| 4 | PERF-003 / PERF-005 | High Impact → **cần duyệt riêng** | Parked |

## Backlog còn lại

| ID | Việc | Impact |
|---|---|---|
| PERF-006 | Gold management slim / page | Med |
| PERF-007 | Fold dashboard follow-ups into `pos_private.get_dashboard` | Med |
| PERF-008 | Bớt double `auth.getUser` (sau audit) | Med |
| PERF-003 | Redesign catalog POS | High |
| PERF-005 | Inventory / purchase / label full-list → paginate | High |
| PERF-010 | Invoice filter không date → RPC/join | Med |
| PERF-013 | Thu hẹp `revalidatePath` | Low |
| PERF-014 | Export CSV cap / stream | Med |

## Không thuộc Phase 3

Realtime, cache invalidation cứng, P95 production build → Phase 4.
