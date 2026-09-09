/** Clear document title so Chrome does not print the app name in headers. */
export function printPurchaseDocument(): void {
  const previous = document.title;
  document.title = " ";
  // Wait for React to commit printDoc switch before opening the print dialog.
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      document.title = previous;
    }, 800);
  }, 200);
}
