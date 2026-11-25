import {
  defaultCashflowRange,
  getCapitalSnapshot,
  getCashflowOverview,
  getCashLedger,
  getCashObligations,
  getCashPeriodSummary,
} from "./query";
import { CashflowWorkspace } from "./CashflowWorkspace";
import type {
  CapitalSnapshot,
  CashflowOverview,
  CashLedgerPage,
  CashObligationRow,
  CashPeriodSummary,
} from "./types";
import { getPosSession } from "@/shared/auth/session";
import { canAdminRead, canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import { redirect } from "next/navigation";

export async function CashflowPage() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    redirect(roleHomePath(session?.role ?? "STAFF"));
  }

  const emptyOverview: CashflowOverview = {
    businessDate: new Date().toISOString().slice(0, 10),
    cash: null,
    bank: null,
    availableDong: 0,
    sevenDay: { inDong: 0, outDong: 0, netDong: 0 },
    receivableDong: 0,
    payableDong: 0,
    stockCapitalDong: 0,
  };
  const emptyLedger: CashLedgerPage = {
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
    sumInDong: 0,
    sumOutDong: 0,
    netDong: 0,
  };
  const emptyCapital: CapitalSnapshot = { totalDong: 0, groups: [] };
  const emptyPeriod = (fromIso: string, toIso: string): CashPeriodSummary => ({
    from: fromIso,
    to: toIso,
    cash: null,
    bank: null,
    total: { openingDong: 0, inDong: 0, outDong: 0, closingDong: 0 },
  });

  let overview = emptyOverview;
  let ledger = emptyLedger;
  let capital = emptyCapital;
  let period = emptyPeriod(defaultCashflowRange().from, defaultCashflowRange().to);
  let obligations: CashObligationRow[] = [];
  let from = defaultCashflowRange().from;
  let to = defaultCashflowRange().to;
  const loadWarnings: string[] = [];

  try {
    overview = await getCashflowOverview();
    const r = defaultCashflowRange(overview.businessDate);
    from = r.from;
    to = r.to;
  } catch {
    // Overview chờ xong rồi mới parallel nhóm sau (không phải parallel toàn waterfall).
    loadWarnings.push("Không tải được tổng quan dòng tiền.");
  }

  // Parallel nhóm sau overview — cùng from/to; lỗi từng phần không kéo sập màn hình.
  const settled = await Promise.allSettled([
    getCashLedger({ from, to, limit: 50, offset: 0 }),
    getCapitalSnapshot(),
    getCashPeriodSummary(from, to),
    getCashObligations(),
  ]);

  if (settled[0].status === "fulfilled") ledger = settled[0].value;
  else loadWarnings.push("Không tải được sổ quỹ (ledger).");
  if (settled[1].status === "fulfilled") capital = settled[1].value;
  else loadWarnings.push("Không tải được vốn hàng hóa.");
  if (settled[2].status === "fulfilled") period = settled[2].value;
  else {
    period = emptyPeriod(from, to);
    loadWarnings.push("Không tải được KPI kỳ.");
  }
  if (settled[3].status === "fulfilled") obligations = settled[3].value;
  else loadWarnings.push("Không tải được công nợ.");

  return (
    <CashflowWorkspace
      initialOverview={overview}
      initialLedger={ledger}
      initialCapital={capital}
      initialPeriod={period}
      initialObligations={obligations}
      initialFrom={from}
      initialTo={to}
      initialLoadWarnings={loadWarnings}
      canMutate={canMutateAdminData(session.role)}
    />
  );
}
