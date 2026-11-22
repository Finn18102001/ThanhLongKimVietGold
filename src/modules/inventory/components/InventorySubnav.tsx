"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/shared/navigation/routes";

const ALL_ITEMS = [
  { href: ROUTES.inventory, label: "Tồn kho hiện tại", exact: true },
  { href: ROUTES.inventoryOrder, label: "Đặt hàng cho kho", staffHide: true },
  { href: ROUTES.inventoryReceive, label: "Nhập hàng", staffHide: true },
  { href: ROUTES.inventoryOutbound, label: "Xuất hàng", staffHide: true },
  { href: ROUTES.inventoryAdjust, label: "Điều chỉnh kho", staffHide: true },
  { href: ROUTES.inventoryCount, label: "Kiểm kê kho" },
  { href: ROUTES.inventoryHistory, label: "Lịch sử biến động" },
] as const;

/** P10: NV Quỹ tiền/vàng chỉ xem tồn / kiểm kê / lịch sử — không tab kho vận hành. */
export function InventorySubnav({
  fundStaffRestricted = false,
}: {
  fundStaffRestricted?: boolean;
}) {
  const pathname = usePathname();
  const items = fundStaffRestricted
    ? ALL_ITEMS.filter((item) => !("staffHide" in item && item.staffHide))
    : ALL_ITEMS;

  return (
    <nav className="flex flex-wrap gap-1 rounded-[12px] bg-white p-1.5 shadow-[var(--tlkv-shadow)]">
      {items.map((item) => {
        const exact = "exact" in item && item.exact;
        const active = exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
              active
                ? "bg-[var(--tlkv-red-soft)] font-semibold text-[var(--tlkv-red)]"
                : "text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
