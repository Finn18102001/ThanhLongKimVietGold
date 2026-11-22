/**
 * In phiếu YC A4: ẩn toàn bộ POS/shell (body.printing-sale-deposit trong globals.css),
 * chỉ hiện .sale-deposit-print — cùng pattern sale-deposit/print.ts.
 */
export function printYcRequestDocument(): void {
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
    window.setTimeout(cleanup, 1500);
  }, 80);
}
