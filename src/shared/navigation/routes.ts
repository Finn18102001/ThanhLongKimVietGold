/**
 * Application navigation contract.
 * Modules navigate with these paths. Do not import another module's internals.
 */
export const ROUTES = {
  dashboard: "/",
  pos: "/pos",
  purchase: "/purchase",
  inventory: "/inventory",
  inventoryPurchase: "/inventory/receive",
  inventoryReceive: "/inventory/receive",
  inventoryOutbound: "/inventory/outbound",
  inventoryAdjust: "/inventory/adjust",
  inventoryCount: "/inventory/count",
  inventoryHistory: "/inventory/history",
  customers: "/customers",
  customerCreate: "/customers?action=create",
  invoices: "/invoices",
  invoiceCreate: "/invoices?action=create",
  returns: "/returns",
  reports: "/reports",
  reportsRevenue: "/reports?view=revenue",
  products: "/products",
  categories: "/categories",
  employees: "/employees",
  suppliers: "/suppliers",
  settings: "/settings",
  audit: "/audit",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export function invoiceDetailPath(invoiceNo: string): string {
  return `/invoices/${encodeURIComponent(invoiceNo)}`;
}
