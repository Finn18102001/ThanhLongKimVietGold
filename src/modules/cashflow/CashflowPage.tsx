import {
  defaultCashflowRange,
  getCapitalSnapshot,
  getCashflowOverview,
  getCashLedger,
} from "./query";
import { CashflowWorkspace } from "./CashflowWorkspace";
import type { CapitalSnapshot, CashflowOverview, CashLedgerPage } from "./types";
import { getPosSession } from "@/shared/auth/session";
import { roleHomePath } from "@/shared/auth/permissions";
import { redirect } from "next/navigation";

export async function CashflowPage() {
  const session = await getPosSession();
  if (!session || session.role !== "ADMIN") {
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
    sumInDong: 0,
    sumOutDong: 0,
    netDong: 0,
  };
  const emptyCapital: CapitalSnapshot = { totalDong: 0, groups: [] };

  let overview = emptyOverview;
  let ledger = emptyLedger;
  let capital = emptyCapital;
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
    ledger = await getCashLedger({ from, to });
  } catch {
    // Ledger chưa sẵn sàng
  }

  try {
    capital = await getCapitalSnapshot();
  } catch {
    // Vốn hàng hóa chưa sẵn sàng
  }

  return (
    <CashflowWorkspace
      initialOverview={overview}
      initialLedger={ledger}
      initialCapital={capital}
      initialFrom={from}
      initialTo={to}
    />
  );
}
