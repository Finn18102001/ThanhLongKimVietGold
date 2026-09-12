/**
 * Print purchase phôi without Chrome date / site-URL headers.
 * Uses an about:blank iframe so the print footer has no vercel/app path,
 * and an empty document title so the header title slot stays blank.
 */
export function printPurchaseDocument(): void {
  // Wait for React to commit printDoc switch before capturing the phôi.
  window.setTimeout(() => {
    const node = document.querySelector(".purchase-print");
    if (!(node instanceof HTMLElement)) {
      printWithBlankTitle();
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument;
    const iwin = iframe.contentWindow;
    if (!idoc || !iwin) {
      iframe.remove();
      printWithBlankTitle();
      return;
    }

    const styleHtml = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'),
    )
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
</style>
</head>
<body></body>
</html>`);
    idoc.close();

    idoc.body.appendChild(node.cloneNode(true));

    const cleanup = () => {
      iframe.remove();
    };

    window.setTimeout(() => {
      try {
        iwin.focus();
        iwin.print();
      } finally {
        window.setTimeout(cleanup, 1200);
      }
    }, 250);
  }, 200);
}

function printWithBlankTitle(): void {
  const previous = document.title;
  document.title = "";
  window.print();
  window.setTimeout(() => {
    document.title = previous;
  }, 800);
}
