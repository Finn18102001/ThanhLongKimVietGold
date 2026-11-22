"use client";

import { YcRequestDocument } from "@/modules/fund-cash/YcRequestDocument";
import { printYcRequestDocument } from "@/modules/fund-cash/print";
import type { CashRequestRow } from "@/modules/fund-cash/types";

/** Xem phiếu YC-THU/YC-CHI trên màn hình rồi mới In — cùng pattern HĐ bán / Phiếu 02. */
export function YcPrintPreviewOverlay({
  request,
  onClose,
}: {
  request: CashRequestRow;
  onClose: () => void;
}) {
  const kindLabel = request.kind === "CHI" ? "YC-CHI" : "YC-THU";
  return (
    <>
      <div className="fixed inset-0 z-[80] overflow-auto bg-black/40 p-4 print:hidden">
        <div className="mx-auto max-w-[210mm] bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold tracking-tight">
                Xem phiếu {kindLabel} trước khi in
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
                {request.code} · kiểm tra nội dung rồi bấm «In phiếu»
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => printYcRequestDocument()}
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
          <YcRequestDocument request={request} />
        </div>
      </div>
      {/*
        Bản in tách khỏi overlay: body.printing-sale-deposit ẩn POS/shell,
        chỉ hiện .sale-deposit-print (globals.css) — tránh in ra lưới SP POS.
      */}
      <div className="sale-deposit-print-root hidden">
        <YcRequestDocument request={request} />
      </div>
    </>
  );
}
