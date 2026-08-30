import { PAYMENT_LABEL, PAYMENT_STATUS_LABEL, type PaymentStatus } from "./types";

export function formatInvoicePhone(phone: string): string {
  if (!phone || phone === "WALKIN") return "";
  if (phone.length === 10) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  if (phone.length === 11) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone;
}

export function formatChi(weightChi: number): string {
  return `${weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}

/** Calendar parts of an issued timestamp in Asia/Ho_Chi_Minh (certificate fields). */
export function invoiceIssuedParts(isoDateTime: string): {
  day: string;
  month: string;
  year: string;
  time: string;
} {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return { day: "", month: "", year: "", time: "" };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function invoiceStatusLabel(status: string, saleStatus: string): string {
  if (saleStatus === "COMPLETED" || status === "ISSUED") return "Hoàn thành";
  return status;
}

export function paymentLabel(method: string): string {
  return PAYMENT_LABEL[method] ?? method;
}

export function paymentBadgeClass(method: string): string {
  if (method === "CASH") {
    return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  }
  if (method === "TRANSFER") {
    return "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]";
  }
  if (method === "CARD") {
    return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  }
  return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
}

export function paymentStatusLabel(status: PaymentStatus | string): string {
  return PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status;
}

/** Display status: OVERDUE when remaining + past due date. */
export function effectivePaymentStatus(
  status: PaymentStatus | string,
  remainingDong: number,
  dueDate: string | null,
  todayIso = new Date().toISOString().slice(0, 10),
): PaymentStatus {
  if (remainingDong > 0 && dueDate && dueDate < todayIso) return "OVERDUE";
  if (status === "UNPAID" || status === "PARTIALLY_PAID" || status === "PAID" || status === "OVERDUE") {
    return status;
  }
  if (remainingDong <= 0) return "PAID";
  return "PARTIALLY_PAID";
}

export function paymentStatusBadgeClass(status: PaymentStatus | string): string {
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
