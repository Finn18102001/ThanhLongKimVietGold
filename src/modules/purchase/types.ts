import type { MarketGoldClass } from "@/modules/pos/types";

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

/** Melt buy lifecycle (UI stepper + BE workflow_status). */
export type BuyWorkflowStatus =
  | "INTAKE"
  | "MELT_COMMITTED"
  | "MELTING"
  | "WEIGHT_ENTERED"
  | "AWAITING_CONFIRM"
  | "INVOICE_ISSUED"
  | "FORM02_READY"
  | "COMPLETED"
  | "CANCELLED";

/** Attachment kinds from pos_buy_attachments.doc_kind. */
export type BuyAttachmentDocKind = "PURITY_TEST" | "RELATED" | "SIGNED_PDF";

export type BuyAttachment = {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number | null;
  docKind: BuyAttachmentDocKind | string;
  actorEmail: string;
  createdAt: string;
};

/** Aggregate buy row status (pos_buys.status). */
export type BuyStatus = "PROCESSING" | "COMPLETED" | "CANCELLED" | "FAILED" | "VOIDED";

export type BuyPayMode = "FULL" | "PARTIAL" | "UNPAID";

/** Spec §2.1 / SRS 6.x: max |unit - reference| per chỉ before admin exception (catalog only). */
export const PRICE_EXCEPTION_THRESHOLD_DONG = 300_000;

export const PRICE_OUT_OF_RANGE_INLINE =
  "⚠️ Giá đã vượt quá mức cho phép thay đổi ±300.000 đ.";

export const PRICE_OUT_OF_RANGE_CONFIRM =
  "⚠️ Giá nhập đang vượt quá mức cho phép ±300.000 đ. Vui lòng kiểm tra và điều chỉnh lại giá trước khi xác nhận.";

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
  /** Loại sản phẩm (`products.product_type_id`); null khi chưa phân loại. */
  productTypeId: string | null;
  weightChi: number;
  /** Giá bán ra website / chỉ (gold_price_rows.sell). Mốc ±300k, không phải giá mua. */
  referenceSellDongPerChi: number;
  /** Giá mua vào website / chỉ (gold_price_rows.buy). 0 nếu dòng giá không có cột mua. */
  suggestedBuyDongPerChi: number;
  priceRowId: string | null;
  goldTypeHint: string | null;
  goldAgeHint: string | null;
  /** Legacy flag from pos_skus; skip-melt popup now gates on non-market only. */
  allowDirectBuy: boolean;
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
  /** Giá tham chiếu / chỉ. Catalog: cột Mua vào. Market: 0. */
  referencePriceDongPerChi: number;
  priceRowId: string | null;
  imageUrl?: string | null;
  /** TL đá của 1 chiếc (chỉ). `weightChi` là TL vàng. Chỉ ghi nhận, không tham gia tính tiền. */
  stoneWeightChi?: number;
  /** Số lượng đá (viên) của 1 chiếc. */
  stoneQuantity?: number;
  /** Đơn giá đá / 1 viên (integer VND). Thành tiền đá = đơn giá × số lượng. */
  stoneUnitPriceDong?: number;
};

export type MarketBuyLine = BuyLineBase & {
  kind: "market";
  isMarketGold: true;
  /** Group card the staff picked (999.9 / 99.9 / 9 / Bạc); saved after intake for the sell grid. */
  marketClass?: MarketGoldClass | null;
};

export type CatalogBuyLine = BuyLineBase & {
  kind: "catalog";
  isMarketGold: false;
  skuId: string;
  sku: string;
  imageUrl?: string | null;
  /** Legacy SKU flag; popup skip-melt gates on !isMarketGold only. */
  allowDirectBuy: boolean;
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
  /** Per piece; server stone amount = stone_unit_price_dong × stone_quantity, line total = gold + stone amount × quantity. */
  stone_weight_chi: number;
  stone_quantity: number;
  stone_unit_price_dong: number;
  /** Market only; ignored by pos_create_buy_intake, sent to pos_set_market_gold_class. */
  market_class?: MarketGoldClass | null;
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
  status: BuyStatus | string;
  workflowStatus: BuyWorkflowStatus | string;
  meltCommitmentNo: string | null;
  form02No: string | null;
  meltingStartedAt: string | null;
  attachmentPdfPath: string | null;
};

export type BuyListPage = {
  items: BuyListRow[];
  total: number;
  limit: number;
  offset: number;
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
  /** Settlement weight (after melt when confirmed; else initial). */
  weightChi: number;
  /** Weight before melting (intake). */
  weightBeforeChi: number;
  /** Weight after melting; null until entered. */
  weightAfterChi: number | null;
  unitPriceDong: number;
  totalPriceDong: number;
  isMarketGold: boolean;
  priceException: boolean;
  /** TL đá của 1 chiếc (chỉ). 0 = không có đá. Chỉ ghi nhận, không tham gia tính tiền. */
  stoneWeightChi: number;
  /** Số lượng đá (viên) của 1 chiếc. 0 trên dòng cũ nhập tiền đá bằng tay. */
  stoneQuantity: number;
  /** Đơn giá đá / 1 viên (VND) lúc mua. */
  stoneUnitPriceDong: number;
  /** Thành tiền đá của 1 chiếc (VND) = đơn giá đá × số lượng đá. */
  stonePriceDong: number;
  /** Tiền vàng cả dòng (VND). totalPriceDong = goldAmountDong + stonePriceDong × quantity. */
  goldAmountDong: number;
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
  /** Server created_at — used for print dates before melt/complete. */
  createdAt: string | null;
  note: string | null;
  status: BuyStatus | string;
  workflowStatus: BuyWorkflowStatus | string;
  meltCommitmentNo: string | null;
  form02No: string | null;
  meltingStartedAt: string | null;
  attachmentPdfPath: string | null;
  intendedPaidDong?: number | null;
  /** True when buy skipped melt/purity (direct branded repurchase). */
  skipMelt?: boolean;
  items: BuyDetailItem[];
  payments: BuyPaymentRow[];
  attachments: BuyAttachment[];
};

