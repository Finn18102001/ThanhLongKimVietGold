/**
 * Print purchase phôi without Chrome date / site-URL headers.
 * Uses an about:blank iframe so the print footer has no app path,
 * and an empty document title so the header title slot stays blank.
 */
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

  const cleanup = () => {
    iframe.remove();
  };

  const runPrint = () => {
    try {
      iwin.focus();
      iwin.print();
    } finally {
      // Keep frame until the print dialog can capture layout.
      window.setTimeout(cleanup, 1500);
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
    if (pending > 0) runPrint();
  }, 900);
}
