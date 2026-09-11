"use client";

import { useEffect, useState } from "react";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { formatDong } from "@/shared/lib/money";
import {
  confirmDepositHandover,
  fetchDepositSale,
  prepareDepositHandover,
  saveDepositDocPayload,
} from "../actions";
import { DEPOSIT_INVOICE_STEPS, depositInvoiceStepIndex, itemStatusLabel } from "../labels";
import { printDepositDocument } from "../print";
import type { DepositDocKind, DepositDocPayload, DepositSaleBundle } from "../types";
import { DepositAgreementDocument } from "./DepositAgreementDocument";
import { DepositDocToolbar, DepositPreviewModal } from "./DepositDocToolbar";
import { DepositExtrasForm } from "./DepositExtrasForm";
import { DepositVoucherDocument } from "./DepositVoucherDocument";
import { DepositWorkflowStepper } from "./DepositWorkflowStepper";
import { HandoverMinutesDocument } from "./HandoverMinutesDocument";

export function InvoiceDepositPanel({
  saleId,
  remainingDong,
  onReloadInvoice,
}: {
  saleId: string;
  remainingDong: number;
  onReloadInvoice?: () => void;
}) {
  const [bundle, setBundle] = useState<DepositSaleBundle | null>(null);
  const [payload, setPayload] = useState<DepositDocPayload>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewStep, setViewStep] = useState(0);
  const [printKind, setPrintKind] = useState<DepositDocKind>("HANDOVER");
  const [previewKind, setPreviewKind] = useState<DepositDocKind | null>(null);

  async function reload() {
    const next = await fetchDepositSale(saleId);
    setBundle(next);
    setPayload({ ...next.payload });
    setViewStep(depositInvoiceStepIndex({ ...next, remainingDong }));
  }

  useEffect(() => {
    void reload().catch((err) => {
      setError(err instanceof Error ? err.message : "Không tải được chứng từ đặt cọc.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId, remainingDong]);

  function queuePrint(kind: DepositDocKind) {
    setPrintKind(kind);
    setPreviewKind(null);
    window.setTimeout(() => printDepositDocument(), 250);
  }

  if (!bundle?.depositWorkflowStatus) return null;

  const workflowStep = depositInvoiceStepIndex({ ...bundle, remainingDong });
  const live: DepositSaleBundle = { ...bundle, payload, remainingDong };
  const hasBackorder = bundle.lines.some(
    (line) => line.itemStatus === "BACKORDER" && line.qtyDelivered < line.quantity,
  );
  const paidOff = remainingDong <= 0;
  const canPrepare = paidOff && !bundle.deliveryReceiptNo && bundle.fulfillmentStatus !== "FULFILLED";
  const canConfirmHandover =
    Boolean(bundle.deliveryReceiptNo) &&
    paidOff &&
    bundle.fulfillmentStatus !== "FULFILLED" &&
    !hasBackorder;
  const done = bundle.fulfillmentStatus === "FULFILLED" || bundle.depositWorkflowStatus === "COMPLETED";
  const viewingPast = viewStep < workflowStep;

  async function saveExtras() {
    setPending(true);
    setError(null);
    try {
      setBundle(await saveDepositDocPayload({ saleId, payload }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được thông tin bổ sung.");
    } finally {
      setPending(false);
    }
  }

  async function onPrepare() {
    setPending(true);
    setError(null);
    try {
      await saveDepositDocPayload({ saleId, payload });
      const next = await prepareDepositHandover({ saleId });
      setBundle(next);
      setViewStep(depositInvoiceStepIndex({ ...next, remainingDong }));
      onReloadInvoice?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lập được biên bản giao nhận.");
    } finally {
      setPending(false);
    }
  }

  async function onConfirmHandover() {
    setPending(true);
    setError(null);
    try {
      const next = await confirmDepositHandover({ saleId });
      setBundle(next);
      setViewStep(depositInvoiceStepIndex({ ...next, remainingDong }));
      onReloadInvoice?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xác nhận giao nhận được.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3 print:hidden">
        <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Chứng từ đặt cọc</p>
        <div className="mt-3">
          <DepositWorkflowStepper
            steps={DEPOSIT_INVOICE_STEPS}
            active={Math.max(workflowStep, 0)}
            viewing={viewStep}
            onSelect={(index) => {
              if (index <= workflowStep) setViewStep(index);
            }}
          />
        </div>

        {viewingPast ? (
          <p className="mt-2 rounded-lg bg-[var(--tlkv-slate-soft)] px-2.5 py-2 text-[12px] text-[var(--tlkv-slate)]">
            Đang xem bước trước. Bấm bước {workflowStep + 1} để quay lại xử lý.
          </p>
        ) : null}

        <ul className="mt-3 space-y-1 text-[12px]">
          {bundle.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-2">
              <span>
                {line.name} × {line.quantity}
              </span>
              <span className="font-medium">{itemStatusLabel(line.itemStatus)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-2">
          {bundle.depositAgreementNo || bundle.depositWorkflowStatus === "AWAITING_AGREEMENT" ? (
            <DepositDocToolbar
              kind="AGREEMENT"
              onPreview={() => {
                setPrintKind("AGREEMENT");
                setPreviewKind("AGREEMENT");
              }}
              onPrint={() => queuePrint("AGREEMENT")}
            />
          ) : null}
          {bundle.depositSlipNo ? (
            <DepositDocToolbar
              kind="SLIP"
              onPreview={() => {
                setPrintKind("SLIP");
                setPreviewKind("SLIP");
              }}
              onPrint={() => queuePrint("SLIP")}
            />
          ) : null}
          {bundle.deliveryReceiptNo || viewStep >= 1 ? (
            <DepositDocToolbar
              kind="HANDOVER"
              onPreview={() => {
                setPrintKind("HANDOVER");
                setPreviewKind("HANDOVER");
              }}
              onPrint={() => queuePrint("HANDOVER")}
            />
          ) : null}
        </div>

        {hasBackorder ? (
          <p className="mt-2 rounded-lg bg-[var(--tlkv-amber-soft)] px-2.5 py-2 text-[12px] text-[var(--tlkv-amber)]">
            Còn hàng đặt chưa đủ tồn. Không giao / không lập biên bản cho đến khi đủ hàng.
          </p>
        ) : null}

        {paidOff && !done && viewStep >= 1 ? (
          <div className="mt-3">
            <DepositExtrasForm variant="handover" value={payload} onChange={setPayload} />
            <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">
              Đã thu đủ {formatDong(bundle.totalDong)}. Chưa hoàn thành cho đến khi xác nhận giao nhận vàng.
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{error}</p> : null}

        {!viewingPast ? (
          <div className="mt-3 flex flex-col gap-2">
            {paidOff && !done ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void saveExtras()}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium disabled:opacity-40"
              >
                Lưu thông tin biên bản
              </button>
            ) : null}
            {canPrepare ? (
              <button
                type="button"
                disabled={pending || hasBackorder}
                onClick={() => void onPrepare()}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang lập..." : "Xác nhận — lập biên bản giao nhận"}
              </button>
            ) : null}
            {canConfirmHandover ? (
              <button
                type="button"
                disabled={pending || hasBackorder}
                onClick={() => void onConfirmHandover()}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang giao..." : "Xác nhận giao nhận (xuất kho)"}
              </button>
            ) : null}
            {done && bundle.invoiceNo ? (
              <a
                href={invoiceDetailPath(bundle.invoiceNo)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white"
              >
                In hóa đơn bán hàng
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {previewKind ? (
        <DepositPreviewModal
          title={
            previewKind === "AGREEMENT"
              ? "Check thỏa thuận đặt cọc"
              : previewKind === "SLIP"
                ? "Check phiếu đặt cọc"
                : "Check biên bản giao nhận"
          }
          onClose={() => setPreviewKind(null)}
          onPrint={() => queuePrint(previewKind)}
        >
          {previewKind === "AGREEMENT" ? <DepositAgreementDocument bundle={live} /> : null}
          {previewKind === "SLIP" ? <DepositVoucherDocument bundle={live} /> : null}
          {previewKind === "HANDOVER" ? <HandoverMinutesDocument bundle={live} /> : null}
        </DepositPreviewModal>
      ) : null}

      <div className="sale-deposit-print-root hidden print:block">
        {printKind === "AGREEMENT" ? <DepositAgreementDocument bundle={live} /> : null}
        {printKind === "SLIP" ? <DepositVoucherDocument bundle={live} /> : null}
        {printKind === "HANDOVER" ? <HandoverMinutesDocument bundle={live} /> : null}
      </div>
    </>
  );
}
