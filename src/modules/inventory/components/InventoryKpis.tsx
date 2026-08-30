"use client";

import { Cube, Package, Scales, Warning, Wallet } from "@phosphor-icons/react";

export function InventoryKpis({
  skuCount,
  totalQty,
  totalWeight,
  valueLabel,
  lowStock,
  lowStockHint,
}: {
  skuCount: string;
  totalQty: string;
  totalWeight: string;
  valueLabel: string;
  lowStock: string;
  lowStockHint: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi icon={Cube} label="Tổng mã hàng" value={skuCount} tone="bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]" />
      <Kpi icon={Package} label="Tổng số lượng" value={totalQty} tone="bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]" />
      <Kpi icon={Scales} label="Tổng trọng lượng" value={totalWeight} tone="bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]" />
      <Kpi icon={Wallet} label="Giá trị tồn (bảng giá hiện tại)" value={valueLabel} tone="bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]" />
      <Kpi icon={Warning} label={lowStockHint} value={lowStock} tone="bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]" />
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
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
