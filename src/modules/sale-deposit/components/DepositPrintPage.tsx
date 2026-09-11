"use client";

import { useEffect, useState } from "react";
import { fetchDepositSale } from "../actions";
import { formatDepositActionError } from "../labels";
import { printDepositDocument } from "../print";
import type { DepositDocKind, DepositSaleBundle } from "../types";
import { DepositAgreementDocument } from "./DepositAgreementDocument";
import { DepositVoucherDocument } from "./DepositVoucherDocument";
import { HandoverMinutesDocument } from "./HandoverMinutesDocument";

export function DepositPrintPage({
  saleId,
  kind,
  autoPrint = false,
}: {
  saleId: string;
  kind: DepositDocKind;
  autoPrint?: boolean;
}) {
  const [bundle, setBundle] = useState<DepositSaleBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchDepositSale(saleId).then((result) => {
      if (!result.ok) {
        setError(formatDepositActionError(result.message));
        return;
      }
      setError(null);
      setBundle(result.bundle);
    });
  }, [saleId]);

  useEffect(() => {
    if (!bundle || !autoPrint) return;
    const t = window.setTimeout(() => printDepositDocument(), 400);
    return () => window.clearTimeout(t);
  }, [bundle, autoPrint]);

  if (error) {
    return <p className="p-6 text-[13px] text-[var(--tlkv-red)] print:hidden">{error}</p>;
  }
  if (!bundle) {
    return <p className="p-6 text-[13px] text-[var(--tlkv-muted)] print:hidden">Đang tải phiếu in...</p>;
  }

  return (
    <div className="sale-deposit-print-root min-h-screen bg-white">
      <div className="print:hidden border-b border-[var(--tlkv-line)] px-4 py-3">
        <p className="text-[13px] font-semibold">
          {kind === "AGREEMENT"
            ? "Thỏa thuận đặt cọc"
            : kind === "SLIP"
              ? "Phiếu đặt cọc"
              : "Biên bản giao nhận"}{" "}
          · {bundle.invoiceNo || bundle.saleNo}
        </p>
        <button
          type="button"
          onClick={() => printDepositDocument()}
          className="mt-2 h-9 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
        >
          In / Lưu PDF
        </button>
      </div>
      {kind === "AGREEMENT" ? <DepositAgreementDocument bundle={bundle} /> : null}
      {kind === "SLIP" ? <DepositVoucherDocument bundle={bundle} /> : null}
      {kind === "HANDOVER" ? <HandoverMinutesDocument bundle={bundle} /> : null}
    </div>
  );
}
