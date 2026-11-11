# Phase 1 · Section 2 — Nội dung tem sản phẩm (90×14)

> Chốt: 2026-11-10 · Người chốt: tuananh18101@gmail.com · **Giải pháp tạm**, chờ admin kiểm tem in thật rồi báo lại.  
> Tổng quan Phase 1: [`P1-00-OVERVIEW.md`](./P1-00-OVERVIEW.md)

## 1. Yêu cầu đã chốt

1. "Thông tin in" có field **Tên sản phẩm (in trên tem)**, tự điền theo SKU chọn ở dropdown, sửa được.
2. Tên sản phẩm in ở **dòng đầu Mặt 2** (mặt có KLT, KLV…).
3. **Hàm lượng** (tuổi vàng) in trên Mặt 2. Tự điền từ `products.gold_age`, sửa được, để trống thì không in.
4. Mặt 2 không đủ chỗ cho 1 cột → **chia 2 cột**. Vẫn chỉnh được cỡ chữ riêng Mặt 2.
5. Dòng không đủ chỗ → hiện `…`; người dùng tự chỉnh cỡ chữ. UI preview cảnh báo dòng nào đang bị cắt.
6. **Xuất xứ: Việt Nam** in ở **dòng cuối Mặt 1** (dưới MSP). Khoảng cách các dòng Mặt 1 cân đối.

## 2. Layout

```text
Mặt 2 (trái)                          Mặt 1 (giữa)
┌────────────────────────────┐        ┌────────────────────────────┐
│ Tên sản phẩm…              │        │ Vàng Thăng Long Kim Việt   │
│ KLT: 1,25 chỉ │ HL: 610,5  │        │ ▌▌▌▌▌▌ barcode ▌▌▌▌▌▌▌▌    │
│ KLV: 1,2 chỉ  │ C: 150.000 đ│        │ MSP: VBTMC000123           │
│ KLĐ: 0,05 chỉ │ G: 3.200.000│        │ Xuất xứ: Việt Nam          │
└────────────────────────────┘        └────────────────────────────┘
```

- Mặt 2: cột trái = trọng lượng (KLT, KLV, KLĐ nếu > 0), cột phải = HL (nếu có), C, G. Hàng thẳng nhau giữa 2 cột.
- Các dòng chia đều chiều cao mặt (`space-between`); mọi dòng 1 hàng, tràn thì `…`.
- Mặt 1: barcode cao cố định, 4 phần tử chia đều khoảng cách. Xuất xứ trống thì không in dòng này.

## 3. Module boundary

- Chỉ `src/modules/label-print/**` + file md này. **Không** đổi DB / RPC.
- Lịch sử in (`pos_label_print_log`) **chưa lưu** tên in trên tem, hàm lượng, xuất xứ → In lại lấy tên SKU, tuổi vàng hiện tại của SP, xuất xứ mặc định. Cần lưu thì làm migration riêng sau khi chốt layout.

## 4. Logic cũ phải giữ nguyên

- MSP / barcode / mint / đổi mã loại / In / In lại / lịch sử không đổi.
- Offset in (mm) và delta cỡ chữ 3 vùng vẫn lưu localStorage như cũ.
- In tem không đổi tồn kho.

## 5. Hard-test checklist

1. Chọn SKU → Tên sản phẩm + Hàm lượng tự điền; sửa tay → preview đổi theo.
2. Tên dài → dòng đầu Mặt 2 hiện `…` + cảnh báo; giảm cỡ chữ Mặt 2 → hết cảnh báo.
3. KLĐ = 0 và HL trống → Mặt 2 còn 2 hàng, không lệch cột.
4. Xuất xứ hiện dòng cuối Mặt 1; xóa trống → dòng biến mất, khoảng cách chia lại đều.

## 6. Lịch sử thay đổi

- 2026-11-10: chốt lần đầu (tạm).
- 2026-11-10: implement. Cỡ chữ gốc Mặt 2 đổi 7 → **5.6 pt** (`layoutDefaults.ts`) vì 2 cột: đo trên preview, ca thường (KL 3 số lẻ, G 8 chữ số) vừa 1 hàng; ca xấu (KL 4 số lẻ, G 9 chữ số) báo cắt "G", giảm Δ −0.5 pt thì hết. Mặt 1 khi có xuất xứ: barcode 4.4 mm, 3 khoảng cách đều 0.36 mm; xuất xứ trống → giữ đúng layout cũ (barcode 5.2 mm). Mặt 2: 3 khoảng cách đều 1.17 mm.
- Cột Mặt 2 rộng theo nội dung (`max-content`), 2 cột thẳng hàng; tên SP `contain: inline-size` để không nới cột.
- 2026-11-11: sửa mất chữ "đ" cuối dòng G. Nguyên nhân: offset gốc Mặt 2 x +1.5 mm, Mặt 1 x −0.5 mm → Mặt 1 (nền trắng, vẽ sau) che 2 mm phải của Mặt 2; layout 1 cột cũ không chạm vùng này. Sửa: Mặt 2 chỉ rộng tới mép trái Mặt 1 (`face2WidthMm`), 2 cột xếp sát trái (gap 1 mm) như tem cũ. Bỏ hàng "Cỡ chữ Mặt 2" riêng; chỉnh cỡ chữ Mặt 2 ở khối "Cỡ chữ (pt)" như trước.
- Chưa in trên máy iDPRT thật — cần admin in thử 1 tem và báo lại cỡ chữ / vị trí.
