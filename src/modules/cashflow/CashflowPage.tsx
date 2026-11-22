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

  try {
    overview = await getCashflowOverview();
    const r = defaultCashflowRange(overview.businessDate);
    from = r.from;
    to = r.to;
  } catch {
    // Overview chưa sẵn sàng
  }

  try {
    ledger = await getCashLedger({ from, to, limit: 50, offset: 0 });
  } catch {
    // Ledger chưa sẵn sàng
  }

  try {
    capital = await getCapitalSnapshot();
  } catch {
    // Vốn hàng hóa chưa sẵn sàng
  }

  try {
    period = await getCashPeriodSummary(from, to);
  } catch {
    period = emptyPeriod(from, to);
  }

  try {
    obligations = await getCashObligations();
  } catch {
    // Công nợ chưa sẵn sàng
  }

  return (
    <CashflowWorkspace
      initialOverview={overview}
      initialLedger={ledger}
      initialCapital={capital}
      initialPeriod={period}
      initialObligations={obligations}
      initialFrom={from}
      initialTo={to}
      canMutate={canMutateAdminData(session.role)}
    />
  );
}
