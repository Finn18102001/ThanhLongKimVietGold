"use client";

import { Cube, Package, Warning, Wallet } from "@phosphor-icons/react";

export function InventoryKpis({
  skuCount,
  totalQty,
  valueLabel,
  lowStock,
  lowStockHint,
}: {
  skuCount: string;
  totalQty: string;
  valueLabel: string;
  lowStock: string;
  lowStockHint: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Cube} label="Tổng mã hàng" value={skuCount} tone="bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]" />
      <Kpi icon={Package} label="Tổng tồn kho" value={totalQty} tone="bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]" />
      <Kpi icon={Wallet} label="Giá trị tồn (bảng giá hiện tại)" value={valueLabel} tone="bg-[var(--tlkv-violet-soft)] text-[var(--tlkv-violet)]" />
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
    <article className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-[var(--tlkv-muted)]">{label}</p>
          <p className="mt-2 text-[20px] leading-none font-bold tracking-tight">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
    </article>
  );
}
