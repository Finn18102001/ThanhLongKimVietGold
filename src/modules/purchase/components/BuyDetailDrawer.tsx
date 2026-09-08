"use client";

import { useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  confirmBuyMelt,
  issueMeltCommitment,
  setBuyMeltWeights,
  startBuyMelting,
  uploadBuyPdf,
  voidBuy,
} from "../actions";
import { formatChi, paymentMethodLabel, paymentStatusLabel } from "../labels";
import type { BuyDetail, MeltWeightItemPayload, PaymentMethod } from "../types";
import { isBuyInMeltWorkflow } from "../workflowLabels";
import { BuyWorkflowPanel } from "./BuyWorkflowPanel";
import { Form02Document } from "./Form02Document";
import { MeltCommitmentDocument } from "./MeltCommitmentDocument";
import { PurchaseVoucherDocument } from "./PurchaseVoucherDocument";

type PrintDocKind = "commitment" | "form02" | "invoice";

/**
 * Buy detail drawer for invoice directory (and reusable embed).
 * Opens in place — does not navigate away from /invoices.
 */
export function BuyDetailDrawer({
  buy: initial,
  onClose,
  onUpdated,
  canVoidBuy = false,
}: {
  buy: BuyDetail;
  onClose: () => void;
  onUpdated?: (next: BuyDetail) => void;
  /** Same allow-list as invoice void (UI gate; BE enforces). */
  canVoidBuy?: boolean;
}) {
  const [buy, setBuy] = useState(initial);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintDocKind>(
    initial.form02No || initial.status === "COMPLETED" ? "invoice" : "commitment",
  );
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const workflowKey = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canShowVoid = canVoidBuy && buy.status === "COMPLETED";

  async function runWorkflow(
    action: () => Promise<BuyDetail>,
    opts?: { print?: PrintDocKind; successTitle?: string; offerAttach?: boolean },
  ) {
    if (pending) return;
    if (!workflowKey.current) workflowKey.current = crypto.randomUUID();
    setPending(true);
    try {
      const next = await action();
      setBuy(next);
      onUpdated?.(next);
      workflowKey.current = null;
      if (opts?.print) setPrintDoc(opts.print);
      if (opts?.successTitle) {
        setAlert({ tone: "success", title: opts.successTitle, reason: next.buyNo });
      }
      if (opts?.offerAttach) setAttachOpen(true);
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không cập nhật được quy trình",
        reason: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
      workflowKey.current = crypto.randomUUID();
    } finally {
      setPending(false);
    }
  }

  function printDocument(kind: PrintDocKind) {
    setPrintDoc(kind);
    window.setTimeout(() => window.print(), 50);
  }

  async function onUploadPdf(file: File | null) {
    if (!file || attachPending) return;
    setAttachPending(true);
    try {
      const fd = new FormData();
      fd.set("buyId", buy.id);
      fd.set("file", file);
      const result = await uploadBuyPdf(fd);
      if (!result.ok) {
        setAlert({ tone: "error", title: "Không đính kèm PDF", reason: result.message });
        return;
      }
      setBuy(result.buy);
      onUpdated?.(result.buy);
      setAttachOpen(false);
      setAlert({
        tone: "success",
        title: "Đã đính kèm PDF",
        reason: result.buy.buyNo,
      });
    } finally {
      setAttachPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onConfirmVoid() {
    const reason = voidReason.trim();
    if (reason.length < 3) {
      setVoidError("Phải nhập lý do hủy (tối thiểu 3 ký tự).");
      return;
    }
    if (pending) return;
    setPending(true);
    setVoidError(null);
    try {
      const next = await voidBuy({ buyId: buy.id, reason });
      setBuy(next);
      onUpdated?.(next);
      setVoidOpen(false);
      setVoidReason("");
      setAlert({
        tone: "success",
        title: "Đã hủy phiếu mua",
        reason: "Hoàn tiền vào quỹ + trừ vàng khỏi kho (bút toán bù, không xóa lịch sử).",
      });
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Hủy phiếu thất bại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/30 print:hidden">
        <div className="flex h-full w-full max-w-[920px] flex-col bg-[var(--tlkv-bg)] shadow-xl">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--tlkv-line)] bg-white px-4 py-3">
            <div>
              <p className="text-[15px] font-semibold">{buy.buyNo}</p>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                {buy.customerName} · {paymentStatusLabel(buy.paymentStatus)} ·{" "}
                {formatDong(buy.totalDong)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </header>

          <div className="grid flex-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[1fr_300px]">
            <div className="space-y-3 rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3">
              <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
                <Info label="Khách" value={buy.customerName} />
                <Info label="CCCD" value={buy.customerCitizenId || "—"} />
                <Info label="SĐT" value={buy.customerPhone || "—"} />
                <Info label="Hình thức" value={paymentMethodLabel(buy.paymentMethod)} />
                <Info label="Đã chi" value={formatDong(buy.paidDong)} />
                <Info label="Còn lại" value={formatDong(buy.remainingDong)} />
              </dl>

              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--tlkv-line)] text-[var(--tlkv-muted)]">
                    <th className="py-1.5 font-medium">SP</th>
                    <th className="py-1.5 font-medium">Trước</th>
                    <th className="py-1.5 font-medium">Sau</th>
                    <th className="py-1.5 text-right font-medium">Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {buy.items.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2">{item.productName}</td>
                      <td className="py-2">
                        {formatChi(
                          item.weightBeforeChi > 0 ? item.weightBeforeChi : item.weightChi,
                        )}
                      </td>
                      <td className="py-2">
                        {item.weightAfterChi != null ? formatChi(item.weightAfterChi) : "—"}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatDong(item.totalPriceDong)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {buy.payments.length > 0 ? (
                <ul className="space-y-1 text-[12px]">
                  {buy.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex justify-between gap-2 border-b border-[var(--tlkv-line)] py-1"
                    >
                      <span>
                        {formatViDateTime(p.paidAt)} · {paymentMethodLabel(p.paymentMethod)}
                      </span>
                      <span className="font-medium">{formatDong(p.amountDong)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAttachOpen(true)}
                  className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
                >
                  {buy.attachmentPdfPath ? "Đổi / thêm PDF" : "Đính kèm PDF"}
                </button>
                {canShowVoid ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVoidOpen(true);
                      setVoidError(null);
                    }}
                    className="h-9 rounded-lg border border-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-[var(--tlkv-red)]"
                  >
                    Hủy phiếu mua
                  </button>
                ) : null}
                {buy.status === "VOIDED" ? (
                  <span className="inline-flex h-9 items-center rounded-lg bg-[var(--tlkv-slate-soft)] px-3 text-[12px] font-semibold text-[var(--tlkv-slate)]">
                    Đã hủy
                  </span>
                ) : null}
              </div>
            </div>

            {isBuyInMeltWorkflow(buy) ||
            buy.workflowStatus === "COMPLETED" ||
            buy.status === "COMPLETED" ? (
              <BuyWorkflowPanel
                buy={buy}
                pending={pending}
                onIssueCommitment={() =>
                  void runWorkflow(
                    () =>
                      issueMeltCommitment({
                        buyId: buy.id,
                        idempotencyKey: workflowKey.current || undefined,
                      }),
                    { print: "commitment", successTitle: "Đã tạo phiếu cam kết nấu" },
                  )
                }
                onStartMelt={() =>
                  void runWorkflow(
                    () =>
                      startBuyMelting({
                        buyId: buy.id,
                        idempotencyKey: workflowKey.current || undefined,
                      }),
                    { successTitle: "Đã chuyển sang nấu vàng" },
                  )
                }
                onSetWeights={(items: MeltWeightItemPayload[]) =>
                  void runWorkflow(
                    () =>
                      setBuyMeltWeights({
                        buyId: buy.id,
                        items,
                        idempotencyKey: workflowKey.current || undefined,
                      }),
                    { successTitle: "Đã lưu khối lượng sau nấu" },
                  )
                }
                onConfirmAgree={() =>
                  void runWorkflow(
                    () =>
                      confirmBuyMelt({
                        buyId: buy.id,
                        agree: true,
                        idempotencyKey: workflowKey.current || undefined,
                        paymentMethod: buy.paymentMethod as PaymentMethod,
                        dueDate: buy.dueDate,
                      }),
                    {
                      print: "form02",
                      successTitle: "Đã xác nhận — tạo Phiếu 02 / hóa đơn",
                      offerAttach: true,
                    },
                  )
                }
                onConfirmCancel={() =>
                  void runWorkflow(
                    () =>
                      confirmBuyMelt({
                        buyId: buy.id,
                        agree: false,
                        idempotencyKey: workflowKey.current || undefined,
                      }),
                    { successTitle: "Đã hủy giao dịch theo yêu cầu khách" },
                  )
                }
                onPrintCommitment={() => printDocument("commitment")}
                onPrintForm02={() => printDocument("form02")}
                onPrintInvoice={() => printDocument("invoice")}
              />
            ) : null}
          </div>
        </div>
      </div>

      {attachOpen ? (
        <Modal title="Đính kèm PDF đã ký" onClose={() => setAttachOpen(false)}>
          <p className="text-[13px] text-[var(--tlkv-muted)]">
            Tải lên bản PDF đã ký (cam kết / phiếu 02 / phiếu mua). Có thể bổ sung sau từ chi tiết
            phiếu.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="mt-3 block w-full text-[12px]"
            disabled={attachPending}
            onChange={(e) => void onUploadPdf(e.target.files?.[0] ?? null)}
          />
          {attachPending ? (
            <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">Đang tải lên...</p>
          ) : null}
        </Modal>
      ) : null}

      {voidOpen ? (
        <Modal title={`Hủy phiếu ${buy.buyNo}`} onClose={() => setVoidOpen(false)}>
          <p className="text-[13px] text-[var(--tlkv-muted)]">
            Bút toán bù: hoàn tiền đã chi vào quỹ và trừ vàng khỏi kho. Không xóa lịch sử giao dịch.
          </p>
          <label className="mt-3 block text-[12px] font-medium">
            Lý do hủy
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px]"
              placeholder="Ví dụ: Hủy sau kiểm thử E2E melt workflow"
            />
          </label>
          {voidError ? <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{voidError}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setVoidOpen(false)}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px]"
              disabled={pending}
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => void onConfirmVoid()}
              className="h-9 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "Đang hủy..." : "Xác nhận hủy"}
            </button>
          </div>
        </Modal>
      ) : null}

      {alert ? <ResultAlert alert={alert} onClose={() => setAlert(null)} /> : null}

      <div className="hidden print:block">
        {printDoc === "commitment" ? (
          <MeltCommitmentDocument buy={buy} />
        ) : printDoc === "form02" ? (
          <Form02Document buy={buy} />
        ) : (
          <PurchaseVoucherDocument buy={buy} />
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <dt className="text-[10px] text-[var(--tlkv-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
