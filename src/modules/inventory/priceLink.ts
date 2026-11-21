/**
 * Shared price-link helpers for receive / order forms (P8 + P9).
 * Money = integer VND. Hệ số is UI-only (no DB column this round).
 * P9: gold receive = TL × HL × spot24K + tiền công nhập.
 * Sell labor (tiền công bán) entered at receive → saved to pos_skus.labor_fee_dong.
 */

import { formatDongDigits } from "@/shared/lib/money";

export type SellPriceMode = "link" | "heso";

/** Receive metal tab — UI only; silver cost/sell are manual (no board autofill). */
export type ReceiveMetalKind = "gold" | "silver";

/** Board unit stand-in: 0.1 chỉ rows vs per-chỉ (1). Matches create_order_jewelry_sku. */
export function boardUnitChiFromProductName(product: string): number {
  return /0\.1\s*chỉ/i.test(String(product || "")) ? 0.1 : 1;
}

/**
 * Convert hàm lượng / tuổi vàng to decimal fraction for formulas.
 * ≤1 → already decimal; ≤100 → percent; &lt;10000 → millesimal/1000 (610→0.61, 999→0.999);
 * ≥10000 → /10000 (9999→0.9999).
 */
export function purityToDecimal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  if (n < 10000) return n / 1000;
  return n / 10000;
}

/** Normalize board sell to VND / chỉ. */
export function boardSellPerChi(boardSellDong: number, boardUnitChi: number): number {
  if (!Number.isFinite(boardSellDong) || boardSellDong < 0) return NaN;
  const unit = boardUnitChi > 0 ? boardUnitChi : 1;
  return boardSellDong / unit;
}

/** P8 silver / legacy: giá vốn = buy × weight (no hệ số, no labor). Kept for non-silver callers. */
export function calcCostDongFromBuy(buyDong: number, weightChi: number): number | null {
  if (!Number.isFinite(buyDong) || buyDong < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  return Math.round(buyDong * weightChi);
}

/**
 * P9 nhập vàng:
 * Tiền vàng nhập = TL × HL × giá NL 24K/9999
 * Tổng tiền nhập = Tiền vàng nhập + tiền công nhập
 */
export function calcGoldReceiveCostDong(
  weightChi: number,
  purityDecimal: number,
  spot24kDongPerChi: number,
  receiveLaborDong: number,
): number | null {
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(purityDecimal) || purityDecimal <= 0 || purityDecimal > 1) return null;
  if (!Number.isFinite(spot24kDongPerChi) || spot24kDongPerChi < 0) return null;
  if (!Number.isFinite(receiveLaborDong) || receiveLaborDong < 0) return null;
  if (!Number.isInteger(receiveLaborDong)) return null;
  const goldPart = weightChi * purityDecimal * spot24kDongPerChi;
  if (!Number.isFinite(goldPart)) return null;
  return Math.round(goldPart) + receiveLaborDong;
}

/**
 * Vàng ta — theo giá link không hệ số:
 * Giá bán gợi ý = (board_sell quy đổi / chỉ × TL) + tiền công bán
 */
export function calcSellDongFromLink(
  sellDong: number,
  weightChi: number,
  boardUnitChi: number,
  sellLaborDong = 0,
): number | null {
  if (!Number.isFinite(sellDong) || sellDong < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(boardUnitChi) || boardUnitChi <= 0) return null;
  if (!Number.isFinite(sellLaborDong) || sellLaborDong < 0 || !Number.isInteger(sellLaborDong)) {
    return null;
  }
  return Math.round(sellDong * (weightChi / boardUnitChi)) + sellLaborDong;
}

/**
 * Vàng tây — theo giá link có hệ số (board_sell, không spot 24K):
 * (TL × HL × board_sell_per_chi + tiền công bán) × hệ số
 */
export function calcGoldSellDongFromHesoBoard(
  boardSellDong: number,
  boardUnitChi: number,
  weightChi: number,
  purityDecimal: number,
  sellLaborDong: number,
  heso: number,
): number | null {
  const perChi = boardSellPerChi(boardSellDong, boardUnitChi);
  if (!Number.isFinite(perChi) || perChi < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(purityDecimal) || purityDecimal <= 0 || purityDecimal > 1) return null;
  if (!Number.isFinite(sellLaborDong) || sellLaborDong < 0 || !Number.isInteger(sellLaborDong)) {
    return null;
  }
  if (!Number.isFinite(heso) || heso <= 0) return null;
  return Math.round((perChi * weightChi * purityDecimal + sellLaborDong) * heso);
}

/**
 * @deprecated Prefer calcGoldSellDongFromHesoBoard (board_sell). Kept for any legacy call sites.
 */
export function calcGoldSellDongFromHeso(
  spot24kDongPerChi: number,
  weightChi: number,
  purityDecimal: number,
  heso: number,
): number | null {
  return calcGoldSellDongFromHesoBoard(spot24kDongPerChi, 1, weightChi, purityDecimal, 0, heso);
}

/** Legacy bạc heso helper — silver receive no longer autofills from board. */
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

/** Heuristic: dòng bảng giá / brand bạc. */
export function looksLikeSilverLabel(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  return /bạc|bac|silver|ag\b/.test(text);
}

export function formatDongPreview(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatDongDigits(Math.round(n))}đ`;
}
