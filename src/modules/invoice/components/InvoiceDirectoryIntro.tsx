import { INVOICE_DIRECTORY_INTRO } from "../copy";

export function InvoiceDirectoryIntro() {
  return (
    <div>
      <h1 className="text-[18px] font-semibold">Hóa đơn</h1>
      <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">{INVOICE_DIRECTORY_INTRO}</p>
    </div>
  );
}
