import { getReportingSnapshot } from "./query";
import { ReportingWorkspace } from "./ReportingWorkspace";
import type { ReportingSnapshot } from "./types";

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

  try {
    initial = await getReportingSnapshot(fromIso, toIso);
  } catch {
    // Migration chưa apply
  }

  return <ReportingWorkspace initial={initial} />;
}
