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

  const canMutate = canMutateAdminData(session.role);
  const canTransfer = canMutate || session.role === "STAFF";

  let accounts;
  let ledger;
  let transfers;
  let requests;
  try {
    accounts = await listEmployeeCashAccounts();
    const staffAccount =
      accounts.find((a) => a.id === gate.access.staffAccountId) ??
      accounts.find((a) => a.kind === "STAFF") ??
      null;
    const ledgerAccountId = gate.access.isAdmin
      ? (accounts[0]?.id ?? null)
      : (staffAccount?.id ?? null);
    ledger = await listEmployeeCashLedger({
      accountId: ledgerAccountId,
      limit: 80,
      offset: 0,
    });
    [transfers, requests] = await Promise.all([
      listCashTransfers({ limit: 50, offset: 0 }),
      listCashRequests({ limit: 80, offset: 0 }),
    ]);

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
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Không tải được dữ liệu Quỹ tiền.";
    return (
      <section className="rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]">
        <h1 className="text-2xl font-semibold tracking-tight">Quỹ tiền</h1>
        <p className="mt-3 text-[14px] text-[var(--tlkv-red)]">{reason}</p>
        <p className="mt-2 text-[13px] text-[var(--tlkv-muted)]">
          Thử Làm mới trang. Nếu vừa đăng nhập, đợi session ổn định rồi vào lại menu Quỹ tiền NV.
        </p>
      </section>
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
