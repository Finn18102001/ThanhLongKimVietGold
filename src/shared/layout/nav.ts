import {
  ChartBar,
  FolderSimple,
  GearSix,
  HandCoins,
  House,
  IdentificationBadge,
  Package,
  Receipt,
  Scroll,
  Storefront,
  Tag,
  Truck,
  Users,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import { canAccessPath, type StaffRole } from "@/shared/auth/permissions";
import { ROUTES } from "@/shared/navigation/routes";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
};

export const MAIN_NAV: NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: House },
  { href: ROUTES.pos, label: "Bán hàng tại quầy (POS)", icon: Storefront },
  { href: ROUTES.purchase, label: "Mua vào", icon: HandCoins },
  { href: ROUTES.inventory, label: "Kho hàng", icon: Package },
  { href: ROUTES.customers, label: "Khách hàng", icon: Users },
  { href: ROUTES.invoices, label: "Hóa đơn", icon: Receipt },
  { href: ROUTES.reports, label: "Báo cáo", icon: ChartBar },
];

export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.products, label: "Sản phẩm", icon: Tag },
  { href: ROUTES.categories, label: "Danh mục", icon: FolderSimple },
  { href: ROUTES.employees, label: "Nhân viên", icon: IdentificationBadge },
  { href: ROUTES.suppliers, label: "Nhà cung cấp", icon: Truck },
  { href: ROUTES.cashflow, label: "Quản lý dòng tiền", icon: Wallet },
  { href: ROUTES.settings, label: "Cài đặt", icon: GearSix },
  { href: ROUTES.audit, label: "Nhật ký hệ thống", icon: Scroll },
];

export function navForRole(role: StaffRole): { main: NavItem[]; admin: NavItem[] } {
  if (role === "ADMIN") {
    return { main: MAIN_NAV, admin: ADMIN_NAV };
  }

  return {
    main: MAIN_NAV.filter((item) => canAccessPath("STAFF", item.href)),
    admin: [],
  };
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === ROUTES.dashboard) {
    return pathname === ROUTES.dashboard;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
