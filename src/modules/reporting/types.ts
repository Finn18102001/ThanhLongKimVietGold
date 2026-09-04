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

export type PurchaseReportFilters = {
  from: string;
  to: string;
  brandId?: string | null;
  skuId?: string | null;
  actorEmail?: string | null;
};

export type PurchaseReportOption = {
  id: string;
  label: string;
};

export type PurchaseReportSnapshot = {
  from: string;
  to: string;
  totalPurchaseDong: number;
  quantityPurchased: number;
  voucherCount: number;
  totalSellDong: number;
  quantitySold: number;
  daily: Array<{
    date: string;
    purchaseDong: number;
    sellDong: number;
    voucherCount: number;
  }>;
  topProducts: Array<{
    skuId: string;
    sku: string;
    name: string;
    quantity: number;
    totalDong: number;
  }>;
  topBrands: Array<{
    brandId: string | null;
    brandName: string;
    quantity: number;
    totalDong: number;
  }>;
  history: Array<{
    buyNo: string;
    completedAt: string;
    actorEmail: string;
    customerName: string;
    totalDong: number;
    quantity: number;
  }>;
  filterOptions: {
    brands: PurchaseReportOption[];
    products: PurchaseReportOption[];
    staff: PurchaseReportOption[];
  };
};
