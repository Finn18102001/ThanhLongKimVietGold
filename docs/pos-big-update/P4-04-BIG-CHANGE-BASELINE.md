# Phase 4 · Big Change: quy tắc đã chốt, điểm lệch với code, chứng từ in

> Chốt: 2026-11-13 · Người chốt: chủ dự án · Tài liệu gốc: "TLKV POS – BIG CHANGE – Consolidated Business Requirements" (gửi trong phiên làm việc 2026-11-13).
> File này ghi **bản tóm lược có đánh số** của bộ quy tắc đã chốt, đối chiếu với code + DB production (chỉ đọc), các câu hỏi, và quyết định triển khai (§5).
> Trạng thái 2026-11-13: QD-1 đến QD-7 đã trả lời; code đã sửa trên working tree; **migration đã áp lên production** (§6); hard-test đạt; DH003544 đã hủy, PN000120 đã đảo, BUY-000446 **chưa hủy**; lỗi hủy đơn Đặt cọc không hoàn kho chờ xử lý (§7).
> Hiện trạng chi tiết: mua [`P4-01-BUY-FLOW.md`](./P4-01-BUY-FLOW.md) · bán [`P4-02-SELL-FLOW.md`](./P4-02-SELL-FLOW.md) · báo cáo [`P4-03-REPORT-EXCEL.md`](./P4-03-REPORT-EXCEL.md) · quyết định cũ C1–C11 [`P4-00-GOLD-STONE.md`](./P4-00-GOLD-STONE.md).
> Khi quy tắc ở đây khác C1–C11 hoặc khác ba file flow, **file này thắng**. Khi code khác quy tắc ở đây: báo điểm lệch, tác động, phương án; không tự chọn cách hiểu khác.

## 1. Quy tắc đã chốt (BC)

### 1.1 Đá

| # | Quy tắc |
|---|---|
| BC-1 | Đá là thành phần đi kèm một sản phẩm vàng. Không phải sản phẩm, SKU, tồn kho, dòng phiếu mua / bán, dòng nhập / xuất kho riêng. Không cộng số lượng đá vào tồn sản phẩm vàng. |
| BC-2 | Mỗi dòng sản phẩm có đá quản lý 4 trường: **trọng lượng đá**, **số lượng đá**, **đơn giá đá**, **thành tiền đá**. |
| BC-3 | **Thành tiền đá = đơn giá đá × số lượng đá.** Trọng lượng đá chỉ để ghi nhận và hiển thị, không tham gia công thức tiền. Không tự quy đổi trọng lượng thành số lượng, không tự suy đơn vị tính. |
| BC-4 | Đổi số lượng đá hoặc đơn giá đá thì tính lại thành tiền đá theo giá trị hiện tại. Chỉ đổi trọng lượng đá thì thành tiền đá không đổi. |

### 1.2 Mua

| # | Quy tắc |
|---|---|
| BC-5 | Tổng tiền mua = tiền vàng + tiền đá (nếu có). **Không có tiền công** ở bất kỳ cấp nào của flow mua. Không đưa tiền đá vào đơn giá vàng hay trọng lượng vàng. |
| BC-6 | Mua vàng thị trường: có ô trọng lượng đá, số lượng đá, đơn giá đá; thành tiền đá tự tính. Không có đá thì để trống. |
| BC-7 | Dòng catalog: giữ khả năng tính đá của server, **không mở thêm ô nhập đá** trên giao diện catalog. |
| BC-8 | Nhập cân sau nấu: chỉ trọng lượng vàng được tính lại. Trọng lượng, số lượng, đơn giá, thành tiền đá không đổi vì nấu. |
| BC-9 | Sau khi nấu, người dùng **vẫn sửa được** trọng lượng đá và số lượng đá; thành tiền đá tính lại theo BC-3. **Đơn giá đá không sửa được sau tiếp nhận** (chủ dự án thu hẹp ở QD-4, 2026-11-13; bản gốc cho sửa cả đơn giá). |
| BC-10 | Nấu chỉ áp cho vàng. Không có nghiệp vụ nấu đá. Không dùng tổng trọng lượng vàng + đá làm trọng lượng nấu. Kết quả nấu không được ghi đè hay làm mất thông tin đá. |
| BC-11 | Phiếu 02 – Mua hàng kiêm nhập kho: sản phẩm có đá là **một dòng**. Không có dòng "Đá" riêng trong danh sách sản phẩm hay danh sách nhập kho. Thông tin đá lưu và thể hiện cùng dòng sản phẩm. |

### 1.3 Bán

