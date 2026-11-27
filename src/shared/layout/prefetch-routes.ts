import { ROUTES } from "@/shared/navigation/routes";

/**
 * PERF-004 — sidebar Link stays `prefetch={false}`; only these light routes
 * get intentional `router.prefetch` on hover/focus. Heavy catalogs stay cold.
 */
const LIGHT_PREFETCH = new Set<string>([
  ROUTES.dashboard,
  ROUTES.customers,
  ROUTES.invoices,
  ROUTES.employees,
  ROUTES.suppliers,
  ROUTES.categories,
  ROUTES.products,
  ROUTES.form02,
  ROUTES.cashVouchers,
  ROUTES.workShifts,
  ROUTES.audit,
  ROUTES.settings,
  ROUTES.inventoryHistory,
  ROUTES.inventoryCount,
  ROUTES.inventoryOutbound,
]);

export function shouldPrefetchNavHref(href: string): boolean {
  const path = href.split("?")[0] || href;
  return LIGHT_PREFETCH.has(path);
}
