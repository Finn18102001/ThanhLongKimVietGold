export const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
};

/** Spec §14 — independent of sale / invoice transaction status. */
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PARTIALLY_PAID: "Thanh toán một phần",
  PAID: "Đã thanh toán",
  OVERDUE: "Quá hạn",
};

export type InvoiceLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number;
  totalPriceDong: number;
  weightChi: number;
  purity: string | null;
  imageUrl: string | null;
};

export type InvoiceListRow = {
  id: string;
  invoiceNo: string;
  status: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
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
  paymentStatus?: PaymentStatus | null;
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
  saleId: string;
  status: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  issuedAt: string;
  actorEmail: string;
  saleNo: string;
  saleStatus: string;
  paymentMethod: string;
  note: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerCitizenId: string | null;
  customerDateOfBirth: string | null;
  customerNo: string | null;
  isWalkIn: boolean;
  lines: InvoiceLine[];
  payments: SalePaymentRecord[];
};

export type SalePaymentRecord = {
  id: string;
  saleId: string;
  amountDong: number;
  paymentMethod: string;
  paidAt: string;
  actorEmail: string;
  note: string | null;
};
