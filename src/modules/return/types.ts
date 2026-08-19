export type ReturnInvoiceItem = {
  saleItemId: string;
  skuId: string;
  sku: string;
  name: string;
  soldQty: number;
  returnedQty: number;
  availableQty: number;
  unitPriceDong: number;
  weightChi: number;
};

export type ReturnInvoiceLookup = {
  invoiceId: string;
  invoiceNo: string;
  issuedAt: string;
  totalDong: number;
  customerName: string;
  customerPhone: string;
  customerNo: string | null;
  isWalkIn: boolean;
  items: ReturnInvoiceItem[];
};

export const RETURN_REASONS = [
  "Sai size / không vừa",
  "Lỗi sản phẩm",
  "Khách đổi ý",
  "Giao nhầm",
  "Khác",
] as const;

export const RETURN_CONDITIONS = ["NEW", "OPENED", "DAMAGED"] as const;

export const RETURN_CONDITION_LABEL: Record<(typeof RETURN_CONDITIONS)[number], string> = {
  NEW: "Còn mới",
  OPENED: "Đã mở / dùng thử",
  DAMAGED: "Hư hỏng",
};
