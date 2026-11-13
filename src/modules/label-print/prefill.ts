import { formatGoldAge } from "./labels";
import type { LabelPrefill, LabelSkuOption } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function nonNegative(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function nonNegativeInt(value: string | null): number | null {
  const n = nonNegative(value);
  return n != null && Number.isInteger(n) ? n : null;
}

/** URL contract used by the buy invoice "In tem" button: `/label-print?sku=&src=&ga=&klv=&kld=&sq=&su=&note=`. */
export function labelPrefillHref(input: {
  skuId: string;
  sourceNo?: string | null;
  goldAge?: string | null;
  klvChi?: number | null;
  kldChi?: number | null;
  stoneQuantity?: number | null;
  stoneUnitPriceDong?: number | null;
  note?: string | null;
}): string {
  const params = new URLSearchParams({ sku: input.skuId });
  if (input.sourceNo) params.set("src", input.sourceNo);
  if (input.goldAge) params.set("ga", input.goldAge);
  if (input.klvChi != null) params.set("klv", String(input.klvChi));
  if (input.kldChi != null) params.set("kld", String(input.kldChi));
  if (input.stoneQuantity != null) params.set("sq", String(input.stoneQuantity));
  if (input.stoneUnitPriceDong != null) params.set("su", String(input.stoneUnitPriceDong));
  if (input.note) params.set("note", input.note.slice(0, 300));
  return `/label-print?${params.toString()}`;
}

export function parseLabelPrefill(params: SearchParams): LabelPrefill | null {
  const skuId = first(params.sku);
  if (!skuId) return null;
  return {
    skuId,
    sourceNo: first(params.src),
    goldAgeText: first(params.ga),
    klvChi: nonNegative(first(params.klv)),
    kldChi: nonNegative(first(params.kld)),
    stoneQuantity: nonNegativeInt(first(params.sq)),
    stoneUnitPriceDong: nonNegativeInt(first(params.su)),
    note: first(params.note),
  };
}

export type LabelFormDefaults = {
  laborFeeDong: number;
  priceDong: number;
  kltChi: number;
  klvChi: number;
  kldChi: number;
  stoneQuantity: number;
  stoneUnitPriceDong: number;
  tagName: string;
  goldAgeText: string;
};

function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function skuFormDefaults(sku: LabelSkuOption): LabelFormDefaults {
  return {
    laborFeeDong: sku.laborFeeDong,
    priceDong: sku.unitPriceDong ?? 0,
    kltChi: round4(sku.weightChi + sku.stoneWeightChi),
    klvChi: sku.weightChi,
    kldChi: sku.stoneWeightChi,
    stoneQuantity: sku.stoneQuantity,
    stoneUnitPriceDong: sku.stoneUnitPriceDong,
    tagName: sku.name,
    goldAgeText: formatGoldAge(sku.goldAge),
  };
}

export function prefillFormDefaults(sku: LabelSkuOption, prefill: LabelPrefill): LabelFormDefaults {
  const base = skuFormDefaults(sku);
  const klvChi = prefill.klvChi ?? base.klvChi;
  const kldChi = prefill.kldChi ?? base.kldChi;
  return {
    ...base,
    klvChi,
    kldChi,
    kltChi: round4(klvChi + kldChi),
    stoneQuantity: prefill.stoneQuantity ?? base.stoneQuantity,
    stoneUnitPriceDong: prefill.stoneUnitPriceDong ?? base.stoneUnitPriceDong,
    goldAgeText: prefill.goldAgeText ?? base.goldAgeText,
  };
}
