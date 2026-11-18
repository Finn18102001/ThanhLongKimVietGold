"use client";

import type { ReceiveMetalKind } from "../priceLink";

/**
 * Reading this as: POS admin receive metal switch for TLKV staff,
 * matching existing --tlkv-* tab buttons (not a marketing landing).
 */
export function ReceiveMetalTabs({
  value,
  onChange,
}: {
  value: ReceiveMetalKind;
  onChange: (next: ReceiveMetalKind) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:max-w-md">
      {(
        [
          { value: "gold" as const, label: "Nhập vàng" },
          { value: "silver" as const, label: "Nhập bạc" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-9 rounded-lg text-[12px] font-semibold active:scale-[0.98] ${
            value === option.value
              ? "bg-[var(--tlkv-red)] text-white"
              : "border border-[var(--tlkv-line)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
