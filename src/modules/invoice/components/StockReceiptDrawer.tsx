"use client";

import { useState, useTransition } from "react";
import { X } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  collectStockReceiptPayment,
  receiveOrderedStockReceipt,
  reverseStockReceipt,
} from "../actions";
import {
  effectivePaymentStatus,
  paymentBadgeClass,
  paymentLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
} from "../labels";
import type { PaymentStatus } from "../types";
import type { GoodsStatus, StockReceiptDetail } from "../types-receipt";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

const GOODS_LABEL: Record<GoodsStatus, string> = {
  NOT_RECEIVED: "Chưa nhận hàng",
  RECEIVED: "Đã nhận hàng",
  SOLD: "Đã bán",
  RETURNED: "Đã trả hàng",
  CANCELLED: "Đã đảo",
};

function goodsBadgeClass(status: GoodsStatus): string {
  if (status === "RECEIVED") return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  if (status === "NOT_RECEIVED") return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  if (status === "RETURNED" || status === "CANCELLED") {
    return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  }
  return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
}

export function StockReceiptDrawer({
  receipt,
  onClose,
  onUpdated,
  canReversePurchase = false,
}: {
  receipt: StockReceiptDetail;
  onClose: () => void;
  onUpdated?: (next: StockReceiptDetail) => void;
  canReversePurchase?: boolean;
}) {
  const isCancelled = receipt.documentStatus === "CANCELLED" || receipt.goodsStatus === "CANCELLED";
  const payStatus = effectivePaymentStatus(
    receipt.paymentStatus,
    receipt.remainingDong,
    null,
    undefined,
    receipt.paidDong,
  );
  const staffName = receipt.actorEmail.split("@")[0] ?? receipt.actorEmail;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [amountText, setAmountText] = useState(
    receipt.remainingDong > 0 ? String(receipt.remainingDong) : "",
  );
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "CARD">(
    (receipt.paymentMethod as "CASH" | "TRANSFER" | "CARD") || "CASH",
  );
  const [note, setNote] = useState("");
  const [receivePending, startReceive] = useTransition();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidPending, setVoidPending] = useState(false);

  async function onCollect() {
    const amount = Number(amountText.replace(/[^\d]/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Nhập số tiền hợp lệ (VND nguyên).");
      return;
    }
    if (amount > receipt.remainingDong) {
      setError(`Không vượt số còn lại (${formatDong(receipt.remainingDong)}).`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await collectStockReceiptPayment({
        receiptId: receipt.id,
        amountDong: amount,
        paymentMethod: method,
        note: note || undefined,
      });
      onUpdated?.({
        ...receipt,
        paidDong: result.paidDong,
        remainingDong: result.remainingDong,
        paymentStatus: result.paymentStatus as PaymentStatus,
        payments: [
          ...receipt.payments,
          {
            id: crypto.randomUUID(),
            amountDong: amount,
            paymentMethod: method,
            paidAt: new Date().toISOString(),
            actorEmail: receipt.actorEmail,
            note: note || null,
          },
        ],
      });
      setAmountText(result.remainingDong > 0 ? String(result.remainingDong) : "");
      setNote("");
      setAlert({
        tone: "success",
        title: "Đã thanh toán nguồn hàng",
        reason: "Tiền giảm, công nợ nguồn hàng giảm. Kho không đổi.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thanh toán thất bại.");
    } finally {
      setPending(false);
    }
  }

  function onReceiveGoods() {
    startReceive(async () => {
      setError(null);
      try {
        await receiveOrderedStockReceipt({ receiptId: receipt.id });
        onUpdated?.({
          ...receipt,
          goodsStatus: "RECEIVED",
          status: "RECEIVED",
          receivedAt: new Date().toISOString(),
          stockAppliedAt: new Date().toISOString(),
        });
        setAlert({
          tone: "success",
          title: "Đã nhận hàng vào kho",
          reason: "Tồn kho đã tăng. Công nợ nguồn hàng cập nhật theo giá trị phiếu. Tiền không đổi.",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nhận hàng thất bại.");
      }
    });
  }

  async function onConfirmReverse() {
    const reason = voidReason.trim();
    if (reason.length < 3) {
      setError("Phải nhập lý do đảo phiếu (tối thiểu 3 ký tự).");
      return;
    }
    setVoidPending(true);
    setError(null);
    try {
      await reverseStockReceipt({ receiptId: receipt.id, reason });
      onUpdated?.({
        ...receipt,
        documentStatus: "CANCELLED",
        goodsStatus: "CANCELLED",
        status: "CANCELLED",
        remainingDong: 0,
      });
      setVoidOpen(false);
      setVoidReason("");
      setAlert({
        tone: "success",
        title: "Đã đảo phiếu nhập",
        reason:
          "Bút toán bù: hoàn kho (nếu đã nhận), hoàn tiền đã trả vào quỹ, chỉnh công nợ nguồn. Không xóa lịch sử.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đảo phiếu thất bại.");
    } finally {
      setVoidPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Đóng chi tiết"
        onClick={onClose}
        className="absolute inset-0 bg-black/25"
      />
      <aside className="relative flex h-full w-full max-w-[460px] flex-col bg-white shadow-[-12px_0_40px_rgb(31_41_55/0.12)]">
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">Chi tiết phiếu nhập</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[18px] font-bold text-[var(--tlkv-red)]">{receipt.receiptNo}</p>
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">Nhập hàng từ nguồn hàng</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${goodsBadgeClass(receipt.goodsStatus)}`}
            >
              {GOODS_LABEL[receipt.goodsStatus]}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentStatusBadgeClass(payStatus)}`}
            >
              {paymentStatusLabel(payStatus)}
            </span>
            <span className="rounded-full bg-[var(--tlkv-slate-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-slate)]">
              {receipt.documentStatus === "COMPLETED"
                ? "Hoàn thành"
                : receipt.documentStatus === "CANCELLED"
                  ? "Đã đảo"
                  : receipt.documentStatus}
            </span>
          </div>

          <p className="mt-2 text-[13px] text-[var(--tlkv-muted)]">
            {formatViDateTime(receipt.completedAt ?? receipt.createdAt)} · {staffName}
          </p>

          <section className="mt-4 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Nguồn hàng</p>
            <p className="mt-1 text-[14px] font-semibold">{receipt.supplierName}</p>
            {receipt.reason ? (
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">Lý do: {receipt.reason}</p>
            ) : null}
            {receipt.note ? (
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">Ghi chú: {receipt.note}</p>
            ) : null}
            {receipt.expectedReceiveAt ? (
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
                Dự kiến nhận:{" "}
                {new Date(`${receipt.expectedReceiveAt}T00:00:00`).toLocaleDateString("vi-VN")}
              </p>
            ) : null}
          </section>

          <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thanh toán / công nợ</p>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span>Tổng phiếu</span>
              <span className="font-medium">{formatDong(receipt.totalDong)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Đã trả</span>
              <span className="font-medium">{formatDong(receipt.paidDong)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Còn phải trả</span>
              <span className="font-semibold text-[var(--tlkv-red)]">
                {formatDong(receipt.remainingDong)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Hình thức</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(receipt.paymentMethod)}`}
              >
                {paymentLabel(receipt.paymentMethod)}
              </span>
            </div>
          </section>

          <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">
              Chi tiết hàng ({receipt.items.length})
            </p>
            <ul className="mt-2 divide-y divide-[var(--tlkv-line)]">
              {receipt.items.map((line) => (
                <li key={line.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-[13px] font-semibold">{line.name}</p>
                  <p className="text-[11px] text-[var(--tlkv-muted)]">
                    {line.sku}
                    {line.brandName ? ` · ${line.brandName}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--tlkv-muted)]">
                    <span>SL: {line.receivedQty}</span>
                    <span>Giá vốn/cái: {formatDong(line.costPriceDong)}</span>
                    <span className="font-medium text-[var(--tlkv-text)]">
                      {formatDong(line.costAmountDong)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {receipt.payments.length > 0 ? (
            <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Lịch sử thanh toán</p>
              <ul className="mt-2 space-y-2">
                {receipt.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-[12px]">
                    <div>
                      <p className="font-medium">{formatDong(p.amountDong)}</p>
                      <p className="text-[var(--tlkv-muted)]">
                        {paymentLabel(p.paymentMethod)} · {formatViDateTime(p.paidAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-3 rounded-[12px] border border-dashed border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] p-3 text-[11px] text-[var(--tlkv-muted)]">
            <p className="font-semibold text-[var(--tlkv-text)]">Nguyên tắc tách biến động</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              <li>Nhận hàng → tăng kho (không phụ thuộc đã trả tiền)</li>
              <li>Thanh toán → giảm tiền và giảm công nợ nguồn</li>
              <li>Đảo phiếu → bút toán bù (không xóa lịch sử)</li>
            </ul>
          </section>

          {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

          {!isCancelled && receipt.goodsStatus === "NOT_RECEIVED" ? (
            <button
              type="button"
              disabled={receivePending}
              onClick={onReceiveGoods}
              className="mt-4 h-10 w-full rounded-lg bg-[var(--tlkv-green)] text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {receivePending ? "Đang nhận..." : "Xác nhận đã nhận hàng vào kho"}
            </button>
          ) : null}

          {!isCancelled && receipt.remainingDong > 0 ? (
            <section className="mt-4 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <p className="text-[13px] font-semibold">Thanh toán thêm cho nguồn hàng</p>
              <label className="mt-2 block text-[12px]">
                Số tiền (VND)
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  className={FIELD}
                  inputMode="numeric"
                />
              </label>
              <label className="mt-2 block text-[12px]">
                Hình thức
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as "CASH" | "TRANSFER" | "CARD")}
                  className={FIELD}
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CARD">Thẻ</option>
                </select>
              </label>
              <label className="mt-2 block text-[12px]">
                Ghi chú
                <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => void onCollect()}
                className="mt-3 h-10 w-full rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang ghi..." : "Xác nhận thanh toán"}
              </button>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--tlkv-line)] px-5 py-3">
          {canReversePurchase && !isCancelled ? (
            <button
              type="button"
              disabled={pending || receivePending || voidPending}
              onClick={() => {
                setError(null);
                setVoidOpen(true);
              }}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-[var(--tlkv-red)] bg-white text-[13px] font-semibold text-[var(--tlkv-red)] disabled:opacity-40"
            >
              Đảo phiếu nhập
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </div>
      </aside>

      {voidOpen ? (
        <Modal
          title={`Đảo phiếu ${receipt.receiptNo}`}
          onClose={() => (voidPending ? undefined : setVoidOpen(false))}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={voidPending}
                onClick={() => setVoidOpen(false)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={voidPending}
                onClick={() => void onConfirmReverse()}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {voidPending ? "Đang đảo..." : "Xác nhận đảo"}
              </button>
            </div>
          }
        >
          <p className="text-[13px] text-[var(--tlkv-muted)]">
            Đảo là giao dịch bù trừ: hoàn kho (nếu đã nhận), hoàn tiền đã trả vào quỹ, chỉnh công nợ
            nguồn hàng, ghi nhật ký. Không xóa phiếu / payment / ledger gốc.
          </p>
          <label className="mt-3 block text-[12px] font-medium">
            Lý do đảo
            <textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              rows={3}
              disabled={voidPending}
              className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
              placeholder="Ví dụ: phiếu test DevTools, nhập sai nguồn hàng..."
            />
          </label>
        </Modal>
      ) : null}

      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-[13px] font-semibold text-white"
          >
            Đã hiểu
          </button>
        </ResultAlert>
      ) : null}
    </div>
  );
}
