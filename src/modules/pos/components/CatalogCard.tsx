"use client";

import Image from "next/image";
import { formatDong } from "@/shared/lib/money";
import type { PosCatalogItem } from "../types";

export function ProductThumb({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
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
      <Image
        src={imageUrl}
        alt={name}
        fill
        unoptimized
        sizes="200px"
        className="object-cover"
      />
    </span>
  );
}

export function CatalogCard({
  item,
  onAdd,
}: {
  item: PosCatalogItem;
  onAdd: (item: PosCatalogItem) => void;
}) {
  const disabled = item.quantity <= 0 || item.unitPriceDong === null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(item)}
      className="overflow-hidden rounded-[12px] border border-[var(--tlkv-line)] bg-white text-left shadow-[var(--tlkv-shadow)] transition-transform disabled:opacity-50 enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--tlkv-red-bar)]"
    >
      <div className="relative aspect-square bg-[#f8f1e7]">
        <ProductThumb name={item.name} imageUrl={item.imageUrl} size={320} />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[40px] text-[13.5px] font-semibold">{item.name}</p>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{item.sku}</p>
        <p className="mt-2 text-[14px] font-bold text-[var(--tlkv-red)]">
          {item.unitPriceDong === null ? "Chưa có giá" : formatDong(item.unitPriceDong)}
        </p>
        <p className="mt-1 text-[12px] font-medium text-[var(--tlkv-green)]">
          SL tồn: {item.quantity}
        </p>
      </div>
    </button>
  );
}
