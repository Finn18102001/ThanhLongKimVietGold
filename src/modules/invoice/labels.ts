import { PAYMENT_LABEL } from "./types";

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
