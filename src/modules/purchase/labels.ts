import type { PaymentMethod, PaymentStatus } from "./types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
};

/** Spec Cluster 1b: short labels for BUY payment status. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: "Đã thanh toán",
  PARTIALLY_PAID: "Một phần",
  UNPAID: "Chưa thanh toán",
  OVERDUE: "Quá hạn",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status;
}

export function paymentStatusBadgeClass(status: string): string {
  if (status === "PAID") {
    return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  }
  if (status === "PARTIALLY_PAID") {
    return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  }
  if (status === "OVERDUE") {
    return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  }
  if (status === "UNPAID") {
    return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
  }
  return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
}

export function formatChi(weightChi: number): string {
  return `${weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}
