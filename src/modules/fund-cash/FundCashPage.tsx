import { redirect } from "next/navigation";
import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import { ROUTES } from "@/shared/navigation/routes";
import { listStaff } from "@/modules/employee/query";
import { CashFundClerkWorkspace } from "./CashFundClerkWorkspace";
import { FundCashWorkspace } from "./FundCashWorkspace";
import {
  canOpenEmployeeCashModule,
  listCashRequests,
  listCashTransfers,
  listEmployeeCashAccounts,
  listEmployeeCashLedger,
} from "./query";

export async function FundCashPage() {
  const session = await getPosSession();
  if (!session) redirect("/login");

  const gate = await canOpenEmployeeCashModule();
  if (!gate.flagOn) {
    return (
      <section className="rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]">
        <h1 className="text-2xl font-semibold tracking-tight">Quỹ tiền</h1>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-6 text-[var(--tlkv-muted)]">
          Feature Flag Quỹ nhân viên đang TẮT. Hệ thống giữ luồng AS-IS (CASH-001 / BANK-001). Bật flag
          tại <a className="text-[var(--tlkv-red)] underline" href={ROUTES.settings}>Cài đặt</a>.
        </p>
      </section>
    );
  }

  if (!gate.allowed) {
    redirect(roleHomePath(session.role));
  }

  const accounts = await listEmployeeCashAccounts();
  const staffAccount =
    accounts.find((a) => a.id === gate.access.staffAccountId) ??
    accounts.find((a) => a.kind === "STAFF") ??
    null;
  const ledgerAccountId = gate.access.isAdmin
    ? (accounts[0]?.id ?? null)
    : (staffAccount?.id ?? null);
  const ledger = await listEmployeeCashLedger({
    accountId: ledgerAccountId,
    limit: 80,
    offset: 0,
  });
  const [transfers, requests] = await Promise.all([
    listCashTransfers({ limit: 50, offset: 0 }),
    listCashRequests({ limit: 80, offset: 0 }),
  ]);

  const canMutate = canMutateAdminData(session.role);
  const canTransfer = canMutate || session.role === "STAFF";

  // NV Quỹ tiền: shell clerk (card YC + CTCT + ca). Admin: workspace quản trị đủ.
  if (!canMutate && gate.access.staffAccountId) {
    return (
      <CashFundClerkWorkspace
        account={staffAccount}
        initialRequests={requests}
        initialTransfers={transfers}
        initialLedger={ledger}
        canAct={canTransfer}
        canTransfer={canTransfer}
        queueKind="BOTH"
      />
    );
  }

  let staffOptions: { id: string; fullName: string; email: string }[] = [];
  if (canMutate) {
    try {
      const page = await listStaff({ active: true, limit: 200, offset: 0 });
      staffOptions = page.items.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
      }));
    } catch {
      staffOptions = [];
    }
  }

  return (
    <FundCashWorkspace
      initialAccounts={accounts}
      initialLedger={ledger}
      initialTransfers={transfers}
      initialRequests={requests}
      canMutate={canMutate}
      canTransfer={canTransfer}
      staffOptions={staffOptions}
    />
  );
}
