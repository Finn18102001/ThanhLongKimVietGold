# SRS bổ sung – PURCHASE / MUA HÀNG TỪ KHÁCH

> Nguồn: cập nhật khách hàng 2026-08-23. Cập nhật flow nấu / hoàn thành 2026-09-15.

## 6.x. NGUYÊN TẮC XÁC ĐỊNH GIÁ KHI MUA HÀNG

Khi cửa hàng mua vàng/sản phẩm từ khách hàng, hệ thống phải phân biệt 2 loại hàng hóa:

```text
PURCHASE
│
├── 1. SẢN PHẨM ĐANG CÓ TRONG DANH SÁCH BÁN
│      → Lấy giá niêm yết hiện tại làm Reference Price
│      → Cho phép điều chỉnh ±300.000đ/chỉ
│
└── 2. VÀNG THỊ TRƯỜNG
       → Nhập giá mua thủ công
       → Không áp dụng ±300.000đ/chỉ
       → Không tạo product card trong danh mục (SKU nội bộ inactive)
```

## Tóm tắt rule giá

| Nội dung | Sản phẩm đang bán | Vàng thị trường |
|----------|-------------------|-----------------|
| Có trong Product Catalog | Có | Không (không hiện card) |
| SKU | Bắt buộc (`sku_id`) | Nội bộ (`MG-…`, `is_active=false`) |
| Giá tham chiếu | Giá niêm yết website / chỉ (`sell`) | Không bắt buộc (payload `0`) |
| ±300.000đ/chỉ | Có | Không |
| PRICE_EXCEPTION | Có thể | Không do ±300k |
| Inventory | IN khi hoàn thành (bước 7) | IN khi hoàn thành (bước 7) |

## Flow nấu vàng (melt buy) — 7 bước

```text
Tiếp nhận
  → Cam kết nấu
  → Nấu vàng
  → Nhập KL sau nấu (+ phiếu HL nếu bắt buộc)
  → Xác nhận KH
  → Hóa đơn mua
  → Xác nhận hóa đơn → Phiếu 02   ← ĐIỂM HOÀN THÀNH
```

### Điểm hoàn thành (bắt buộc)

- **Bước 7 — Xác nhận hóa đơn → Phiếu 02** là điểm giao dịch được xem là **Hoàn thành**.
- **Không còn** bước 8 “Hoàn tất giao dịch” trên UI.
- Khi nhân viên bấm xác nhận ở bước 7:
  1. Tạo/gắn **Phiếu 02** (logic hiện tại: `pos_confirm_buy_invoice`).
  2. Ngay sau đó ghi nhận **status = COMPLETED**, nhập kho, dòng tiền / payable theo logic hiện tại (`pos_complete_buy_melt`).
- Vẫn xem / in Hóa đơn mua hàng và Phiếu 02 bình thường sau khi hoàn thành.

### Không đổi

- Các bước 1–6 (tiếp nhận → hóa đơn mua).
- Công thức tiền, trọng lượng, ±300k, skip-melt (nếu có).
- Cách mint Phiếu 02, in chứng từ, void / bút toán bù.

### Trạng thái trung gian `FORM02_READY`

- Chỉ còn là trạng thái kỹ thuật ngắn (hoặc phiếu cũ dừng giữa chừng trước khi đổi rule).
- UI có nút khôi phục “Tiếp tục hoàn thành” nếu phiếu còn `FORM02_READY` và chưa `COMPLETED`.

## UI layout (admin)

```text
[ Header: Mua hàng từ khách | meta draft ]
[ Customer search/select ]
[ Catalog tabs + cards + "+ Vàng thị trường" ]
[ Lines table ]
[ Summary KPIs + Payment ]
[ clear / confirm F9 ]
Right (lg+): HÓA ĐƠN MUA HÀNG preview + yellow ±300k banner nếu catalog exception
+ BuyWorkflowStepper (7 bước) khi phiếu đang xử lý / đã hoàn thành
```
