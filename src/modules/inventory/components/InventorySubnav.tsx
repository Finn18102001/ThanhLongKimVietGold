"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/shared/navigation/routes";

const ITEMS = [
  { href: ROUTES.inventory, label: "Tồn kho hiện tại", exact: true },
  { href: ROUTES.inventoryReceive, label: "Nhập hàng" },
  { href: ROUTES.inventoryOutbound, label: "Xuất hàng" },
  { href: ROUTES.inventoryAdjust, label: "Điều chỉnh kho" },
  { href: ROUTES.inventoryCount, label: "Kiểm kê kho" },
  { href: ROUTES.inventoryHistory, label: "Lịch sử biến động" },
] as const;

export function InventorySubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-[12px] bg-white p-1.5 shadow-[var(--tlkv-shadow)]">
      {ITEMS.map((item) => {
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
