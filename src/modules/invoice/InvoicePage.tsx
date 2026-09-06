import { Suspense } from "react";
import { getPosSession } from "@/shared/auth/session";
import { listDocuments } from "./query";
import { InvoiceDirectory } from "./components/InvoiceDirectory";
import { InvoiceDirectoryIntro } from "./components/InvoiceDirectoryIntro";
import { canVoidInvoiceEmail } from "./voidAccess";

export async function InvoicePage() {
  const [initial, session] = await Promise.all([listDocuments({ limit: 5, offset: 0 }), getPosSession()]);
  const canVoidInvoice = canVoidInvoiceEmail(session?.email);
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <InvoiceDirectoryIntro />
      <Suspense fallback={<div className="mt-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải hóa đơn...</div>}>
        <InvoiceDirectory initial={initial} canVoidInvoice={canVoidInvoice} />
      </Suspense>
    </section>
  );
}
