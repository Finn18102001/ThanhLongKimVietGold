"use client";

import type { ReactNode } from "react";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";

export type ResultAlertModel = {
  tone: "success" | "error";
  title: string;
  reason: string;
  detail?: string;
};

export function ResultAlert({
  alert,
  children,
  onClose,
}: {
  alert: ResultAlertModel;
  children?: ReactNode;
  onClose: () => void;
}) {
  const success = alert.tone === "success";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="result-alert-title"
        className="w-full max-w-md overflow-hidden rounded-[12px] bg-white shadow-[0_24px_60px_rgb(31_41_55/0.18)]"
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          {success ? (
            <CheckCircle size={28} weight="fill" className="shrink-0 text-[var(--tlkv-green)]" />
          ) : (
            <WarningCircle size={28} weight="fill" className="shrink-0 text-[var(--tlkv-red)]" />
          )}
          <div className="min-w-0 flex-1">
            <h2 id="result-alert-title" className="text-[16px] font-semibold">
              {alert.title}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed">{alert.reason}</p>
            {alert.detail ? (
              <p className="mt-2 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
                {alert.detail}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          {children ?? (
            <button
              type="button"
              onClick={onClose}
              className={`h-10 rounded-lg px-4 text-[13px] font-semibold text-white ${
                success ? "bg-[var(--tlkv-green)]" : "bg-[var(--tlkv-red)]"
              }`}
            >
              Đã hiểu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
