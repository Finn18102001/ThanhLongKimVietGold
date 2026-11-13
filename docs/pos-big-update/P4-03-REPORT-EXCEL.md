# Phase 4 · Báo cáo và Excel: đối chiếu với file tham chiếu

> Audit: 2026-11-13, chỉ đọc. Nguồn: file tham chiếu `DS_Hoa_don_2026-11-12_11-50.xlsx`, code nhánh `Finn/New/POS-Future` (commit `9b65fa5`), function và dữ liệu trên DB production.
> Vai trò: xác định cột nào của file tham chiếu TLKV đã hỗ trợ, cột nào còn thiếu, cách tính và cách xuất hiện tại. **Không đổi cột báo cáo nào** trong đợt này.
> Liên quan: flow mua [`P4-01-BUY-FLOW.md`](./P4-01-BUY-FLOW.md) · flow bán [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md) · cột hàm lượng [`P1-04-EXPORT-PURITY.md`](./P1-04-EXPORT-PURITY.md).

File tham chiếu không nằm trong repo và có dữ liệu cá nhân của khách (tên, địa chỉ, điện thoại, CCCD, ngày sinh). Tài liệu này chỉ ghi cấu trúc cột, công thức và số đếm; không chép dữ liệu khách.

## 1. File tham chiếu

| Mục | Nội dung |
|---|---|
| Sheet | `DS_Hóa_đơn`: tiêu đề dòng 1–2, nhóm cột dòng 4, tên cột dòng 5, cột con dòng 6, dữ liệu dòng 7–152, tổng dòng 153 |
| Kích thước | 54 cột (A–BB), 146 dòng hàng, 105 hóa đơn, tối đa 4 dòng / hóa đơn |
| Mức dòng | 1 dòng = 1 dòng hàng. Thông tin hóa đơn và khách lặp lại trên từng dòng |
| Nguồn | Hệ thống bán hàng khác, không phải TLKV: tiền tố số hóa đơn, kênh bán, quầy, cửa hàng đều không thuộc TLKV. Dùng làm tham chiếu **cấu trúc và nghiệp vụ**, không phải dữ liệu để nhập |
| Bản file | Tìm thấy 2 bản cùng tên: bản ở Desktop (50.157 byte, bản xuất gốc) và bản ở Downloads (57.221 byte, đã lưu lại). Cùng tiêu đề cột, cùng 146 dòng; các cột đã đối chiếu cho kết quả giống nhau |

## 2. Quy tắc đọc được từ file tham chiếu

Suy ra từ số liệu, kiểm trên toàn bộ 146 dòng. Đây là hành vi của hệ thống xuất ra file, chưa phải quy tắc của TLKV.

| # | Quy tắc | Mức khớp |
|---|---|---|
| R1 | Tổng trọng lượng = Trọng lượng vàng + Trọng lượng đá | 146 / 146 |
| R2 | Thành tiền sau CK = Thành tiền trước CK − Giá trị CK | 146 / 146 |
| R3 | Giảm giá hóa đơn = tổng Giá trị CK các dòng của hóa đơn, lặp lại trên từng dòng (không phải khoản giảm thêm) | 105 / 105 hóa đơn |
| R4 | Thành tiền trước CK theo 3 kiểu: (A) TL vàng × Đơn giá SP + Tiền đá bán + Tiền công bán · (B) **Tổng** TL × Đơn giá SP, tiền đá = 0, tiền công = 0 · (C) = Đơn giá SP (giá theo chiếc) | A: 97 dòng (59 không có TL đá, 38 có TL đá) · B: 23 dòng (1 dòng lệch không quá 1 đồng) · C: 6 dòng · 19 dòng giá 0 · 1 dòng không khớp kiểu nào |
| R5 | Giá trị CK = % trên tiền công + % trên tiền đá + % trên toàn bộ sản phẩm, theo nhãn ở cột Tỷ lệ giảm giá | 29 / 57 dòng có CK. 28 dòng còn lại để trống nhãn, CK bằng 3–8% thành tiền trước CK |
| R6 | Số tiền theo hình thức thanh toán chỉ ghi ở dòng đầu của hóa đơn | 33 / 33 hóa đơn nhiều dòng |
| R7 | File gồm cả hóa đơn đã hủy, phân biệt bằng cột Trạng thái | 91 đã trả vàng · 12 hủy chờ thanh toán · 2 hủy đã thanh toán |

