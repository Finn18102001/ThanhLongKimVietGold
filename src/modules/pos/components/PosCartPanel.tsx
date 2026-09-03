"use client";

import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { customerInitials, formatPhoneDisplay } from "@/modules/customer/labels";
import type { CustomerRecord } from "@/modules/customer/types";
import {
  chargesTotalDong,
  clampAdjustmentPerChi,
  lineTotalDong,
  PRICE_ADJ_LIMIT_PER_CHI,
  type PosChargeDraft,
} from "../money";
import type { CartLine, PosOperatorOption } from "../types";
import { ProductThumb } from "./CatalogCard";

export type PosPayMode = "FULL" | "PARTIAL" | "UNPAID";

export function PosCartPanel({
  customer,
  lines,
  merchandiseTotal,
  charges,
  displayTotal,
  note,
  paymentMethod,
  payMode,
  paidDong,
  dueDate,
  pending,
  isPreorder,
  isShared,
  operators,
  operatorStaffId,
  pickupDueAt,
  onOpenCustomer,
  onClear,
  onNoteChange,
  onPaymentChange,
  onPayModeChange,
  onPaidDongChange,
  onDueDateChange,
  onQty,
  onAdj,
  onRemove,
  onChargesChange,
  onOperatorChange,
  onPickupDueAtChange,
  onCheckout,
  onCancel,
  onAddMore,
  onSave,
  saving,
  heldHoldNo,
}: {
  customer: CustomerRecord;
  lines: CartLine[];
  merchandiseTotal: number;
  charges: PosChargeDraft[];
  displayTotal: number;
  note: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  payMode: PosPayMode;
  paidDong: number;
  dueDate: string;
  pending: boolean;
  isPreorder: boolean;
  isShared: boolean;
  operators: PosOperatorOption[];
  operatorStaffId: string;
  pickupDueAt: string;
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
  onAdj: (skuId: string, adjustmentPerChi: number) => void;
  onRemove: (skuId: string) => void;
  onChargesChange: (charges: PosChargeDraft[]) => void;
  onOperatorChange: (staffId: string) => void;
  onPickupDueAtChange: (value: string) => void;
  onCheckout: () => void;
  onCancel: () => void;
  onAddMore: () => void;
  onSave: () => void;
}) {
  const extraDong = chargesTotalDong(charges);
  const effectivePaid =
    payMode === "FULL" ? displayTotal : payMode === "UNPAID" ? 0 : Math.max(0, paidDong);
  const remainingDong = Math.max(0, displayTotal - effectivePaid);

  function addCharge() {
    onChargesChange([
      ...charges,
      {
        clientKey: crypto.randomUUID(),
        name: "",
        amountDong: 0,
        reason: "",
      },
    ]);
  }

  function patchCharge(key: string, patch: Partial<PosChargeDraft>) {
    onChargesChange(charges.map((row) => (row.clientKey === key ? { ...row, ...patch } : row)));
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Đơn hàng ({lines.length})</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="inline-flex rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-amber)]">
              Nháp, chưa trừ kho
            </span>
            {isPreorder ? (
              <span className="inline-flex rounded-full bg-[var(--tlkv-blue-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-blue)]">
                Đặt hàng
              </span>
            ) : null}
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
            Chưa chọn sản phẩm. Thêm từ lưới bên trái. Kho chưa trừ. Hết hàng vẫn thêm được để đặt hàng.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--tlkv-line)]">
            {lines.map((line) => {
              const lineTotal = lineTotalDong(
                line.referenceUnitPriceDong,
                line.priceAdjustmentPerChi,
                line.weightChi,
                line.quantity,
              );
              const out = line.stock <= 0;
              return (
                <li key={line.skuId} className="px-3 py-2.5">
                  <div className="flex gap-2">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                      <ProductThumb name={line.name} imageUrl={line.imageUrl} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium">{line.name}</p>
                          <p className="text-[11px] text-[var(--tlkv-muted)]">
                            {line.sku}
                            {out ? " · Hết hàng, đặt hàng" : ` · Tồn ${line.stock}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Xóa dòng"
                          onClick={() => onRemove(line.skuId)}
                          className="text-[var(--tlkv-muted)] hover:text-[var(--tlkv-red)]"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex h-7 w-[76px] items-center rounded-md border border-[var(--tlkv-line)]">
                          <button
                            type="button"
                            aria-label="Giảm"
                            onClick={() => onQty(line.skuId, line.quantity - 1)}
                            className="flex h-7 w-6 items-center justify-center"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-5 text-center text-[12px] font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Tăng"
                            onClick={() => onQty(line.skuId, line.quantity + 1)}
                            className="flex h-7 w-6 items-center justify-center"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <p className="text-[12px] font-semibold">{formatDong(lineTotal)}</p>
                      </div>
                      <label className="mt-1.5 block text-[11px] text-[var(--tlkv-muted)]">
                        Điều chỉnh /chỉ (±{PRICE_ADJ_LIMIT_PER_CHI.toLocaleString("vi-VN")}đ)
                        <input
                          type="number"
                          step={1000}
                          min={-PRICE_ADJ_LIMIT_PER_CHI}
                          max={PRICE_ADJ_LIMIT_PER_CHI}
                          value={line.priceAdjustmentPerChi}
                          onChange={(event) =>
                            onAdj(
                              line.skuId,
                              clampAdjustmentPerChi(Number(event.target.value) || 0),
                            )
                          }
                          className="mt-0.5 h-7 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                        />
                      </label>
                      <p className="mt-0.5 text-[11px] text-[var(--tlkv-muted)]">
                        Bảng {formatDong(line.referenceUnitPriceDong)} · GD{" "}
                        {formatDong(line.unitPriceDong)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold">Khoản thu thêm</p>
            <button
              type="button"
              onClick={addCharge}
              className="text-[12px] font-medium text-[var(--tlkv-red)]"
            >
              + Thêm khoản
            </button>
          </div>
          {charges.length === 0 ? (
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
              Phí gia công, hộp, vận chuyển... Không gộp vào giá sản phẩm.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {charges.map((row) => (
                <li key={row.clientKey} className="rounded-lg border border-[var(--tlkv-line)] p-2">
                  <label className="block text-[11px] text-[var(--tlkv-muted)]">
                    Tên khoản
                    <input
                      value={row.name}
                      onChange={(event) => patchCharge(row.clientKey, { name: event.target.value })}
                      className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                    />
                  </label>
                  <label className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                    Số tiền (VND)
                    <input
                      inputMode="numeric"
                      value={row.amountDong > 0 ? String(row.amountDong) : ""}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^\d]/g, "");
                        patchCharge(row.clientKey, { amountDong: digits ? Number(digits) : 0 });
                      }}
                      className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                    />
                  </label>
                  <label className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                    Lý do
                    <input
                      value={row.reason}
                      onChange={(event) =>
                        patchCharge(row.clientKey, { reason: event.target.value })
                      }
                      className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChargesChange(charges.filter((item) => item.clientKey !== row.clientKey))
                    }
                    className="mt-1 text-[11px] text-[var(--tlkv-red)]"
                  >
                    Xóa khoản
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 pb-3">
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
        <Row label="Tiền hàng" value={formatDong(merchandiseTotal)} />
        <Row label="Khoản thu thêm" value={formatDong(extraDong)} muted={extraDong === 0} />
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

        {isShared ? (
          <label className="mt-3 block text-[13px]">
            Nhân viên đứng quầy
            <select
              value={operatorStaffId}
              onChange={(event) => onOperatorChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Chọn nhân viên</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.fullName} ({op.staffNo})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isPreorder ? (
          <label className="mt-3 block text-[13px]">
            Hẹn trả hàng
            <input
              type="datetime-local"
              value={pickupDueAt}
              onChange={(event) => onPickupDueAtChange(event.target.value)}
              required
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
            <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
              Đơn đặt hàng. Kho chưa trừ đến khi giao.
            </span>
          </label>
        ) : null}

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
              Ngày hẹn trả tiền
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
            {isPreorder ? "Đặt hàng F9" : "Xác nhận F9"}
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
