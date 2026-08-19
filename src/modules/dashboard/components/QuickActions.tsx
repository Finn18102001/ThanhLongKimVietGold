"use client";

import Link from "next/link";
import {
  ChartLine,
  Package,
  Sliders,
  Storefront,
  UserPlus,
} from "@phosphor-icons/react";
import { ROUTES } from "@/shared/navigation/routes";

const ACTIONS = [
  {
    href: ROUTES.pos,
    label: "Bán hàng (POS)",
    icon: Storefront,
    className: "bg-[var(--tlkv-red)] text-white hover:bg-[var(--tlkv-red-hover)]",
  },
  {
    href: ROUTES.inventoryPurchase,
    label: "Nhập hàng",
    icon: Package,
    className: "bg-[var(--tlkv-green)] text-white hover:opacity-90",
  },
  {
    href: ROUTES.customerCreate,
    label: "Thêm khách hàng",
    icon: UserPlus,
    className: "bg-[var(--tlkv-blue)] text-white hover:opacity-90",
  },
  {
    href: ROUTES.inventoryAdjust,
    label: "Điều chỉnh kho",
    icon: Sliders,
    className: "bg-[var(--tlkv-amber)] text-white hover:opacity-90",
  },
  {
    href: ROUTES.reportsRevenue,
    label: "Báo cáo doanh thu",
    icon: ChartLine,
    className: "bg-[var(--tlkv-slate)] text-white hover:opacity-90",
  },
] as const;

export function QuickActions() {
  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="mb-4 text-[15px] font-semibold">Thao tác nhanh</h2>
      <div className="flex flex-col gap-2.5">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-[13.5px] font-semibold transition-transform active:scale-[0.99] ${action.className}`}
            >
              <Icon size={18} weight="bold" />
              {action.label}
            </Link>
          );
        })}
      </div>
    </article>
  );
}