Ghi nhận thêm:

- Cột "Đơn giá SP (giá vàng 1 chỉ)" mang 3 nghĩa tùy dòng (theo R4): giá vàng / chỉ, giá / chỉ tính trên tổng trọng lượng gồm cả đá, hoặc giá cả chiếc.
- 67 dòng có TL đá, chỉ 11 dòng có tiền đá > 0. Không dòng nào có tiền đá mà TL đá = 0. Tiền công > 0 ở 78 dòng.
- Cả 125 dòng có TL vàng đều có số lượng 1 và có Serial (quản lý theo từng chiếc). 19 dòng không có Serial chính là 19 dòng giá 0; 3 dòng có số lượng > 1 đều nằm trong nhóm này.
- 2 dòng đơn vị "Viên" không có TL vàng, chỉ có TL đá, có Serial, bán theo giá chiếc (kiểu C): trong file tham chiếu, **đá rời được bán như một sản phẩm riêng**.
- Đơn vị tính: Chiếc, Đôi, Viên. Trọng lượng tối đa 3 chữ số thập phân. Hàm lượng ghi dạng phần trăm (99.99, 99.9, 75, 58.5, 41.7, 92.5, 0). Thời gian ghi dạng chữ `HH:mm dd/MM/yyyy`.
- Tiền có phần thập phân ở một số dòng (Thành tiền trước CK 22 dòng, sau CK 26 dòng, Giá trị CK 7 dòng, Đơn giá SP 6 dòng, Tiền đá 1 dòng).

## 3. File xuất hiện có của TLKV

Mọi nút "Xuất Excel" của TLKV tạo file **CSV** (UTF-8 có BOM), không phải `.xlsx`. Không file nào có cột TL đá, tiền đá, tiền công, tiền vàng hay chiết khấu. Không RPC xuất nào đọc các cột đá / công.

| File | Màn | RPC / nguồn | Mức dòng | Phạm vi |
|---|---|---|---|---|
| `tlkv-giao-dich-<từ>-<đến>.csv` | Báo cáo (admin) | `pos_export_transactions` | dòng hàng | Bán + Mua, chỉ giao dịch `COMPLETED` |
| `chung-tu.csv` | Hóa đơn | `pos_export_documents` | dòng hàng | Bán + Mua + Phiếu nhập, bỏ chứng từ đã hủy |
| `phieu-02.csv` | Phiếu 02 | `pos_export_form02` → `pos_list_form02` | dòng mua | Phiếu mua có số Phiếu 02 |
| `hoat-dong-<mã KH>.csv` | Khách hàng | select `pos_sale_items` / `pos_buy_items` | dòng hàng | Theo khách |
| `quan-ly-vang-*.csv` | Quản lý vàng | select | dòng hàng | Chỉ số lượng và số chỉ, không có tiền |
| `ton-kho.csv`, `lich-su-bien-dong-kho.csv`, `kiem-ke-*.csv`, `khach-hang.csv`, `dong-tien-*.csv`, `don-phai-thu-chi-*.csv` | Kho, Khách hàng, Dòng tiền | | | Không có dòng hàng bán / mua theo thành phần |

Cột hiện có (giữ nguyên, ghi để đối chiếu):

- `tlkv-giao-dich-*.csv` (26 cột): Loại, Mã phiếu, Số hóa đơn, Khách hàng, SĐT, CCCD khách hàng, Mã hàng, Thương hiệu, Tên sản phẩm, Hàm lượng, Đơn giá, SL bán, Số chỉ, Tổng tiền, Đã thanh toán, Còn lại, Trạng thái thanh toán, Hình thức thanh toán, Hạn thanh toán, Người bán, Hoàn tất lúc, Ghi chú, Trạng thái trả vàng, Ngày hẹn trả vàng, Thời gian trả vàng, Ngày trả vàng.
- `chung-tu.csv` (23 cột): Loại, Số chứng từ, Đối tác, SĐT, Tên sản phẩm, Thương hiệu, Hàm lượng, Đơn giá, Số lượng, Số chỉ, Tổng, Đã trả, Còn lại, Trạng thái TT, Hình thức, Thời gian, Trạng thái trả vàng, Ngày hẹn trả vàng, Ngày xuất vàng, Thu lần 1 (đặt cọc), Thu lần 2 (còn lại), Tham chiếu, Ghi chú.
- `phieu-02.csv` (14 cột): STT, Ngày tháng năm mua hàng, Tên người bán, Địa chỉ, Số căn cước, Số điện thoại, Tên hàng hóa/dịch vụ, Hàm lượng, Số lượng/Trọng lượng, Đơn giá, Tổng giá thanh toán, Số hóa đơn, Mã giao dịch, Nhân viên mua.

