"use client";

import Image from "next/image";
import { formatDong } from "@/shared/lib/money";
import type { PosCatalogItem } from "../types";

/** Used in cart / checkout / recent strip — not in catalog list cards. */
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
  const disabled = item.unitPriceDong === null;
  const outOfStock = item.quantity <= 0;
  const weightLabel =
    item.weightChi > 0
      ? `${item.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`
      : "—";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(item)}
      className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3 text-left shadow-[var(--tlkv-shadow)] transition-transform disabled:opacity-50 enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--tlkv-red-bar)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)]">
          {item.sku}
        </p>
        {outOfStock ? (
          <span className="shrink-0 rounded-md bg-[var(--tlkv-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
            Hết hàng
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-[40px] text-[13.5px] font-semibold">{item.name}</p>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        {item.brandName || "Không thương hiệu"}
      </p>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">KL: {weightLabel}</p>
      <p className="mt-2 text-[14px] font-bold text-[var(--tlkv-red)]">
        {item.unitPriceDong === null ? "Chưa có giá" : formatDong(item.unitPriceDong)}
      </p>
      <p
        className={`mt-1 text-[12px] font-medium ${
          outOfStock ? "text-[var(--tlkv-amber)]" : "text-[var(--tlkv-green)]"
        }`}
      >
        SL tồn: {item.quantity}
        {outOfStock ? " · Đặt hàng" : ""}
      </p>
    </button>
  );
}
