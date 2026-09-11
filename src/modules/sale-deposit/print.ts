/** Isolate deposit phôi: hide all app chrome; restore title after print. */
export function printDepositDocument(): void {
  const previous = document.title;
  document.title = " ";
  document.body.classList.add("printing-sale-deposit");

  const cleanup = () => {
    document.title = previous;
    document.body.classList.remove("printing-sale-deposit");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    window.print();
    // Fallback if afterprint never fires (some Chromium builds).
    window.setTimeout(cleanup, 1500);
  }, 200);
}