Cách tính hiện tại của các cột tiền và trọng lượng (đọc từ SQL):

| Cột | `tlkv-giao-dich-*.csv` | `chung-tu.csv` |
|---|---|---|
| Đơn giá, dòng bán | `làm tròn(unit_price_dong ÷ weight_chi)`: đơn giá chiếc (vàng + đá + công) chia cho TL vàng | `unit_price_dong`: giá 1 chiếc (vàng + đá + công) |
| Đơn giá, dòng mua | `unit_price_dong`: giá vàng / chỉ | `unit_price_dong`: giá vàng / chỉ |
| Số chỉ | số lượng × TL vàng | TL vàng 1 chiếc (không nhân số lượng) |
| Tổng tiền / Tổng | Thành tiền **dòng** (`total_price_dong`) | Tổng **chứng từ**, lặp lại trên từng dòng |
| Đã thanh toán, Còn lại | Số cấp chứng từ, lặp lại trên từng dòng | Số cấp chứng từ, lặp lại trên từng dòng |
| Khoản thu thêm | Không xuất | Nằm trong Tổng chứng từ, không có dòng riêng |

Hệ quả cần biết khi dùng các file này (không sửa trong đợt này):

1. **Đơn giá dòng bán ở file giao dịch sẽ gộp tiền đá và tiền công vào giá / chỉ** ngay khi có giao dịch thật có đá hoặc công. Điều này trái nguyên tắc S2 của P4-02. Hiện chưa lệch vì chưa có giao dịch thật nào có đá / công (P4-02 §2).
2. Dòng mua có đá: Tổng tiền gồm tiền đá, nhưng Đơn giá và Số chỉ chỉ là vàng, nên Đơn giá × Số chỉ ≠ Tổng tiền và không thấy tiền đá ở đâu. `phieu-02.csv` cũng vậy, trong khi bản in Phiếu 02 tách dòng đá riêng.
3. File giao dịch không có khoản thu thêm: cộng cột Tổng tiền sẽ thấp hơn doanh thu. 744 hóa đơn hoàn tất có khoản thu thêm; ở cả 744, Σ thành tiền dòng + Σ khoản thu thêm = tổng hóa đơn.
4. `chung-tu.csv`: cộng cột Tổng sẽ đếm lặp với chứng từ nhiều dòng (426 hóa đơn bán hoàn tất có hơn 1 dòng).
5. Cột Số chỉ khác nghĩa giữa hai file (có nhân số lượng / không nhân).
6. Trọng lượng đá không nằm trong cột trọng lượng nào.
7. File giao dịch lọc ngày theo `completed_at::date`; `chung-tu.csv` lọc theo giờ Việt Nam (`Asia/Ho_Chi_Minh`). Hai file có thể lệch nhau với giao dịch quanh nửa đêm.

## 4. Đối chiếu 5 cột trọng tâm

| Cột tham chiếu | Nguồn TLKV (dòng bán) | Cách tính | Trạng thái |
|---|---|---|---|
| Trọng lượng đá | `pos_sale_items.stone_weight_chi` | × số lượng | Có dữ liệu, **chưa xuất** |
| Tiền đá bán | `pos_sale_items.stone_price_dong` | × số lượng | Có dữ liệu, **chưa xuất** |
| Tiền công bán | `pos_sale_items.labor_final_dong` | × số lượng | Có dữ liệu, **chưa xuất** |
| Thành tiền trước CK | `pos_sale_items.total_price_dong` | (vàng + đá + công) × số lượng | Đã xuất dưới tên "Tổng tiền", chỉ ở file giao dịch. Bằng trước CK vì TLKV chưa có CK |
| Thành tiền sau CK | Không có | | **Không có dữ liệu**: TLKV chưa có chiết khấu (P4-02 §9). Hiện sau CK = trước CK |

