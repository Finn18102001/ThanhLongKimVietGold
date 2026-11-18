/**
 * Shared price-link helpers for receive / order forms (P8 + P9).
 * Money = integer VND. Hệ số is UI-only (no DB column this round).
 * P9: gold receive = TL × HL × spot24K + tiền công nhập; sell labor stays on invoice only.
 */

export type SellPriceMode = "link" | "heso";

/** Receive metal tab — UI only; does not invent silver cost formula beyond manual / buy×TL. */
export type ReceiveMetalKind = "gold" | "silver";

/** Board unit stand-in: 0.1 chỉ rows vs per-chỉ (1). Matches create_order_jewelry_sku. */
export function boardUnitChiFromProductName(product: string): number {
  return /0\.1\s*chỉ/i.test(String(product || "")) ? 0.1 : 1;
}

/**
 * Convert hàm lượng / tuổi vàng to decimal fraction for formulas.
 * ≤1 → already decimal; ≤100 → percent; ≤1000 → millesimal (750 → 0.75, 999.9 → 0.9999).
 */
export function purityToDecimal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  if (n <= 1000) return n / 1000;
  return null;
}

/** P8 silver / legacy: giá vốn = buy × weight (no hệ số, no labor). */
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

/** Mode link (gợi ý bán, chưa cộng công bán — công bán trên HĐ): sell × weight / board_unit. */
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

/**
 * P9 vàng theo hệ số (gợi ý bán, chưa cộng công bán):
 * (giá NL 24K × TL × HL) × hệ số
 * Công bán nhập trên hóa đơn, không nhân vào gợi ý nhận hàng.
 */
export function calcGoldSellDongFromHeso(
  spot24kDongPerChi: number,
  weightChi: number,
  purityDecimal: number,
  heso: number,
): number | null {
  if (!Number.isFinite(spot24kDongPerChi) || spot24kDongPerChi < 0) return null;
  if (!Number.isFinite(weightChi) || weightChi < 0) return null;
  if (!Number.isFinite(purityDecimal) || purityDecimal <= 0 || purityDecimal > 1) return null;
  if (!Number.isFinite(heso) || heso <= 0) return null;
  return Math.round(spot24kDongPerChi * weightChi * purityDecimal * heso);
}

/** P8/P9 bạc theo hệ số (gợi ý): (sell × TL) × hệ số — không công bán trên form nhập. */
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
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}
