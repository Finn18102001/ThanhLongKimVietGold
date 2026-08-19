"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, DownloadSimple, EnvelopeSimple, Plus, Printer } from "@phosphor-icons/react";
import { ROUTES } from "@/shared/navigation/routes";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { InvoiceDocument } from "./InvoiceDocument";
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
      <div className="rounded-[12px] bg-white shadow-[var(--tlkv-shadow)] print:shadow-none">
        <InvoiceDocument invoice={invoice} />
      </div>
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
