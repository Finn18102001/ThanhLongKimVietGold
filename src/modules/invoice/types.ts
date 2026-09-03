export const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
};

/** Spec §14 — independent of sale / invoice transaction status. */
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export type DocumentType = "SALE_TO_CUSTOMER" | "PURCHASE_FROM_CUSTOMER" | "STOCK_RECEIPT";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PARTIALLY_PAID: "Thanh toán một phần",
  PAID: "Đã thanh toán đủ",
  OVERDUE: "Quá hạn thanh toán",
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
  transactionType: "SALE" | "PREORDER";
  fulfillmentStatus: string;
  documentType: DocumentType;
};

export type InvoiceListFilter = {
  query?: string;
  from?: string | null;
  to?: string | null;
  paymentMethod?: "CASH" | "TRANSFER" | "CARD" | null;
  paymentStatus?: PaymentStatus | null;
  transactionType?: "SALE" | "PREORDER" | null;
  fulfillment?: "UNFULFILLED" | "FULFILLED" | null;
  documentType?: DocumentType | null;
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
  charges: InvoiceCharge[];
  payments: SalePaymentRecord[];
  transactionType: "SALE" | "PREORDER";
  fulfillmentStatus: string;
  pickupDueAt: string | null;
  operatorStaffId: string | null;
  operatorName: string | null;
};

export type InvoiceCharge = {
  id: string;
  name: string;
  amountDong: number;
  reason: string | null;
};

export type SalePaymentRecord = {
  id: string;
  saleId: string;
  amountDong: number;
  paymentMethod: string;
  paidAt: string;
  actorEmail: string;
  note: string | null;
  receivedByName: string | null;
};
