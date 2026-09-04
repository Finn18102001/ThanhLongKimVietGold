import { ROUTES } from "@/shared/navigation/routes";

export type StaffRole = "ADMIN" | "STAFF";

/** Routes hidden for every role until the feature is released. */
export const HIDDEN_RELEASE_HREFS = new Set<string>([ROUTES.returns]);

/** Spec §26 — routes STAFF may open. Everything else is admin-only. */
export const STAFF_ALLOWED_HREFS = new Set<string>([
  ROUTES.pos,
  ROUTES.purchase,
  ROUTES.inventory,
  ROUTES.inventoryPurchase,
  ROUTES.inventoryReceive,
  ROUTES.inventoryOutbound,
  ROUTES.inventoryHistory,
  ROUTES.customers,
  ROUTES.invoices,
]);

/** Spec §26 — ADMIN sees all main + quản trị items. */
export const ADMIN_ONLY_HREFS = new Set<string>([
  ROUTES.dashboard,
  ROUTES.cashflow,
  ROUTES.reports,
  ROUTES.reportsRevenue,
  ROUTES.products,
  ROUTES.categories,
  ROUTES.employees,
  ROUTES.suppliers,
  ROUTES.settings,
  ROUTES.audit,
  ROUTES.inventoryAdjust,
  ROUTES.inventoryCount,
]);

export function roleHomePath(role: StaffRole): string {
  return role === "ADMIN" ? ROUTES.dashboard : ROUTES.pos;
}

function isHiddenReleasePath(pathname: string): boolean {
  for (const href of HIDDEN_RELEASE_HREFS) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return true;
    }
  }
  return false;
}

export function canAccessPath(role: StaffRole, pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";

  if (isHiddenReleasePath(path)) {
    return false;
  }

  if (role === "ADMIN") return true;

  if (path === ROUTES.dashboard || path === "/") {
    return false;
  }

  for (const href of STAFF_ALLOWED_HREFS) {
    if (path === href || path.startsWith(`${href}/`)) {
      return true;
    }
  }

  return false;
}

export function roleLabel(role: StaffRole): string {
  return role === "ADMIN" ? "Quản trị" : "Nhân viên";
}