Dòng trước P4 (`gold_amount_dong` null): đá = 0, công = 0, toàn bộ thành tiền là vàng.
Dòng mua: TL đá và tiền đá có dữ liệu (`pos_buy_items.stone_weight_chi`, `stone_price_dong`), chưa xuất. Không có tiền công (P4-01 B4).

## 5. Đối chiếu đủ 54 cột

Trạng thái: **Đã xuất** = TLKV đã có cột tương ứng trong ít nhất một file · **Chưa xuất** = có dữ liệu, chưa đưa ra file · **Tính được** = suy ra từ dữ liệu đã lưu · **Không có** = TLKV không có dữ liệu, cần nghiệp vụ mới · **Khác nghĩa** = gần tên nhưng nội dung khác, cần xác nhận.

| Cột | Tên cột tham chiếu | Nguồn TLKV | Trạng thái |
|---|---|---|---|
| A | Số hóa đơn | `pos_invoices.invoice_no` | Đã xuất |
| B | Thời gian | `pos_invoices.issued_at` / `pos_sales.completed_at` | Đã xuất (định dạng khác) |
| C | NV bán hàng | Nhân viên thao tác, không có thì email tài khoản | Đã xuất ở file giao dịch; `chung-tu.csv` không có |
| D | Kênh bán | | Không có |
| E | Mã khách hàng | `pos_customers.customer_no` | Chưa xuất ở 2 file hóa đơn (có ở `hoat-dong-*.csv`) |
| F | Tên khách hàng | `pos_customers.name` | Đã xuất |
| G | Địa chỉ | `pos_customers.address` | Chưa xuất ở file bán |
| H, I | Địa chỉ 1, Địa chỉ 2 | | Không có (TLKV có 1 trường địa chỉ) |
| J | Điện thoại | `pos_customers.phone` | Đã xuất |
| K | Mã số thuế | `pos_customers.tax_code` | Chưa xuất |
| L | Loại giấy tờ | | Không có (TLKV chỉ lưu CCCD) |
| M | Căn cước công dân | `pos_customers.citizen_id` | Đã xuất ở file giao dịch |
| N | Hạng thẻ | | Không có. TLKV có `customer_group`, chưa rõ có tương ứng không |
| O | Giới tính | `pos_customers.gender` | Chưa xuất |
| P | Ngày sinh | `pos_customers.date_of_birth` | Chưa xuất |
| Q | Mã hàng hóa | `pos_sale_items.sku_snapshot` | Đã xuất ở file giao dịch |
| R | Tên hàng hóa | `product_name_snapshot` | Đã xuất |
| S | Serial | | Không có ở dòng bán. TLKV bán theo SKU và số lượng; MSP trên tem không gắn vào giao dịch bán |
| T | Đơn vị tính | | Không có |
| U | Số lượng | `quantity` | Đã xuất |
| V | Hàm lượng vàng | Dòng giá lúc bán, không có thì hàm lượng SKU | Đã xuất, **khác định dạng**: TLKV là chữ như đã ghi (`999,9`, `99.99`, `10K`…), tham chiếu là số phần trăm |
| W | Tổng trọng lượng | (`weight_chi` + `stone_weight_chi`) × số lượng | Tính được, chưa xuất |
| X | Trọng lượng vàng | `weight_chi` × số lượng | Đã xuất dưới tên "Số chỉ" (xem §3 mục 5) |
| Y | Trọng lượng đá | `stone_weight_chi` × số lượng | Chưa xuất |
| Z | Tiền đá bán | `stone_price_dong` × số lượng | Chưa xuất |
| AA | Tiền công bán | `labor_final_dong` × số lượng | Chưa xuất |
| AB | Thành tiền trước CK | `total_price_dong` | Đã xuất ("Tổng tiền", file giao dịch) |
| AC | Thành tiền sau CK | | Không có (chưa có CK) |
| AD | Giá trị CK | | Không có |
| AE | Tỷ lệ giảm giá | | Không có |
| AF | CTKM áp dụng | | Không có |
| AG | Ghi chú hàng hóa | | Không có (TLKV chỉ có ghi chú cấp hóa đơn) |
| AH | Giảm giá hóa đơn | | Không có |
| AI | Ghi chú hóa đơn | `pos_sales.note` | Đã xuất |
| AJ | Tiền mặt | `pos_sale_payments` theo hình thức `CASH` | Chưa xuất dạng cột riêng (hiện xuất Hình thức + Thu lần 1 / lần 2) |
| AK | Chuyển khoản | `pos_sale_payments` theo hình thức `TRANSFER` | Chưa xuất dạng cột riêng |
| AL | Thẻ | Giá trị `CARD` có trong dữ liệu cũ | Chưa xuất dạng cột riêng; màn bán hiện chỉ có tiền mặt và chuyển khoản |
| AM, AN, AO | Urbox, Voucher, Voucher (thanh toán) | | Không có |
| AP | Số tài khoản | | Chưa rõ nghĩa ở file tham chiếu. Lần thu bán của TLKV không gắn tài khoản |
| AQ | Số HDĐT | | Không có |
| AR | Trạng thái | Trạng thái thanh toán + trạng thái trả vàng | Khác nghĩa: bộ giá trị khác, và TLKV **loại** hóa đơn đã hủy khỏi file xuất |
| AS, AT | Quầy hàng, Cửa hàng | | Không có |
| AU | Ngày hóa đơn | `issued_at` | Đã xuất (cùng nguồn với cột B) |
| AV | Ngày trả vàng | Thời điểm xuất kho của giao dịch | Đã xuất |
| AW | Mã giá | `pos_sale_items.price_row_id` | Chưa xuất |
| AX | Đơn giá SP (giá vàng 1 chỉ) | Tính được: `gold_amount_dong ÷ weight_chi` | Khác nghĩa: cột "Đơn giá" hiện tại của TLKV gộp đá + công (§3); cột tham chiếu mang 3 nghĩa (§2) |
| AY–BB | Bảo hành: Mã phiếu, Ngày tạo, Tổng tiền, Dịch vụ | | Không có |