| # | Quy tắc |
|---|---|
| BC-12 | Tổng tiền bán = tiền vàng + tiền đá (nếu có) + tiền công (nếu có). Mỗi khoản tính riêng, lưu riêng, hiển thị riêng. |
| BC-13 | Sản phẩm chỉ có vàng: giữ nguyên công thức hiện tại. Sản phẩm có đá: tiền vàng vẫn theo công thức vàng hiện tại, đá và công cộng thêm. |
| BC-14 | Tiền công chỉ có ở chiều bán, là khoản riêng, không nằm trong đơn giá vàng / chỉ. Bằng 0 hoặc không phát sinh thì không cộng. |
| BC-15 | Đơn giá vàng phải là đơn giá vàng. **Không** lấy tổng tiền sản phẩm (đã gồm đá, công) chia cho trọng lượng vàng. |
| BC-16 | Đặt cọc / Đặt trước: giữ nguyên phần lưu thành phần đang chạy. Phần còn làm: chứng từ đặt cọc và đơn tạm. |
| BC-17 | Giấy đảm bảo: giữ giới hạn in hiện tại, không mở rộng. |
| BC-18 | Hóa đơn: giữ cấu trúc cột chính. Thành phần đá / công là **dòng chi tiết bên dưới sản phẩm**, chỉ hiện khi phát sinh. Đá không thành sản phẩm riêng trên hóa đơn. Tổng tiền hóa đơn = tổng thành phần + các khoản thu hợp lệ khác. |

### 1.4 Báo cáo / file xuất

| # | Quy tắc |
|---|---|
| BC-19 | Mọi file xuất liên quan mua, bán, giao dịch được rà và bổ sung cột: trọng lượng vàng, đơn giá vàng, tiền vàng, trọng lượng đá, số lượng đá, đơn giá đá, tiền đá, tiền công, tổng tiền sản phẩm. Tên cột theo chuẩn TLKV. |
| BC-20 | Có dữ liệu thì xuất, không có thì **để trống**. Không tự điền 0 nếu nghiệp vụ phân biệt "không phát sinh" với "bằng 0". Không bỏ cột vì một dòng không dùng. |
| BC-21 | Cột "Đơn giá" là đơn giá vàng (BC-15). Tổng giá trị sản phẩm dùng cột "Tổng tiền" riêng. |
| BC-22 | Khoản thu thêm phải được xuất, bằng cột riêng nếu quản lý độc lập; không gộp vào vàng / đá / công, không cộng trùng. Phải xác minh công thức đối chiếu với hóa đơn trước khi đổi cách tính. |
| BC-23 | **Không triển khai chiết khấu**: không ô nhập, không logic, không cột nghiệp vụ. Phần chiết khấu trong file Excel tham chiếu chỉ để tham khảo. Không suy quy tắc TLKV từ file của hệ thống khác. |

### 1.5 Ràng buộc chung

| # | Quy tắc |
|---|---|
| BC-24 | Một bộ công thức dùng chung cho màn hình, API, hóa đơn, báo cáo: tiền vàng (công thức hiện tại), tiền đá (BC-3), tiền công, tổng dòng mua = vàng + đá, tổng dòng bán = vàng + đá + công. |
| BC-25 | Lưu riêng vàng, đá, công và đủ dữ liệu đầu vào để đối chiếu lại phép tính. |
| BC-26 | Không sửa dữ liệu lịch sử, không tính lại giao dịch cũ khi chưa có kế hoạch migration và đối soát được duyệt. Không đổi DB production khi chưa có kế hoạch migration, backup, verification, rollback được duyệt. |
| BC-27 | Giao dịch chỉ có vàng, giao dịch cũ, SKU, bảng giá, tồn kho, và các flow POS không liên quan tiếp tục chạy như cũ. |
| BC-28 | Ngoài phạm vi: bán đá rời, kho đá, SKU đá, nấu đá, chiết khấu, quy đổi trọng lượng đá thành số lượng, tính tiền đá theo trọng lượng, đổi công thức giá vàng của sản phẩm chỉ có vàng. |

## 2. Điểm lệch giữa code hiện tại và quy tắc đã chốt

Đã kiểm trên code nhánh `Finn/New/POS-Future` (commit `9b65fa5`) và DB production ngày 2026-11-13.

