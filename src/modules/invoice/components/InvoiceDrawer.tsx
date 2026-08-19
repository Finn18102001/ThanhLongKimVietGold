"use client";

import { Printer, X } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import {
  formatChi,
  formatInvoicePhone,
  invoiceStatusLabel,
  paymentBadgeClass,
  paymentLabel,
} from "../labels";
import type { InvoiceDetail } from "../types";

export function InvoiceDrawer({
  invoice,
  onClose,
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
}) {
  const staffName = invoice.actorEmail.split("@")[0] ?? invoice.actorEmail;
  const phone = formatInvoicePhone(invoice.customerPhone);

  function openPrintView() {
    window.open(invoiceDetailPath(invoice.invoiceNo), "_blank", "noopener,noreferrer");
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
            <span className="rounded-full bg-[var(--tlkv-green-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-green)]">
              {invoiceStatusLabel(invoice.status, invoice.saleStatus)}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--tlkv-muted)]">
            {formatViDateTime(invoice.issuedAt)}
          </p>

          <section className="mt-4 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin khách hàng</p>
            <p className="mt-1 text-[14px] font-semibold">{invoice.customerName}</p>
            <p className="text-[13px] text-[var(--tlkv-muted)]">
              {invoice.customerNo ?? "—"}
              {invoice.isWalkIn ? " · Khách vãng lai" : phone ? ` · ${phone}` : ""}
            </p>
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
              Địa chỉ: {invoice.customerAddress || "—"}
            </p>
          </section>

          <section className="mt-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin thanh toán</p>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span>Hình thức</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(invoice.paymentMethod)}`}>
                {paymentLabel(invoice.paymentMethod)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span>Nhân viên</span>
              <span className="font-medium">{staffName}</span>
            </div>
            <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">
              Ghi chú: {invoice.note || "—"}
            </p>
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
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span>Tổng tiền hàng</span>
              <span>{formatDong(invoice.totalDong)}</span>
            </div>
            <div className="flex justify-between text-[var(--tlkv-muted)]">
              <span>Chiết khấu</span>
              <span>0 đ</span>
            </div>
            <div className="flex justify-between text-[var(--tlkv-muted)]">
              <span>Thuế VAT (0%)</span>
              <span>0 đ</span>
            </div>
            <div className="mt-2 flex items-start justify-between border-t border-[var(--tlkv-line)] pt-2">
              <span className="font-semibold">Tổng thanh toán</span>
              <div className="text-right">
                <p className="text-[20px] leading-none font-bold text-[var(--tlkv-red)]">
                  {formatDong(invoice.totalDong)}
                </p>
                <p className="mt-1 max-w-[220px] text-[11px] text-[var(--tlkv-muted)]">
                  {formatDongInWords(invoice.totalDong)}
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
