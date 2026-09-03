"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, DownloadSimple, EnvelopeSimple, Plus, Printer } from "@phosphor-icons/react";
import { ROUTES } from "@/shared/navigation/routes";
import { formatDong } from "@/shared/lib/money";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { InvoiceDocument, invoiceCertificateRowCount } from "./InvoiceDocument";
import type { InvoiceDetail } from "./types";

export function InvoiceDetailView({ invoice }: { invoice: InvoiceDetail }) {
  const router = useRouter();
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F9") {
        event.preventDefault();
        window.print();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function printInvoice() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={() => router.push(ROUTES.invoices)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
        >
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push(ROUTES.pos)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
          >
            <Plus size={16} weight="bold" />
            Tạo đơn hàng mới
          </button>
          <button
            type="button"
            onClick={printInvoice}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
          >
            <Printer size={16} />
            In hóa đơn F9
          </button>
          <button
            type="button"
            onClick={printInvoice}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
          >
            <DownloadSimple size={16} />
            Tải PDF
          </button>
          <button
            type="button"
            onClick={() =>
              setAlert({
                tone: "error",
                title: "Chưa gửi được hóa đơn",
                reason: "Chưa kết nối nhà cung cấp email / hóa đơn điện tử.",
                detail: "Hóa đơn đã phát hành không bị tạo lại. Chỉ cần in hoặc tải PDF.",
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
          >
            <EnvelopeSimple size={16} />
            Gửi hóa đơn
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)] print:overflow-visible print:rounded-none print:bg-white print:p-0 print:shadow-none">
        {invoiceCertificateRowCount(invoice) > 4 ? (
          <p className="mb-3 text-[12px] text-[var(--tlkv-muted)] print:hidden">
            Giấy đảm bảo vàng in tối đa 4 dòng (sản phẩm và khoản thu thêm). Đơn này có{" "}
            {invoiceCertificateRowCount(invoice)} dòng; các dòng sau dòng 4 không in trên mẫu.
          </p>
        ) : null}
        <InvoiceDocument invoice={invoice} />
      </div>
      <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[14px] font-semibold">Thanh toán và giao hàng</h2>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Trạng thái bán, thu tiền và trả hàng độc lập. Hóa đơn đã phát hành không có nghĩa đã thu đủ.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] md:grid-cols-3">
          <div>
            <dt className="text-[var(--tlkv-muted)]">Tổng</dt>
            <dd className="font-semibold">{formatDong(invoice.totalDong)}</dd>
          </div>
          <div>
            <dt className="text-[var(--tlkv-muted)]">Đã thanh toán</dt>
            <dd className="font-semibold">{formatDong(invoice.paidDong)}</dd>
          </div>
          <div>
            <dt className="text-[var(--tlkv-muted)]">Còn lại</dt>
            <dd className="font-semibold text-[var(--tlkv-red)]">
              {formatDong(invoice.remainingDong)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--tlkv-muted)]">Hẹn trả tiền</dt>
            <dd className="font-medium">
              {invoice.dueDate
                ? new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString("vi-VN")
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--tlkv-muted)]">Hẹn trả hàng</dt>
            <dd className="font-medium">
              {invoice.pickupDueAt
                ? new Date(invoice.pickupDueAt).toLocaleString("vi-VN")
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--tlkv-muted)]">Hàng</dt>
            <dd className="font-medium">
              {invoice.transactionType === "PREORDER"
                ? invoice.fulfillmentStatus === "FULFILLED"
                  ? "Đã trả hàng"
                  : invoice.fulfillmentStatus === "CANCELLED"
                    ? "Đã hủy đặt"
                    : "Chưa trả hàng"
                : "Đã giao"}
            </dd>
          </div>
        </dl>
        {invoice.charges.length > 0 ? (
          <ul className="mt-3 space-y-1 text-[13px]">
            {invoice.charges.map((charge) => (
              <li key={charge.id} className="flex justify-between gap-3">
                <span>
                  {charge.name}
                  {charge.reason ? ` (${charge.reason})` : ""}
                </span>
                <span className="font-medium">{formatDong(charge.amountDong)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đã hiểu
          </button>
        </ResultAlert>
      ) : null}
    </div>
  );
}