| # | Quy tắc | Code hiện tại | Tác động | Phương án đề xuất (chờ duyệt) |
|---|---|---|---|---|
| L1 | BC-2, BC-3 | **Không có số lượng đá và đơn giá đá** ở bất kỳ bảng nào. Chỉ có `stone_weight_chi` và `stone_price_dong` (tiền đá của **1 chiếc sản phẩm**, nhập tay), trên `pos_buy_items`, `pos_skus`, `pos_sale_items`. Tiền đá dòng = `stone_price_dong × số chiếc`. Đây là C2 cũ. | Lệch cốt lõi. Chạm 3 bảng, 5 function (`create_buy_intake`, `pos_set_buy_melt_weights`, `pos_get_buy`, `complete_sale`, `pos_set_sku_sale_components`), modal mua, form In tem, giỏ bán, 5 chứng từ in, các RPC xuất. | Migration chỉ thêm: cột **số lượng đá** và **đơn giá đá** trên 3 bảng. Giữ `stone_price_dong` với nghĩa "thành tiền đá của 1 chiếc" = đơn giá × số lượng, do server tính, để mọi đẳng thức và chỗ đọc hiện có không đổi. Dữ liệu cũ: chỉ có 1 dòng mua và 1 dòng bán có đá, đều thuộc chứng từ test đã hủy, và 2 SKU test đã ẩn. Xem QD-1. |
| L2 | BC-11 | Phiếu mua hàng kiêm nhập kho và Phiếu 02 (bản in + chi tiết Phiếu 02) đang in **dòng "Đá kèm …" riêng, có STT riêng** (`buyPrintRows.ts`). Đây là yêu cầu cũ ở P4-00 §1 mục 2, đã hard-test. | Quy tắc mới đảo yêu cầu cũ. Danh sách nhập kho và sổ kho thì đã đúng (1 dòng, không có dòng đá). | Bỏ dòng đá có STT; thể hiện đá cùng dòng sản phẩm. Cách trình bày cần chốt: QD-2, QD-3. |
| L3 | BC-9 | Không có chức năng sửa đá sau khi tạo phiếu mua. Đá chỉ nhập lúc tiếp nhận; `pos_set_buy_melt_weights` chỉ nhận KL sau nấu. | Thiếu chức năng. Sửa đá làm đổi tổng phiếu, số dự kiến trả, và thông tin đá trên SKU vàng thị trường. | RPC mới sửa đá của dòng mua (có audit trước / sau, idempotency, `ActionResult`), tính lại tổng phiếu. Cần chốt cho sửa tới bước nào: QD-4. |
| L4 | BC-18 | Giấy đảm bảo in Đá và Tiền công thành dòng riêng ngay dưới dòng vàng của sản phẩm, tên dòng là "Đá" / "Tiền công". **Đính chính 2026-11-13:** phôi không in cột STT (STT chỉ có trong dữ liệu nội bộ), nên hai dòng này vốn đã là dòng chi tiết dưới sản phẩm. Thiếu: số lượng đá và đơn giá đá / viên. | Dòng đá chỉ ghi tiền đá / chiếc. | Dòng đá ghi số viên, đơn giá / viên, thành tiền. Cách đếm giới hạn dòng: QD-6. |
| L5 | BC-17 | Baseline ghi "không in từ dòng sản phẩm thứ 9" và "tối đa 4 sản phẩm chính". Code: phôi có 4 dòng kẻ; in tối đa **8 dòng in** (mỗi dòng vàng, đá, công, khoản thu thêm đều tính là 1 dòng), quá 4 thì thu nhỏ chữ; dòng in thứ 9 trở đi bị bỏ. Không có giới hạn theo số sản phẩm. | Hai cách phát biểu trong baseline khác nhau và đều khác code. Dữ liệu thật: 11 hóa đơn hoàn tất có hơn 4 dòng in, 0 hóa đơn hơn 8, hóa đơn nhiều sản phẩm nhất có 5 dòng hàng. | Cần chốt giới hạn tính theo gì: QD-6. |
| L6 | BC-15, BC-21 | `pos_export_transactions`: Đơn giá dòng bán = `unit_price_dong ÷ weight_chi` (gồm đá + công). `pos_export_documents`: Đơn giá dòng bán = giá 1 chiếc gồm đá + công. | Sai bản chất khi có đá / công. Chưa lệch số vì chưa có giao dịch thật có đá / công. | Đơn giá = `gold_amount_dong ÷ weight_chi` (dòng sau P4); dòng trước P4 giữ cách tính cũ (toàn bộ là vàng nên kết quả như nhau). |
| L7 | BC-19, BC-22 | Không file nào có cột thành phần. File giao dịch không có khoản thu thêm. | Thiếu. | Thêm cột ở **cuối** file hiện có (không chèn giữa, không đổi tên cột cũ). Khoản thu thêm: xem QD-9. |
| L8 | BC-20 | Cột đá trong DB là `not null default 0`: không phân biệt "không có đá" với "đá 0 đồng". Dòng trước P4: `gold_amount_dong`, `labor_final_dong` là null. | Cần quy ước để trống. | Đề xuất: để trống cả nhóm đá khi trọng lượng = 0, số lượng = 0 và tiền = 0; để trống tiền công khi công thực tế = 0 hoặc null. Xem QD-10. |
| L9 | BC-16 | Đơn tạm chỉ lưu SKU, số lượng, điều chỉnh / chỉ; mất giá đá đã sửa và điều chỉnh công khi mở lại. 3 chứng từ đặt cọc in đơn giá gộp. | Thiếu, đã ghi ở P4-02 §10. | Phạm vi cụ thể cần chốt: QD-7, QD-8. |
| L10 | BC-18 | Giấy đảm bảo in "Tổng cộng" = **số đã thu**, không phải tổng hóa đơn. Hóa đơn thu một phần thì tổng in ≠ tổng các dòng. | Có trước P4. Lệch câu "tổng tiền hóa đơn khớp tổng thành phần" với đơn chưa thu đủ. | Không tự sửa. Hỏi ở QD-6. |

