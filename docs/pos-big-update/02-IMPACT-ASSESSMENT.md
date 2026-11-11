# Đánh giá impact — cây yêu cầu ADMIN (2026-11-10)

> Nguồn hiện trạng: [`01-DB-AUDIT.md`](./01-DB-AUDIT.md) + đọc code nhánh `Finn/New/POS-Future` (`6bcba2f`).  
> Mức: **Thấp** = 1 module, không đổi DB/RPC · **Vừa** = thêm cột/RPC mới kiểu additive, ≤ 2 module · **Cao** = đổi logic giá/kho/mua bán, nhiều module hoặc website.

## 1. Bảng impact

| Nhánh | Hạng mục | Mức | Chạm DB / RPC | Chạm module | Phụ thuộc |
|-------|----------|-----|---------------|-------------|-----------|
| Mua vào › Vàng thị trường | Chỉ giữ 3 mã cố định | **Cao** | `ensure_market_gold_sku`, `create_buy_intake`, `complete_buy`, `void_buy`, `compute_unit_price` (giá bán = `last_cost` theo SKU), 118 SKU `MG-*` cũ (96 còn tồn) | purchase, pos, inventory, gold-management, reporting, cashflow (vốn theo nhóm) | Hàm lượng master; tồn theo chỉ |
| | Nhập tay loại/tuổi vàng, 3 số thập phân | Thấp–Vừa | `pos_buy_items.gold_age` đang là text → chỉ validate | purchase | Đơn vị ‰ hay % (xem §3) |
| | Hàm lượng trong Excel/HĐ/Báo cáo/Kho | **Vừa** | `pos_export_documents`, `pos_export_transactions`, `pos_export_ledger`, `pos_get_reporting`; dòng bán **không có** snapshot hàm lượng | reporting, invoice, inventory, gold-management, form02 | Nguồn hàm lượng cho dòng bán |
| Mua vào › Trang sức | Mua nguyên / nấu hỏng | Vừa–Cao | luồng nấu `workflow_status`, `skip_melt` đã có; cần cờ loại mua | purchase, form02 | — |
| | Hàm lượng, TL vàng/đá, giá đá | Vừa | thêm cột `pos_buy_items` | purchase (+ phiếu in) | — |
| Mua vào › In tem kiêm nhập kho | Section nhập hàng trên "Thông tin in" | **Vừa** | tái dùng `pos_receive_order_purchase` + `pos_mint_label_piece`; có thể thêm RPC gộp | label-print (gọi RPC, không import inventory) | — · **Phase 1** |
| Bán ra | Thông tin vàng/đá/công/ghi chú | Vừa | thêm cột snapshot `pos_sale_items` | pos, invoice, sale-deposit | — |
| | Tính theo giá SP / theo hệ số | **Cao** | `compute_unit_price`, `complete_sale`, `replace_held_order_items`, deposit, void | pos, invoice, sale-deposit, reporting | Hệ số + cấu hình SP |
| Kho hàng | Trạng thái vàng → dropdown, thương hiệu → options | Thấp | — | inventory | — |
| | Danh mục dạng cây | **Cao** | quyết định `categories` vs `pos_categories` | inventory, pos, label-print | Danh mục cây |
| | VTS + hàm lượng | Vừa | thuộc tính hàm lượng trên SKU | inventory | Hàm lượng |
| Sản phẩm | Tuổi vàng, số chỉ, số lượng | **Vừa** | thêm cột (VD `gold_age`) vào `products`/`pos_skus` + trigger sync `tlkv_sync_pos_sku_from_product`; số lượng **chỉ đọc** từ `pos_inventory_stock` | product (POS đang placeholder) hoặc admin website | — · **Phase 1** |
| | 3 số thập phân tuổi vàng | Thấp | kiểu `numeric(_,3)` | product | Đơn vị ‰ / % |
| | Phân trang | Thấp | query `range()` / RPC count | product | — · **Phase 1** |
| Danh mục / Thương hiệu | UI cây, phân nhánh, bắt buộc thương hiệu | **Cao** | `categories` thêm `brand_id`? website đọc `categories` | category, admin website, pos, inventory, purchase | — |
| Giá vàng / bạc | Tách Vàng/Bạc, danh mục riêng | **Cao** | `gold_price_rows.metal` đã có; admin website `js/gold-data.js` upsert/delete từ client | admin website, pricing, pos | — |
| | Liên kết giá theo hàm lượng, % giá gốc | **Cao** | cột liên kết + công thức; `compute_unit_price`; realtime website | pricing, pos, website price engine | Hàm lượng master |
| | Phân loại hàm lượng 999.9…418 | Vừa | bảng master mới + mapping 10 cách viết hiện có | — | — |
| | Ẩn dòng giá trên website | **Thấp** | cột `is_visible_on_website` **đã có** (9/21 dòng đang ẩn) nhưng **chưa code nào đọc** → website vẫn hiện | `js/gold-data.js` | — · **Phase 1 (note, làm trên main)** |
| Tem sản phẩm | Hàm lượng, TL vàng + đá, tên SP, cỡ chữ, Xuất xứ VN | Thấp–Vừa | `pos_label_print_log` thêm cột (hàm lượng, xuất xứ) để in lại đúng; `pos_record_label_print` thêm tham số default | label-print | Nguồn hàm lượng · **Phase 1** |

## 2. Thứ tự gợi ý

1. **Phase 1 (ít phụ thuộc):** tem, in tem kiêm nhập kho, sản phẩm (field + phân trang), cột hàm lượng trong export, note website.
2. Hàm lượng master + danh mục cây + thương hiệu (gốc của hầu hết hạng mục Cao).
3. Giá vàng/bạc + liên kết giá.
4. Mua vào (3 mã cố định, trang sức).
5. Bán ra (giá SP / hệ số).
6. Kho + báo cáo hoàn thiện.

## 3. Điểm cần chốt sớm vì ảnh hưởng nhiều nhánh

1. **Đơn vị hàm lượng.** Danh sách "999.9, 99.9, 980, 750, 610, 585, 418" trộn ‰ (999.9, 980, 750…) và % (99.9). Đề xuất lưu thống nhất **‰** với 3 số thập phân (`numeric(7,3)`: 999.900, 999.000, 980.000, 750.000…).
2. **3 mã vàng thị trường** ghi "999.9, 999.9 và 9 (Vàng tây)" — có lặp 999.9, có thể ý là 999.9 / 99.9 (999) / vàng tây?
3. **Hàm lượng ở Phase 1** lưu ở đâu khi chưa có master: cột số trên `pos_skus` (sau này map sang master) — tránh làm 2 lần.
