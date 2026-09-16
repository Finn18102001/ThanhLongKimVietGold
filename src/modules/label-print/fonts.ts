/**
 * Per-zone font delta (pt) — cộng thêm vào BASE_LABEL_FONTS.
 * UI mặc định 0 = dùng cỡ chuẩn đã bake.
 */

export type LabelPrintFonts = {
  face1Pt: number;
  face2Pt: number;
  tailPt: number;
};

/** Delta mặc định = 0. */
export const DEFAULT_LABEL_FONTS: LabelPrintFonts = {
  face1Pt: 0,
  face2Pt: 0,
  tailPt: 0,
};

const STORAGE_KEY = "tlkv.label-print.fonts.v3";

/** Delta cho mặt: ±3 pt quanh base. */
export const FONT_FACE_RANGE = { min: -3, max: 3, step: 0.1 } as const;
/** Delta cho đuôi: ±2 pt quanh base. */
export const FONT_TAIL_RANGE = { min: -2, max: 2, step: 0.1 } as const;

export function clampFaceFontPt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(FONT_FACE_RANGE.max, Math.max(FONT_FACE_RANGE.min, rounded));
}

export function clampTailFontPt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(FONT_TAIL_RANGE.max, Math.max(FONT_TAIL_RANGE.min, rounded));
}

export function normalizeFonts(raw: unknown): LabelPrintFonts {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<LabelPrintFonts>;
  return {
    face1Pt: clampFaceFontPt(Number(src.face1Pt) || 0),
    face2Pt: clampFaceFontPt(Number(src.face2Pt) || 0),
    tailPt: clampTailFontPt(Number(src.tailPt) || 0),
  };
}

export function loadLabelFonts(): LabelPrintFonts {
  if (typeof window === "undefined") return { ...DEFAULT_LABEL_FONTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LABEL_FONTS };
    return normalizeFonts(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_LABEL_FONTS };
  }
}

export function saveLabelFonts(fonts: LabelPrintFonts): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFonts(fonts)));
  } catch {
    // ignore quota
  }
}

/** 1 pt = 25.4/72 mm */
export function fontPtToMm(pt: number): number {
  return (pt * 25.4) / 72;
}
