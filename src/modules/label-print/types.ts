/** Canonical: 90x14. Legacy 21x10/21x12 kept for print-history rows. */
export type LabelStockSize = "90x14" | "21x10" | "21x12";

export type LabelPrintAction = "FIRST_PRINT" | "REPRINT";

/** AUTO_MSP = mint sequence PREFIX-######. PRE_ASSIGNED = user nhập mã loại + số SP (được có chữ). */
export type LabelCodeMode = "AUTO_MSP" | "PRE_ASSIGNED";

export type LabelSkuOption = {
  skuId: string;
  sku: string;
  name: string;
  category: string;
  brandName: string | null;
  /** Loại sản phẩm (`products.product_type_id`); null khi chưa phân loại. */
  productTypeId: string | null;
  weightChi: number;
  laborFeeDong: number;
  unitPriceDong: number | null;
  stockQty: number;
  /** `products.gold_age` (tuổi vàng, ≤ 3 decimals); null when not set. */
  goldAge: number | null;
  /** Default stone data per piece saved on the SKU (`weightChi` = TL vàng). */
  stoneWeightChi: number;
  /** Số lượng đá (viên). */
  stoneQuantity: number;
  /** Đơn giá đá / viên. */
  stoneUnitPriceDong: number;
  /** Thành tiền đá / chiếc = đơn giá đá × số lượng đá (rows saved before 2026-11-13 may hold a hand-typed amount). */
  stonePriceDong: number;
  isMarketGold: boolean;
};

/** Prefill when opening In tem from a buy invoice (URL params). Printing never touches stock. */
export type LabelPrefill = {
  skuId: string;
  sourceNo: string | null;
  goldAgeText: string | null;
  klvChi: number | null;
  kldChi: number | null;
  stoneQuantity: number | null;
  stoneUnitPriceDong: number | null;
  note: string | null;
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
  /** First line of Mặt 2. Defaults to the SKU name, editable before printing. */
  tagName: string;
  /** Hàm lượng as typed (e.g. "610,5"). Printed only when non-empty. */
  goldAgeText: string;
  /** Last line of Mặt 1 ("Xuất xứ: …"). Printed only when non-empty. */
  originText: string;
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

export type LabelReceiveBrand = { id: string; name: string };
export type LabelReceiveCategory = { id: string; name: string };
export type LabelReceivePriceRow = { id: string; brand: string; product: string; purity: string };
export type LabelProductType = { id: string; name: string };
/** One row of `brand_categories`: the category may be used with that brand. */
export type LabelBrandCategoryLink = { brandId: string; categoryId: string };

/** Dropdown sources for "Nhập hàng" on the label screen (ADMIN only). */
export type LabelReceiveOptions = {
  brands: LabelReceiveBrand[];
  categories: LabelReceiveCategory[];
  priceRows: LabelReceivePriceRow[];
  productTypes: LabelProductType[];
  brandCategories: LabelBrandCategoryLink[];
};

export type LabelReceivePaymentMethod = "CASH" | "TRANSFER";

export type LabelReceiveInput = {
  idempotencyKey: string;
  name: string;
  brandId: string;
  categoryId: string;
  /** Loại sản phẩm, optional ("" = chưa phân loại). */
  productTypeId: string;
  priceRowId: string;
  priceNote: string;
  skuPrefix: string;
  weightChi: number;
  /** Raw text so "610.500" keeps its scale; validated as ≤ 3 decimals. */
  goldAge: string;
  visible: boolean;
  expectedQty: number;
  receivedQty: number;
  costPriceDong: number;
  supplierName: string;
  paymentMethod: LabelReceivePaymentMethod;
  reason: string;
};

export type LabelReceiveResult = {
  receiptNo: string;
  skuId: string;
  skuCode: string;
  /** Same idempotency key was already committed — no new stock was added. */
  replayed: boolean;
  sku: LabelSkuOption | null;
};

/** Suggested gold ages until the /admin purity master exists (free input still allowed). */
export const GOLD_AGE_SUGGESTIONS = ["999.9", "99.9", "980", "750", "610", "585", "418"] as const;

export const GOLD_AGE_PATTERN = /^\d{1,4}(\.\d{1,3})?$/;

export const DEFAULT_COMPANY_NAME = "Công ty TNHH Vàng Bạc Thăng Long Kim Việt";
export const DEFAULT_COMPANY_SHORT = "Vàng Thăng Long Kim Việt";
export const DEFAULT_ADDRESS_LINE = "Đc: 322 Nguyễn Trãi, P. Đại Mỗ";
export const DEFAULT_ORIGIN = "Việt Nam";
