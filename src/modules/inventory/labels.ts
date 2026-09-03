import type { LedgerRow } from "./types";

export const STOCK_STATUS_LABEL = {
  IN_STOCK: "Còn hàng",
  LOW_STOCK: "Sắp hết hàng",
  OUT_OF_STOCK: "Hết hàng",
} as const;

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  PURCHASE_RECEIVED: "Nhập hàng",
  SALE: "Xuất bán",
  CUSTOMER_RETURN: "Khách trả",
  SUPPLIER_RETURN: "Trả NCC",
  STOCK_ADJUSTMENT_IN: "Điều chỉnh tăng",
  STOCK_ADJUSTMENT_OUT: "Điều chỉnh giảm",
};

export const LEDGER_TYPE_OPTIONS = [
  { value: "", label: "Tất cả loại" },
  { value: "PURCHASE_RECEIVED", label: "Nhập hàng / mua từ khách" },
  { value: "SALE", label: "Xuất bán" },
  { value: "STOCK_ADJUSTMENT_IN", label: "Điều chỉnh tăng" },
  { value: "STOCK_ADJUSTMENT_OUT", label: "Điều chỉnh giảm" },
  { value: "CUSTOMER_RETURN", label: "Khách trả" },
] as const;

export function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABEL[type] ?? type;
}

export function ledgerTone(row: LedgerRow): string {
  if (row.quantity > 0) return "text-[var(--tlkv-green)]";
  if (row.type === "SALE") return "text-[var(--tlkv-blue)]";
  return "text-[var(--tlkv-amber)]";
}
