/**
 * Print jewelry labels — page 90 × 14 mm (die-cut bounding box), margin 0.
 */

import { labelGeometryMm } from "./geometry";
import type { LabelStockSize } from "./types";

export function printLabelNodes(_stockSize?: LabelStockSize): void {
  const nodes = Array.from(document.querySelectorAll(".label-print-batch .label-print-tag"));
  if (nodes.length === 0) {
    console.warn("[label-print] no .label-print-tag nodes");
    return;
  }

  const geo = labelGeometryMm();
  const pageW = geo.pageW;
  const pageH = geo.pageH;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  const bodyHtml = nodes.map((n) => n.outerHTML).join("\n");

  idoc.open();
  idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>&nbsp;</title>
<style>
  @page {
    size: ${pageW}mm ${pageH}mm;
    margin: 0;
  }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${pageW}mm;
    height: ${pageH}mm;
    background: #fff !important;
    overflow: hidden;
  }
  .label-print-tag {
    position: relative !important;
    width: ${pageW}mm !important;
    height: ${pageH}mm !important;
    page-break-after: always;
    break-after: page;
    box-shadow: none !important;
    overflow: hidden !important;
  }
  .label-print-tag:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .label-print-tag [data-face],
  .label-print-tag [data-zone="tail"] {
    position: absolute !important;
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`);
  idoc.close();

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 800);
  };

  iwin.focus();
  window.setTimeout(() => {
    try {
      iwin.print();
    } finally {
      cleanup();
    }
  }, 250);
}
