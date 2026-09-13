/**
 * Print sales invoice (Giấy đảm bảo vàng) at the project phôi size 205 × 148 mm.
 * Uses an about:blank iframe so Chrome's default @page is the phôi size (not A4/Letter).
 * Source of truth: GOLD_CERTIFICATE in print-template.ts.
 */

import { GOLD_CERTIFICATE } from "./print-template";

const PAGE_W = `${GOLD_CERTIFICATE.widthMm}mm`;
const PAGE_H = `${GOLD_CERTIFICATE.heightMm}mm`;

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
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  const styleHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join("\n");

  idoc.open();
  idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title></title>
${styleHtml}
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
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    width: ${PAGE_W} !important;
    height: ${PAGE_H} !important;
    overflow: hidden !important;
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

  const cleanup = () => {
    iframe.remove();
  };

  const runPrint = () => {
    try {
      iwin.focus();
      iwin.print();
    } finally {
      window.setTimeout(cleanup, 1500);
    }
  };

  const links = Array.from(idoc.querySelectorAll('link[rel="stylesheet"]'));
  if (links.length === 0) {
    window.setTimeout(runPrint, 200);
    return;
  }
  let pending = links.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) window.setTimeout(runPrint, 80);
  };
  for (const link of links) {
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
  }
  window.setTimeout(() => {
    if (pending > 0) runPrint();
  }, 900);
}
