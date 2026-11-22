/**
 * In phiếu quỹ A4 (YC / CTCT): ẩn POS/shell (body.printing-sale-deposit),
 * chỉ hiện .sale-deposit-print — cùng pattern sale-deposit/print.ts.
 */
export function printFundVoucherDocument(): void {
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

/** @deprecated Dùng printFundVoucherDocument — giữ alias cho YC overlay cũ. */
export function printYcRequestDocument(): void {
  printFundVoucherDocument();
}
