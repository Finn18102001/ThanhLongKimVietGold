# Phase 3 — Frontend & data flow (PARKED)

**Status:** Giữ lại scope — **chưa implement** tại thời điểm 2026-11-24.  
**Chỉ bắt đầu sau khi user duyệt phạm vi riêng.**

Nguồn: `PHASE1-FULL-PERFORMANCE-AUDIT.md` §10 + `PHASE2-BENCHMARK-AND-LEFTOVERS.md` §4.

## Mục tiêu

Giảm payload / fetch khi đổi tab, tối ưu list lớn và search UX. Không đổi giá LINK/HESO, tồn, thanh toán, công nợ, RLS.

## Backlog (chưa làm)

| ID | Việc | Impact |
|---|---|---|
| PERF-003 | Redesign catalog POS (không nhét full SKU vào RSC) | High |
| PERF-004 | Prefetch sidebar | Low–Med |
| PERF-005 | Inventory / purchase / label full-list → paginate | High |
| PERF-006 | Gold management slim / page | Med |
| PERF-007 | Fold dashboard follow-ups vào RPC (migration) | Med |
| PERF-008 | Bớt double `auth.getUser` | Med |
| PERF-009 | Debounce MSP typeahead | Low |
| PERF-010 | Invoice filter không date → RPC/join | Med |
| PERF-013 | Thu hẹp `revalidatePath` | Low |
| PERF-014 | Export CSV cap / stream | Med |

## Thứ tự đề xuất khi mở lại

1. PERF-009 → PERF-004 → PERF-006  
2. PERF-007 / 008 / 010  
3. PERF-003 + PERF-005 (High Impact — cần contract/SRS + regression)

## Không thuộc Phase 3

Realtime, cache invalidation cứng, P95 production build → Phase 4.
