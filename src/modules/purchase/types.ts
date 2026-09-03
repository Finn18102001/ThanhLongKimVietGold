export type PaymentMethod = "CASH" | "TRANSFER" | "CARD";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export type BuyPayMode = "FULL" | "PARTIAL" | "UNPAID";

/** Spec §2.1 / SRS 6.x: max |unit - reference| per chỉ before admin exception (catalog only). */
export const PRICE_EXCEPTION_THRESHOLD_DONG = 300_000;

export type MarketGoldRef = {
  id: string;
  brand: string;
  product: string;
  purity: string | null;
  buyDong: number;
  sellDong: number;
};

/** Catalog row enriched for purchase: weight + sell/buy per chỉ. */
export type PurchaseCatalogItem = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Total sell price for the piece (POS board). */
  unitPriceDong: number | null;
  imageUrl: string | null;
  browseGroup: string;
  category: string;
  brandName: string | null;
  weightChi: number;
  /** Giá niêm yết website / chỉ (gold_price_rows.sell). */
  referenceSellDongPerChi: number;
  /** Giá mua gợi ý / chỉ (buy > 0 ? buy : sell). */
  suggestedBuyDongPerChi: number;
  priceRowId: string | null;
  goldTypeHint: string | null;
  goldAgeHint: string | null;
};

type BuyLineBase = {
  localId: string;
  productName: string;
  goldType: string;
  goldAge: string;
  brandName?: string | null;
  quantity: number;
  weightChi: number;
  /** Giá giao dịch / chỉ (integer VND). */
  unitPriceDong: number;
  /** Giá tham chiếu / chỉ. Catalog: sell board. Market: 0. */
  referencePriceDongPerChi: number;
  priceRowId: string | null;
  imageUrl?: string | null;
};

export type MarketBuyLine = BuyLineBase & {
  kind: "market";
  isMarketGold: true;
};

export type CatalogBuyLine = BuyLineBase & {
  kind: "catalog";
  isMarketGold: false;
  skuId: string;
  sku: string;
  imageUrl?: string | null;
};

export type BuyLine = MarketBuyLine | CatalogBuyLine;

/** Payload item for pos_complete_buy (snake_case keys). */
export type BuyItemPayload = {
  sku_id?: string | null;
  is_market_gold: boolean;
  product_name: string;
  gold_type: string;
  gold_age: string;
  quantity: number;
  weight_chi: number;
  unit_price_dong: number;
  /** Catalog: sell / chỉ. Market: 0 (BE skips ±300k for market). */
  reference_price_dong_per_chi: number;
  price_row_id: string | null;
};

export type BuyListRow = {
  id: string;
  buyNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: PaymentStatus | string;
  paymentMethod: PaymentMethod | string;
  dueDate: string | null;
  actorEmail: string;
  completedAt: string | null;
  note: string | null;
};

export type BuyDetailItem = {
  id: string;
  skuId: string | null;
  productName: string;
  goldType: string | null;
  goldAge: string | null;
  brandId: string | null;
  brandName: string | null;
  quantity: number;
  weightChi: number;
  unitPriceDong: number;
  totalPriceDong: number;
  isMarketGold: boolean;
  priceException: boolean;
};

export type BuyPaymentRow = {
  id: string;
  amountDong: number;
  paymentMethod: PaymentMethod | string;
  paidAt: string;
  actorEmail: string;
  note: string | null;
};

export type BuyDetail = {
  id: string;
  buyNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNo: string | null;
  customerCitizenId: string | null;
  customerAddress: string | null;
  customerBankAccount: string | null;
  customerBankHolder: string | null;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: PaymentStatus | string;
  paymentMethod: PaymentMethod | string;
  dueDate: string | null;
  actorEmail: string;
  completedAt: string | null;
  note: string | null;
  items: BuyDetailItem[];
  payments: BuyPaymentRow[];
};

export type DebtSummary = {
  receivableDong: number;
  payableDong: number;
  buyCount: number;
  saleCount: number;
};

export type CompleteBuyResult = {
  buyId: string;
  buyNo: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: string;
  dueDate: string | null;
  customerId: string;
};

export type CollectBuyPaymentResult = {
  buyId: string;
  buyNo: string;
  paidDong: number;
  remainingDong: number;
  paymentStatus: string;
  dueDate: string | null;
};

export function lineTotalDong(line: Pick<BuyLine, "unitPriceDong" | "weightChi" | "quantity">): number {
  return Math.round(line.unitPriceDong * line.weightChi * line.quantity);
}

/**
 * ±300k exception applies to catalog lines only.
 * Market gold never returns true (SRS 6.x.6).
 */
export function isPriceException(
  unitPriceDong: number,
  referencePriceDongPerChi: number,
  isMarketGold = false,
): boolean {
  if (isMarketGold) return false;
  return Math.abs(unitPriceDong - referencePriceDongPerChi) > PRICE_EXCEPTION_THRESHOLD_DONG;
}

export function lineHasPriceException(line: BuyLine): boolean {
  return isPriceException(line.unitPriceDong, line.referencePriceDongPerChi, line.isMarketGold);
}

export function toBuyItemPayload(line: BuyLine): BuyItemPayload {
  return {
    sku_id: line.kind === "catalog" ? line.skuId : null,
    is_market_gold: line.isMarketGold,
    product_name: line.productName,
    gold_type: line.goldType,
    gold_age: line.goldAge,
    quantity: line.quantity,
    weight_chi: line.weightChi,
    unit_price_dong: line.unitPriceDong,
    // Market: 0 so BE can skip ±300k; catalog: sell board / chỉ
    reference_price_dong_per_chi: line.isMarketGold ? 0 : line.referencePriceDongPerChi,
    price_row_id: line.priceRowId,
  };
}
