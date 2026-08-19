"use client";

import {
  Cube,
  Package,
  Receipt,
  TrendUp,
  Wallet,
} from "@phosphor-icons/react";
import type { DashboardKpi } from "../types";

const ICON_BY_ID = {
  revenue: Wallet,
  sold: Cube,
  stock: Package,
  invoices: Receipt,
} as const;

const TONE_BY_ID = {
  revenue: "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]",
  sold: "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]",
  stock: "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]",
  invoices: "bg-[var(--tlkv-violet-soft)] text-[var(--tlkv-violet)]",
} as const;

export function KpiRow({ items }: { items: DashboardKpi[] }) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = ICON_BY_ID[item.id];
        return (
          <article
            key={item.id}
            className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] text-[var(--tlkv-muted)]">{item.label}</p>
                <p className="mt-2 text-[22px] leading-none font-bold tracking-tight">
                  {item.valueLabel}
                </p>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONE_BY_ID[item.id]}`}
              >
                <Icon size={20} weight="bold" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-[12px]">
              {item.trendDirection === "up" && item.trendPercent !== null ? (
                <>
                  <TrendUp size={14} className="text-[var(--tlkv-green)]" weight="bold" />
                  <span className="font-semibold text-[var(--tlkv-green)]">
                    +{item.trendPercent}%
                  </span>
                  <span className="text-[var(--tlkv-faint)]">{item.hint}</span>
                </>
              ) : (
                <span className="text-[var(--tlkv-muted)]">Không đổi</span>
              )}
            </p>
          </article>
        );
      })}
    </section>
  );
}