Tổng hợp: 3 cột thành phần (Y, Z, AA) và cột W, AW, AX có dữ liệu hoặc tính được nhưng chưa xuất; nhóm chiết khấu (AC–AF, AH), bảo hành, kênh / quầy / cửa hàng, serial, đơn vị tính, voucher, hóa đơn điện tử không có dữ liệu.

TLKV có mà file tham chiếu không có: điều chỉnh giá ±300.000 đ/chỉ, khoản thu thêm, tiền công gốc và mức điều chỉnh, giá đá mặc định, hạn thanh toán, số còn lại, ngày hẹn trả vàng, thương hiệu.

## 6. Khác biệt cần xác nhận

Ghi để xác nhận, không tự suy diễn.

| # | Khác biệt | TLKV hiện tại | File tham chiếu |
|---|---|---|---|
| D1 | Bản file dùng làm chuẩn | | 2 bản cùng tên, khác kích thước (§1) |
| D2 | Cách tính thành tiền | Một kiểu: (vàng theo TL vàng + tiền đá + tiền công) × số lượng | 3 kiểu (R4). Kiểu B tính giá trên tổng trọng lượng gồm đá; kiểu C bán theo giá chiếc |
| D3 | Ý nghĩa "Đơn giá SP (giá vàng 1 chỉ)" | Giá vàng / chỉ lúc bán | 3 nghĩa theo dòng |
| D4 | Chiết khấu | Không có | Theo dòng, theo % trên công / đá / toàn sản phẩm, gắn CTKM; 28 dòng không ghi nhãn tỷ lệ |
| D5 | Quản lý theo chiếc | Theo SKU và số lượng, dòng có thể > 1 chiếc; thành phần tính theo chiếc × số lượng | Theo Serial, dòng vàng luôn 1 chiếc |
| D6 | Tiền | Số nguyên VND | Có phần thập phân |
| D7 | Hàm lượng | Chữ, nhiều cách viết | Số phần trăm |
| D8 | Đơn vị tính | Không có | Chiếc, Đôi, Viên |
| D9 | Hóa đơn đã hủy | Không xuất | Có xuất, kèm trạng thái |
| D10 | Khoản thu thêm | Có, cấp hóa đơn, không nằm trong thành tiền dòng | Không có cột tương ứng |
| D11 | Điều chỉnh ±300.000 đ/chỉ | Nằm trong giá vàng giao dịch | Không có |
| D12 | Hình thức thanh toán | Tiền mặt, chuyển khoản (thẻ chỉ ở dữ liệu cũ) | 6 cột, gồm thẻ, Urbox, voucher |
| D13 | Tiền đá khi có TL đá | Nhập tay theo chiếc, cho phép TL đá > 0 mà tiền = 0 | 56 / 67 dòng có TL đá nhưng tiền đá = 0 |
| D14 | Định dạng file | CSV | `.xlsx` có dòng tiêu đề, nhóm cột, dòng tổng |
| D15 | Phạm vi | File hiện có trộn Bán và Mua (và Phiếu nhập) | Chỉ hóa đơn bán |
| D16 | Đá rời | Đá chỉ là thành phần của sản phẩm vàng, không có SKU hay tồn kho riêng, chưa mua bán đá lẻ (P4-00 §1 mục 3, 7) | 2 dòng bán đá rời theo viên, có Serial riêng |

