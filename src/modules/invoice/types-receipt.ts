import type { PaymentStatus } from "./types";

export type GoodsStatus = "NOT_RECEIVED" | "RECEIVED" | "SOLD" | "RETURNED" | "CANCELLED";
export type DocumentStatus = "DRAFT" | "COMPLETED" | "CANCELLED";

export type StockReceiptLine = {
  id: string;
  skuId: string;
  sku: string;
  name: string;
  brandName: string | null;
  expectedQty: number;
  receivedQty: number;
  costPriceDong: number;
  costAmountDong: number;
  weightChi: number | null;
  unitCostDongPerChi: number | null;
  skuWeightChi: number | null;
};

export type StockReceiptPayment = {
  id: string;
  amountDong: number;
  paymentMethod: string;
  paidAt: string;
  actorEmail: string;
  note: string | null;
};

export type StockReceiptDetail = {
  id: string;
  receiptNo: string;
  status: string;
  documentStatus: DocumentStatus;
  goodsStatus: GoodsStatus;
  supplierId: string | null;
  supplierName: string;
  reason: string;
  note: string | null;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  expectedReceiveAt: string | null;
  actorEmail: string;
  receivedAt: string | null;
  completedAt: string | null;
  stockAppliedAt: string | null;
  createdAt: string;
  items: StockReceiptLine[];
  payments: StockReceiptPayment[];
};
