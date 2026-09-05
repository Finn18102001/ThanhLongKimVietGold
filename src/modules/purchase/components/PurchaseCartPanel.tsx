"use client";

import { Minus, Plus, Trash, Warning } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { customerInitials, formatPhoneDisplay } from "@/modules/customer/labels";
import type { CustomerRecord } from "@/modules/customer/types";
import { formatChi } from "../labels";
import {
  PRICE_EXCEPTION_THRESHOLD_DONG,
  PRICE_OUT_OF_RANGE_INLINE,
  buyUnitPriceBounds,
  clampBuyUnitPriceDong,
  lineHasPriceException,
  lineTotalDong,
  type BuyLine,
  type BuyPayMode,
  type PaymentMethod,
} from "../types";
import { parseDongInput, purchaseInputClass } from "./purchaseFormUtils";
import { PurchaseProductThumb } from "./PurchaseCatalogCard";

const PRICE_STEP = 10_000;

export function PurchaseCartPanel({
  customer,
  debt,
  lines,
  totalDong,
  effectivePaid,
  remainingDong,
  paymentMethod,
  payMode,
  paidDong,
  dueDate,
  note,
  pending,
  anyCatalogException,
  onOpenCustomer,
  onClear,
  onChangeLine,
  onRemove,
  onPaymentMethod,
  onPayMode,
  onPaidDong,
  onDueDate,
  onNote,
  onCheckout,
}: {
  customer: CustomerRecord | null;
  debt: { payableDong: number; receivableDong: number; buyCount: number; saleCount: number } | null;
  lines: BuyLine[];
  totalDong: number;
  effectivePaid: number;
  remainingDong: number;
  paymentMethod: PaymentMethod;
  payMode: BuyPayMode;
  paidDong: number;
  dueDate: string;
  note: string;
  pending: boolean;
  anyCatalogException: boolean;
  onOpenCustomer: () => void;
  onClear: () => void;
  onChangeLine: (localId: string, patch: Partial<BuyLine>) => void;
  onRemove: (localId: string) => void;
  onPaymentMethod: (m: PaymentMethod) => void;
  onPayMode: (m: BuyPayMode) => void;
  onPaidDong: (n: number) => void;
  onDueDate: (v: string) => void;
  onNote: (v: string) => void;
  onCheckout: () => void;
}) {
  function setUnitPrice(line: BuyLine, next: number) {
    onChangeLine(line.localId, {
      unitPriceDong: clampBuyUnitPriceDong(
        next,
        line.referencePriceDongPerChi,
        line.isMarketGold,
      ),
    });
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Phiếu mua ({lines.length})</h2>
          <span className="mt-1 inline-flex rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-amber)]">
            Nháp, chưa cộng kho
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={lines.length === 0}
          className="text-[12px] font-medium text-[var(--tlkv-red)] disabled:opacity-40"
        >
          Xóa tất cả
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-[var(--tlkv-line)] px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[12px] font-bold text-[var(--tlkv-red)]">
          {customer ? customerInitials(customer.name) : "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {customer ? customer.name : "Chưa chọn khách"}
          </p>
          <p className="text-[12px] text-[var(--tlkv-muted)]">
            {customer
              ? formatPhoneDisplay(customer.phone) || customer.customerNo
              : "Bắt buộc khách thật"}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCustomer}
          className="h-9 shrink-0 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold hover:bg-[var(--tlkv-bg)]"
        >
          {customer ? "Đổi khách" : "Chọn khách"}
        </button>
      </div>

      {debt && customer ? (
        <div className="grid grid-cols-2 gap-1.5 border-b border-[var(--tlkv-line)] px-3 py-2 text-[10px]">
          <span className="text-[var(--tlkv-muted)]">
            CH nợ KH: <strong className="text-[var(--tlkv-text)]">{formatDong(debt.payableDong)}</strong>
          </span>
          <span className="text-[var(--tlkv-muted)]">
            KH nợ CH:{" "}
            <strong className="text-[var(--tlkv-text)]">{formatDong(debt.receivableDong)}</strong>
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[var(--tlkv-muted)]">
            Chưa có hàng. Chọn từ lưới bên trái - chỉnh SL và giá mua ngay trên phiếu.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--tlkv-line)]">
            {lines.map((line) => {
              const exception = lineHasPriceException(line);
              const bounds = !line.isMarketGold
                ? buyUnitPriceBounds(line.referencePriceDongPerChi)
                : null;
              return (
                <li key={line.localId} className="px-3 py-2.5">
                  <div className="flex gap-2">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[#f8f1e7]">
                      <PurchaseProductThumb name={line.productName} imageUrl={line.imageUrl} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium">{line.productName}</p>
                          <p className="text-[11px] text-[var(--tlkv-muted)]">
                            {line.isMarketGold
                              ? "Vàng thị trường"
                              : line.kind === "catalog"
                                ? line.sku
                                : ""}
                            {line.weightChi > 0 ? ` · ${formatChi(line.weightChi)}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Xóa dòng"
                          onClick={() => onRemove(line.localId)}
                          className="text-[var(--tlkv-muted)] hover:text-[var(--tlkv-red)]"
                        >
                          <Trash size={14} />
                        </button>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex h-7 w-[76px] items-center rounded-md border border-[var(--tlkv-line)]">
                          <button
                            type="button"
                            aria-label="Giảm SL"
                            onClick={() =>
                              onChangeLine(line.localId, {
                                quantity: Math.max(1, line.quantity - 1),
                              })
                            }
                            className="flex h-7 w-6 items-center justify-center"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-5 text-center text-[12px] font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Tăng SL"
                            onClick={() =>
                              onChangeLine(line.localId, { quantity: line.quantity + 1 })
                            }
                            className="flex h-7 w-6 items-center justify-center"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <p className="text-[12px] font-semibold">{formatDong(lineTotalDong(line))}</p>
                      </div>

                      <label className="mt-1.5 block text-[11px] text-[var(--tlkv-muted)]">
                        Giá mua / chỉ
                        {!line.isMarketGold
                          ? ` (±${PRICE_EXCEPTION_THRESHOLD_DONG.toLocaleString("vi-VN")}đ)`
                          : " (tự do)"}
                        <div className="mt-0.5 flex items-center gap-0.5">
                          {!line.isMarketGold ? (
                            <button
                              type="button"
                              aria-label="Giảm giá"
                              onClick={() => setUnitPrice(line, line.unitPriceDong - PRICE_STEP)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--tlkv-line)]"
                            >
                              <Minus size={11} />
                            </button>
                          ) : null}
                          <input
                            inputMode="numeric"
                            value={String(line.unitPriceDong)}
                            onChange={(e) => {
                              const raw = parseDongInput(e.target.value);
                              onChangeLine(line.localId, { unitPriceDong: raw });
                            }}
                            className={`h-7 min-w-0 flex-1 rounded-md border px-2 text-[12px] outline-none focus:border-[var(--tlkv-red)] ${
                              exception
                                ? "border-[var(--tlkv-red)] text-[var(--tlkv-red)]"
                                : "border-[var(--tlkv-line)] text-[var(--tlkv-text)]"
                            }`}
                          />
                          {!line.isMarketGold ? (
                            <button
                              type="button"
                              aria-label="Tăng giá"
                              onClick={() => setUnitPrice(line, line.unitPriceDong + PRICE_STEP)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--tlkv-line)]"
                            >
                              <Plus size={11} />
                            </button>
                          ) : null}
                        </div>
                      </label>
                      {!line.isMarketGold && bounds ? (
                        <p className="mt-0.5 text-[10px] text-[var(--tlkv-muted)]">
                          Niêm yết {formatDong(line.referencePriceDongPerChi)} · Cho phép{" "}
                          {formatDong(bounds.min)}–{formatDong(bounds.max)}
                        </p>
                      ) : null}
                      {exception ? (
                        <p className="mt-0.5 flex items-start gap-1 text-[10px] font-medium text-[var(--tlkv-red)]">
                          <Warning size={12} className="mt-0.5 shrink-0" />
                          <span>{PRICE_OUT_OF_RANGE_INLINE}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-4 py-3">
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ghi chú phiếu mua..."
            rows={2}
            className="w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </div>
      </div>

      <div className="border-t border-[var(--tlkv-line)] px-4 py-3">
        <div className="flex items-start justify-between">
          <span className="text-[13px] font-semibold">Tổng cộng</span>
          <div className="text-right">
            <p className="text-[22px] leading-none font-bold text-[var(--tlkv-red)]">
              {formatDong(totalDong)}
            </p>
            {totalDong > 0 ? (
              <p className="mt-1 max-w-[220px] text-[11px] text-[var(--tlkv-muted)]">
                {formatDongInWords(totalDong)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-[var(--tlkv-muted)]">
          <span>Trả ngay</span>
          <span className="font-medium text-[var(--tlkv-text)]">{formatDong(effectivePaid)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[12px] text-[var(--tlkv-muted)]">
          <span>Còn trả</span>
          <span className="font-semibold text-[var(--tlkv-red)]">{formatDong(remainingDong)}</span>
        </div>

        {anyCatalogException ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-[var(--tlkv-red)]/40 bg-[var(--tlkv-red-soft)] px-2.5 py-2 text-[11px] font-medium text-[var(--tlkv-red)]">
            <Warning size={14} className="mt-0.5 shrink-0" />
            {PRICE_OUT_OF_RANGE_INLINE} Bấm xác nhận sẽ bị chặn đến khi chỉnh lại.
          </div>
        ) : null}

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

        {payMode === "PARTIAL" ? (
          <label className="mt-3 block text-[13px]">
            Số tiền trả (VND)
            <input
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

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-11 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
          >
            Hủy nháp
          </button>
          <button
            type="button"
            disabled={pending || lines.length === 0}
            onClick={onCheckout}
            className="h-11 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Xác nhận F9
          </button>
        </div>
      </div>
    </aside>
  );
}
