"use client";

import { Receipt, ShoppingCart, TrendUp, UsersThree } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import type { CustomerDirectoryStats } from "../types";

const KPI_CONFIG = [
  {
    id: "customers",
    label: "Tổng khách hàng",
    icon: UsersThree,
    tone: "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]",
    value: (stats: CustomerDirectoryStats) => stats.totalCustomers.toLocaleString("vi-VN"),
    hint: (stats: CustomerDirectoryStats) =>
      stats.newCustomers30d > 0
        ? `+${stats.newCustomers30d.toLocaleString("vi-VN")} khách mới (30 ngày)`
        : "Không có khách mới trong 30 ngày",
  },
  {
    id: "spending",
    label: "Tổng chi tiêu",
    icon: ShoppingCart,
    tone: "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]",
    value: (stats: CustomerDirectoryStats) => formatDong(stats.totalSpendingDong),
    hint: () => "Chỉ tính đơn đã hoàn tất",
  },
  {
    id: "orders",
    label: "Số đơn hàng",
    icon: Receipt,
    tone: "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]",
    value: (stats: CustomerDirectoryStats) => stats.totalOrders.toLocaleString("vi-VN"),
    hint: () => "Đơn hoàn tất trên quầy",
  },
  {
    id: "avg",
    label: "Chi tiêu trung bình",
    icon: TrendUp,
    tone: "bg-[var(--tlkv-violet-soft)] text-[var(--tlkv-violet)]",
    value: (stats: CustomerDirectoryStats) => formatDong(stats.avgOrderDong),
    hint: () => "Trung bình mỗi đơn hoàn tất",
  },
] as const;

export function CustomerKpiRow({ stats }: { stats: CustomerDirectoryStats }) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {KPI_CONFIG.map((item) => {
        const Icon = item.icon;
        return (
          <article
            key={item.id}
            className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-4 shadow-[var(--tlkv-shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] text-[var(--tlkv-muted)]">{item.label}</p>
                <p className="mt-2 truncate text-[20px] leading-none font-bold tracking-tight">
                  {item.value(stats)}
                </p>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}
              >
                <Icon size={20} weight="bold" />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--tlkv-faint)]">{item.hint(stats)}</p>
          </article>
        );
      })}
    </section>
  );
}
