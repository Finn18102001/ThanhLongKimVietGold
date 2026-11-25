/**
 * Print purchase phôi without Chrome date / site-URL headers.
 * Uses an about:blank iframe so the print footer has no app path,
 * and an empty document title so the header title slot stays blank.
 *
 * Chrome print preview hangs on "Loading…" if the iframe is 0×0 or removed while the
 * dialog is still open — keep a real-size hidden frame until afterprint.
 */

/** Safety: remove iframe if afterprint never fires. */
const IFRAME_CLEANUP_MS = 5 * 60_000;

export function printPurchaseDocument(): void {
  void waitForPrintNode().then((node) => {
    if (!node) {
      console.warn("[purchase/print] .purchase-print not found; skip print");
      return;
    }
    printNodeInBlankFrame(node);
  });
}

function waitForPrintNode(maxMs = 1600): Promise<HTMLElement | null> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const node = document.querySelector(".purchase-print");
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

function printNodeInBlankFrame(node: HTMLElement): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "");
  // A4-sized hidden frame — Chrome 0×0 frames often stick on "Loading preview…".
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  // Voucher/Form02/Commitment use Tailwind classNames — need app stylesheets.
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
  @page { margin: 0; }
  @page purchase-voucher { size: A4 portrait; margin: 0; }
  @page purchase-form02 { size: A4 landscape; margin: 0; }
  @page purchase-commitment { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body > * { margin: 0 !important; }
</style>
</head>
<body></body>
</html>`);
  idoc.close();
  // Keep title empty so Chrome header title slot stays blank.
  idoc.title = "";

  const clone = node.cloneNode(true) as HTMLElement;
  clone.classList.remove("hidden");
  clone.style.display = "block";
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
      // Do NOT remove the iframe while Chrome is still building print preview.
      iwin.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(cleanup, IFRAME_CLEANUP_MS);
    }
  };

  // Wait for cloned stylesheet links to settle when possible.
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
    if (!printed) runPrint();
  }, 2000);
}
