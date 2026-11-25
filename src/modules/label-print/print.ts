/**
 * Print jewelry labels — content 90 × 14 mm (die-cut), margin 0.
 *
 * Chrome print-preview pitfalls this module must avoid:
 * 1) iframe 0×0 or removed while dialog open → spinner forever / "0 sheets"
 * 2) @page size with a side < ~1" (14mm height) → Chrome layout hang / 0 pages
 *    → do NOT force size: 90mm 14mm; let the selected printer media (iDPRT …) drive
 *      page size; each .label-print-tag is still laid out at 90×14 mm.
 * 3) locking html/body height to one label clips multi-copy pagination.
 */

import { labelGeometryMm } from "./geometry";
import type { LabelStockSize } from "./types";

/** Safety: remove iframe if afterprint never fires. */
const IFRAME_CLEANUP_MS = 5 * 60_000;

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
  // Large hidden viewport — NOT 90×14. Sub-inch iframe height makes Chrome treat
  // the document as empty (0 sheets) and spin forever on print preview.
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;visibility:hidden;pointer-events:none;";
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
  /*
   * No @page size here. Forcing 90×14 mm (height 14mm < 1") hangs Chrome preview
   * with "Loading…" / 0 sheets. User's iDPRT media size supplies the paper;
   * each tag below is still exactly ${pageW}×${pageH} mm.
   */
  @page {
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
    width: auto;
    height: auto;
    background: #fff !important;
    overflow: visible;
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

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe.remove();
    } catch {
      /* already gone */
    }
  };

  let printed = false;
  const runPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iwin.focus();
      iwin.print();
    } finally {
      iwin.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(cleanup, IFRAME_CLEANUP_MS);
    }
  };

  // Barcode SVG is painted via React effect before clone; give layout a beat.
  window.setTimeout(runPrint, 400);
}
