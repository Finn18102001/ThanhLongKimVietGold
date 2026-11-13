# Phase 1 · Section 4 — Cột hàm lượng trong file xuất Excel/CSV

> Rà soát: 2026-11-10 (code + DB production, chỉ đọc). Tổng quan: [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md)

## 1. Kết quả rà soát

Không file xuất nào có cột hàm lượng / tuổi vàng. Không RPC xuất nào đọc `purity` / `gold_age`.

| # | File xuất | Màn | Nguồn dữ liệu | Mức dòng | Id có trong dòng |
|---|-----------|-----|---------------|----------|------------------|
| 1 | `chung-tu.csv` | Hóa đơn | RPC `pos_export_documents` | dòng hàng | chỉ id chứng từ (RPC đã join `si`/`bi`/`pi`/`sk`) |
| 2 | `tlkv-giao-dich-*.csv` | Báo cáo | RPC `pos_export_transactions` | dòng hàng | mã SKU (RPC join `si`/`bi`/`sk`) |
| 3 | `ton-kho.csv` | Kho | select `pos_skus` | SKU | `skuId` |
| 4 | `lich-su-bien-dong-kho.csv` | Kho › Lịch sử | RPC `pos_export_ledger` → `pos_list_ledger` | biến động | mã SKU (RPC join `pos_skus`) |
| 5 | `kiem-ke-*.csv` | Kho › Kiểm kê | RPC `pos_get_stock_count` + select `pos_skus` | SKU | `skuId` |
| 6 | `quan-ly-vang-*.csv` | Quản lý vàng | select `pos_purchase_items` / `pos_sale_items` | dòng hàng | id dòng |
| 7 | `phieu-02.csv` | Phiếu 02 | RPC `pos_export_form02` → `pos_list_form02` | dòng mua | `itemId` (= `pos_buy_items.id`) |
| 8 | `hoat-dong-*.csv` | Khách hàng | select `pos_sale_items` / `pos_buy_items` | dòng hàng | không có id dòng |

## 2. Nguồn hàm lượng có sẵn (live)

| Nguồn | Độ phủ |
|-------|--------|
| `pos_buy_items.gold_age` (NV gõ khi mua) | 558 / 588 dòng mua |
| `gold_price_rows.purity` qua `pos_sale_items.price_row_id` (snapshot lúc bán) | 3 695 / 3 695 dòng bán |
| `gold_price_rows.purity` qua `pos_skus.price_row_id` (giá hiện tại) | 98 / 304 SKU |
| `products.gold_age` (mới, Section 1) | 1 / 304 SKU |

Giá trị đang viết không thống nhất: `999,9` · `99.99` · `9999` · `99,9` · `24K` · `10K` · `41.6`…

## 3. Phát hiện phụ (chưa sửa)

- `pos_list_ledger` và `pos_list_form02` giới hạn cứng **200 dòng** → file Lịch sử biến động kho và Phiếu 02 xuất tối đa 200 dòng dù UI xin 5 000–10 000.

## 4. Đã chốt + đã làm (2026-11-11)

- **Nguồn (snapshot):** dòng mua = tuổi vàng NV gõ → dòng giá của dòng mua → SKU; dòng bán = dòng giá lưu lúc bán → SKU; kho / phiếu nhập / biến động / kiểm kê = hàm lượng hiện tại của SKU (tuổi vàng SP → tuổi vàng dòng mua nếu là MG → dòng giá đang gắn).
- **Định dạng:** giữ nguyên như đã ghi (`999,9`, `99.99`, `10K`…).
- **Số dòng xuất:** thay cho cắt cứng 200 → ô chọn "Xuất 20 / 50 / 100 / 200 / 500 / Tất cả (tối đa 5000)" ở Kho › Lịch sử biến động, Báo cáo › giao dịch, Phiếu 02 (Hóa đơn đã có sẵn). Báo cáo: chọn N thì lấy N giao dịch mới nhất theo thời gian hoàn tất; "Tất cả" giữ thứ tự cũ.

| Migration | Nội dung |
|-----------|----------|
| `20261110180219_export_purity_helpers` | `pos_private.price_row_purity`, `pos_private.sku_purity`, RPC `pos_list_sku_purity(uuid[])` (authenticated + service_role) |
| `20261110181526_export_purity_columns` | thêm khóa `purity` vào `pos_export_documents`, `pos_export_transactions`, `pos_list_ledger`, `pos_list_form02`; nới cap 200 → 5000 ở `pos_list_ledger` / `pos_list_form02` (màn danh sách vẫn xin 25–50 dòng). Bản cũ: `scripts/backup/2026-11-11-export-rpcs-before.sql` + `tlkv_backup_20261110._routines` |

Kiểm chứng trên DB (rollback): hóa đơn 55/56 dòng có hàm lượng; giao dịch 30 ngày 2 642/2 652; lịch sử kho 5 000 dòng (trước 200), 4 962 có hàm lượng; Phiếu 02 520 dòng (trước 200), 498 có. Màn danh sách ledger 50 / form02 25 vẫn đúng.

**Cột "Hàm lượng" đã thêm ở 8 file:** `chung-tu.csv`, `tlkv-giao-dich-*.csv`, `ton-kho.csv`, `lich-su-bien-dong-kho.csv`, `kiem-ke-*.csv`, `quan-ly-vang-*.csv`, `phieu-02.csv`, `hoat-dong-*.csv`.

**Còn lại:** sổ biến động kho đã 5 006 dòng → xuất "Tất cả" không lọc sẽ thiếu 6 dòng cũ nhất (dùng bộ lọc ngày); chưa tải thử file thật qua trình duyệt.

**Phase 4 (2026-11-13):** các file trên chưa có cột trọng lượng đá, tiền đá, tiền công. Đối chiếu với file tham chiếu, ý nghĩa hiện tại của cột Đơn giá / Số chỉ / Tổng và tác động tương thích khi thêm cột: [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md).
