export type ReportingSnapshot = {
  from: string;
  to: string;
  totalRevenueDong: number;
  invoiceCount: number;
  avgInvoiceDong: number;
  returnsTotalDong: number;
  netRevenueDong: number;
  daily: Array<{ date: string; revenueDong: number; invoiceCount: number }>;
  topProducts: Array<{
    sku: string;
    name: string;
    quantitySold: number;
    weightChiSold: number;
    revenueDong: number;
  }>;
};

export type StaffSalesRow = {
  actorEmail: string;
  invoiceCount: number;
  grossDong: number;
  collectedDong: number;
  remainingDong: number;
};

export type TransactionExportRow = {
  type: "SELL" | "BUY";
  code: string;
  invoiceNo: string | null;
  customerName: string;
  customerPhone: string;
  totalDong: number;
  paidDong: number;
  remainingDong: number;
  paymentStatus: string;
  paymentMethod: string | null;
  dueDate: string | null;
  actorEmail: string;
  completedAt: string;
};
