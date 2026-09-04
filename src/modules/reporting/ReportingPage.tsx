import { getPurchaseReportSnapshot, getReportingSnapshot } from "./query";
import { ReportingWorkspace } from "./ReportingWorkspace";
import type { PurchaseReportSnapshot, ReportingSnapshot } from "./types";

export async function ReportingPage() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  let initial: ReportingSnapshot = {
    from: fromIso,
    to: toIso,
    totalRevenueDong: 0,
    invoiceCount: 0,
    avgInvoiceDong: 0,
    returnsTotalDong: 0,
    netRevenueDong: 0,
    daily: [],
    topProducts: [],
  };

  let initialPurchase: PurchaseReportSnapshot = {
    from: fromIso,
    to: toIso,
    totalPurchaseDong: 0,
    quantityPurchased: 0,
    voucherCount: 0,
    totalSellDong: 0,
    quantitySold: 0,
    daily: [],
    topProducts: [],
    topBrands: [],
    history: [],
    filterOptions: { brands: [], products: [], staff: [] },
  };

  try {
    initial = await getReportingSnapshot(fromIso, toIso);
  } catch {
    // Migration chưa apply
  }

  try {
    initialPurchase = await getPurchaseReportSnapshot({ from: fromIso, to: toIso });
  } catch {
    // Buy tables / RLS chưa sẵn sàng
  }

  return <ReportingWorkspace initial={initial} initialPurchase={initialPurchase} />;
}