Đã khớp, không cần sửa: không có tiền công ở flow mua (BC-5) · nhập cân sau nấu chỉ tính lại vàng (BC-8) · KL trước / sau nấu là trọng lượng vàng (BC-10) · không SKU, tồn kho, dòng sổ kho cho đá (BC-1) · dòng catalog không có ô đá (BC-7) · bán tính và lưu riêng 3 thành phần, điều chỉnh / chỉ chỉ tác động vàng (BC-12 đến BC-14) · không có chiết khấu (BC-23) · Đặt cọc / Đặt trước lưu đủ thành phần (BC-16).

## 3. Chứng từ in trong flow mua và bán

Baseline mới nhắc 2 chứng từ: Phiếu 02 – Mua hàng kiêm nhập kho (mua) và hóa đơn / Giấy đảm bảo (bán). Bảng dưới là toàn bộ chứng từ in hệ thống đang có.

### 3.1 Flow mua

| Chứng từ | Nguồn | In ở bước | Đá hiện tại | Baseline |
|---|---|---|---|---|
| Phiếu cam kết nấu bán sản phẩm | `MeltCommitmentDocument` | 2 | Không in đá. Bảng: tên, số lượng, KL trước nấu, KL sau nấu (đều là TL vàng), mô tả. Mục 2.2 in sẵn chính sách: hàng gắn đá phải bóc tách đá, đá kiểm định và mua theo giá thỏa thuận | Chưa nhắc |
| Phiếu hàm lượng | File PDF người dùng tải lên | 4 | Không do hệ thống tạo | Chưa nhắc |
| Phiếu mua hàng kiêm nhập kho và chi tiền (nút "Hóa đơn") | `PurchaseVoucherDocument` | 6 | Dòng "Đá kèm …" riêng có STT. Cột: STT, tên, hàm lượng, ĐVT (luôn in "chỉ"), trọng lượng, đơn giá, thành tiền | Có nhắc (BC-11), cần xác nhận tên: QD-2 |
| Phiếu 02 = Bảng kê thu mua không có hóa đơn (Mẫu 02/TNDN, Thông tư 20/2026/TT-BTC) | `Form02Document`, `Form02DetailDrawer` | 7 | Dòng "Đá kèm …" riêng có STT. Cột theo mẫu: (6) tên hàng, (7) số lượng / trọng lượng, (8) đơn giá, (9) tổng giá thanh toán | Có nhắc (BC-11), cần xác nhận tên: QD-2 |
| Tem sản phẩm (In tem từ hóa đơn mua) | `label-print` | Sau hoàn tất | In KLT, KLV, KLĐ (khi > 0), HL, C, G. G mặc định = vàng + công của SKU, **chưa gồm tiền đá**, sửa tay được | Chưa nhắc |

Màn hình (không in): khung xem trước "HÓA ĐƠN MUA HÀNG" bên phải màn Mua ghi "SL × TL · giá / chỉ" và thành tiền đã gồm đá nhưng không ghi dòng đá.

### 3.2 Flow bán

| Chứng từ | Nguồn | Đá / công hiện tại | Baseline |
|---|---|---|---|
| Giấy đảm bảo vàng (phôi 205 × 148 mm, 4 dòng kẻ) | `InvoiceDocument` | Dòng Vàng, Đá, Tiền công có STT riêng; khoản thu thêm là dòng riêng; tối đa 8 dòng in | Có nhắc (BC-17, BC-18) |
| Thỏa thuận đặt cọc mua bán | `DepositAgreementDocument` | Bảng hàng chung (`DepositGoodsTable`): STT, tên, số lượng, tổng trọng lượng (vàng), ĐVT (luôn "chiếc"), hàm lượng, **Đơn giá = giá 1 chiếc gộp vàng + đá + công**, thành tiền. Không tách đá / công. **Không liệt kê khoản thu thêm** dù "Tổng giá trị giao dịch dự kiến" đã gồm khoản này | Chưa nhắc |
| Phiếu đặt cọc mua hàng kiêm phiếu thu tiền | `DepositVoucherDocument` | Cùng bảng hàng trên | Chưa nhắc |
| Biên bản giao nhận | `HandoverMinutesDocument` | Cùng bảng hàng trên | Chưa nhắc |
| Tem sản phẩm | `label-print` | Như ở flow mua | Chưa nhắc |
| Trang Báo cáo (in bằng trình duyệt) | `ReportingWorkspace` | Chỉ số tổng, không có thành phần theo dòng | Chưa nhắc |

