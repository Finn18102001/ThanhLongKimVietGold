"use client";

import { CtcvTransferDocument } from "@/modules/fund-gold/CtcvTransferDocument";
import { printCtcvTransferDocument } from "@/modules/fund-gold/print";
import type { GoldTransferRow } from "@/modules/fund-gold/types";

/** Xem chứng từ CTCV trước khi in. */
export function CtcvPrintPreviewOverlay({
  transfer,
  onClose,
}: {
  transfer: GoldTransferRow;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[80] overflow-auto bg-black/40 p-4 print:hidden">
        <div className="mx-auto max-w-[210mm] bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold tracking-tight">
                Xem chứng từ CTCV trước khi in
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
                {transfer.code} · kiểm tra nội dung rồi bấm «In phiếu»
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => printCtcvTransferDocument()}
                className="h-9 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
              >
                In phiếu
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px]"
              >
                Đóng
              </button>
            </div>
          </div>
          <CtcvTransferDocument transfer={transfer} />
        </div>
      </div>
      <div className="sale-deposit-print-root hidden">
        <CtcvTransferDocument transfer={transfer} />
      </div>
    </>
  );
}
