export type StockRow = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  weightChi: number;
  unitPriceDong: number | null;
  lastCostDong: number | null;
  imageUrl: string | null;
  category: string;
  brandId: string | null;
  brandName: string | null;
};

export type LedgerRow = {
  id: string;
  sku: string;
  name: string;
  type: string;
  quantity: number;
  beforeQuantity: number;
  afterQuantity: number;
  reason: string;
  createdAt: string;
  actorEmail: string;
  referenceType: string;
  referenceId: string;
  costPriceDong: number | null;
  brandName: string | null;
  /** Khách (SALE/CUSTOMER_BUY) hoặc NCC (PURCHASE). */
  customerName: string | null;
  customerPhone: string | null;
  customerCitizenId: string | null;
};

export type BrandOption = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

/** Sentinel for "no brand" filter. Must match pos_list_ledger. */
export const NO_BRAND_ID = "00000000-0000-0000-0000-000000000000";

export type LedgerListPage = {
  items: LedgerRow[];
  total: number;
  limit: number;
  offset: number;
};

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/** Display-only threshold. Not a stored reorder policy. */
export const LOW_STOCK_DISPLAY_QTY = 2;

export function stockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= LOW_STOCK_DISPLAY_QTY) return "LOW_STOCK";
  return "IN_STOCK";
}

export type StockFilter = "ALL" | StockStatus;
