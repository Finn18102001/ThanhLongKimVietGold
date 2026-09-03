/** Integer VND helpers for POS price adjustment and charges. Backend remains source of truth. */

export const PRICE_ADJ_LIMIT_PER_CHI = 300_000;

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

export function chargesTotalDong(charges: PosChargeDraft[]): number {
  return charges.reduce((sum, row) => sum + Math.max(0, row.amountDong), 0);
}
