"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import JsBarcode from "jsbarcode";
import {
  PREVIEW_MM_TO_PX,
  labelGeometryMm,
  mmToPrinterPx,
  pageSizeLabel,
} from "../geometry";
import type { LabelPrintPayload } from "../types";
import { formatChi, formatDong } from "../labels";
import {
  DEFAULT_LABEL_OFFSETS,
  type LabelPrintOffsets,
} from "../offsets";
import {
  DEFAULT_LABEL_FONTS,
  fontPtToMm,
  type LabelPrintFonts,
} from "../fonts";
import {
  BASE_LABEL_FONTS,
  BASE_LABEL_OFFSETS,
  mergeFonts,
  mergeOffsets,
} from "../layoutDefaults";

type Unit = "mm" | "px";

function u(valueMm: number, unit: Unit, scalePxPerMm: number): string {
  if (unit === "mm") return `${valueMm}mm`;
  return `${valueMm * scalePxPerMm}px`;
}

export function LabelPreview({
  payload,
  copies = 1,
  offsets = DEFAULT_LABEL_OFFSETS,
  fonts = DEFAULT_LABEL_FONTS,
}: {
  payload: LabelPrintPayload | null;
  copies?: number;
  offsets?: LabelPrintOffsets;
  fonts?: LabelPrintFonts;
}) {
  if (!payload) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[12px] border border-dashed border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] text-[13px] text-[var(--tlkv-muted)]">
        Chọn sản phẩm và MSP để xem layout tem.
      </div>
    );
  }

  const geo = labelGeometryMm(payload.stockSize);
  const count = Math.max(1, Math.min(copies, 3));

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-[var(--tlkv-muted)]">
        Phôi {pageSizeLabel()} · trái Mặt 2 (KLT…) · giữa Mặt 1 (công ty/MSP) · đuôi Đc ·{" "}
        {geo.faceW}×{geo.faceH} mm × 2 · tỷ lệ {PREVIEW_MM_TO_PX} px/mm.
      </p>

      <div className="overflow-x-auto rounded-[12px] border border-[var(--tlkv-line)] bg-[#eceff3] p-6">
        <div className="flex flex-wrap items-start gap-8">
          {Array.from({ length: count }).map((_, i) => (
            <LabelTag
              key={`${payload.msp}-${i}`}
              payload={payload}
              offsets={offsets}
              fonts={fonts}
            />
          ))}
        </div>
      </div>
      {copies > 3 ? (
        <p className="text-[11px] text-[var(--tlkv-muted)]">
          Đang xem 3/{copies} tem; khi in sẽ xuất đủ số lượng đã chọn.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Horizontal 90×14 die-cut — thứ tự in khớp phôi khách (đuôi bên phải):
 *   [ Mặt 2: KLT/KLV/C/G | 30×14 ][ Mặt 1: công ty/barcode/MSP | 30×14 ]══ đuôi Đc 30×2
 * Print iframe has NO Tailwind — every layout rule must be inline style.
 */
export function LabelTag({
  payload,
  forPrint = false,
  offsets = DEFAULT_LABEL_OFFSETS,
  fonts = DEFAULT_LABEL_FONTS,
}: {
  payload: LabelPrintPayload;
  forPrint?: boolean;
  offsets?: LabelPrintOffsets;
  fonts?: LabelPrintFonts;
}) {
  const geo = labelGeometryMm(payload.stockSize);
  const unit: Unit = forPrint ? "mm" : "px";
  const scale = forPrint ? 1 : PREVIEW_MM_TO_PX;

  const appliedOffsets = mergeOffsets(BASE_LABEL_OFFSETS, offsets);
  const appliedFonts = mergeFonts(BASE_LABEL_FONTS, fonts);

  const pageW = u(geo.pageW, unit, scale);
  const pageH = u(geo.pageH, unit, scale);
  const faceW = u(geo.faceW, unit, scale);
  const faceH = u(geo.faceH, unit, scale);
  const pad = u(geo.safePad, unit, scale);
  const radius = u(geo.faceRadius, unit, scale);

  const fontFace1Mm = fontPtToMm(appliedFonts.face1Pt);
  const fontFace2Mm = fontPtToMm(appliedFonts.face2Pt);
  const fontTailMm = fontPtToMm(appliedFonts.tailPt);
  const fontFace1 = forPrint ? `${fontFace1Mm}mm` : `${fontFace1Mm * scale}px`;
  const fontFace2 = forPrint ? `${fontFace2Mm}mm` : `${fontFace2Mm * scale}px`;
  const fontTail = forPrint ? `${fontTailMm}mm` : `${fontTailMm * scale}px`;

  const company =
    payload.companyName.trim().length > 28
      ? shortenCompany(payload.companyName)
      : payload.companyName;

  const barcodeHMm = 5.2;
  const barcodeH = forPrint ? mmToPrinterPx(barcodeHMm) : barcodeHMm * scale;
  const barcodeWidthMm = geo.faceW - geo.safePad * 2;

  const tailTopMm = (geo.pageH - geo.tailH) / 2 + appliedOffsets.tail.y;
  const address = payload.addressLine.trim() || "Đc: 322 Nguyễn Trãi, P. Đại Mỗ";

  /** Trái = Mặt 2 (specs), giữa = Mặt 1 (nhận diện) — đúng thứ tự gập/phôi. */
  const face2LeftMm = 0 + appliedOffsets.face2.x;
  const face1LeftMm = geo.faceW + appliedOffsets.face1.x;

  const colStyleFace1: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    height: "100%",
    fontSize: fontFace1,
    lineHeight: 1.12,
    fontWeight: 700,
    margin: 0,
  };

  const colStyleFace2: CSSProperties = {
    ...colStyleFace1,
    fontSize: fontFace2,
    lineHeight: 1.15,
  };

  const lineStyle: CSSProperties = {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <article
      className={`label-print-tag ${forPrint ? "label-print-tag--print" : ""}`}
      style={{
        position: "relative",
        width: pageW,
        height: pageH,
        overflow: "hidden",
        background: "transparent",
        color: "#000",
        fontFamily: "Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
      }}
      data-stock="90x14"
      data-page-w-mm={geo.pageW}
      data-page-h-mm={geo.pageH}
      aria-label={`Tem ${payload.msp}`}
    >
      {/* Mặt 2 — trái: KLT / KLV / (KLĐ nếu có) / C / G */}
      <FacePanel
        left={u(face2LeftMm, unit, scale)}
        top={u(0 + appliedOffsets.face2.y, unit, scale)}
        width={faceW}
        height={faceH}
        radius={radius}
        padding={pad}
        label="Mặt 2"
      >
        <div
          style={{
            ...colStyleFace2,
            lineHeight: payload.kldChi > 0 ? 1.08 : colStyleFace2.lineHeight,
          }}
        >
          <SpecLine label="KLT" value={`${formatChi(payload.kltChi)} chỉ`} />
          <SpecLine label="KLV" value={`${formatChi(payload.klvChi)} chỉ`} />
          {payload.kldChi > 0 ? (
            <SpecLine label="KLĐ" value={`${formatChi(payload.kldChi)} chỉ`} />
          ) : null}
          <SpecLine label="C" value={formatDong(payload.laborFeeDong)} />
          <SpecLine label="G" value={formatDong(payload.priceDong)} />
        </div>
      </FacePanel>

      {/* Mặt 1 — giữa (sát đuôi): công ty / barcode / MSP */}
      <FacePanel
        left={u(face1LeftMm, unit, scale)}
        top={u(0 + appliedOffsets.face1.y, unit, scale)}
        width={faceW}
        height={faceH}
        radius={radius}
        padding={pad}
        label="Mặt 1"
      >
        <div style={colStyleFace1}>
          <p style={{ ...lineStyle, letterSpacing: "-0.01em" }} title={payload.companyName}>
            {company}
          </p>
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 0,
              marginTop: u(0.2, unit, scale),
              marginBottom: u(0.2, unit, scale),
            }}
          >
            <BarcodeSvg
              value={payload.barcode}
              heightPx={barcodeH}
              widthHintMm={barcodeWidthMm}
              forPrint={forPrint}
              scalePxPerMm={scale}
            />
          </div>
          <p style={{ ...lineStyle, fontVariantNumeric: "tabular-nums" }}>
            MSP: {payload.msp}
          </p>
        </div>
      </FacePanel>

      {/* Dây nối — Đc */}
      <div
        style={{
          position: "absolute",
          left: u(geo.faceW * 2 + appliedOffsets.tail.x, unit, scale),
          top: u(tailTopMm, unit, scale),
          width: u(geo.tailL, unit, scale),
          height: u(geo.tailH, unit, scale),
          overflow: "hidden",
          boxSizing: "border-box",
          background: "#fff",
          border: "none",
          borderRadius: `0 ${u(0.8, unit, scale)} ${u(0.8, unit, scale)} 0`,
          display: "flex",
          alignItems: "center",
          paddingLeft: u(0.4, unit, scale),
          paddingRight: u(0.4, unit, scale),
        }}
        data-zone="tail"
        title={address}
      >
        {!forPrint ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: u(geo.adhesiveFreeL, unit, scale),
              height: "100%",
              background: "rgba(34, 197, 94, 0.18)",
              pointerEvents: "none",
            }}
          />
        ) : null}
        <span
          style={{
            position: "relative",
            fontSize: fontTail,
            lineHeight: 1,
            fontWeight: 600,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {address}
        </span>
      </div>
    </article>
  );
}