Không có bản in: đơn tạm, trả hàng, phiếu nhập kho (Kho › Nhập hàng).

Số liệu liên quan: 76 đơn Đặt cọc / Đặt trước hoàn tất có khoản thu thêm (bảng hàng trên 3 chứng từ đặt cọc cộng lại không bằng tổng in bên dưới). 27 đơn Đặt cọc / Đặt trước chưa giao. 34 phiếu mua đang xử lý dở. 0 đơn tạm đang mở.

## 4. Câu hỏi còn mở

| # | Câu hỏi | Trả lời |
|---|---|---|
| QD-1 | Dòng có nhiều chiếc (ví dụ mua 2 chiếc giống nhau, hoặc bán SKU số lượng 2): trọng lượng đá, số lượng đá nhập cho **1 chiếc** rồi nhân số chiếc (như hiện tại), hay nhập cho **cả dòng**? | "Đá luôn đi kèm sản phẩm vàng, không tách rời, nên case này sẽ không xảy ra." Chưa chọn phương án. **Giả định triển khai:** giữ cách hiện tại (thông tin đá là của 1 chiếc, nhân số chiếc). Dòng 1 chiếc thì hai cách cho cùng kết quả. |
| QD-2 | "Phiếu 02 – Mua hàng kiêm nhập kho" trong baseline là chứng từ nào? Hệ thống có 2 chứng từ riêng: Phiếu mua hàng kiêm nhập kho và chi tiền; Phiếu 02 (Mẫu 02/TNDN). BC-11 áp cho cả hai? | Cả hai chứng từ. |
| QD-3 | Khi bỏ dòng đá riêng, thông tin đá in thế nào trên 2 phiếu mua? Riêng Mẫu 02/TNDN có cột theo quy định: nếu chỉ 1 dòng thì (7) trọng lượng × (8) đơn giá ≠ (9) tổng giá thanh toán khi có đá. | Ghi chú đá ngay dưới tên hàng trong cùng ô (số lượng, trọng lượng, tiền đá). Thành tiền dòng = vàng + đá. |
| QD-4 | Sửa đá sau nấu (BC-9): cho sửa tới bước nào? Sau khi phiếu hoàn tất (đã chi tiền, đã nhập kho) có cho sửa không? | Chỉ sửa **trọng lượng** và **số lượng** đá. Đơn giá đá không sửa được. Cập nhật cùng lúc với bước upload file PDF (phiếu kiểm tra hàm lượng). |
| QD-5 | Phiếu cam kết nấu: giữ không in đá, hay ghi thêm số lượng / trọng lượng đá khách giao kèm? | Giữ nguyên, không in đá. |
| QD-6 | Giấy đảm bảo: giới hạn tính theo **số sản phẩm** hay **số dòng in**? Dòng chi tiết đá / công có tính vào giới hạn không? "Tổng cộng" in số đã thu (hiện tại) hay tổng hóa đơn? | Theo **số dòng in** như hiện tại: tối đa 8 dòng, dòng chi tiết vẫn tính. Phần "Tổng cộng" chưa trả lời: giữ nguyên in số đã thu. |
| QD-7 | 3 chứng từ đặt cọc: tách đá / công thành dòng chi tiết như Giấy đảm bảo, hay giữ đơn giá gộp? Có bổ sung khoản thu thêm vào bảng hàng không? | Tách riêng thành phần, không in đơn giá gộp: đơn giá và thành tiền vàng riêng; có đá thì dòng chi tiết dưới sản phẩm (trọng lượng, số lượng, đơn giá, thành tiền đá); có tiền công thì dòng chi tiết riêng; khoản thu thêm thể hiện riêng. Chỉ hiện thành phần có phát sinh. Tổng chứng từ khớp tổng thành phần. Không đổi cách tính của sản phẩm chỉ có vàng. |
| QD-8 | Đơn tạm: phạm vi là giữ giá đá và điều chỉnh công đã sửa khi lưu / mở lại, hay còn gì khác? | |
| QD-9 | Khoản thu thêm trong file giao dịch: cột riêng ghi ở dòng đầu của hóa đơn, hay thêm dòng riêng cho từng khoản? (Đã xác minh: ở cả 744 hóa đơn, tổng dòng hàng + tổng khoản thu thêm = tổng hóa đơn.) | |
| QD-10 | Quy ước để trống ở L8 có đúng không? | |
| QD-11 | Khi bán: sửa được những gì của đá? Hiện chỉ sửa được tiền đá / chiếc; trọng lượng đá lấy từ SKU, không sửa được. | |
| QD-12 | Tem: có in thêm số lượng đá không? Form In tem có cần ô số lượng đá và đơn giá đá để lưu về SKU làm mặc định khi bán không? Giá "G" trên tem có phải gồm tiền đá không (hiện mặc định chưa gồm)? | |
| QD-13 | Trả hàng đang hoàn theo đơn giá gộp, dòng trả không tách thành phần. Có thuộc Big Change không? | |

