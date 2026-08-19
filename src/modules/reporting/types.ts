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
    revenueDong: number;
  }>;
};
