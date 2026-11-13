# Tiến độ POS big update so với plan ban đầu (Giai đoạn 1–7)

> Cập nhật: 2026-11-12 (UTC+7), thêm Phase 4 vàng kèm đá ([`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md)). Chi tiết Phase 1: [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md).  
> 2026-11-13: audit Phase 4, không đổi code nên **không đổi %**. Hiện trạng và khoảng trống theo flow: mua [`P4-01-BUY-FLOW.md`](./P4-01-BUY-FLOW.md), bán [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md), báo cáo / Excel [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md). Yêu cầu mới chưa tính vào %: chiết khấu khi bán (P4-02 §9), cột thành phần trong file xuất (P4-03).  
> % = ước lượng theo số hạng mục con đã xong (đã code + kiểm chứng), không phải theo giờ công.

## 1. Tổng

| | % |
|---|---|
| **Plan ban đầu (7 giai đoạn, 36 hạng mục con)** | **≈ 40% xong · 60% còn lại** |
| Phase 1 "ít phụ thuộc" (7 section) | ≈ 65% xong (S1 95 · S2 85 · S3 0 · S4 90 · S5 0 · S6 90 · S7 Kho 100). Riêng các section làm trên nhánh này: ≈ 90% |
| Phase 4 vàng kèm đá (mua / tem / bán) | ≈ 85% xong: code + hard-test thật xong; còn giá bán MG (admin), đơn tạm / đặt cọc, cột xuất Excel |

## 2. Theo giai đoạn

| GĐ | Nội dung | Xong | Còn | Đã làm | Còn thiếu | Module chính | Nhánh |
|----|----------|------|-----|--------|-----------|--------------|-------|
| 1 | Rà soát & chuẩn hóa DB | 85% | 15% | Rà schema / giá / mua bán tồn / FK, backup code + DB, sổ yêu cầu | Export 4 migration chỉ có trên DB về repo; chốt mapping hàm lượng master | (DB, docs) | `main` (export migration) |
| 2 | Chuẩn hóa dữ liệu gốc | 10% | 90% | Cột tuổi vàng 3 số lẻ (`products.gold_age`), quy tắc phân nhóm hàm lượng (vàng thị trường) | Danh mục cây, thương hiệu, loại vàng, bảng hàm lượng + hệ số, tách cấu hình Vàng/Bạc, trọng lượng 3 số lẻ | `category`, admin website, DB | `Finn/New/POS-Future` + `main` (admin website) |
| 3 | Quản lý giá & liên kết giá | 15% | 85% | Rà cơ chế cập nhật giá; giá hiển thị card vàng thị trường theo dòng giá | Tách khu Vàng/Bạc, liên kết giá theo hàm lượng, % so với giá gốc, ẩn dòng giá trên website | `pricing`, `js/gold-data.js`, `pos` | `main` (website) + `Finn/New/POS-Future` |
| 4 | Quản lý sản phẩm | 10% | 90% | Tuổi vàng lưu được khi nhập Order | UI danh mục cây, dropdown loại vàng, số chỉ / số lượng, phân trang, cấu hình bán theo giá SP / hệ số | `product` (POS đang placeholder), admin website | `main` (Section 3 hoãn) |
| 5 | Mua vào & nhập kho | 75% | 25% | Vàng thị trường 3 card + chọn nhóm; nhập kho + in tem cùng màn; **P4:** TL vàng / TL đá / giá đá khi mua, dòng đá trên Phiếu mua + Phiếu 02, In tem từ hóa đơn mua | Xuất Excel cột đá; mua trang sức catalog có đá | `purchase`, `form02`, `label-print` | `Finn/New/POS-Future` |
| 6 | Bán ra | 50% | 50% | **P4:** giá = vàng (bảng giá lúc bán) + đá (sửa được) + công (± , ≥ 0), snapshot từng thành phần, Giấy đảm bảo in Vàng / Đá / Công; MG bán theo dòng giá nhóm; hard-test thật xong | Đơn tạm / đặt cọc giữ đá + công; quét tem; giá theo hệ số | `pos`, `invoice`, `sale-deposit` | `Finn/New/POS-Future` |
| 7 | Báo cáo & phụ trợ | 40% | 60% | Cột hàm lượng ở 8 file xuất + chọn số dòng xuất; tem mới (tên SP, HL, 2 cột, xuất xứ) | Dashboard, báo cáo vàng / bạc, bảng giá trước / sau, lưu nội dung tem vào lịch sử in | `reporting`, `dashboard`, `label-print` | `Finn/New/POS-Future` |

## 3. Nhánh

- **`Finn/New/POS-Future` (đã commit + push 2026-11-12):** code Phase 1 Section 1, 2, 4, 6, 7 và Phase 4 (vàng kèm đá), docs `docs/pos-big-update/**`, rule `.cursor/rules/tlkv-pos-big-update.mdc`, 9 migration P1 / P4, script backup. Tag backup: `backup/pre-pos-big-update-20261110`.
- **DB production** (chung cho cả 2 nhánh): 9 migration đã áp, file repo trùng version: P1 `20261110163201_label_print_receive_order`, `20261110180219_export_purity_helpers`, `20261110181526_export_purity_columns`, `20261110182624_market_gold_classes`, `20261111160717_complete_sale_market_gold_price_row`; P4 `20261111182014_p4_buy_stone`, `20261111182451_p4_sku_sale_components`, `20261111183407_p4_sale_gold_stone_labor`, `20261111184919_p4_label_mint_market_gold` (+ ẩn SKU test `TLKVTS000002`, `TLKVTS000003` qua audit).
- **`main` (chờ chuyển nhánh):** Section 3 Sản phẩm (admin website), Section 5 ẩn dòng giá website, export 4 migration drift về repo.
