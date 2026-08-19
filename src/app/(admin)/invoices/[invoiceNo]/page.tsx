import { InvoiceDetailPage } from "@/modules/invoice/InvoiceDetailPage";

export default async function InvoiceDetailRoute({
  params,
}: {
  params: Promise<{ invoiceNo: string }>;
}) {
  const { invoiceNo } = await params;
  return <InvoiceDetailPage invoiceNo={decodeURIComponent(invoiceNo)} />;
}
