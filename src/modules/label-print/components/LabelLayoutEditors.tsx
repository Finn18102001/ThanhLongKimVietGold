"use client";

import {
  OFFSET_RANGE,
  OFFSET_STEP_MM,
  type LabelZoneOffset,
} from "../offsets";

/** Offset ΔX/ΔY per zone — shared by In tem SKU + Tem trước nhập kho. */
export function OffsetZoneEditor({
  title,
  zone,
  onChange,
}: {
  title: string;
  zone: LabelZoneOffset;
  onChange: (axis: keyof LabelZoneOffset, value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] bg-white p-2.5">
      <p className="text-[12px] font-medium text-[var(--tlkv-text)]">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[var(--tlkv-muted)]">
          ΔX
          <input
            type="number"
            step={OFFSET_STEP_MM}
            min={OFFSET_RANGE.min}
            max={OFFSET_RANGE.max}
            value={zone.x === 0 ? "" : zone.x}
            placeholder="0"
            onChange={(e) =>
              onChange("x", e.target.value === "" ? 0 : Number(e.target.value))
            }
            className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <label className="text-[11px] text-[var(--tlkv-muted)]">
          ΔY
          <input
            type="number"
            step={OFFSET_STEP_MM}
            min={OFFSET_RANGE.min}
            max={OFFSET_RANGE.max}
            value={zone.y === 0 ? "" : zone.y}
            placeholder="0"
            onChange={(e) =>
              onChange("y", e.target.value === "" ? 0 : Number(e.target.value))
            }
            className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
      </div>
    </div>
  );
}

/** Font Δ pt per zone — shared by In tem SKU + Tem trước nhập kho. */
export function FontSizeEditor({
  title,
  value,
  min,
  max,
  step,
  onChange,
  onNudge,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] bg-white p-2.5">
      <p className="text-[12px] font-medium text-[var(--tlkv-text)]">{title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNudge(-step)}
          className="h-8 w-8 shrink-0 rounded-md border border-[var(--tlkv-line)] text-[14px] font-semibold hover:bg-[var(--tlkv-bg)] active:scale-[0.98]"
          aria-label={`Giảm cỡ chữ ${title}`}
        >
          −
        </button>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-center text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
        />
        <button
          type="button"
          onClick={() => onNudge(step)}
          className="h-8 w-8 shrink-0 rounded-md border border-[var(--tlkv-line)] text-[14px] font-semibold hover:bg-[var(--tlkv-bg)] active:scale-[0.98]"
          aria-label={`Tăng cỡ chữ ${title}`}
        >
          +
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] text-[var(--tlkv-muted)]">Δ pt</p>
    </div>
  );
}
