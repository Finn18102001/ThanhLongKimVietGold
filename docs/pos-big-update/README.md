# POS Big Update — Sổ yêu cầu theo giai đoạn

Mỗi giai đoạn có **1 file md riêng** ghi yêu cầu chi tiết đã chốt. Trước khi sửa module nào, đọc file của giai đoạn đã chạm module đó (cột "Module" bên dưới) để logic cũ vẫn chạy đúng.

Contract chung: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) · Backup: [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md)

| GĐ | File | Phạm vi | Module chính | Trạng thái |
|----|------|---------|--------------|------------|
| 0 | [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md) | Backup code + DB, cách rollback | — | Xong 2026-11-10 |
| 1 | [`01-DB-AUDIT.md`](./01-DB-AUDIT.md) | Rà soát schema, dữ liệu, FK, mapping | — | Rà soát xong, chờ chốt §4 |
| — | [`03-PROGRESS.md`](./03-PROGRESS.md) | Tiến độ % so với plan 7 giai đoạn, theo module / nhánh | — | Cập nhật 2026-11-11 |
| — | [`02-IMPACT-ASSESSMENT.md`](./02-IMPACT-ASSESSMENT.md) | Impact cây yêu cầu ADMIN (mức Thấp/Vừa/Cao) | — | Xong 2026-11-10 |
| P1 | [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md) (bảng tiến độ %) | Phase 1 ít phụ thuộc: nhập hàng kiêm in tem, tem, sản phẩm, export hàm lượng, note website | `label-print`, `product`, `reporting`, `invoice`, `inventory` | Section 1, 2, 4, 6, 7 xong; Section 3, 5 chờ nhánh `main` |
| P4 | [`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md) | Mua / bán vàng trang sức kèm đá, tiền công, in tem từ hóa đơn mua | `purchase`, `form02`, `label-print`, `pos`, `invoice` | Xong 4.1–4.5 + hard-test thật (đã hủy chứng từ test) |
| 2 | `02-MASTER-DATA.md` | Danh mục cây, thương hiệu, loại vàng, hàm lượng, hệ số, tách vàng/bạc, trọng lượng 3 số | `category`, catalog website | Chưa có |
| 3 | `03-PRICING.md` | Giá vàng/bạc, liên kết theo hàm lượng, % giá gốc, ẩn giá web | `pricing`, `pos` (đọc giá), `js/gold-data.js` | Chưa có |
| 4 | `04-PRODUCT.md` | UI danh mục cây, dropdown loại vàng, hàm lượng, số chỉ, số lượng, phân trang, chế độ giá | `product`, `category` | Chưa có |
| 5 | `05-BUY-RECEIVE.md` | Vàng thị trường 2 mã, mua trang sức, nguyên/nấu hỏng, nhập kho, tem kiêm nhập kho | `purchase`, `inventory`, `label-print`, `form02` | Chưa có |
| 6 | `06-SELL.md` | Quét tem / mã, giá theo hàm lượng, công hoặc hệ số, kiểm tồn | `pos`, `invoice`, `sale-deposit` | Chưa có |
| 7 | `07-REPORTING.md` | Excel, tem, dashboard, báo cáo vàng/bạc, bảng giá trước/sau | `reporting`, `dashboard`, `label-print`, `gold-management` | Chưa có |

## Mẫu cho mỗi file giai đoạn

```markdown
# Giai đoạn N — <tên>

> Chốt: YYYY-MM-DD · Người chốt: ...

## 1. Yêu cầu (nguyên văn đã chốt)
## 2. Business rule (đánh số, mỗi rule kiểm chứng được)
## 3. Module boundary — allowed files / forbidden files
## 4. DB impact — bảng, cột, migration, GRANT (§32.1), rollback
## 5. API / RPC contract — trước / sau
## 6. Logic cũ phải giữ nguyên (regression list)
## 7. Hard-test checklist (DevTools)
## 8. Lịch sử thay đổi
```

## Quy tắc khi update sau này

1. Tìm module sẽ sửa trong bảng trên → đọc mọi file giai đoạn liên quan, mục **§6 Logic cũ phải giữ nguyên**.
2. Thay đổi rule đã chốt → cập nhật file giai đoạn đó (mục §8) **trước** khi code.
3. Không sửa module ngoài phạm vi giai đoạn đang làm (Rule 1, Rule 10).
