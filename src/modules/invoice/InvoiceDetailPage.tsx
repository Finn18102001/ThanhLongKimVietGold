import { notFound } from "next/navigation";
import { InvoiceDetailView } from "./InvoiceDetailView";
import { getInvoiceByNo } from "./query";

export async function InvoiceDetailPage({ invoiceNo }: { invoiceNo: string }) {
  const invoice = await getInvoiceByNo(invoiceNo);
  if (!invoice) notFound();
  return <InvoiceDetailView invoice={invoice} />;
}
