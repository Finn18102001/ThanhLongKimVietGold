export type StockRow = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  weightChi: number;
  unitPriceDong: number | null;
  imageUrl: string | null;
  category: string;
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
