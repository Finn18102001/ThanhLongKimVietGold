export const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
};

export type InvoiceLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number;
  totalPriceDong: number;
  weightChi: number;
  imageUrl: string | null;
};

export type InvoiceListRow = {
  id: string;
  invoiceNo: string;
  status: string;
  totalDong: number;
  issuedAt: string;
  customerName: string;
  customerPhone: string;
  customerNo: string | null;
  isWalkIn: boolean;
  paymentMethod: string;
  saleNo: string;
  saleStatus: string;
  actorEmail: string;
};

export type InvoiceListFilter = {
  query?: string;
  from?: string | null;
  to?: string | null;
  paymentMethod?: "CASH" | "TRANSFER" | "CARD" | null;
  limit?: number;
  offset?: number;
};

export type InvoiceListPage = {
  items: InvoiceListRow[];
  total: number;
  limit: number;
  offset: number;
};

export type InvoiceDetail = {
  id: string;
  invoiceNo: string;
  status: string;
  totalDong: number;
  issuedAt: string;
  actorEmail: string;
  saleNo: string;
  saleStatus: string;
  paymentMethod: string;
  note: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerNo: string | null;
  isWalkIn: boolean;
  lines: InvoiceLine[];
};
