import { notFound } from "next/navigation";
import { getPosSession } from "@/shared/auth/session";
import { InvoiceDetailView } from "./InvoiceDetailView";
import { getInvoiceByNo } from "./query";

export async function InvoiceDetailPage({ invoiceNo }: { invoiceNo: string }) {
  const invoice = await getInvoiceByNo(invoiceNo);
  if (!invoice) notFound();
  const session = await getPosSession();
  return <InvoiceDetailView invoice={invoice} isAdmin={session?.role === "ADMIN"} />;
}
