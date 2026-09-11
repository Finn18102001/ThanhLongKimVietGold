"use client";

import { Eye, Printer, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { DepositDocKind } from "../types";

export function DepositDocToolbar({
  kind,
  onPreview,
  onPrint,
  extra,
}: {
  kind: DepositDocKind;
  onPreview: () => void;
  onPrint: () => void;
  extra?: ReactNode;
}) {
  const title =
    kind === "AGREEMENT"
      ? "Thỏa thuận đặt cọc"
      : kind === "SLIP"
        ? "Phiếu đặt cọc"
        : "Biên bản giao nhận";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] font-semibold">{title}</p>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold hover:bg-[var(--tlkv-bg)]"
        >
          <Eye size={14} />
          Check / Xem trước
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
        >
          <Printer size={14} />
          In
        </button>
      </div>
    </div>
  );
}

/** On-screen check only — never participates in print layout. */
export function DepositPreviewModal({
  title,
  children,
  onClose,
  onPrint,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="flex max-h-[92vh] w-full max-w-[210mm] flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_24px_60px_rgb(31_41_55/0.2)]">
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-2.5">
          <p className="text-[14px] font-semibold">{title}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
            >
              <Printer size={14} />
              In
            </button>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--tlkv-bg)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