## 5. Quyết định triển khai (2026-11-13)

### 5.1 Dữ liệu

- Thêm 2 cột trên `pos_buy_items`, `pos_skus`, `pos_sale_items`: `stone_quantity` (số viên) và `stone_unit_price_dong` (đơn giá / viên). Mặc định 0.
- `stone_price_dong` giữ nguyên nghĩa "thành tiền đá của 1 chiếc sản phẩm", nay do server tính = `stone_unit_price_dong × stone_quantity`. Mọi đẳng thức đang chạy không đổi: dòng mua = vàng + `stone_price_dong × số chiếc`; giá 1 chiếc khi bán = vàng + `stone_price_dong` + công.
- Check `*_stone_qty_chk` trên 3 bảng: thành tiền đá phải bằng đơn giá × số lượng, trừ dòng cũ (số lượng 0 và đơn giá 0) được giữ số tiền đá nhập tay.
- Không tính lại dòng cũ. Dòng cũ có tiền đá nhập tay ("dòng cũ"): chỉ ở chứng từ test đã hủy và 2 SKU test đã ẩn.

### 5.2 Mua

- Modal "Mua vàng thị trường": ô trọng lượng đá, số lượng đá, đơn giá đá; thành tiền đá tự tính, không nhập tay. Có đơn giá thì bắt buộc có số lượng.
- `create_buy_intake`: nhận `stone_quantity`, `stone_unit_price_dong`; server tính thành tiền đá. Client cũ chỉ gửi `stone_price_dong` vẫn chạy.
- RPC mới `pos_set_buy_stone`: sửa trọng lượng + số lượng đá, chỉ khi phiếu `PROCESSING` và ở bước `WEIGHT_ENTERED` (đã nhập cân sau nấu, chưa tải phiếu hàm lượng). Đơn giá đá giữ nguyên. Tính lại thành tiền đá, tổng dòng, tổng phiếu, còn lại, số dự kiến trả; đồng bộ thông tin đá sang SKU vàng thị trường; audit `BUY_STONE_EDIT` có trước / sau; có idempotency. Dòng cũ chỉ sửa được trọng lượng.
- Màn quy trình: ô sửa đá nằm trong khối tải phiếu hàm lượng. Tải file thì thay đổi đá được lưu trước, lỗi thì dừng không tải.
- Phiếu không qua nấu (`skip_melt`) không có bước tải phiếu hàm lượng nên không có chỗ sửa đá sau tiếp nhận.
- Phiếu mua hàng kiêm nhập kho, Phiếu 02 (bản in + chi tiết): 1 dòng / sản phẩm; ghi chú "Đá kèm: số viên · trọng lượng · đơn giá / viên · tiền đá" dưới tên hàng; đơn giá = giá vàng / chỉ; thành tiền = vàng + đá. Phiếu cam kết nấu: không đổi.

### 5.3 Bán

- Giỏ bán: thay ô "Giá đá / chiếc" bằng ô số lượng đá và đơn giá đá / viên; thành tiền đá tự tính. `complete_sale` nhận `stone_quantity`, `stone_unit_price_dong`, lưu vào dòng bán, ghi audit khi khác mặc định SKU. Client cũ vẫn chạy.
- Giấy đảm bảo: dòng đá ghi "Đá (n viên)", đơn giá = giá / viên, thành tiền = tiền đá × số chiếc. Giới hạn 8 dòng in không đổi. "Tổng cộng" không đổi.
- Thỏa thuận đặt cọc, Phiếu đặt cọc, Biên bản giao nhận: dòng sản phẩm in đơn giá và thành tiền vàng; dòng chi tiết "Đá kèm" và "Tiền công" khi có; khoản thu thêm thành dòng riêng. Dòng bán trước khi tách thành phần giữ 1 dòng như cũ.
- In tem: form có ô số lượng đá, đơn giá đá (lưu về SKU qua `pos_set_sku_sale_components_v2`), thành tiền tự tính. Nội dung tem in ra không đổi.

### 5.4 Chưa làm, chờ trả lời

