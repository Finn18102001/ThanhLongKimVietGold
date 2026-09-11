"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDong } from "@/shared/lib/money";
import { ROUTES } from "@/shared/navigation/routes";
import { Modal } from "@/shared/ui/Modal";
import {
  confirmDepositAgreement,
  fetchDepositSale,
  saveDepositDocPayload,
} from "../actions";
import { DEPOSIT_COMPANY } from "../company";
import {
  DEPOSIT_POS_STEPS,
  depositPosStepIndex,
  formatDepositActionError,
  itemStatusLabel,
} from "../labels";
import { printDepositDocument } from "../print";
import type { DepositDocKind, DepositDocPayload, DepositSaleBundle } from "../types";
import { DepositAgreementDocument } from "./DepositAgreementDocument";
import { DepositDocToolbar, DepositPreviewModal } from "./DepositDocToolbar";
import { DepositExtrasForm } from "./DepositExtrasForm";
import { DepositVoucherDocument } from "./DepositVoucherDocument";
import { DepositWorkflowStepper } from "./DepositWorkflowStepper";

export function DepositPosPanel({
  saleId,
  invoiceNo,
  onDone,
}: {
  saleId: string;
  invoiceNo: string;
  onDone: () => void;
}) {
  const [bundle, setBundle] = useState<DepositSaleBundle | null>(null);
  const [payload, setPayload] = useState<DepositDocPayload>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewStep, setViewStep] = useState(1);
  const [printKind, setPrintKind] = useState<DepositDocKind>("AGREEMENT");
  const [previewKind, setPreviewKind] = useState<DepositDocKind | null>(null);

  async function reload() {
    const result = await fetchDepositSale(saleId);
    if (!result.ok) {
      setError(formatDepositActionError(result.message));
      return;
    }
    const next = result.bundle;
    setError(null);
    setBundle(next);
    setPayload({
      place: next.payload.place || DEPOSIT_COMPANY.place,
      delivery_place:
        next.payload.delivery_place || next.depositDeliveryPlace || DEPOSIT_COMPANY.place,
      ...next.payload,
    });
    setViewStep(depositPosStepIndex(next));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  function queuePrint(kind: DepositDocKind) {
    setPrintKind(kind);
    setPreviewKind(null);
    window.setTimeout(() => printDepositDocument(), 250);
  }

  if (!bundle) {
    return (
      <Modal title="Đặt cọc" wide onClose={onDone}>
        <p className="text-[13px] text-[var(--tlkv-muted)]">
          {error ?? "Đang mở thỏa thuận đặt cọc..."}
        </p>
      </Modal>
    );
  }

  const workflowStep = depositPosStepIndex(bundle);
  const live: DepositSaleBundle = { ...bundle, payload };
  const viewingPast = viewStep < workflowStep;
  const titleNo = bundle.invoiceNo || invoiceNo;
  const showConfirm = viewStep === 0;
  const showAgreement = viewStep === 1;
  const showSlip = viewStep === 2;
  const showWait = viewStep >= 3;

  async function saveExtras() {
    setPending(true);
    setError(null);
    const result = await saveDepositDocPayload({ saleId, payload });
    if (!result.ok) {
      setError(formatDepositActionError(result.message));
    } else {
      setBundle(result.bundle);
    }
    setPending(false);
  }

  async function onCustomerConfirm() {
    setPending(true);
    setError(null);
    const result = await confirmDepositAgreement({
      saleId,
      deliveryPlace: payload.delivery_place || payload.place,
      payload,
    });
    if (!result.ok) {
      setError(formatDepositActionError(result.message));
    } else {
      setBundle(result.bundle);
      setPayload({ ...result.bundle.payload });
      setViewStep(depositPosStepIndex(result.bundle));
    }
    setPending(false);
  }

  return (
    <>
      <Modal
        title={`Đặt cọc ${titleNo}`}
        wide
        onClose={onDone}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--tlkv-muted)]">
              {bundle.saleNo} · Chữ ký trên bản in để trống · Chưa xuất kho
            </p>
            <div className="flex flex-wrap gap-2">
              {workflowStep >= 3 ? (
                <Link
                  href={`${ROUTES.invoices}?paymentStatus=PARTIALLY_PAID`}
                  className="inline-flex h-10 items-center rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
                >
                  Mở tab Hóa đơn
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onDone}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                {workflowStep >= 3 ? "Đơn mới tại POS" : "Đóng"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                {bundle.customerName}
                {bundle.customerPhone ? ` · ${bundle.customerPhone}` : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                <MoneyChip label="Tổng" value={formatDong(bundle.totalDong)} />
                <MoneyChip label="Đã đặt cọc" value={formatDong(bundle.paidDong)} />
                <MoneyChip label="Còn lại" value={formatDong(bundle.remainingDong)} />
                <MoneyChip label="HĐ" value={titleNo || "—"} />
              </div>
            </div>
            <span className="rounded-full bg-[var(--tlkv-amber-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-amber)]">
              Thanh toán một phần
            </span>
          </div>

          <DepositWorkflowStepper
            steps={DEPOSIT_POS_STEPS}
            active={Math.max(workflowStep, 1)}
            viewing={viewStep}
            onSelect={(index) => {
              if (index <= workflowStep) setViewStep(index);
            }}
          />

          {viewingPast ? (
            <p className="rounded-lg bg-[var(--tlkv-slate-soft)] px-2.5 py-2 text-[12px] text-[var(--tlkv-slate)]">
              Đang xem bước trước. Bấm bước {workflowStep + 1} trên thanh tiến trình để quay lại xử lý.
            </p>
          ) : null}

          <div>
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Hàng sẵn / hàng đặt</p>
            <ul className="mt-1 divide-y divide-[var(--tlkv-line)] text-[13px]">
              {bundle.lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  <span className="text-[12px] font-medium text-[var(--tlkv-muted)]">
                    {itemStatusLabel(line.itemStatus)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {showConfirm ? (
            <section className="space-y-2 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <p className="text-[13px] font-semibold">1. Xác nhận hóa đơn</p>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Hóa đơn đã lưu trên hệ thống. Chưa xuất kho. Bấm bước 2 để lập thỏa thuận đặt cọc.
              </p>
              <button
                type="button"
                onClick={() => setViewStep(Math.min(1, workflowStep))}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
              >
                Tiếp — Thỏa thuận đặt cọc
              </button>
            </section>
          ) : null}

          {showAgreement ? (
            <section className="space-y-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <DepositDocToolbar
                kind="AGREEMENT"
                onPreview={() => {
                  setPrintKind("AGREEMENT");
                  setPreviewKind("AGREEMENT");
                }}
                onPrint={() => queuePrint("AGREEMENT")}
              />
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Dữ liệu lấy từ hóa đơn. Chỉ nhập phần còn trống. Check và In độc lập — không bắt buộc in
                ngay.
              </p>
              <DepositExtrasForm variant="agreement" value={payload} onChange={setPayload} />
              {error && showAgreement ? (
                <p className="text-[12px] text-[var(--tlkv-red)]">{error}</p>
              ) : null}
              {workflowStep <= 1 && !viewingPast ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void saveExtras()}
                    className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium disabled:opacity-40"
                  >
                    Lưu thông tin bổ sung
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void onCustomerConfirm()}
                    className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {pending ? "Đang xác nhận..." : "Khách xác nhận thỏa thuận"}
                  </button>
                </div>
              ) : workflowStep > 1 ? (
                <p className="text-[12px] font-medium text-[var(--tlkv-green)]">
                  Thỏa thuận đã xác nhận. Có thể Check / In lại bất cứ lúc nào.
                </p>
              ) : null}
            </section>
          ) : null}

          {showSlip ? (
            <section className="space-y-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <DepositDocToolbar
                kind="SLIP"
                onPreview={() => {
                  setPrintKind("SLIP");
                  setPreviewKind("SLIP");
                }}
                onPrint={() => queuePrint("SLIP")}
              />
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Phiếu đặt cọc kế thừa hóa đơn + thỏa thuận. Không nhập lại tiền / sản phẩm.
              </p>
              <DepositExtrasForm variant="slip" value={payload} onChange={setPayload} />
              {error && showSlip ? (
                <p className="text-[12px] text-[var(--tlkv-red)]">{error}</p>
              ) : null}
              {workflowStep === 2 && !viewingPast ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void saveExtras()}
                  className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium disabled:opacity-40"
                >
                  Lưu thông tin bổ sung
                </button>
              ) : null}
              {workflowStep > 2 ? (
                <p className="text-[12px] font-medium text-[var(--tlkv-green)]">
                  Phiếu đặt cọc đã lập. Có thể Check / In lại.
                </p>
              ) : null}
            </section>
          ) : null}

          {showWait ? (
            <section className="space-y-3 rounded-[12px] border border-[var(--tlkv-green)]/30 bg-[var(--tlkv-green-soft)] p-3">
              <p className="text-[14px] font-semibold text-[var(--tlkv-green)]">
                Đã lưu phiếu đặt cọc. Kết thúc tại quầy bán hàng.
              </p>
              <p className="text-[13px] text-[var(--tlkv-text)]">
                Khi khách đến nhận vàng: vào Hóa đơn → lọc Thanh toán một phần → mở đúng hóa đơn này để thu
                nốt, lập biên bản giao nhận rồi in hóa đơn bán hàng.
              </p>
              <div className="space-y-2 rounded-lg bg-white/70 p-2">
                <DepositDocToolbar
                  kind="AGREEMENT"
                  onPreview={() => {
                    setPrintKind("AGREEMENT");
                    setPreviewKind("AGREEMENT");
                  }}
                  onPrint={() => queuePrint("AGREEMENT")}
                />
                <DepositDocToolbar
                  kind="SLIP"
                  onPreview={() => {
                    setPrintKind("SLIP");
                    setPreviewKind("SLIP");
                  }}
                  onPrint={() => queuePrint("SLIP")}
                />
              </div>
            </section>
          ) : null}
        </div>
      </Modal>

      {previewKind ? (
        <DepositPreviewModal
          title={
            previewKind === "AGREEMENT" ? "Check thỏa thuận đặt cọc" : "Check phiếu đặt cọc"
          }
          onClose={() => setPreviewKind(null)}
          onPrint={() => queuePrint(previewKind)}
        >
          {previewKind === "AGREEMENT" ? <DepositAgreementDocument bundle={live} /> : null}
          {previewKind === "SLIP" ? <DepositVoucherDocument bundle={live} /> : null}
        </DepositPreviewModal>
      ) : null}

      <div className="sale-deposit-print-root hidden print:block">
        {printKind === "AGREEMENT" ? <DepositAgreementDocument bundle={live} /> : null}
        {printKind === "SLIP" ? <DepositVoucherDocument bundle={live} /> : null}
      </div>
    </>
  );
}

function MoneyChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <p className="text-[10px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
