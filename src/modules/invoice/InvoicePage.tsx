import { Suspense } from "react";
import { listInvoices } from "./query";
import { InvoiceDirectory } from "./components/InvoiceDirectory";
import { InvoiceDirectoryIntro } from "./components/InvoiceDirectoryIntro";

export async function InvoicePage() {
  const initial = await listInvoices({ limit: 5, offset: 0 });
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <InvoiceDirectoryIntro />
      <Suspense fallback={<div className="mt-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải hóa đơn...</div>}>
        <InvoiceDirectory initial={initial} />
      </Suspense>
    </section>
  );
}
