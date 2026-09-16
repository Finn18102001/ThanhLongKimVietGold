/**
 * Layout chuẩn đã calibrate trên iDPRT (bake vào lúc vẽ).
 * UI offset/font chỉ là delta cộng thêm — mặc định 0.
 */

import type { LabelPrintOffsets } from "./offsets";
import type { LabelPrintFonts } from "./fonts";

/** Offset gốc (mm) — áp vào vị trí vẽ. */
export const BASE_LABEL_OFFSETS: LabelPrintOffsets = {
  face1: { x: -0.5, y: 1 },
  face2: { x: 1.5, y: 1 },
  tail: { x: -0.5, y: 0.5 },
};

/** Cỡ chữ gốc (pt) — áp vào lúc vẽ. */
export const BASE_LABEL_FONTS: LabelPrintFonts = {
  face1Pt: 6,
  face2Pt: 7,
  tailPt: 5.4,
};

export function mergeOffsets(
  base: LabelPrintOffsets,
  delta: LabelPrintOffsets,
): LabelPrintOffsets {
  return {
    face1: { x: base.face1.x + delta.face1.x, y: base.face1.y + delta.face1.y },
    face2: { x: base.face2.x + delta.face2.x, y: base.face2.y + delta.face2.y },
    tail: { x: base.tail.x + delta.tail.x, y: base.tail.y + delta.tail.y },
  };
}

export function mergeFonts(
  base: LabelPrintFonts,
  delta: LabelPrintFonts,
): LabelPrintFonts {
  return {
    face1Pt: base.face1Pt + delta.face1Pt,
    face2Pt: base.face2Pt + delta.face2Pt,
    tailPt: base.tailPt + delta.tailPt,
  };
}
