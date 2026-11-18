# P8 — Order / giá liên kết / In tem kiêm nhập kho

> Chốt: 2026-11-16 · Nguồn: `TLKV_Order_InTem_Kiem_NhapKho_Clarification_v2.md` + yêu cầu UI fill giá + 2 mode giá bán  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md)  
> **P9 (2026-11-18):** công thức **nhập vàng** và bán vàng/bạc theo [`P9-00-GOLD-SILVER-RECEIVE-SELL-PRICE.md`](./P9-00-GOLD-SILVER-RECEIVE-SELL-PRICE.md) **thắng** mục giá vốn `buy×TL` bên dưới khi áp nhập vàng P9. Link bảng giá / UI In tem / combined vẫn theo P8.

## 1. Yêu cầu đã chốt

1. Chỉ liên kết dòng giá **đang hiển thị** bảng giá (`gold_price_rows.is_visible_on_website = true`).
2. Nhập hàng/mua: dùng cột **`buy`**. Bán hàng: dùng **`sell`** (không trộn).
3. **Giá vốn / chiếc (P8, còn dùng khi chưa áp P9 vàng):** = `buy × trọng lượng (chỉ)` — **không** nhân hệ số → ghi `cost_price_dong`. Với **nhập vàng P9:** `TL × HL × giá NL 24K/9999 + tiền công nhập` (xem P9 §2.2 / SYSTEM_DEVELOPMENT_RULES §21.2).
4. Hệ số: nhập tay, **không mặc định**, khác hàm lượng; DB chưa có cột — không tạo field DB trong round này.
5. Giá theo hệ số (`giá 1 chỉ × TL × hệ số`) = giá giao dịch với khách, **không** ghi `cost_price_dong`.
6. Khi chọn dòng giá trên mọi form nhập kho: hiện giá link; auto-fill giá nhập + giá bán; user vẫn sửa được. Liên kết **tùy chọn**, không bắt buộc (P9 §6).
7. Giá bán 2 mode: (a) theo giá link như hiện tại (`sell × TL / board_unit`); (b) theo hệ số (`sell × TL × hệ số`) — chọn mode thì tính lại; user sửa được hệ số. Công thức bán vàng/bạc chi tiết: P9 §3–§4 / SYSTEM_DEVELOPMENT_RULES §13.1.
8. Menu POS chỉ còn **một** mục **In tem**. Trong module: **2 tab to** — **In tem** | **Lịch sử in**. Trong tab In tem: 3 lựa chọn nghiệp vụ (thứ tự **In tem** → **In tem kiêm nhập kho** → **In tem trước nhập kho**). Mặc định mở tab In tem / chế độ In tem. Không đổi logic in tem / P7; chỉ đổi lớp điều hướng UI.
9. **In tem kiêm nhập kho**: form Order/nhập kho phía trên + **cùng workbench In tem** (layout/tính năng tab In tem) phía dưới trên một màn. Alert xác nhận nhập; sau OK tự chọn SKU vừa tạo vào khung in bên dưới (không đổi tab, không tìm lại). Không field Giá/ghi chú trên form Order.
10. Nhập OK / in lỗi → giữ phiếu, chỉ in lại; không tạo lại SKU/Unit/MSP.
11. SP Order tự tạo: không ảnh, không tự bật hiển thị/nổi bật.

## 2. Module boundary

| Allowed | Forbidden |
|---------|-----------|
| `inventory/**` (ReceiveForm, DraftReceivePanel, query, types, price helpers) | Tự tạo cột hệ số DB |
| `label-print/**` (tab mới, receive options filter, confirm → receive → print hiện có) | Đổi tab draft / mint SKU path ngoài cần thiết |
| File md này + README index | POS sell cart rewrite ngoài mode hiển thị trên form nhập |

## 3. Logic cũ phải giữ

- Catalog receive (SKU sẵn) vẫn chạy.
- Draft receive P7 vẫn qty=1, không ghi sell vào labor chưa chốt S1/S2/S3.
- `pos_receive_order_purchase` / `pos_receive_label_order_purchase` contract: vẫn nhận `cost_price_dong` integer từ client (đã fill theo công thức, user có thể sửa).

## 4. Hard-test

- Login `tuananh18101@gmail.com` trên POS `next dev` (xem [`POS-DEV-BUILD.md`](./POS-DEV-BUILD.md)).
- Nhập hàng Order: chọn dòng visible → thấy buy/sell; cost = buy×TL (trước P9) / công thức P9 khi đã code; sell mode link / hệ số.
- Tab In tem kiêm nhập kho: alert → nhận → in; giả lập in lỗi không tạo phiếu mới khi bấm lại cùng key.

## 5. Lịch sử

- 2026-11-16: chốt P8.
- 2026-11-18: ghi chú P9 thắng công thức giá vốn nhập vàng; link giá vẫn P8.
