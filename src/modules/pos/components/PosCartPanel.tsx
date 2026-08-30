"use client";

import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { customerInitials, formatPhoneDisplay } from "@/modules/customer/labels";
import type { CustomerRecord } from "@/modules/customer/types";
import type { CartLine } from "../types";
import { ProductThumb } from "./CatalogCard";

export type PosPayMode = "FULL" | "PARTIAL" | "UNPAID";

export function PosCartPanel({
  customer,
  lines,
  displayTotal,
  note,
  paymentMethod,
  payMode,
  paidDong,
  dueDate,
  pending,
  onOpenCustomer,
  onClear,
  onNoteChange,
  onPaymentChange,
  onPayModeChange,
  onPaidDongChange,
  onDueDateChange,
  onQty,
  onRemove,
  onCheckout,
  onCancel,
  onAddMore,
  onSave,
  saving,
  heldHoldNo,
}: {
  customer: CustomerRecord;
  lines: CartLine[];
  displayTotal: number;
  note: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  payMode: PosPayMode;
  paidDong: number;
  dueDate: string;
  pending: boolean;
  saving?: boolean;
  heldHoldNo?: string | null;
  onOpenCustomer: () => void;
  onClear: () => void;
  onNoteChange: (value: string) => void;
  onPaymentChange: (value: "CASH" | "TRANSFER" | "CARD") => void;
  onPayModeChange: (value: PosPayMode) => void;
  onPaidDongChange: (value: number) => void;
  onDueDateChange: (value: string) => void;
  onQty: (skuId: string, quantity: number) => void;
  onRemove: (skuId: string) => void;
  onCheckout: () => void;
  onCancel: () => void;
  onAddMore: () => void;
  onSave: () => void;
}) {
  const effectivePaid =
    payMode === "FULL" ? displayTotal : payMode === "UNPAID" ? 0 : Math.max(0, paidDong);
  const remainingDong = Math.max(0, displayTotal - effectivePaid);

  return (
    <aside className="flex min-h-0 flex-col rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Đơn hàng ({lines.length})</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="inline-flex rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-amber)]">
              Nháp, chưa trừ kho
            </span>
            {heldHoldNo ? (
              <span className="inline-flex rounded-full bg-[var(--tlkv-red-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-red)]">
                {heldHoldNo}
              </span>
            ) : null}
          </div>
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
          {customerInitials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{customer.name}</p>
          <p className="text-[12px] text-[var(--tlkv-muted)]">
            {customer.isWalkIn
              ? "Khách vãng lai"
              : formatPhoneDisplay(customer.phone) || customer.customerNo}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCustomer}
          className="h-9 shrink-0 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold hover:bg-[var(--tlkv-bg)]"
        >
          Chọn khách
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[var(--tlkv-muted)]">
            Chưa chọn sản phẩm. Thêm từ lưới bên trái. Kho chưa trừ.
          </p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-white text-[11px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="px-3 py-2 font-medium">Sản phẩm</th>
                <th className="py-2 font-medium">SL</th>
                <th className="py-2 pr-3 text-right font-medium">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.skuId} className="border-b border-[var(--tlkv-line)]">
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                        <ProductThumb name={line.name} imageUrl={line.imageUrl} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{line.name}</span>
                        <span className="text-[11px] text-[var(--tlkv-muted)]">{line.sku}</span>
                        <span className="block text-[11px] text-[var(--tlkv-muted)]">
                          {formatDong(line.unitPriceDong)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex h-7 w-[76px] items-center rounded-md border border-[var(--tlkv-line)]">
                      <button type="button" aria-label="Giảm" onClick={() => onQty(line.skuId, line.quantity - 1)} className="flex h-7 w-6 items-center justify-center">
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center text-[12px] font-semibold">{line.quantity}</span>
                      <button type="button" aria-label="Tăng" onClick={() => onQty(line.skuId, line.quantity + 1)} className="flex h-7 w-6 items-center justify-center">
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <p className="font-semibold">{formatDong(line.unitPriceDong * line.quantity)}</p>
                    <button
                      type="button"
                      aria-label="Xóa dòng"
                      onClick={() => onRemove(line.skuId)}
                      className="mt-1 text-[var(--tlkv-muted)] hover:text-[var(--tlkv-red)]"
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lines.length > 0 ? (
          <div className="px-4 pt-2">
            <button
              type="button"
              onClick={onAddMore}
              className="text-[12px] font-medium text-[var(--tlkv-red)]"
            >
              + Thêm sản phẩm khác
            </button>
          </div>
        ) : null}
        <div className="px-4 py-3">
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Ghi chú đơn hàng..."
            rows={2}
            className="w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </div>
      </div>

      <div className="border-t border-[var(--tlkv-line)] px-4 py-3">
        <Row label="Tạm tính" value={formatDong(displayTotal)} />
        <Row label="Chiết khấu" value="0 đ" muted />
        <Row label="Thuế VAT (0%)" value="0 đ" muted />
        <div className="mt-2 flex items-start justify-between">
          <span className="text-[13px] font-semibold">Tổng cộng</span>
          <div className="text-right">
            <p className="text-[22px] leading-none font-bold text-[var(--tlkv-red)]">
              {formatDong(displayTotal)}
            </p>
            <p className="mt-1 max-w-[220px] text-[11px] text-[var(--tlkv-muted)]">
              {formatDongInWords(displayTotal)}
            </p>
          </div>
        </div>
        <label className="mt-3 block text-[13px]">
          Hình thức thanh toán
          <select
            value={paymentMethod}
            onChange={(event) =>
              onPaymentChange(event.target.value as "CASH" | "TRANSFER" | "CARD")
            }
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="CASH">Tiền mặt</option>
            <option value="TRANSFER">Chuyển khoản</option>
            <option value="CARD">Thẻ</option>
          </select>
        </label>

        <fieldset className="mt-3">
          <legend className="text-[13px]">Trạng thái thu</legend>
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
                  onClick={() => onPayModeChange(option.value)}
                  className={`h-9 rounded-lg text-[12px] font-semibold ${
                    active
                      ? "bg-[var(--tlkv-red)] text-white"
                      : "border border-[var(--tlkv-line)] text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
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
            Số tiền thu (VND)
            <input
              type="text"
              inputMode="numeric"
              value={paidDong > 0 ? String(paidDong) : ""}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^\d]/g, "");
                onPaidDongChange(digits ? Number(digits) : 0);
              }}
              placeholder="Nhập số đã thu"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
        ) : null}

        {payMode !== "FULL" ? (
          <>
            <label className="mt-3 block text-[13px]">
              Ngày hẹn trả
              <input
                type="date"
                value={dueDate}
                onChange={(event) => onDueDateChange(event.target.value)}
                required
                className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
              />
            </label>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="text-[var(--tlkv-muted)]">Còn phải thu</span>
              <span className="font-semibold text-[var(--tlkv-red)]">
                {formatDong(remainingDong)}
              </span>
            </div>
          </>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending || saving}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium hover:bg-[var(--tlkv-bg)] active:scale-[0.98] disabled:opacity-40"
          >
            Hủy đơn F8
          </button>
          <button
            type="button"
            disabled={pending || saving || lines.length === 0}
            onClick={onSave}
            className="h-10 rounded-lg border border-[var(--tlkv-red)] text-[13px] font-semibold text-[var(--tlkv-red)] hover:bg-[var(--tlkv-red-soft)] active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Đang lưu..." : "Lưu đơn"}
          </button>
          <button
            type="button"
            disabled={pending || saving || lines.length === 0}
            onClick={onCheckout}
            className="col-span-2 h-10 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white active:scale-[0.98] disabled:opacity-40"
          >
            Xác nhận F9
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[13px]">
      <span className={muted ? "text-[var(--tlkv-muted)]" : ""}>{label}</span>
      <span className={muted ? "text-[var(--tlkv-muted)]" : "font-medium"}>{value}</span>
    </div>
  );
}
