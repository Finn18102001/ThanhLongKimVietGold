"use client";

import Image from "next/image";
import { formatDong } from "@/shared/lib/money";
import type { PurchaseCatalogItem } from "../types";

/** Minimal thumb — same visual language as POS CatalogCard. */
export function PurchaseProductThumb({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null | undefined;
}) {
  if (!imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f8f1e7] text-[11px] font-semibold text-[var(--tlkv-muted)]">
        {name.slice(0, 1)}
      </div>
    );
  }
  return (
    <span className="relative block h-full w-full">
      <Image src={imageUrl} alt={name} fill unoptimized sizes="200px" className="object-cover" />
    </span>
  );
}

export function PurchaseCatalogCard({
  item,
  onPick,
}: {
  item: PurchaseCatalogItem;
  onPick: (item: PurchaseCatalogItem) => void;
}) {
  const disabled = item.referenceSellDongPerChi <= 0 && item.suggestedBuyDongPerChi <= 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(item)}
      className="overflow-hidden rounded-[12px] border border-[var(--tlkv-line)] bg-white text-left shadow-[var(--tlkv-shadow)] transition-transform disabled:opacity-50 enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--tlkv-red)]"
    >
      <div className="relative aspect-square bg-[#f8f1e7]">
        <PurchaseProductThumb name={item.name} imageUrl={item.imageUrl} />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[40px] text-[13.5px] font-semibold">{item.name}</p>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{item.sku}</p>
        <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">
          Niêm yết:{" "}
          <span className="font-semibold text-[var(--tlkv-text)]">
            {item.referenceSellDongPerChi > 0
              ? `${formatDong(item.referenceSellDongPerChi)}/chỉ`
              : "Chưa có"}
          </span>
        </p>
        <p className="mt-1 text-[14px] font-bold text-[var(--tlkv-red)]">
          {item.suggestedBuyDongPerChi > 0
            ? `Mua gợi ý ${formatDong(item.suggestedBuyDongPerChi)}/chỉ`
            : "Chưa có giá mua"}
        </p>
        {item.weightChi > 0 ? (
          <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
            TL mặc định: {item.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ
          </p>
        ) : null}
      </div>
    </button>
  );
}
