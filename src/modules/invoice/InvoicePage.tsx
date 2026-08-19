import { listInvoices } from "./query";
import { InvoiceDirectory } from "./components/InvoiceDirectory";

export async function InvoicePage() {
  const initial = await listInvoices({ limit: 5, offset: 0 });
  return <InvoiceDirectory initial={initial} />;
}
