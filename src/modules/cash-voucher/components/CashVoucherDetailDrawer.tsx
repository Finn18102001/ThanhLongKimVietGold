"use client";

import { useEffect, useState } from "react";
import { Printer, X } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { YcRequestDocument } from "@/modules/fund-cash/YcRequestDocument";
import { printYcRequestDocument } from "@/modules/fund-cash/print";
import type { CashRequestRow } from "@/modules/fund-cash/types";
import { getCashVoucherDetail } from "../actions";

function statusLabel(status: string): string {
  if (status === "CONFIRMED") return "Đã xác nhận";
  if (status === "REJECTED") return "Từ chối";
  if (status === "REVERSED") return "Đã đảo";
  return "Chờ xác nhận";
}

function methodLabel(method: string): string {
  const m = method.toUpperCase();
  if (m === "TRANSFER") return "Chuyển khoản";
  if (m === "CARD") return "Thẻ";
  return "Tiền mặt";
}

/**
 * View + print only. Consumes fund-cash YC A4 template (no confirm/reject).
 */
export function CashVoucherDetailDrawer({
  requestId,
  codeHint,
  onClose,
}: {
  requestId: string;
  codeHint?: string | null;
  onClose: () => void;
}) {
  const [row, setRow] = useState<CashRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getCashVoucherDetail(requestId)
      .then((detail) => {
        if (cancelled) return;
        setRow(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được phiếu thu/chi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  function onPrint() {
    if (!row) return;
    window.setTimeout(() => printYcRequestDocument(), 50);
  }

  const title = row?.code || codeHint || "Phiếu thu/chi";

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/35 print:hidden">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết ${title}`}
          className="flex h-full w-full max-w-3xl flex-col bg-white shadow-[0_24px_60px_rgb(31_41_55/0.18)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
            <div>
              <h2 className="text-[16px] font-semibold">{title}</h2>
              {row?.sourceCode ? (
                <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
                  Chứng từ {row.sourceCode}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrint}
                disabled={!row || loading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                <Printer size={14} weight="bold" />
                In phiếu
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <p className="text-[13px] text-[var(--tlkv-muted)]">Đang tải…</p>
            ) : error ? (
              <p className="rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-[13px] text-[var(--tlkv-red)]">
                {error}
              </p>
            ) : row ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
                  <Info label="Loại" value={row.kind === "CHI" ? "Chi" : "Thu"} />
                  <Info label="Trạng thái" value={statusLabel(row.status)} />
                  <Info label="Số tiền" value={formatDong(row.amountDong)} />
                  <Info label="Hình thức" value={methodLabel(row.paymentMethod)} />
                  <Info label="Người tạo" value={row.requestedByEmail || "—"} />
                  <Info
                    label="Tạo lúc"
                    value={row.createdAt ? formatViDateTime(row.createdAt) : "—"}
                  />
                  <Info label="Quỹ tiền" value={row.cashAccountCode || "—"} />
                  <Info
                    label="Người xác nhận"
                    value={row.confirmedByEmail || row.rejectedByEmail || "—"}
                  />
                  <Info label="Quỹ vàng liên quan" value={row.relatedGoldAccountCode || "—"} />
                  <Info label="NV Quỹ vàng" value={row.relatedStaffName || "—"} />
                  <Info label="Khách" value={row.customerName || "—"} />
                  <Info label="Nội dung" value={row.content || "—"} />
                </dl>
                {row.rejectReason ? (
                  <p className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[12px]">
                    Lý do từ chối: {row.rejectReason}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {row ? (
        <div className="hidden print:block">
          <YcRequestDocument request={row} />
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <dt className="text-[10px] text-[var(--tlkv-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium break-all">{value}</dd>
    </div>
  );
}