/** Payload row for pos_set_buy_melt_weights. */
export type MeltWeightItemPayload = {
  item_id: string;
  weight_after_chi: number;
};

/** Payload row for pos_set_buy_stone (đơn giá đá không sửa được sau tiếp nhận). */
export type BuyStoneItemPayload = {
  item_id: string;
  stone_weight_chi: number;
  stone_quantity: number;
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

export function lineGoldDong(line: Pick<BuyLine, "unitPriceDong" | "weightChi" | "quantity">): number {
  return Math.round(line.unitPriceDong * line.weightChi * line.quantity);
}

type BuyLineStone = Pick<BuyLine, "stoneWeightChi" | "stoneQuantity" | "stoneUnitPriceDong">;

/** Thành tiền đá của 1 chiếc = đơn giá đá × số lượng đá. Trọng lượng đá không tham gia. */
export function lineStonePieceDong(line: Pick<BuyLine, "stoneQuantity" | "stoneUnitPriceDong">): number {
  return (line.stoneUnitPriceDong ?? 0) * (line.stoneQuantity ?? 0);
}

export function lineStoneDong(line: Pick<BuyLine, "stoneQuantity" | "stoneUnitPriceDong" | "quantity">): number {
  return lineStonePieceDong(line) * line.quantity;
}

/** Mirrors pos_create_buy_intake: gold (unit × TL vàng × SL) + (đơn giá đá × số lượng đá) × SL. */
export function lineTotalDong(
  line: Pick<BuyLine, "unitPriceDong" | "weightChi" | "quantity" | "stoneQuantity" | "stoneUnitPriceDong">,
): number {
  return lineGoldDong(line) + lineStoneDong(line);
}

export function buyLineHasStone(line: BuyLineStone): boolean {
  return (line.stoneWeightChi ?? 0) > 0 || (line.stoneQuantity ?? 0) > 0 || (line.stoneUnitPriceDong ?? 0) > 0;
}

export function buyItemHasStone(
  item: Pick<BuyDetailItem, "stoneWeightChi" | "stoneQuantity" | "stonePriceDong">,
): boolean {
  return item.stoneWeightChi > 0 || item.stoneQuantity > 0 || item.stonePriceDong > 0;
}

/**
 * ±300k applies to catalog lines only.
 * Market gold never returns true (SRS 6.x.6).
 */
export function isPriceException(
  unitPriceDong: number,
  referencePriceDongPerChi: number,
  isMarketGold = false,
): boolean {
  if (isMarketGold) return false;
  if (referencePriceDongPerChi <= 0) return false;
  return Math.abs(unitPriceDong - referencePriceDongPerChi) > PRICE_EXCEPTION_THRESHOLD_DONG;
}

export function lineHasPriceException(line: BuyLine): boolean {
  return isPriceException(line.unitPriceDong, line.referencePriceDongPerChi, line.isMarketGold);
}

/** Clamp catalog buy unit price into reference ± 300.000đ/chỉ. */
export function clampBuyUnitPriceDong(
  unitPriceDong: number,
  referencePriceDongPerChi: number,
  isMarketGold = false,
): number {
  if (!Number.isFinite(unitPriceDong)) return 0;
  const rounded = Math.trunc(unitPriceDong);
  if (isMarketGold || referencePriceDongPerChi <= 0) return Math.max(0, rounded);
  const min = referencePriceDongPerChi - PRICE_EXCEPTION_THRESHOLD_DONG;
  const max = referencePriceDongPerChi + PRICE_EXCEPTION_THRESHOLD_DONG;
  if (rounded < min) return Math.max(0, min);
  if (rounded > max) return max;
  return Math.max(0, rounded);
}

export function buyUnitPriceBounds(
  referencePriceDongPerChi: number,
): { min: number; max: number } | null {
  if (referencePriceDongPerChi <= 0) return null;
  return {
    min: Math.max(0, referencePriceDongPerChi - PRICE_EXCEPTION_THRESHOLD_DONG),
    max: referencePriceDongPerChi + PRICE_EXCEPTION_THRESHOLD_DONG,
  };
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
    // Market: 0 so BE can skip ±300k; catalog: buy board / chỉ
    reference_price_dong_per_chi: line.isMarketGold ? 0 : line.referencePriceDongPerChi,
    price_row_id: line.priceRowId,
    stone_weight_chi: line.stoneWeightChi ?? 0,
    stone_quantity: line.stoneQuantity ?? 0,
    stone_unit_price_dong: line.stoneUnitPriceDong ?? 0,
    ...(line.kind === "market" && line.marketClass ? { market_class: line.marketClass } : {}),
  };
}
