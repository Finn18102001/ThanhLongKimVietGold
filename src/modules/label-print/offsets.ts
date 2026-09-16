/** Per-zone print offsets — UI delta (mm), cộng thêm vào BASE_LABEL_OFFSETS. */

export type LabelZoneOffset = {
  /** Dịch ngang thêm: + sang phải, − sang trái (mm). */
  x: number;
  /** Dịch dọc thêm: + xuống dưới, − lên trên (mm). */
  y: number;
};

export type LabelPrintOffsets = {
  face1: LabelZoneOffset;
  face2: LabelZoneOffset;
  tail: LabelZoneOffset;
};

export const ZERO_ZONE: LabelZoneOffset = { x: 0, y: 0 };

/** Delta mặc định = 0 (layout chuẩn đã bake). */
export const DEFAULT_LABEL_OFFSETS: LabelPrintOffsets = {
  face1: { x: 0, y: 0 },
  face2: { x: 0, y: 0 },
  tail: { x: 0, y: 0 },
};

const STORAGE_KEY = "tlkv.label-print.offsets.v3";
const OFFSET_MIN = -8;
const OFFSET_MAX = 8;

export function clampOffsetMm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, rounded));
}

export function normalizeOffsets(raw: unknown): LabelPrintOffsets {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<LabelPrintOffsets>;
  const zone = (z: unknown): LabelZoneOffset => {
    const o = (z && typeof z === "object" ? z : {}) as Partial<LabelZoneOffset>;
    return {
      x: clampOffsetMm(Number(o.x) || 0),
      y: clampOffsetMm(Number(o.y) || 0),
    };
  };
  return {
    face1: zone(src.face1),
    face2: zone(src.face2),
    tail: zone(src.tail),
  };
}

export function loadLabelOffsets(): LabelPrintOffsets {
  if (typeof window === "undefined") return { ...DEFAULT_LABEL_OFFSETS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LABEL_OFFSETS };
    return normalizeOffsets(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_LABEL_OFFSETS };
  }
}

export function saveLabelOffsets(offsets: LabelPrintOffsets): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeOffsets(offsets)));
  } catch {
    // ignore quota
  }
}

export const OFFSET_STEP_MM = 0.1;
export const OFFSET_RANGE = { min: OFFSET_MIN, max: OFFSET_MAX } as const;
