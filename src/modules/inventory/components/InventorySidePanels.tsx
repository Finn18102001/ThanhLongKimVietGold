"use client";

import Link from "next/link";
import {
  ClipboardText,
  Package,
  Sliders,
  Storefront,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { ROUTES } from "@/shared/navigation/routes";
import { ledgerTone, ledgerTypeLabel } from "../labels";
import type { LedgerRow } from "../types";

export function InventorySidePanels({ ledger }: { ledger: LedgerRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Hoạt động kho gần đây</h2>
        <ul className="mt-4 space-y-3">
          {ledger.length === 0 ? (
            <li className="text-[13px] text-[var(--tlkv-muted)]">Chưa có biến động.</li>
          ) : (
            ledger.slice(0, 6).map((row) => (
              <li key={row.id} className="border-b border-[var(--tlkv-line)] pb-3 last:border-b-0 last:pb-0">
                <p className={`text-[13px] font-semibold ${ledgerTone(row)}`}>
                  {ledgerTypeLabel(row.type)}
                </p>
                <p className="mt-0.5 text-[13px]">
                  {row.name} · SL {row.quantity > 0 ? "+" : ""}
                  {row.quantity}
                </p>
                <p className="text-[12px] text-[var(--tlkv-muted)]">
                  {row.beforeQuantity} → {row.afterQuantity} · {row.actorEmail}
                </p>
                <p className="text-[11px] text-[var(--tlkv-faint)]">
                  {formatViDateTime(row.createdAt)}
                </p>
              </li>
            ))
          )}
        </ul>
      </article>
      <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Thao tác nhanh</h2>
        <div className="mt-3 flex flex-col gap-2">
          <QuickLink href={ROUTES.inventoryReceive} label="Nhập hàng" className="bg-[var(--tlkv-green)]" icon={Package} />
          <QuickLink href={ROUTES.pos} label="Xuất bán (POS)" className="bg-[var(--tlkv-blue)]" icon={Storefront} />
          <QuickLink href={ROUTES.inventoryAdjust} label="Điều chỉnh kho" className="bg-[var(--tlkv-amber)]" icon={Sliders} />
          <QuickLink href={ROUTES.inventoryCount} label="Kiểm kê kho" className="bg-[var(--tlkv-violet)]" icon={ClipboardText} />
          <QuickLink href={ROUTES.inventoryHistory} label="Lịch sử biến động" className="bg-[var(--tlkv-slate)]" icon={ClockCounterClockwise} />
        </div>
      </article>
    </div>
  );
}

function QuickLink({
  href,
  label,
  className,
  icon: Icon,
}: {
  href: string;
  label: string;
  className: string;
  icon: typeof Package;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white ${className}`}
    >
      <Icon size={16} weight="bold" />
      {label}
    </Link>
  );
}
