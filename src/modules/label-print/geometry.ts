/**
 * Jewelry label geometry — phôi thật 90 × 14 mm.
 *
 * Thứ tự in (đuôi bên phải):
 *   [ Mặt 2 30×14 — KLT/KLV/C/G ][ Mặt 1 30×14 — công ty/barcode/MSP ]══ đuôi 30×2 (Đc)
 */

import type { LabelStockSize } from "./types";

export const LABEL_PRINTER_DPI = 203;

/** Canonical stock for new prints. */
export const LABEL_STOCK_CANONICAL: LabelStockSize = "90x14";

export type LabelGeometryMm = {
  pageW: number;
  pageH: number;
  faceW: number;
  faceH: number;
  /** Đuôi length (mm). */
  tailL: number;
  /** Đuôi height (mm) — vật lý 2 mm, căn giữa pageH. */
  tailH: number;
  /** Vùng khử keo trên đuôi (mm) — preview only. */
  adhesiveFreeL: number;
  faceRadius: number;
  /** Inner safe inset from face edge (mm). */
  safePad: number;
};

export function labelGeometryMm(_stock?: LabelStockSize): LabelGeometryMm {
  return {
    pageW: 90,
    pageH: 14,
    faceW: 30,
    faceH: 14,
    tailL: 30,
    tailH: 2,
    adhesiveFreeL: 15,
    faceRadius: 0.6,
    safePad: 0.7,
  };
}

export function mmToPrinterPx(mm: number): number {
  return (mm * LABEL_PRINTER_DPI) / 25.4;
}

/** Screen preview: mm → CSS px, physical aspect locked. */
export const PREVIEW_MM_TO_PX = 6;

export function pageSizeLabel(_stock?: LabelStockSize): string {
  const g = labelGeometryMm();
  return `${g.pageW} × ${g.pageH} mm`;
}

/** 1 pt = 25.4/72 mm — body text ~5–6 pt. */
export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}