| Việc | Vướng |
|---|---|
| File xuất / CSV (BC-19 đến BC-22, L6, L7, L8) | QD-9, QD-10 |
| Đơn tạm giữ thông tin đá / công đã sửa | QD-8 |
| Phạm vi sửa đá khi bán (đang cho sửa số lượng + đơn giá, không sửa trọng lượng) | QD-11 |
| Nội dung tem, giá "G" có gồm đá không | QD-12 |
| Trả hàng tách thành phần | QD-13 |
| Giấy đảm bảo "Tổng cộng" = số đã thu | phần còn lại của QD-6 |

## 6. Kế hoạch migration (đã duyệt, đã áp 2026-11-13)

**Đã áp lên production 2026-11-13** qua 4 migration (thay cho file gộp `20261113000000_bc_stone_quantity.sql` ban đầu):

| Version | Tên | Nội dung |
|---|---|---|
| `20261113031055` | `bc_stone_quantity_columns` | Backup + 2 cột + 3 check |
| `20261113031147` | `bc_stone_quantity_buy` | `pos_private.create_buy_intake`, `public.pos_get_buy` |
| `20261113031223` | `bc_stone_quantity_sale` | `pos_private.complete_sale` (13 tham số) |
| `20261113031330` | `bc_stone_quantity_stone_edit` | `pos_set_buy_stone`, `pos_set_sku_sale_components`, `pos_set_sku_sale_components_v2` |

Kết quả kiểm sau khi áp: số dòng và tổng tiền của `pos_buy_items` (602), `pos_skus` (311), `pos_sale_items` (3851), `pos_buys` (443), `pos_sales` (3269) không đổi so với trước khi áp; `md5(prosrc)` của 6 function trên production trùng file trong repo; 2 function mới chỉ grant `authenticated`, `service_role`. **Chưa chạy** advisor sau khi áp.

Kế hoạch đã duyệt (giữ lại để đối chiếu). Chỉ thêm (expand); không drop, không đổi tên, không sửa dữ liệu cũ.

1. **Backup** vào `tlkv_backup_20261110`: `pos_buy_items__bc`, `pos_skus__bc`, `pos_sale_items__bc`, `_routines__bc` (định nghĩa 5 function trước khi thay). Bật RLS, không grant.
2. **Thay đổi:** 2 cột + 1 check trên 3 bảng; thay `create_buy_intake`, `pos_get_buy`, `complete_sale` (13 tham số), `pos_set_sku_sale_components` (cùng chữ ký); thêm `pos_set_buy_stone`, `pos_set_sku_sale_components_v2` (grant `authenticated`, `service_role`; revoke `public`, `anon`). Không tạo bảng `public` mới nên không cần GRANT bảng (§32.1): cột mới theo grant sẵn có của bảng.
3. **Tương thích ngược:** chữ ký RPC cũ giữ nguyên; payload không có số lượng / đơn giá đá đi đường cũ. App đang chạy không cần deploy cùng lúc. Chiều ngược lại thì không: code mới đọc cột mới nên **phải áp migration trước khi deploy code**.
4. **Kiểm trước khi áp (đã chạy 2026-11-13, chỉ đọc):** mã nguồn 5 function trên production trùng file migration trong repo; chưa có cột / function / bảng backup trùng tên; ngoài các function được thay, không function nào ghi `stone_price_dong`; 0 đơn hoàn tất có tổng khác tổng dòng + khoản thu thêm.
5. **Kiểm sau khi áp:** đếm dòng 3 bảng bằng bản backup; mọi dòng có `stone_quantity = 0`, `stone_unit_price_dong = 0`, `stone_price_dong` không đổi; tổng `total_dong` của `pos_buys` và `pos_sales` không đổi; 2 function mới tồn tại đúng grant; advisor không có cảnh báo mới.
6. **Rollback:** migration mới khôi phục 5 function từ `_routines__bc`, drop 2 function mới và 3 check; để nguyên 2 cột (mặc định 0, function cũ không đọc).
7. **Dữ liệu dở:** 34 phiếu mua đang xử lý và 27 đơn Đặt cọc / Đặt trước chưa giao không bị tính lại; không dòng nào có đá.

Hard-test sau khi áp: đã được đồng ý (tài khoản hard-test, hủy toàn bộ chứng từ test, không sửa chứng từ thật). Mã chứng từ test ghi ở §7.

## 7. Lịch sử thay đổi

