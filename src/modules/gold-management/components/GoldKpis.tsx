"use client";

import { ArrowDownLeft, ArrowUpRight, Scales, Stack } from "@phosphor-icons/react";

export function GoldKpis({
  receivableCount,
  receivableChi,
  payableCount,
  payableChi,
}: {
  receivableCount: string;
  receivableChi: string;
  payableCount: string;
  payableChi: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={ArrowDownLeft}
        label="Tổng giao dịch phải thu"
        value={receivableCount}
        tone="bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
      />
      <Kpi
        icon={Scales}
        label="Tổng số chỉ phải thu"
        value={receivableChi}
        tone="bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
      />
      <Kpi
        icon={ArrowUpRight}
        label="Tổng giao dịch phải trả"
        value={payableCount}
        tone="bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
      />
      <Kpi
        icon={Stack}
        label="Tổng số chỉ phải trả"
        value={payableChi}
        tone="bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
      />
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Stack;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className="rounded-[12px] border border-[var(--tlkv-line)]/60 bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] leading-snug text-[var(--tlkv-muted)]">{label}</p>
          <p className="mt-2 truncate text-[18px] leading-none font-bold tracking-tight">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={16} />
        </span>
      </div>
    </article>
  );
}
