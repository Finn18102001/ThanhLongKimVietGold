"use client";

import { Warning } from "@phosphor-icons/react";
import { formatViDate } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { customerInitials, formatPhoneDisplay } from "@/modules/customer/labels";
import type { CustomerRecord } from "@/modules/customer/types";
import { formatChi, paymentMethodLabel } from "../labels";
import {
  lineHasPriceException,
  lineTotalDong,
  type BuyLine,
  type BuyPayMode,
  type PaymentMethod,
} from "../types";

export function PurchaseInvoicePreview({
  customer,
  lines,
  totalDong,
  effectivePaid,
  remainingDong,
  paymentMethod,
  payMode,
  dueDate,
}: {
  customer: CustomerRecord | null;
  lines: BuyLine[];
  totalDong: number;
  effectivePaid: number;
  remainingDong: number;
  paymentMethod: PaymentMethod;
  payMode: BuyPayMode;
  dueDate: string;
}) {
  const anyException = lines.some(lineHasPriceException);
  const payLabel =
    payMode === "FULL" ? "Đủ" : payMode === "PARTIAL" ? "Một phần" : "Chờ thanh toán";

  return (
    <aside className="flex h-fit flex-col rounded-[12px] border border-[var(--tlkv-line)] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <p className="text-center text-[11px] font-semibold tracking-[0.12em] text-[var(--tlkv-muted)]">
        HÓA ĐƠN MUA HÀNG
      </p>
      <p className="mt-1 text-center text-[15px] font-bold text-[var(--tlkv-red)]">
        Thăng Long Kim Việt
      </p>

      {anyException ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--tlkv-amber)]/50 bg-[var(--tlkv-amber-soft)] px-3 py-2 text-[11px] font-medium text-[var(--tlkv-amber)]">
          <Warning size={14} className="mt-0.5 shrink-0" />
          <span>
            Có dòng sản phẩm catalog vượt ±300.000đ/chỉ. Cần duyệt ngoại lệ trước khi chốt.
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3 border-b border-[var(--tlkv-line)] pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[12px] font-bold text-[var(--tlkv-red)]">
          {customer ? customerInitials(customer.name) : "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {customer ? customer.name : "Chưa chọn khách"}
          </p>
          <p className="text-[11px] text-[var(--tlkv-muted)]">
            {customer
              ? formatPhoneDisplay(customer.phone) || customer.customerNo
              : "Bắt buộc khách thật"}
          </p>
        </div>
      </div>

      <ul className="mt-3 max-h-[280px] space-y-2 overflow-y-auto text-[12px]">
        {lines.length === 0 ? (
          <li className="py-6 text-center text-[var(--tlkv-muted)]">Chưa có hàng trên phiếu.</li>
        ) : (
          lines.map((line) => (
            <li
              key={line.localId}
              className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--tlkv-line)] pb-2"
            >
              <div className="min-w-0">
                <p className="font-medium">{line.productName}</p>
                <p className="text-[11px] text-[var(--tlkv-muted)]">
                  {line.quantity} × {formatChi(line.weightChi)} · {formatDong(line.unitPriceDong)}
                  /chỉ
                  {line.isMarketGold ? " · TT" : ""}
                  {lineHasPriceException(line) ? " · ±300k" : ""}
                </p>
              </div>
              <p className="shrink-0 font-semibold">{formatDong(lineTotalDong(line))}</p>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 space-y-1 border-t border-[var(--tlkv-line)] pt-3 text-[13px]">
        <Row label="Tổng" value={formatDong(totalDong)} strong />
        <Row label={`Trả (${payLabel})`} value={formatDong(effectivePaid)} />
        <Row label="Còn trả" value={formatDong(remainingDong)} accent />
        <Row label="Hình thức" value={paymentMethodLabel(paymentMethod)} />
        {remainingDong > 0 ? <Row label="Hẹn trả" value={formatViDate(dueDate)} /> : null}
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[var(--tlkv-muted)]">{label}</span>
      <span
        className={
          accent
            ? "font-semibold text-[var(--tlkv-red)]"
            : strong
              ? "font-semibold"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}
