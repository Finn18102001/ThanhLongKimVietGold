import { redirect } from "next/navigation";
import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import { ROUTES } from "@/shared/navigation/routes";
import { listStaff } from "@/modules/employee/query";
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
  const ledger = await listEmployeeCashLedger({
    accountId: accounts[0]?.id ?? null,
    limit: 50,
    offset: 0,
  });
  const [transfers, requests] = await Promise.all([
    listCashTransfers({ limit: 50, offset: 0 }),
    listCashRequests({ limit: 50, offset: 0 }),
  ]);

  let staffOptions: { id: string; fullName: string; email: string }[] = [];
  if (canMutateAdminData(session.role)) {
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

  const canTransfer = canMutateAdminData(session.role) || session.role === "STAFF";

  return (
    <FundCashWorkspace
      initialAccounts={accounts}
      initialLedger={ledger}
      initialTransfers={transfers}
      initialRequests={requests}
      canMutate={canMutateAdminData(session.role)}
      canTransfer={canTransfer}
      staffOptions={staffOptions}
    />
  );
}
