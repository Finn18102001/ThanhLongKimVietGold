import {
  ArrowUUpLeft,
  ChartBar,
  FolderSimple,
  GearSix,
  House,
  IdentificationBadge,
  Package,
  Receipt,
  Scroll,
  Storefront,
  Tag,
  Truck,
  Users,
  type Icon,
} from "@phosphor-icons/react";
import { ROUTES } from "@/shared/navigation/routes";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
};

export const MAIN_NAV: NavItem[] = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: House },
  { href: ROUTES.pos, label: "Bán hàng tại quầy (POS)", icon: Storefront },
  { href: ROUTES.inventory, label: "Kho hàng", icon: Package },
  { href: ROUTES.customers, label: "Khách hàng", icon: Users },
  { href: ROUTES.invoices, label: "Hóa đơn", icon: Receipt },
  { href: ROUTES.returns, label: "Trả hàng", icon: ArrowUUpLeft },
  { href: ROUTES.reports, label: "Báo cáo", icon: ChartBar },
];

export const ADMIN_NAV: NavItem[] = [
  { href: ROUTES.products, label: "Sản phẩm", icon: Tag },
  { href: ROUTES.categories, label: "Danh mục", icon: FolderSimple },
  { href: ROUTES.employees, label: "Nhân viên", icon: IdentificationBadge },
  { href: ROUTES.suppliers, label: "Nhà cung cấp", icon: Truck },
  { href: ROUTES.settings, label: "Cài đặt", icon: GearSix },
  { href: ROUTES.audit, label: "Nhật ký hệ thống", icon: Scroll },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === ROUTES.dashboard) {
    return pathname === ROUTES.dashboard;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
