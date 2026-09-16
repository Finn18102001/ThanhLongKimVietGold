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

export const DEFAULT_COMPANY_NAME = "Công ty TNHH Vàng Bạc Thăng Long Kim Việt";
export const DEFAULT_COMPANY_SHORT = "Vàng Thăng Long Kim Việt";
export const DEFAULT_ADDRESS_LINE = "Đc: 322 Nguyễn Trãi, P. Đại Mỗ";
