"use client";

import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";

export function Modal({
  title,
  wide,
  children,
  footer,
  onClose,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_24px_60px_rgb(31_41_55/0.18)] ${
          wide ? "max-w-4xl" : "max-w-[560px]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--tlkv-line)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
