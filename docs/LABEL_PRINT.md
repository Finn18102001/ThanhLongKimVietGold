# In tem sản phẩm — MSP + Barcode + lịch sử in

> Cập nhật: 2026-09-16  
> Máy in: iDPRT · 203 DPI · phôi **90 × 14 mm** (SRS)  
> Contract: [`SYSTEM_DEVELOPMENT_RULES.md`](./SYSTEM_DEVELOPMENT_RULES.md)

## 1. Mục tiêu V1

Module **In tem** để tạo/in tem trang sức với:

- MSP + mã vạch **UNIQUE** theo từng sản phẩm vật lý
- Layout ngang 2 mặt + đuôi theo SRS 90×14
- Lịch sử in / in lại (không ghi đè)
- **Không** quét barcode, **không** đổi tồn kho / HĐ / tiền khi in

## 2. Hard-check hệ thống hiện tại

| Flow | Identity hiện tại | Kết luận |
|------|-------------------|----------|
| Product / SKU | `pos_skus` + qty `pos_inventory_stock` | Quantity-based, **không** serial |
| Nhập kho / bán / trả | `sku_id` + qty | Không gắn MSP |

V1 **không** gắn MSP vào vòng đời kho/bán.

## 3. V1 đã ship

| Hạng mục | Chi tiết |
|----------|----------|
| Route | `/label-print` · menu **In tem** |
| Module | `src/modules/label-print/**` |
| Tables | `pos_label_pieces`, `pos_label_print_log` |
| RPC | `pos_mint_label_piece`, `pos_record_label_print` |
| Disable | MSP, Mã vạch, KLT, KLV |
| Editable | C, G, tên công ty, địa chỉ (đuôi), SL in |
| Preview / Print | Phôi **90×14**: Mặt1 30×14 + Mặt2 30×14 + đuôi 30×2 (Đc) |

## 4. Mapping dữ liệu tem

| Tem | Nguồn |
|-----|--------|
| KLT / KLV | `pos_skus.weight_chi` |
| C / G | labor + giá (sửa trước khi in) |
| MSP / Barcode | `pos_label_msp_seq` |
| Công ty | Mặc định rút gọn `Vàng Thăng Long Kim Việt` |
| Địa chỉ | In trên đuôi / dây nối (`Đc: 322 Nguyễn Trãi, P. Đại Mỗ`) |

### Hình dạng phôi

```
┌────────────┬────────────┐
│  MẶT 1     │  MẶT 2     │════ đuôi 30×2 mm (Đc…)
│  30 × 14   │  30 × 14   │
└────────────┴────────────┘
Trang in (bounding box): 90 × 14 mm.
Geometry: src/modules/label-print/geometry.ts
```

## 5. Future (Phase 2)

Lifecycle MSP trên nhập/bán/trả; tách KLT/KLĐ/KLV; SDK iDPRT.
