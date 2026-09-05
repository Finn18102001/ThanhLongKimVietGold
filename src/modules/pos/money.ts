/** Integer VND helpers for POS price adjustment and charges. Backend remains source of truth. */

export const PRICE_ADJ_LIMIT_PER_CHI = 300_000;
/** Step for +/- on transaction unit price in cart. */
export const PRICE_UNIT_STEP_DONG = 10_000;

export const PRICE_OUT_OF_RANGE_INLINE =
  "⚠️ Giá đã vượt quá mức cho phép thay đổi ±300.000 đ.";

export const PRICE_OUT_OF_RANGE_CONFIRM =
  "⚠️ Giá nhập đang vượt quá mức cho phép ±300.000 đ. Vui lòng kiểm tra và điều chỉnh lại giá trước khi xác nhận.";

export type PosChargeDraft = {
  clientKey: string;
  name: string;
  amountDong: number;
  reason: string;
};

export function lineActualUnitDong(
  referenceUnitDong: number,
  adjustmentPerChi: number,
  weightChi: number,
): number {
  return referenceUnitDong + Math.round(adjustmentPerChi * weightChi);
}

export function lineTotalDong(
  referenceUnitDong: number,
  adjustmentPerChi: number,
  weightChi: number,
  quantity: number,
): number {
  return lineActualUnitDong(referenceUnitDong, adjustmentPerChi, weightChi) * quantity;
}

export function clampAdjustmentPerChi(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.trunc(value);
  if (rounded > PRICE_ADJ_LIMIT_PER_CHI) return PRICE_ADJ_LIMIT_PER_CHI;
  if (rounded < -PRICE_ADJ_LIMIT_PER_CHI) return -PRICE_ADJ_LIMIT_PER_CHI;
  return rounded;
}

/** Convert a direct unit (piece) price into adjustment / chỉ (optionally clamped for +/-). */
export function unitPriceToAdjustmentPerChi(
  unitPriceDong: number,
  referenceUnitDong: number,
  weightChi: number,
  opts: { clamp?: boolean } = {},
): number {
  if (!Number.isFinite(unitPriceDong) || weightChi <= 0) return 0;
  const raw = Math.round((Math.trunc(unitPriceDong) - referenceUnitDong) / weightChi);
  return opts.clamp === false ? raw : clampAdjustmentPerChi(raw);
}

/** Clamp a typed unit price into reference ± (300k × weightChi). */
export function clampUnitPriceDong(
  unitPriceDong: number,
  referenceUnitDong: number,
  weightChi: number,
): number {
  const adj = unitPriceToAdjustmentPerChi(unitPriceDong, referenceUnitDong, weightChi);
  return lineActualUnitDong(referenceUnitDong, adj, weightChi);
}

export function unitPriceBoundsDong(
  referenceUnitDong: number,
  weightChi: number,
): { min: number; max: number } {
  const w = weightChi > 0 ? weightChi : 1;
  return {
    min: referenceUnitDong - Math.round(PRICE_ADJ_LIMIT_PER_CHI * w),
    max: referenceUnitDong + Math.round(PRICE_ADJ_LIMIT_PER_CHI * w),
  };
}

/** True when piece unit price is outside reference ± (300k × weightChi). */
export function isUnitPriceOutOfAllowedRange(
  unitPriceDong: number,
  referenceUnitDong: number,
  weightChi: number,
): boolean {
  if (!Number.isFinite(unitPriceDong)) return true;
  const bounds = unitPriceBoundsDong(referenceUnitDong, weightChi);
  const unit = Math.trunc(unitPriceDong);
  return unit < bounds.min || unit > bounds.max;
}

export function chargesTotalDong(charges: PosChargeDraft[]): number {
  return charges.reduce((sum, row) => sum + Math.max(0, row.amountDong), 0);
}