- 2026-11-13: tạo file từ bộ quy tắc đã chốt và kết quả đối chiếu code + DB. Chưa đổi code hay DB.
- 2026-11-13: ghi trả lời QD-1 đến QD-7; thêm §5 quyết định triển khai, §6 kế hoạch migration; đính chính L4 (phôi Giấy đảm bảo không in STT). Code đã sửa trên working tree, migration chưa áp.
- 2026-11-13: migration được duyệt và đã áp (4 version ở §6). Hard-test toàn luồng mua và bán (đặt hàng trả nhiều lần) **đạt**. Sửa thêm: thẻ sản phẩm POS hiện giá vàng / chỉ không cộng đá và công (trước đó chia tổng giá chiếc cho trọng lượng vàng).

### Chứng từ hard-test 2026-11-13 (khách test KH000169)

| Thứ tự hủy | Mã | Loại | Nội dung | Trạng thái |
|---|---|---|---|---|
| 1 | **DH003544** (PRE-000437, PDC-000144) | Đặt hàng, đã giao, đã thu đủ | SKU TLKVTS000018: vàng 1.296.000 + đá 2 viên × 35.000 = 70.000 + công 100.000 = 1.466.000; thu 3 lần tiền mặt 500.000 + 466.000 + 500.000 | **Đã hủy** 21:00 (lý do "test"): hoàn 3 khoản tiền `SALE_VOID_REFUND`. Kho **không** được hoàn (lỗi L-VOID-DEPOSIT bên dưới), đã bổ sung 1 bút toán `SALE_VOID` +1 qua `pos_private.apply_stock_change` lúc 21:10 |
| 2 | **PN000120** | Nhập hàng tab In tem (giá vốn 0) | Tạo SKU **TLKVTS000018** (0,1 chỉ, 999,9), MSP 000739 | **Đã đảo** 21:12 (`PURCHASE_VOID` −1, trạng thái CANCELLED, không có dòng tiền). Kho TLKVTS000018 = 0 sau 4 bút toán. SKU **chưa ẩn** |
| 3 | **BUY-000446** (PCN20261113-564, BK20261113-565) | Mua vàng thị trường 999.9, đã hoàn thành | 0,1 → 0,09 chỉ × 1.000.000 + đá 3 viên × 25.000 = 75.000; tổng 165.000, chi tiền mặt; SKU MG-EC1D49810C67, MSP 000738 | **Chưa hủy** |

**L-VOID-DEPOSIT (lỗi có sẵn, chưa sửa, phát hiện khi dọn test):** `pos_private.void_sale_invoice` chỉ hoàn kho khi `transaction_type = 'SALE'` hoặc `'PREORDER'` + `FULFILLED`. Đơn Đặt cọc (`DEPOSIT`) đã giao khi hủy thì hoàn tiền nhưng **không hoàn kho** (trái quy tắc 6). Ngoài DH003544 còn 8 đơn đã hủy cùng tình trạng, cần đối soát kho trước khi sửa dữ liệu (BRD §9.15): DH000118, DH000157, DH000154, DH000211, DH000213, DH000564, DH002818, DH002924. Hướng sửa đề xuất: thêm `DEPOSIT` vào điều kiện hoàn kho (migration có backup), đối soát từng SKU rồi mới bổ sung bút toán.

**Hóa đơn thật bị hủy trong round:** HD000446 (26/09/2026, 1.386.000 đ) bị hủy 10:28 ngày 13/11 bằng tài khoản hard-test qua dev server local, lý do "ttsss". Không do agent thực hiện; cần chủ cửa hàng xác nhận.

Kết quả kiểm chứng từ:

- Mua: modal 3 ô đá, thành tiền tự tính; cam kết nấu chỉ dòng vàng; KL sau nấu giữ tiền đá; sửa đá ở bước upload phiếu HL (2 → 3 viên, đơn giá giữ) tính lại tổng 165.000; Phiếu mua hàng kiêm nhập kho và Phiếu 02 một dòng, ghi chú "Đá kèm: 3 viên · 0,03 chỉ · 25.000 đ/viên · tiền đá 75.000 đ" dưới tên, thành tiền 165.000. SKU nhận số lượng / đơn giá đá; form In tem nạp đúng, tem in không đổi.
- Bán (đặt hàng trả một phần): sửa đơn giá đá tại POS 40.000 → 35.000; Thỏa thuận đặt cọc, Phiếu đặt cọc, Biên bản giao nhận có dòng vàng + "Đá kèm" (viên) + "Tiền công", tổng khớp 1.466.000, cọc 500.000, còn lại đúng; Giấy đảm bảo in dòng vàng (12.960.000 / chỉ), "Đá (2 viên)" 35.000, "Tiền công" 100.000, tổng 1.466.000.

Ghi nhận thêm (chưa sửa): tem lấy dữ liệu từ link phiếu mua giữ số thực dạng float (0.11999…) trong ô KLT/KLV/KLĐ, hiển thị vẫn đúng; nhập KLĐ tay ở form tem không tự cộng KLT; giá "G" trên tem chỉ là giá vàng (QD-12).
