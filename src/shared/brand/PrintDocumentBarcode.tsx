"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

const BAR_HEIGHT_PX = 30;

/**
 * Code 128 for print vouchers (YC thu/chi). Encodes stable invoice/buy codes (HD… / BUY-…).
 * White bg, black bars, quiet zone via margin; human-readable label rendered by parent.
 */
export function PrintDocumentBarcode({
  value,
  heightPx = BAR_HEIGHT_PX,
}: {
  value: string;
  heightPx?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const code = value.trim();

  useEffect(() => {
    if (!ref.current || !code) return;
    try {
      const modules = Math.max(40, code.length * 11);
      const targetWidthPx = 160;
      const barWidth = Math.max(1, (targetWidthPx * 0.88) / modules);
      JsBarcode(ref.current, code, {
        format: "CODE128",
        displayValue: false,
        margin: 6,
        height: Math.max(10, heightPx),
        width: barWidth,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // leave empty svg if encode fails
    }
  }, [code, heightPx]);

  if (!code) return null;

  return (
    <svg
      ref={ref}
      aria-hidden
      style={{
        display: "block",
        height: `${heightPx}px`,
        maxWidth: "48mm",
        width: "auto",
      }}
    />
  );
}
