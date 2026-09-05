"use client";

import { useState } from "react";
import { Printer, X } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { collectSalePayment, cancelInvoicePreorder, fulfillInvoicePreorder } from "../actions";
import {
  effectivePaymentStatus,
  formatChi,
  formatInvoicePhone,
  fulfillmentLabel,
  invoiceLifecycleBadgeClass,
  invoiceLifecycleLabel,
  invoiceLifecycleStatus,
  isInvoiceIncomplete,
  paymentBadgeClass,
  paymentLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
  transactionTypeLabel,
} from "../labels";
import type { InvoiceDetail, PaymentStatus } from "../types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export function InvoiceDrawer({
  invoice,
  onClose,
  onUpdated,
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
  onUpdated?: (next: InvoiceDetail) => void;
}) {
  const staffName = invoice.actorEmail.split("@")[0] ?? invoice.actorEmail;
  const phone = formatInvoicePhone(invoice.customerPhone);
  const payStatus = effectivePaymentStatus(
    invoice.paymentStatus,
    invoice.remainingDong,
    invoice.dueDate,
  );
  const lifecycle = invoiceLifecycleStatus(
    invoice.remainingDong,
    invoice.transactionType,
    invoice.fulfillmentStatus,
    payStatus,
  );
  const incomplete = isInvoiceIncomplete(lifecycle);
  const isVoided = invoice.status === "VOIDED" || invoice.saleStatus === "VOIDED";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState(
    invoice.remainingDong > 0 ? String(invoice.remainingDong) : "",
  );
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "CARD">(
    (invoice.paymentMethod as "CASH" | "TRANSFER" | "CARD") || "CASH",
  );
  const [note, setNote] = useState("");

  function openPrintView() {
    window.open(invoiceDetailPath(invoice.invoiceNo), "_blank", "noopener,noreferrer");
  }

  async function onCollect() {
    const amount = Number(amountText.replace(/[^\d]/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Nhập số tiền thu hợp lệ (VND nguyên).");
      return;
    }
    if (amount > invoice.remainingDong) {
      setError(`Không vượt số còn lại (${formatDong(invoice.remainingDong)}).`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await collectSalePayment({
        saleId: invoice.saleId,
        amountDong: amount,
        paymentMethod: method,
        note: note || undefined,
        dueDate: invoice.dueDate,
      });
      onUpdated?.({
        ...invoice,
        paidDong: result.paidDong,
        remainingDong: result.remainingDong,
        paymentStatus: result.paymentStatus as PaymentStatus,
        dueDate: result.dueDate,
        payments: [
          ...invoice.payments,
          {
            id: crypto.randomUUID(),
            saleId: invoice.saleId,
            amountDong: amount,
            paymentMethod: method,
            paidAt: new Date().toISOString(),
            actorEmail: invoice.actorEmail,
            note: note || null,
            receivedByName: null,
          },
        ],
      });
      setAmountText(result.remainingDong > 0 ? String(result.remainingDong) : "");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thu tiền thất bại.");
    } finally {
      setPending(false);
    }
  }

  async function onFulfill() {
    setPending(true);
    setError(null);
    try {
      const result = await fulfillInvoicePreorder({ saleId: invoice.saleId });
      onUpdated?.({
        ...invoice,
        fulfillmentStatus: result.fulfillmentStatus,
        remainingDong: result.remainingDong,
        paymentStatus: result.paymentStatus as PaymentStatus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giao hàng thất bại.");
    } finally {
      setPending(false);
    }
  }

  async function onCancelOrder() {
    setPending(true);
    setError(null);
    try {
      const result = await cancelInvoicePreorder({ saleId: invoice.saleId });
      onUpdated?.({
        ...invoice,
        fulfillmentStatus: result.fulfillmentStatus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hủy đặt hàng thất bại.");
    } finally {
      setPending(false);
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
      <aside className="relative flex h-full w-full max-w-[440px] flex-col bg-white shadow-[-12px_0_40px_rgb(31_41_55/0.12)]">
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">Chi tiết hóa đơn</h2>
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
              <p className="text-[18px] font-bold text-[var(--tlkv-red)]">{invoice.invoiceNo}</p>
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">Mã bán {invoice.saleNo}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invoiceLifecycleBadgeClass(lifecycle)}`}
            >
              {invoiceLifecycleLabel(lifecycle)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-[var(--tlkv-slate-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-slate)]">
              {transactionTypeLabel(invoice.transactionType)}
            </span>
            <span className="rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
              {fulfillmentLabel(invoice.transactionType, invoice.fulfillmentStatus)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentStatusBadgeClass(payStatus)}`}
            >
              {paymentStatusLabel(payStatus)}
            </span>
          </div>
          {!incomplete ? (
            <p className="mt-2 rounded-lg border border-[var(--tlkv-green)]/30 bg-[var(--tlkv-green-soft)] px-2.5 py-1.5 text-[11px] text-[var(--tlkv-green)]">
              Hóa đơn đã hoàn thành - khóa thu thêm / giao hàng. Chỉ in và xem.
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-[var(--tlkv-muted)]">
            {formatViDateTime(invoice.issuedAt)}
          </p>

          <section className="mt-4 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin khách hàng</p>
            <p className="mt-1 text-[14px] font-semibold">{invoice.customerName}</p>
            <p className="text-[13px] text-[var(--tlkv-muted)]">
              {invoice.customerNo ?? "-"}
              {invoice.isWalkIn ? " · Khách vãng lai" : phone ? ` · ${phone}` : ""}
            </p>
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
              Địa chỉ: {invoice.customerAddress || "-"}
            </p>
          </section>

          <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin thanh toán</p>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span>Trạng thái TT</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentStatusBadgeClass(payStatus)}`}
              >
                {paymentStatusLabel(payStatus)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Hình thức</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(invoice.paymentMethod)}`}
              >
                {paymentLabel(invoice.paymentMethod)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Tổng HĐ</span>
              <span className="font-medium">{formatDong(invoice.totalDong)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Đã thanh toán</span>
              <span className="font-medium">{formatDong(invoice.paidDong)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Còn lại</span>
              <span className="font-semibold text-[var(--tlkv-red)]">
                {formatDong(invoice.remainingDong)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Hẹn trả</span>
              <span className="font-medium">
                {invoice.dueDate
                  ? new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString("vi-VN")
                  : "-"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>NV đứng quầy</span>
              <span className="font-medium">{invoice.operatorName || "-"}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Nhân viên đăng nhập</span>
              <span className="font-medium">{staffName}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Hẹn trả hàng</span>
              <span className="font-medium">
                {invoice.pickupDueAt
                  ? formatViDateTime(invoice.pickupDueAt)
                  : "-"}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">
              Ghi chú: {invoice.note || "-"}
            </p>
          </section>

          {invoice.transactionType === "PREORDER" &&
          !isVoided &&
          invoice.fulfillmentStatus !== "FULFILLED" &&
          invoice.fulfillmentStatus !== "CANCELLED" ? (
            <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
              <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Giao hàng đặt trước</p>
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
                Kho chưa trừ. Giao hàng sẽ trừ tồn một lần. Hủy đặt không hoàn tiền tự động.
              </p>
              {error && invoice.remainingDong <= 0 ? (
                <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{error}</p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void onCancelOrder()}
                  className="h-10 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium disabled:opacity-40"
                >
                  Hủy đặt
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void onFulfill()}
                  className="h-10 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Giao hàng
                </button>
              </div>
            </section>
          ) : null}

          {isVoided ? (
            <section className="mt-3 rounded-[12px] border border-[var(--tlkv-red)]/40 bg-[var(--tlkv-red-soft)]/50 p-3">
              <p className="text-[12px] font-semibold text-[var(--tlkv-red)]">Hóa đơn đã hủy</p>
              <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
                Không thu thêm / giao hàng / chỉnh sửa. Chỉ xem lịch sử và in.
              </p>
            </section>
          ) : null}

          {!isVoided && invoice.remainingDong > 0 ? (
            <section className="mt-3 rounded-[12px] border border-[var(--tlkv-amber)]/40 bg-[var(--tlkv-amber-soft)]/40 p-3">
              <p className="text-[12px] font-semibold text-[var(--tlkv-amber)]">Thu tiền còn lại</p>
              <label className="mt-2 block text-[13px]">
                Số tiền thu (VND)
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className={FIELD}
                />
              </label>
              <label className="mt-2 block text-[13px]">
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
              <label className="mt-2 block text-[13px]">
                Ghi chú
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={FIELD}
                  placeholder="Tùy chọn"
                />
              </label>
              {error ? <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{error}</p> : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => void onCollect()}
                className="mt-3 h-10 w-full rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang thu..." : "Xác nhận thu tiền"}
              </button>
            </section>
          ) : null}

          <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Lịch sử thanh toán</p>
            {invoice.payments.length === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">Chưa có lần thu nào.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {invoice.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 border-b border-[var(--tlkv-line)] pb-2 text-[12px] last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{formatDong(p.amountDong)}</p>
                      <p className="text-[var(--tlkv-muted)]">
                        {paymentLabel(p.paymentMethod)} · {formatViDateTime(p.paidAt)}
                      </p>
                      {p.note ? <p className="text-[var(--tlkv-muted)]">{p.note}</p> : null}
                    </div>
                    <span className="shrink-0 text-[var(--tlkv-muted)]">
                      {p.receivedByName || (p.actorEmail.split("@")[0] ?? p.actorEmail)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <table className="mt-4 w-full text-left text-[12px]">
            <thead className="text-[11px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 font-medium">STT</th>
                <th className="py-2 font-medium">Sản phẩm</th>
                <th className="py-2 text-right font-medium">KL/SL</th>
                <th className="py-2 text-right font-medium">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={`${line.skuId}-${index}`} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-2 align-top">{index + 1}</td>
                  <td className="py-2 pr-2">
                    <p className="font-medium">{line.name}</p>
                    <p className="text-[11px] text-[var(--tlkv-muted)]">{line.sku}</p>
                    <p className="text-[11px] text-[var(--tlkv-muted)]">
                      {formatDong(line.unitPriceDong)}
                    </p>
                  </td>
                  <td className="py-2 text-right align-top">
                    <p>{line.quantity}</p>
                    <p className="text-[11px] text-[var(--tlkv-muted)]">{formatChi(line.weightChi)}</p>
                  </td>
                  <td className="py-2 text-right align-top font-medium">
                    {formatDong(line.totalPriceDong)}
                  </td>
                </tr>
              ))}
              {invoice.charges.map((charge) => (
                <tr key={charge.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-2 align-top">+</td>
                  <td className="py-2 pr-2">
                    <p className="font-medium">{charge.name}</p>
                    {charge.reason ? (
                      <p className="text-[11px] text-[var(--tlkv-muted)]">{charge.reason}</p>
                    ) : null}
                  </td>
                  <td className="py-2 text-right align-top">1</td>
                  <td className="py-2 text-right align-top font-medium">
                    {formatDong(charge.amountDong)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span>Tổng đơn</span>
              <span>{formatDong(invoice.totalDong)}</span>
            </div>
            <div className="flex justify-between">
              <span>Còn lại</span>
              <span className="font-medium text-[var(--tlkv-red)]">
                {formatDong(invoice.remainingDong)}
              </span>
            </div>
            <div className="mt-2 flex items-start justify-between border-t border-[var(--tlkv-line)] pt-2">
              <span className="font-semibold">Đã thanh toán</span>
              <div className="text-right">
                <p className="text-[20px] leading-none font-bold text-[var(--tlkv-red)]">
                  {formatDong(invoice.paidDong)}
                </p>
                <p className="mt-1 max-w-[220px] text-[11px] text-[var(--tlkv-muted)]">
                  {formatDongInWords(invoice.paidDong)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--tlkv-line)] px-5 py-3">
          <button
            type="button"
            onClick={openPrintView}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
          >
            <Printer size={16} />
            In hóa đơn
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </div>
      </aside>
    </div>
  );
}
