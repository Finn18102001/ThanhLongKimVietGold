/**
 * Application navigation contract.
 * Modules navigate with these paths. Do not import another module's internals.
 */
export const ROUTES = {
  dashboard: "/",
  pos: "/pos",
  purchase: "/purchase",
  inventory: "/inventory",
  inventoryOrder: "/inventory/order",
  inventoryPurchase: "/inventory/receive",
  inventoryReceive: "/inventory/receive",
  inventoryOutbound: "/inventory/outbound",
  inventoryReturn: "/inventory/return",
  inventoryAdjust: "/inventory/adjust",
  inventoryCount: "/inventory/count",
  inventoryHistory: "/inventory/history",
  customers: "/customers",
  customerCreate: "/customers?action=create",
  invoices: "/invoices",
  invoiceCreate: "/invoices?action=create",
  returns: "/returns",
  cashflow: "/cashflow",
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
