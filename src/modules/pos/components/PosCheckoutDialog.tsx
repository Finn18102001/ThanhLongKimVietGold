"use client";

import { Warning } from "@phosphor-icons/react";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { formatPhoneDisplay } from "@/modules/customer/labels";
import { Modal } from "@/shared/ui/Modal";
import type { CustomerRecord } from "@/modules/customer/types";
import { chargesTotalDong, lineTotalDong, type PosChargeDraft } from "../money";
import type { CartLine } from "../types";
import { ProductThumb } from "./CatalogCard";

const PAYMENT_LABEL = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
} as const;

export function PosCheckoutDialog({
  customer,
  lines,
  charges,
  displayTotal,
  paymentMethod,
  note,
  paidDong,
  remainingDong,
  dueDate,
  pending,
  isPreorder,
  operatorName,
  pickupDueAt,
  onClose,
  onConfirm,
  onChangeCustomer,
}: {
  customer: CustomerRecord;
  lines: CartLine[];
  charges: PosChargeDraft[];
  displayTotal: number;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note: string;
  paidDong: number;
  remainingDong: number;
  dueDate: string | null;
  pending: boolean;
  isPreorder: boolean;
  operatorName: string | null;
  pickupDueAt: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onChangeCustomer: () => void;
}) {
  const extraDong = chargesTotalDong(charges);
  const merch = displayTotal - extraDong;

  return (
    <Modal
      title={isPreorder ? "Xác nhận đặt hàng" : "Xác nhận đơn hàng"}
      wide
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
          >
            Quay lại
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {pending
              ? "Đang chốt..."
              : isPreorder
                ? "Đặt hàng F9"
                : "Xác nhận & thanh toán F9"}
          </button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--tlkv-amber-soft)] px-3 py-2.5 text-[13px] text-[var(--tlkv-amber)]">
        <Warning size={18} className="mt-0.5 shrink-0" />
        <p>
          {isPreorder
            ? "Đơn đặt hàng. Kho chưa trừ. Hàng trừ khi giao. Kiểm tra khách, giá điều chỉnh và ngày hẹn trả hàng trước khi chốt."
            : "Kiểm tra khách hàng, giá giao dịch và số lượng trước khi chốt. Kho chưa trừ ngay. Hệ thống sẽ kiểm tra tồn, giá và quyền, rồi phát hành hóa đơn và trừ kho trong một bước."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[var(--tlkv-line)] p-3">
            <div>
              <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin khách hàng</p>
              <p className="mt-1 text-[14px] font-semibold">{customer.name}</p>
              <p className="text-[13px] text-[var(--tlkv-muted)]">
                {customer.customerNo}
                {customer.isWalkIn
                  ? " · Khách vãng lai"
                  : formatPhoneDisplay(customer.phone)
                    ? ` · ${formatPhoneDisplay(customer.phone)}`
                    : ""}
              </p>
              {customer.address ? (
                <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{customer.address}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onChangeCustomer}
              className="h-8 shrink-0 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              Thay đổi
            </button>
          </div>

          <table className="mt-3 w-full text-left text-[13px]">
            <thead className="text-[11px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 font-medium">Sản phẩm</th>
                <th className="py-2 font-medium">SL</th>
                <th className="py-2 text-right font-medium">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.skuId} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="relative h-9 w-9 overflow-hidden rounded-md">
                        <ProductThumb name={line.name} imageUrl={line.imageUrl} />
                      </span>
                      <span>
                        <span className="block font-medium">{line.name}</span>
                        <span className="text-[12px] text-[var(--tlkv-muted)]">
                          {line.sku}
                          {line.stock <= 0 ? " · Đặt hàng" : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5">{line.quantity}</td>
                  <td className="py-2.5 text-right font-medium">
                    {formatDong(
                      lineTotalDong(
                        line.referenceUnitPriceDong,
                        line.priceAdjustmentPerChi,
                        line.weightChi,
                        line.quantity,
                      ),
                    )}
                  </td>
                </tr>
              ))}
              {charges
                .filter((row) => row.name.trim() && row.amountDong > 0)
                .map((row) => (
                  <tr key={row.clientKey} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-2.5 font-medium">{row.name}</td>
                    <td className="py-2.5">1</td>
                    <td className="py-2.5 text-right font-medium">{formatDong(row.amountDong)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-[12px] bg-[var(--tlkv-bg)] p-3">
          <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thanh toán</p>
          <p className="mt-1 text-[13px] font-medium">{PAYMENT_LABEL[paymentMethod]}</p>
          {operatorName ? (
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">NV quầy: {operatorName}</p>
          ) : null}
          {note ? <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">Ghi chú: {note}</p> : null}
          <div className="mt-3 space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span>Tiền hàng</span>
              <span>{formatDong(merch)}</span>
            </div>
            <div className="flex justify-between">
              <span>Khoản thu thêm</span>
              <span>{formatDong(extraDong)}</span>
            </div>
            <div className="flex justify-between">
              <span>Đã thu</span>
              <span className="font-medium">{formatDong(paidDong)}</span>
            </div>
            <div className="flex justify-between">
              <span>Còn lại</span>
              <span className="font-semibold text-[var(--tlkv-red)]">
                {formatDong(remainingDong)}
              </span>
            </div>
            {remainingDong > 0 ? (
              <div className="flex justify-between">
                <span>Hẹn trả tiền</span>
                <span className="font-medium">
                  {dueDate
                    ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("vi-VN")
                    : "-"}
                </span>
              </div>
            ) : null}
            {isPreorder ? (
              <div className="flex justify-between">
                <span>Hẹn trả hàng</span>
                <span className="font-medium">
                  {pickupDueAt ? new Date(pickupDueAt).toLocaleString("vi-VN") : "-"}
                </span>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-[12px] text-[var(--tlkv-muted)]">Tổng cộng</p>
          <p className="text-[20px] font-bold text-[var(--tlkv-red)]">{formatDong(displayTotal)}</p>
          <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">{formatDongInWords(displayTotal)}</p>
        </aside>
      </div>
    </Modal>
  );
}
