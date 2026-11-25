/**
 * Print sales invoice (Giấy đảm bảo vàng) at the project phôi size 205 × 148 mm.
 * Uses an about:blank iframe so Chrome's default @page is the phôi size (not A4/Letter).
 * Source of truth: GOLD_CERTIFICATE in print-template.ts.
 *
 * Chrome print preview hangs on "Loading…" if the iframe is 0×0 or removed while the
 * dialog is still open — keep a real-size hidden frame until afterprint.
 * Phôi layout is almost entirely inline styles; do NOT clone the whole app CSS
 * (Next/Tailwind) into the frame (that also stalls preview).
 */

import { GOLD_CERTIFICATE } from "./print-template";

const PAGE_W = `${GOLD_CERTIFICATE.widthMm}mm`;
const PAGE_H = `${GOLD_CERTIFICATE.heightMm}mm`;
/** Safety: remove iframe if afterprint never fires (dialog dismissed oddly). */
const IFRAME_CLEANUP_MS = 5 * 60_000;

export function printSalesInvoiceDocument(): void {
  void waitForInvoicePrintNode().then((node) => {
    if (!node) {
      console.warn("[invoice/print] .invoice-print-page not found; skip print");
      return;
    }
    printInvoiceNodeInBlankFrame(node);
  });
}

function waitForInvoicePrintNode(maxMs = 1600): Promise<HTMLElement | null> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const node = document.querySelector(".invoice-print-page");
      if (node instanceof HTMLElement) {
        resolve(node);
        return;
      }
      if (Date.now() - started >= maxMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 50);
    };
    window.setTimeout(tick, 80);
  });
}

function printInvoiceNodeInBlankFrame(node: HTMLElement): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "");
  // Real phôi size + visibility:hidden — Chrome 0×0 frames often stick on "Loading preview…".
  iframe.style.cssText = `position:fixed;right:0;bottom:0;width:${PAGE_W};height:${PAGE_H};border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  idoc.open();
  idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title></title>
<style>
  /* Default page = project phôi (205×148). Do not fall back to A4/Letter. */
  @page {
    size: ${PAGE_W} ${PAGE_H};
    margin: 0;
  }
  @page gold-certificate {
    size: ${PAGE_W} ${PAGE_H};
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    width: ${PAGE_W} !important;
    height: ${PAGE_H} !important;
    overflow: hidden !important;
    color: #1f1f1f;
    font-family: Arial, Helvetica, sans-serif;
  }
  body > * { margin: 0 !important; }
  .invoice-print-page,
  .invoice-print {
    page: gold-certificate;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    box-shadow: none !important;
    max-width: none !important;
    width: ${PAGE_W} !important;
    height: ${PAGE_H} !important;
    aspect-ratio: auto !important;
    background: transparent !important;
    overflow: hidden !important;
    transform: none !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .invoice-template-background {
    display: none !important;
  }
  /* Tailwind classNames used on InvoiceDocument fields (layout/color are inline). */
  .font-semibold { font-weight: 600 !important; }
  .font-medium { font-weight: 500 !important; }
  .font-bold { font-weight: 700 !important; }
</style>
</head>
<body></body>
</html>`);
  idoc.close();
  idoc.title = "";

  const clone = node.cloneNode(true) as HTMLElement;
  clone.classList.remove("hidden");
  clone.style.display = "block";
  clone.style.width = PAGE_W;
  clone.style.height = PAGE_H;
  clone.style.maxWidth = "none";
  clone.style.aspectRatio = "auto";
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.position = "absolute";
  clone.style.top = "0";
  clone.style.left = "0";
  idoc.body.appendChild(clone);

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

  window.setTimeout(runPrint, 200);
}
