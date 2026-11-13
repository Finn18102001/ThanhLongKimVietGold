"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag } from "@phosphor-icons/react";
import { labelPrefillHref } from "@/modules/label-print/prefill";
import { formatChi } from "../labels";
import type { BuyDetail, BuyDetailItem } from "../types";

function hrefFor(buy: BuyDetail, item: BuyDetailItem): string | null {
  if (!item.skuId) return null;
  return labelPrefillHref({
    skuId: item.skuId,
    sourceNo: buy.buyNo,
    goldAge: item.goldAge,
    klvChi: item.weightChi,
    kldChi: item.stoneWeightChi,
    stoneQuantity: item.stoneQuantity,
    stoneUnitPriceDong: item.stoneUnitPriceDong,
    note: buy.note,
  });
}

/** Opens the existing label flow prefilled from a completed buy. Print only: no new buy, no stock change. */
export function BuyLabelPrintButton({ buy }: { buy: BuyDetail }) {
  const [open, setOpen] = useState(false);
  const items = buy.items.filter((item) => item.skuId);
  const enabled = buy.status === "COMPLETED" && items.length > 0;
  const className =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium";

  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        title="Chỉ in tem khi phiếu mua đã hoàn tất nhập kho"
        className={`${className} opacity-40`}
      >
        <Tag size={14} />
        In tem
      </button>
    );
  }

  if (items.length === 1) {
    return (
      <Link href={hrefFor(buy, items[0]) ?? "/label-print"} className={`${className} hover:bg-[var(--tlkv-bg)]`}>
        <Tag size={14} />
        In tem
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${className} hover:bg-[var(--tlkv-bg)]`}
      >
        <Tag size={14} />
        In tem
      </button>
      {open ? (
        <ul className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-[var(--tlkv-line)] bg-white p-1 shadow-[var(--tlkv-shadow)]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={hrefFor(buy, item) ?? "/label-print"}
                className="block rounded-md px-2.5 py-2 text-[12px] hover:bg-[var(--tlkv-bg)]"
              >
                <span className="block font-medium">{item.productName}</span>
                <span className="text-[var(--tlkv-muted)]">
                  {formatChi(item.weightChi)}
                  {item.stoneWeightChi > 0 ? ` · đá ${formatChi(item.stoneWeightChi)}` : ""} · SL {item.quantity}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
