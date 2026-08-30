# SRS bổ sung – PURCHASE / MUA HÀNG TỪ KHÁCH

> Nguồn: cập nhật khách hàng 2026-08-23. Copy vào `docs/` để AI/dev theo contract.

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
```

## Tóm tắt rule

| Nội dung | Sản phẩm đang bán | Vàng thị trường |
|----------|-------------------|-----------------|
| Có trong Product Catalog | Có | Không |
| SKU | Bắt buộc (`sku_id`) | Không (BE tạo MG SKU) |
| Giá tham chiếu | Giá niêm yết website / chỉ (`sell`) | Không bắt buộc (payload `0`) |
| ±300.000đ/chỉ | Có | Không |
| PRICE_EXCEPTION | Có thể | Không do ±300k |
| Inventory | IN khi hoàn tất | IN khi hoàn tất |

## UI layout (admin)

```text
[ Header: Mua hàng từ khách | meta draft ]
[ Customer search/select ]
[ Catalog tabs + cards + "+ Vàng thị trường" ]
[ Lines table ]
[ Summary KPIs + Payment ]
[ clear / confirm F9 ]
Right (lg+): HÓA ĐƠN MUA HÀNG preview + yellow ±300k banner nếu catalog exception
```

Chi tiết acceptance: xem `SRS_PURCHASE_Mua_Hang_Tu_Khach.md` bản đầy đủ trong Downloads nếu cần.