function shortenCompany(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("thăng long kim việt") || lower.includes("thang long kim viet")) {
    return "Vàng Thăng Long Kim Việt";
  }
  return name.slice(0, 26);
}

function FacePanel({
  left,
  top,
  width,
  height,
  radius,
  padding,
  label,
  children,
}: {
  left: string;
  top: string;
  width: string;
  height: string;
  radius: string;
  padding: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#fff",
        borderRadius: radius,
        padding,
        border: "none",
      }}
      data-face={label}
    >
      {children}
    </div>
  );
}

function SpecLine({ label, value }: { label: string; value: string }) {
  return (
    <p
      style={{
        margin: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span>{label}:</span> {value}
    </p>
  );
}

function BarcodeSvg({
  value,
  heightPx,
  widthHintMm,
  forPrint,
  scalePxPerMm,
}: {
  value: string;
  heightPx: number;
  widthHintMm: number;
  forPrint: boolean;
  scalePxPerMm: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const targetWidthPx = forPrint
    ? mmToPrinterPx(widthHintMm)
    : widthHintMm * scalePxPerMm;

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      const modules = Math.max(40, value.length * 11);
      const barWidth = Math.max(0.9, (targetWidthPx * 0.88) / modules);
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        margin: 4,
        height: Math.max(10, heightPx),
        width: barWidth,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // keep empty svg
    }
  }, [value, heightPx, targetWidthPx]);

  return (
    <svg
      ref={ref}
      style={{
        width: "100%",
        height: `${heightPx}px`,
        maxWidth: "100%",
        display: "block",
      }}
    />
  );
}
