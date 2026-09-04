import type { Dong } from "@/shared/lib/money";

export type TrendDirection = "up" | "down" | "flat";

export type DashboardKpi = {
  id: "revenue" | "sold" | "stock" | "invoices" | "purchaseValue" | "purchaseQty" | "purchaseVouchers";
  label: string;
  valueLabel: string;
  trendPercent: number | null;
  trendDirection: TrendDirection;
  hint: string;
};

export type RevenuePoint = {
  isoDate: string;
  label: string;
  amountDong: Dong;
  purchaseDong: Dong;
  isCurrent: boolean;
};

export type BestSeller = {
  rank: number;
  name: string;
  quantitySold: number;
  revenueDong: Dong;
};

export type StockAlert = {
  productName: string;
  sku: string;
  quantity: number;
  level: "low";
};

export type InvoiceStatus = "COMPLETED";

export type RecentInvoice = {
  id: string;
  customerName: string;
  totalDong: Dong;
  paymentMethod: string;
  issuedAt: string;
  staffName: string;
  status: InvoiceStatus;
};

export type PurchaseTodayStats = {
  totalDong: Dong;
  quantity: number;
  voucherCount: number;
};

export type DashboardSnapshot = {
  isPreview: boolean;
  businessDate: string;
  kpis: DashboardKpi[];
  purchaseToday: PurchaseTodayStats;
  revenueSeries: RevenuePoint[];
  bestSellers: BestSeller[];
  stockAlerts: StockAlert[];
  recentInvoices: RecentInvoice[];
};
