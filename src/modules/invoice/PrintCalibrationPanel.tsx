"use client";

import { useEffect, useState } from "react";
import { Crosshair, FloppyDisk, Printer } from "@phosphor-icons/react";
import { loadPrinterProfile, savePrinterProfile } from "./print-storage";
import {
  DEFAULT_PRINTER_PROFILE,
  GOLD_CERTIFICATE,
  type PrinterProfile,
} from "./print-template";

type Props = {
  profile: PrinterProfile;
  onChange: (next: PrinterProfile) => void;
  onTestPrint: () => void;
};

export function PrintCalibrationPanel({ profile, onChange, onTestPrint }: Props) {
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    onChange(loadPrinterProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  function persist() {
    savePrinterProfile(profile);
    setSavedMsg("Đã lưu offset máy in trên trình duyệt này.");
    window.setTimeout(() => setSavedMsg(null), 2500);
  }

  function reset() {
    onChange({ ...DEFAULT_PRINTER_PROFILE });
    savePrinterProfile(DEFAULT_PRINTER_PROFILE);
    setSavedMsg("Đã đặt lại offset về 0.");
    window.setTimeout(() => setSavedMsg(null), 2500);
  }

  return (
    <section className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-4 shadow-[var(--tlkv-shadow)] print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-[14px] font-semibold">
            <Crosshair size={16} />
            Căn chỉnh in phôi ({GOLD_CERTIFICATE.widthMm} × {GOLD_CERTIFICATE.heightMm} mm)
          </h2>
          <p className="mt-1 max-w-[65ch] text-[12px] text-[var(--tlkv-muted)]">
            Chỉ admin. Khi in thật, website chỉ in dữ liệu động (không in logo/khung phôi). Offset
            X/Y dùng chung cho mọi field. Scale mặc định 100% - không dùng Fit to Page trên máy in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTestPrint}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-medium"
          >
            <Printer size={14} />
            In test
          </button>
          <button
            type="button"
            onClick={persist}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
          >
            <FloppyDisk size={14} />
            Lưu
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
          >
            Đặt lại
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--tlkv-muted)]">Offset X (mm)</span>
          <input
            type="number"
            step="0.1"
            value={profile.offsetX}
            onChange={(e) =>
              onChange({ ...profile, offsetX: Number(e.target.value) || 0 })
            }
            className="h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2 tabular-nums"
          />
        </label>
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--tlkv-muted)]">Offset Y (mm)</span>
          <input
            type="number"
            step="0.1"
            value={profile.offsetY}
            onChange={(e) =>
              onChange({ ...profile, offsetY: Number(e.target.value) || 0 })
            }
            className="h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2 tabular-nums"
          />
        </label>
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--tlkv-muted)]">Scale</span>
          <input
            type="number"
            step="0.001"
            min="0.9"
            max="1.1"
            value={profile.scale}
            onChange={(e) =>
              onChange({
                ...profile,
                scale: Math.min(1.1, Math.max(0.9, Number(e.target.value) || 1)),
              })
            }
            className="h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2 tabular-nums"
          />
        </label>
        <label className="block text-[12px]">
          <span className="mb-1 block text-[var(--tlkv-muted)]">Tên máy in</span>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            className="h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2"
            placeholder="HP Printer A"
          />
        </label>
      </div>

      {savedMsg ? (
        <p className="mt-2 text-[12px] text-[var(--tlkv-green)]">{savedMsg}</p>
      ) : (
        <p className="mt-2 text-[11px] text-[var(--tlkv-muted)]">
          Công thức: X_final = X_field + OffsetX, Y_final = Y_field + OffsetY. In test dùng dữ liệu
          mẫu và 4 điểm P1–P4 để đo lệch.
        </p>
      )}
    </section>
  );
}
