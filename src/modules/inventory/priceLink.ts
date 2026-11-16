/**
 * Shared price-link helpers for receive / order forms (P8).
 * Money = integer VND. Hệ số is UI-only (no DB column this round).
 */

export type SellPriceMode = "link" | "heso";

/** Board unit stand-in: 0.1 chỉ rows vs per-chỉ (1). Matches create_order_jewelry_sku. */
export function boardUnitChiFromProductName(product: string): number {
  return /0\.1\s*chỉ/i.test(String(product || "")) ? 0.1 : 1;
}

/** Giá vốn / chiếc = buy × weight (no hệ số). */
export function calcCostDongFromBuy(buyDong: number, weightChi: number): number | null {
  if (!Number.isFinite(buyDong) || buyDong < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  return Math.round(buyDong * weightChi);
}

/** Mode link: sell × weight / board_unit (POS compute_unit_price style, no labor). */
export function calcSellDongFromLink(
  sellDong: number,
  weightChi: number,
  boardUnitChi: number,
): number | null {
  if (!Number.isFinite(sellDong) || sellDong < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(boardUnitChi) || boardUnitChi <= 0) return null;
  return Math.round(sellDong * (weightChi / boardUnitChi));
}

/** Mode hệ số: sell × weight × hệ số (customer formula; not cost). */
export function calcSellDongFromHeso(
  sellDong: number,
  weightChi: number,
  heso: number,
): number | null {
  if (!Number.isFinite(sellDong) || sellDong < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(heso) || heso <= 0) return null;
  return Math.round(sellDong * weightChi * heso);
}

export function formatDongPreview(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}
