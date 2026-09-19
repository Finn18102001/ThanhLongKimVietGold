/** Canonical: 90x14. Legacy 21x10/21x12 kept for print-history rows. */
export type LabelStockSize = "90x14" | "21x10" | "21x12";

export type LabelPrintAction = "FIRST_PRINT" | "REPRINT";

export type LabelSkuOption = {
  skuId: string;
  sku: string;
  name: string;
  category: string;
  brandName: string | null;
  weightChi: number;
  laborFeeDong: number;
  unitPriceDong: number | null;
  stockQty: number;
};

export type LabelPiece = {
  id: string;
  msp: string;
  barcode: string;
  /** Editable product-type prefix (e.g. VBTMC). */
  typeCode: string;
  /** System serial (e.g. 000008) — immutable after mint. */
  serialNo: string;
  skuId: string;
  createdAt: string;
  createdBy: string;
};

export type LabelPrintPayload = {
  pieceId: string;
  msp: string;
  barcode: string;
  productName: string;
  productType: string;
  brandName: string;
  companyName: string;
  addressLine: string;
  kltChi: number;
  klvChi: number;
  /** Stone weight (chỉ). Printed only when > 0. */
  kldChi: number;
  laborFeeDong: number;
  priceDong: number;
  stockSize: LabelStockSize;
  printQty: number;
  actionType: LabelPrintAction;
};

export type LabelPrintLogRow = {
  id: string;
  printedAt: string;
  msp: string;
  barcode: string;
  productName: string;
  productType: string;
  brandName: string;
  kltChi: number;
  klvChi: number;
  kldChi: number;
  laborFeeDong: number;
  priceDong: number;
  printQty: number;
  stockSize: LabelStockSize;
  actorEmail: string;
  actionType: LabelPrintAction;
  pieceId: string;
  skuId: string;
  companyName: string;
  addressLine: string;
};

export type LabelHistoryFilter = {
  dateFrom: string;
  dateTo: string;
  productType: string;
  productQuery: string;
  brand: string;
  actorQuery: string;
  codeQuery: string;
};

/** Server-side history page (limit 2–30). */
export type LabelHistoryQuery = LabelHistoryFilter & {
  limit: number;
  offset: number;
};

export type LabelHistoryPage = {
  items: LabelPrintLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export const LABEL_HISTORY_PAGE_SIZES = [10, 20, 30] as const;
export const DEFAULT_LABEL_HISTORY_PAGE_SIZE = 20;

export const DEFAULT_COMPANY_NAME = "Công ty TNHH Vàng Bạc Thăng Long Kim Việt";
export const DEFAULT_COMPANY_SHORT = "Vàng Thăng Long Kim Việt";
export const DEFAULT_ADDRESS_LINE = "Đc: 322 Nguyễn Trãi, P. Đại Mỗ";