Câu hỏi đi kèm:

1. Mục tiêu là **thêm cột thành phần vào file hiện có**, hay **tạo file mới** theo bố cục file tham chiếu, hay cả hai?
2. Các cột TLKV không có dữ liệu (§5): bỏ, để trống, hay là yêu cầu nghiệp vụ mới sẽ làm sau?
3. Ai đang dùng `tlkv-giao-dich-*.csv` và `chung-tu.csv`, có công thức hay công cụ nào đọc theo vị trí cột không?
4. File cần cho flow mua có theo bố cục riêng không? File tham chiếu chỉ có hóa đơn bán.

## 7. Tác động tương thích nếu thêm cột

Chỉ là phân tích. Chưa thay đổi gì.

| Thay đổi | Tác động | Mức |
|---|---|---|
| RPC trả thêm khóa JSON (ví dụ `stoneWeightChi`, `stonePriceDong`, `laborFinalDong`, `goldAmountDong`) | Code đọc hiện tại bỏ qua khóa lạ. Chữ ký function không đổi nên GRANT giữ nguyên | Thấp |
| Thêm cột vào **cuối** file CSV hiện có | Người đọc theo tên cột hoặc theo vị trí cũ không bị ảnh hưởng | Thấp |
| Chèn cột vào **giữa** hoặc đổi tên cột | Vỡ mọi công thức / công cụ đọc theo vị trí hoặc tên | Cao |
| Đổi nghĩa cột "Đơn giá" dòng bán thành giá vàng / chỉ thuần | Số liệu cùng cột khác trước và sau thời điểm đổi với dòng có đá / công. Hiện chưa có dòng thật nào như vậy nên đổi lúc này không làm lệch số cũ | Vừa, cần chốt |
| Đổi "Số chỉ" cho thống nhất giữa 2 file | Đổi số ở `chung-tu.csv` với dòng nhiều chiếc | Vừa, cần chốt |
| Thêm dòng khoản thu thêm vào file giao dịch | Đổi số dòng và tổng cột | Vừa, cần chốt |
| Xuất hóa đơn đã hủy | Đổi phạm vi file, phải có cột trạng thái để lọc | Vừa, cần chốt |
| File `.xlsx` thật | Cần thư viện mới (hiện không có) | Cần duyệt dependency |

Quy trình bắt buộc khi sửa RPC xuất: snapshot function vào `tlkv_backup_20261110` theo [`00-BACKUP-ROLLBACK.md`](./00-BACKUP-ROLLBACK.md) §3; migration có file trong repo; nếu đổi chữ ký function phải cấp lại GRANT; không sửa dữ liệu giao dịch.

## 8. Việc còn lại

Chưa triển khai. Không ghi nhận là xong.

1. Chốt các điểm D1–D16 và 4 câu hỏi ở §6.
2. Sau khi chốt: thiết kế cột xuất cho bán (TL đá, tiền đá, tiền công, tiền vàng, giá vàng / chỉ) và cho mua (TL đá, tiền đá, tiền vàng).
3. Nhóm chiết khấu chỉ làm được sau khi có nghiệp vụ chiết khấu (P4-02 §9).

## 9. Lịch sử thay đổi

- 2026-11-13: tạo file từ kết quả đối chiếu file tham chiếu với code + DB. Chưa đổi cột xuất nào.
