# Verification — PERF-009 / PERF-004 / Cashflow parallel

> 2026-11-25 ~23:55 VN · **Không claim ≥98%** cho đến khi có Network regression trong giờ ca + Admin OTP.

## Quyết định PO (giữ)

Giữ 009 / 004 / Cashflow parallel · PERF-008 audit only · Park 006/007/003/005 · Không deploy.

## Gaps tìm thấy khi review (đã sửa)

### A. PERF-009

| Check | Trước review | Sau fix |
|-------|--------------|---------|
| Debounce 300ms + cancel | Có | Giữ trong `useMspSkuIdSearch` |
| Xóa từ khóa / query &lt; 2 | **Gap:** chờ debounce → POS/Purchase `mspSet.has` vẫn loại SKU khỏi rows ~300ms | Clear **ngay** khi live query &lt; 2; filter chỉ exclude MSP khi `q.length >= 2` |
| Request cũ ghi đè | `cancelled` flag | Giữ |
| Unmount cleanup | timer + effect | Giữ |
| Không debounce add cart / giao dịch | Chỉ search hook | Giữ |
| Logic MSP ≥2 ký tự + cùng RPC | Không đổi SoT | Giữ |

Files: `src/modules/label-print/use-msp-sku-search.ts` + POS / Purchase / Stock / Adjust.

### B. PERF-004

| Check | Trạng thái |
|-------|------------|
| `prefetch={false}` mặc định | Có |
| Chỉ light routes hover/focus | `prefetch-routes.ts` — không gồm POS/kho/mua/vàng/dòng tiền/quỹ/tem/reports |
| Prefetch lặp khi rê chuột | **Fix:** `prefetchedRef` once-per-href / shell mount |
| Quyền / nav | Không đổi `canAccessPath` |

Allowlist unit assert (script): light=14, heavy_excluded=9 → OK.

**Network live:** chưa ghi được trong phiên này (STAFF ngoài 07–20 bị chặn ca; Admin cần OTP). Cần retest trong giờ ca: hover «Khách hàng» thấy RSC prefetch; hover «Bán hàng» **không** thấy.

### C. Cashflow parallel

| Check | Trạng thái |
|-------|------------|
| Overview **tuần tự trước**, rồi parallel nhóm sau | Đúng — không phải parallel toàn waterfall |
| Cùng `from`/`to` | Có |
| KPI / filter / công thức | Không đổi |
| Lỗi phụ → số 0 im lặng | **Fix:** `initialLoadWarnings` → banner `error` |
| `React.cache(getCashflowOverview)` | Request-scoped RSC only; no args → không lẫn user/params giữa request |

## Điều kiện Done (PO)

| Kiểm tra | Kết quả phiên này |
|----------|-------------------|
| TypeScript | `tsc --noEmit` OK |
| Lint | Không lỗi mới trên file đụng |
| Build | `npm run build` OK |
| Regression SoT | Không đổi giá/tồn/công thức; chỉ debounce/prefetch/parallel load |
| Network | **Chưa đủ** — chờ hard-test trong ca / Admin OTP |
| Production deploy | **Không** |

## Kết luận

- Code + build đạt tiêu chí kỹ thuật; **chưa chốt ≥98% nghiệp vụ** vì thiếu Network evidence.
- Không mở PERF-006 cho đến khi hard-test 009/004/Cashflow xong trong giờ làm việc.
