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
  if (status === "ISSUED") return "Đã phát hành";
  if (saleStatus === "COMPLETED") return "Đã chốt giao dịch";
  return status;
}

export function fulfillmentLabel(
  transactionType: string | null | undefined,
  fulfillmentStatus: string | null | undefined,
): string {
  if (transactionType === "PREORDER") {
    if (fulfillmentStatus === "FULFILLED") return "Đã trả hàng";
    if (fulfillmentStatus === "CANCELLED") return "Đã hủy đặt";
    if (fulfillmentStatus === "READY") return "Sẵn sàng giao";
    return "Chưa trả hàng";
  }
  return "Đã giao";
}

export function transactionTypeLabel(transactionType: string | null | undefined): string {
  return transactionType === "PREORDER" ? "Đặt hàng" : "Bán ngay";
}

export function documentTypeLabel(type: string | null | undefined): string {
  if (type === "PURCHASE_FROM_CUSTOMER") return "Mua từ khách";
  if (type === "STOCK_RECEIPT") return "Nhập hàng";
  return "Bán cho khách";
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

/** Display status: amounts win over a stale PAID flag. */
export function effectivePaymentStatus(
  status: PaymentStatus | string,
  remainingDong: number,
  dueDate: string | null,
  todayIso = new Date().toISOString().slice(0, 10),
  paidDong?: number,
): PaymentStatus {
  if (remainingDong > 0 && dueDate && dueDate < todayIso) return "OVERDUE";
  if (remainingDong <= 0) return "PAID";
  if ((paidDong ?? 0) <= 0) return "UNPAID";
  if (status === "UNPAID" || status === "PARTIALLY_PAID" || status === "OVERDUE") {
    return status;
  }
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

/** Customer req §7: aggregate from payment × gold delivery (not staff-picked). */
export type InvoiceLifecycleStatus =
  | "PARTIAL"
  | "AWAITING_GOLD"
  | "AWAITING_PAYMENT"
  | "COMPLETED";

export function isPaymentSettled(
  remainingDong: number,
  paymentStatus?: PaymentStatus | string,
): boolean {
  if (remainingDong <= 0) return true;
  return paymentStatus === "PAID";
}

export function isGoldDelivered(
  transactionType: string | null | undefined,
  fulfillmentStatus: string | null | undefined,
): boolean {
  if (transactionType === "PREORDER") {
    return fulfillmentStatus === "FULFILLED";
  }
  // Immediate sale / delivered default
  if (!fulfillmentStatus || fulfillmentStatus === "DELIVERED" || fulfillmentStatus === "FULFILLED") {
    return true;
  }
  if (fulfillmentStatus === "CANCELLED") return false;
  return false;
}

export function invoiceLifecycleStatus(
  remainingDong: number,
  transactionType: string | null | undefined,
  fulfillmentStatus: string | null | undefined,
  paymentStatus?: PaymentStatus | string,
): InvoiceLifecycleStatus {
  const paid = isPaymentSettled(remainingDong, paymentStatus);
  const delivered = isGoldDelivered(transactionType, fulfillmentStatus);
  if (paid && delivered) return "COMPLETED";
  if (paid && !delivered) return "AWAITING_GOLD";
  if (!paid && delivered) return "AWAITING_PAYMENT";
  return "PARTIAL";
}

export function invoiceLifecycleLabel(status: InvoiceLifecycleStatus): string {
  switch (status) {
    case "PARTIAL":
      return "1 phần";
    case "AWAITING_GOLD":
      return "Chưa trả vàng";
    case "AWAITING_PAYMENT":
      return "Chưa thanh toán đủ";
    case "COMPLETED":
      return "Hoàn thành";
  }
}

export function invoiceLifecycleBadgeClass(status: InvoiceLifecycleStatus): string {
  if (status === "COMPLETED") {
    return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  }
  if (status === "AWAITING_GOLD") {
    return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  }
  if (status === "AWAITING_PAYMENT") {
    return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  }
  return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
}

/** Incomplete = not fully paid+delivered; may still collect payment / fulfill. */
export function isInvoiceIncomplete(status: InvoiceLifecycleStatus): boolean {
  return status !== "COMPLETED";
}
