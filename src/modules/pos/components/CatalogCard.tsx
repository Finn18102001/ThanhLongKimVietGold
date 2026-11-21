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
  const isGroup = Boolean(item.marketGroupClass);
  const disabled = !isGroup && item.unitPriceDong === null;
  const outOfStock = item.quantity <= 0;
  const msp = (item.msp ?? "").trim();
  const weightLabel = isGroup
    ? "theo từng món"
    : item.weightChi > 0
      ? `${item.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`
      : "1 cái";
  const measureLabel = isGroup ? "KL" : item.weightChi > 0 ? "KL" : "SL";
  const priceLabel =
    item.unitPriceDong === null
      ? "Chưa có giá"
      : item.weightChi > 0
        ? `${formatDong(Math.round((item.goldUnitDong ?? item.unitPriceDong) / item.weightChi))}/chỉ`
        : formatDong(item.unitPriceDong);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(item)}
      className="h-auto w-full self-start rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3 text-left shadow-[var(--tlkv-shadow)] transition-transform disabled:opacity-50 enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--tlkv-red-bar)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)]">
            SKU: {item.sku}
          </p>
          {msp ? (
            <p className="mt-0.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)]">
              MSP: {msp}
            </p>
          ) : null}
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {item.isMarketGold ? (
            <span className="rounded-md bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
              Thị trường
            </span>
          ) : null}
          {outOfStock ? (
            <span className="rounded-md bg-[var(--tlkv-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
              Hết hàng
            </span>
          ) : null}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-[40px] text-[13.5px] font-semibold">{item.name}</p>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        {item.brandName || (item.isMarketGold ? "Vàng thị trường" : "Không thương hiệu")}
      </p>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        {measureLabel}: {weightLabel}
      </p>
      <p className="mt-2 text-[14px] font-bold text-[var(--tlkv-red)]">{priceLabel}</p>
      <p
        className={`mt-1 text-[12px] font-medium ${
          outOfStock ? "text-[var(--tlkv-amber)]" : "text-[var(--tlkv-green)]"
        }`}
      >
        SL tồn: {item.quantity}
        {isGroup ? " · Bấm để chọn món" : outOfStock ? " · Đặt hàng" : ""}
      </p>
    </button>
  );
}
