/**
 * In chứng từ CTCV A4: ẩn POS/shell (body.printing-sale-deposit),
 * chỉ hiện .sale-deposit-print.
 */
export function printCtcvTransferDocument(): void {
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
