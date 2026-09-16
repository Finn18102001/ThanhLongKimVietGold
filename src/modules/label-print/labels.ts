import type { LabelPrintAction, LabelStockSize } from "./types";

export const ACTION_LABEL: Record<LabelPrintAction, string> = {
  FIRST_PRINT: "In lần đầu",
  REPRINT: "In lại",
};

export const STOCK_SIZE_LABEL: Record<LabelStockSize, string> = {
  "90x14": "90 × 14 mm",
  "21x10": "21 × 10 mm (cũ)",
  "21x12": "21 × 12 mm (cũ)",
};

export function formatChi(value: number): string {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

export function formatDong(value: number): string {
  return `${value.toLocaleString("vi-VN")} đ`;
}
