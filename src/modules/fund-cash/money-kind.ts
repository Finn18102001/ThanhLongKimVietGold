import type { EmployeeCashMoneyKind } from "./types";

/** Map payment_method HĐ/YC → bucket quỹ (CASH=TM, còn lại=CK). */
export function moneyKindFromPaymentMethod(method: string | null | undefined): EmployeeCashMoneyKind {
  return String(method ?? "CASH").trim().toUpperCase() === "CASH" ? "CASH" : "BANK";
}

export function formatMoneyKind(kind: EmployeeCashMoneyKind | string | null | undefined): string {
  return String(kind ?? "CASH").toUpperCase() === "BANK" ? "Chuyển khoản" : "Tiền mặt";
}

export function formatPaymentMethod(method: string | null | undefined): string {
  const m = String(method ?? "CASH").trim().toUpperCase();
  if (m === "TRANSFER") return "Chuyển khoản";
  if (m === "CARD") return "Thẻ";
  if (m === "MIXED") return "Hỗn hợp";
  return "Tiền mặt";
}
