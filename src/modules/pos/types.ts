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
  brandId: string | null;
  brandName: string | null;
  /** Vàng/bạc thị trường — sold from stock; soft-inactive by design. */
  isMarketGold?: boolean;
  /** Real MG SKU only: group from RPC `pos_list_market_gold_stock`. */
  marketClass?: MarketGoldClass;
  goldType?: string | null;
  goldAge?: string | null;
  boughtAt?: string | null;
  /** Virtual grid card that stands for every in-stock MG SKU of this group (never sent to the server). */
  marketGroupClass?: MarketGoldClass;
  /** Giá vàng / 1 chiếc theo bảng giá hiện tại. `unitPriceDong` = vàng + công + đá mặc định. */
  goldUnitDong?: number | null;
  laborFeeDong?: number;
  stoneWeightChi?: number;
  /** Số lượng đá (viên) mặc định của SKU. */
  stoneQuantity?: number;
  /** Đơn giá đá / viên mặc định của SKU. */
  stoneUnitPriceDong?: number;
  /** Thành tiền đá / 1 chiếc = đơn giá đá × số lượng đá (SKU cũ có thể là số nhập tay). */
  stonePriceDong?: number;
};

export type MarketGoldClass = "9999" | "999" | "9" | "SILVER";

export const MARKET_GOLD_CLASSES: MarketGoldClass[] = ["9999", "999", "9", "SILVER"];

export const MARKET_GOLD_CLASS_LABEL: Record<MarketGoldClass, string> = {
  "9999": "Vàng thị trường 999.9",
  "999": "Vàng thị trường 99.9",
  "9": "Vàng thị trường 9 (vàng tây)",
  SILVER: "Bạc thị trường",
};

export const MARKET_GOLD_GROUP = "Vàng thị trường";

/** Display-only price per chỉ from the market price rows (`pos_market_gold_class_prices`). */
export type MarketGoldClassPrice = { priceRowId: string; buyDong: number; sellDong: number };
export type MarketGoldClassPrices = Partial<Record<MarketGoldClass, MarketGoldClassPrice>>;

export type PosBrandOption = {
  id: string;
  name: string;
  slug: string;
};

export type CartLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  weightChi: number;
  stock: number;
  /** Giá vàng / 1 chiếc theo bảng giá (base for the ±300k / chỉ adjustment). */
  referenceUnitPriceDong: number;
  priceAdjustmentPerChi: number;
  /** Giá thực tế / 1 chiếc = vàng (+ điều chỉnh) + đá + công. */
  unitPriceDong: number;
  imageUrl: string | null;
  stoneWeightChi: number;
  stonePriceDefaultDong: number;
  /** Số lượng đá (viên) khi bán (sửa được). */
  stoneQuantity: number;
  /** Đơn giá đá / viên khi bán (sửa được). */
  stoneUnitPriceDong: number;
  /**
   * SKU cũ chỉ có tiền đá nhập tay (chưa có số lượng + đơn giá) và dòng chưa nhập số lượng / đơn giá:
   * giữ nguyên số tiền đó, gửi server theo đường cũ.
   */
  stoneLegacyAmount: boolean;
  /** Thành tiền đá / 1 chiếc = đơn giá đá × số lượng đá (tự tính, không nhập tay). */
  stonePriceDong: number;
  /** Tiền công gốc / 1 chiếc (SKU). */
  laborFeeDong: number;
  /** Điều chỉnh tiền công / 1 chiếc (+/-), công cuối >= 0. */
  laborAdjustDong: number;
};

export type PosOperatorOption = {
  id: string;
  staffNo: string;
  fullName: string;
};

/** Shared counter login — only this account may pick “Nhân viên đứng quầy”. */
export const SHARED_POS_COUNTER_EMAIL = "nhanvienthanglongkimviet@gmail.com";

export function isSharedPosCounterEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SHARED_POS_COUNTER_EMAIL;
}

export type PosSaleContext = {
  staffId: string | null;
  /** True only for the shared counter login (see SHARED_POS_COUNTER_EMAIL). */
  isShared: boolean;
  operators: PosOperatorOption[];
};

/**
 * Parked unpaid POS cart. Not a sale and not an invoice.
 * Every authenticated POS user can list / resume / cancel every HELD order
 * (`sees_all` / `visible_to_all` are always true from the list RPC).
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
  seesAll: boolean;
};

export type HeldOrderListResult = {
  ok: boolean;
  visibleToAll: boolean;
  /** Setting shared holds OR Admin — show system-wide list / saver column. */
  seesAll: boolean;
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
