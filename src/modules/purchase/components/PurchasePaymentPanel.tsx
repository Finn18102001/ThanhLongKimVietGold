"use client";

import { Warning } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import type { BuyPayMode, PaymentMethod } from "../types";
import { parseDongInput, purchaseInputClass } from "./purchaseFormUtils";

export function PurchasePaymentPanel({
  totalDong,
  effectivePaid,
  remainingDong,
  paymentMethod,
  onPaymentMethod,
  payMode,
  onPayMode,
  paidDong,
  onPaidDong,
  dueDate,
  onDueDate,
  note,
  onNote,
  anyCatalogException,
  approveException,
  onApproveException,
  exceptionReason,
  onExceptionReason,
}: {
  totalDong: number;
  effectivePaid: number;
  remainingDong: number;
  paymentMethod: PaymentMethod;
  onPaymentMethod: (m: PaymentMethod) => void;
  payMode: BuyPayMode;
  onPayMode: (m: BuyPayMode) => void;
  paidDong: number;
  onPaidDong: (n: number) => void;
  dueDate: string;
  onDueDate: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  anyCatalogException: boolean;
  approveException: boolean;
  onApproveException: (v: boolean) => void;
  exceptionReason: string;
  onExceptionReason: (v: string) => void;
}) {
  return (
    <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <h2 className="text-[15px] font-semibold">Thanh toán</h2>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <Kpi label="Tổng tiền" value={formatDong(totalDong)} />
        <Kpi label="Đã trả" value={formatDong(effectivePaid)} />
        <Kpi label="Còn phải trả" value={formatDong(remainingDong)} accent />
      </div>
      {totalDong > 0 ? (
        <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">{formatDongInWords(totalDong)}</p>
      ) : null}

      <fieldset className="mt-3">
        <legend className="text-[13px]">Trả cho khách</legend>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {(
            [
              { value: "FULL" as const, label: "Đủ" },
              { value: "PARTIAL" as const, label: "Một phần" },
              { value: "UNPAID" as const, label: "Chờ TT" },
            ] as const
          ).map((option) => {
            const active = payMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPayMode(option.value)}
                className={`h-9 rounded-lg text-[12px] font-semibold ${
                  active
                    ? "bg-[var(--tlkv-red)] text-white"
                    : "border border-[var(--tlkv-line)] hover:bg-[var(--tlkv-bg)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-3 block text-[13px]">
        Hình thức
        <select
          value={paymentMethod}
          onChange={(e) => onPaymentMethod(e.target.value as PaymentMethod)}
          className={`${purchaseInputClass} mt-1`}
        >
          <option value="CASH">Tiền mặt</option>
          <option value="TRANSFER">Chuyển khoản</option>
          <option value="CARD">Thẻ</option>
        </select>
      </label>

      {payMode === "PARTIAL" ? (
        <label className="mt-3 block text-[13px]">
          Số tiền trả (VND)
          <input
            type="text"
            inputMode="numeric"
            value={paidDong > 0 ? String(paidDong) : ""}
            onChange={(e) => onPaidDong(parseDongInput(e.target.value))}
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
      ) : null}

      {remainingDong > 0 ? (
        <label className="mt-3 block text-[13px]">
          Ngày hẹn trả
          <input
            type="date"
            value={dueDate}
            onChange={(e) => onDueDate(e.target.value)}
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
      ) : null}

      <label className="mt-3 block text-[13px]">
        Ghi chú
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          className={`${purchaseInputClass} mt-1`}
          placeholder="Ghi chú phiếu mua..."
        />
      </label>

      {anyCatalogException ? (
        <div className="mt-3 rounded-lg border border-[var(--tlkv-amber)]/40 bg-[var(--tlkv-amber-soft)] px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-[12px] font-medium text-[var(--tlkv-amber)]">
            <Warning size={14} className="mt-0.5 shrink-0" />
            Có dòng catalog vượt ngưỡng ±300.000đ/chỉ
          </p>
          <label className="mt-2 flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={approveException}
              onChange={(e) => onApproveException(e.target.checked)}
              className="mt-0.5"
            />
            <span>Quản trị duyệt ngoại lệ</span>
          </label>
          {approveException ? (
            <textarea
              value={exceptionReason}
              onChange={(e) => onExceptionReason(e.target.value)}
              rows={2}
              className={`${purchaseInputClass} mt-2`}
              placeholder="Lý do duyệt ngoại lệ giá..."
            />
          ) : (
            <p className="mt-1.5 text-[11px] text-[var(--tlkv-muted)]">
              Backend chỉ chấp nhận khi tài khoản admin duyệt kèm lý do.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <p className="text-[10px] text-[var(--tlkv-muted)]">{label}</p>
      <p
        className={`mt-0.5 text-[12px] font-semibold ${accent ? "text-[var(--tlkv-red)]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
