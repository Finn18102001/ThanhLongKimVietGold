# Phase 3 — Frontend & data flow

**Cập nhật:** 2026-11-26  
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
| 4 | PERF-003 / PERF-005 | High Impact → **cần duyệt riêng** | Parked (xem Round sau) |

## Round 2026-11-26 — shell-first (đã ship, ít rủi ro giá)

**Mục tiêu:** giảm thời gian *hiện UI* khi mở tab Bán hàng / Mua vào — không đổi search debounce, add giỏ, công thức giá, complete bán/mua.

| Việc | Status |
|---|---|
| RSC `/pos` + `/purchase` không `await` full catalog | Done — shell (brands/types/board/held/fund) trước |
| Client `loadPosCatalogAction` / `loadPurchaseCatalogAction` = cùng mapper cũ | Done |
| Skeleton lưới SP + cache client TTL 3 phút khi soft-nav quay lại | Done |
| Cắt số SKU lần mở tab (page/search + slim columns) | **Chưa** — Round sau |

Files: `PosPage` / `PosTerminal` / `pos/actions` / `pos/catalog-client-cache`; `PurchasePage` / `PurchaseWorkspace` / `PurchaseCatalogPanel` / `purchase/actions` / `purchase/catalog-client-cache`.

## Round sau (PERF-003 / PERF-005 — cần duyệt trước khi code)

> Giá sai = tối kỵ. Chỉ làm khi đã chốt hydrate path; không cắt catalog nửa vời.

1. **BE:** lần mở tab không trả ~400 (POS) / ~250 (purchase) SKU — page đầu / segment vừa đủ card; slim field cho card; **cùng** nguồn giá/tồn hiện tại (`listPosCatalog` mapper / RPC tương đương).
2. **Hydrate bắt buộc** khi MSP search (debounce 300ms giữ nguyên) hoặc barcode trả `skuId` chưa có trong client catalog — `list by sku_ids` cùng mapper; không để `catalog.find` miss.
3. **FE:** giữ shell + skeleton + cache; search/add/confirm không đổi hợp đồng nghiệp vụ.
4. **Không** đổi `complete_sale` / `complete_buy` / HESO-LINK / P9 bạc / P9.4 vàng manual.
5. Hard-test: mở tab → card sớm; search MSP + quét tem SP ngoài page đầu; add + F9 một đơn; regression giá board/HESO/manual/MG.
6. Feature flag / rollback nếu miss SKU hoặc lệch `unitPriceDong`.

## Backlog còn lại

| ID | Việc | Impact |
|---|---|---|
| PERF-006 | Gold management slim / page | Med |
| PERF-007 | Fold dashboard follow-ups into `pos_private.get_dashboard` | Med |
| PERF-008 | Bớt double `auth.getUser` (sau audit) | Med |
| PERF-003 | Redesign catalog POS (page + hydrate) — Round sau | High |
| PERF-005 | Inventory / purchase / label full-list → paginate — Round sau (purchase grid) | High |
| PERF-010 | Invoice filter không date → RPC/join | Med |
| PERF-013 | Thu hẹp `revalidatePath` | Low |
| PERF-014 | Export CSV cap / stream | Med |

## Không thuộc Phase 3

Realtime, cache invalidation cứng, P95 production build → Phase 4.
