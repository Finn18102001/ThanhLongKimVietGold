export type PosCatalogItem = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  weightChi: number;
  unitPriceDong: number | null;
  imageUrl: string | null;
  category: string;
  browseGroup: string;
};

export type CartLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  weightChi: number;
  stock: number;
  referenceUnitPriceDong: number;
  priceAdjustmentPerChi: number;
  unitPriceDong: number;
  imageUrl: string | null;
};

export type PosOperatorOption = {
  id: string;
  staffNo: string;
  fullName: string;
};

export type PosSaleContext = {
  staffId: string | null;
  isShared: boolean;
  operators: PosOperatorOption[];
};

/**
 * Parked unpaid POS cart. Not a sale and not an invoice.
 * `visibleToAll` maps `pos_held_order_settings.visible_to_all` (default false:
 * only the saver sees/resumes/cancels). Flip that DB flag if cashiers must share holds.
 */
export type HeldOrderStatus = "HELD" | "CANCELLED" | "COMPLETED";

export type HeldOrderListItem = {
  id: string;
  holdNo: string;
  status: HeldOrderStatus;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerNo: string | null;
  isWalkIn: boolean;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note: string | null;
  estimatedTotalDong: number;
  itemCount: number;
  savedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type HeldOrderLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number;
  lineTotalDong: number;
};

export type HeldOrderDetail = HeldOrderListItem & {
  items: HeldOrderLine[];
  visibleToAll: boolean;
};

export type HeldOrderListResult = {
  ok: boolean;
  visibleToAll: boolean;
  items: HeldOrderListItem[];
};

export function browseGroupFromProduct(name: string, category: string | null): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("nhẫn")) return "Nhẫn";
  if (normalized.includes("bông lúa")) return "Bông lúa";
  if (normalized.includes("bông sen")) return "Bông Sen";
  if (normalized.includes("kim gia bảo")) return "Kim Gia Bảo";
  if (normalized.includes("rồng")) return "Vàng Rồng";
  return category?.trim() || "Khác";
}
