import { redirect } from "next/navigation";
import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import { ROUTES } from "@/shared/navigation/routes";
import { listStaff } from "@/modules/employee/query";
import { FundGoldWorkspace } from "./FundGoldWorkspace";
import {
  canOpenEmployeeGoldModule,
  listEmployeeGoldAccounts,
  listEmployeeGoldCounts,
  listEmployeeGoldLedger,
  listEmployeeGoldStock,
  listEmployeeGoldTransfers,
} from "./query";

export async function FundGoldPage() {
  const session = await getPosSession();
  if (!session) redirect("/login");

  const gate = await canOpenEmployeeGoldModule();
  if (!gate.flagOn) {
    return (
      <section className="rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]">
        <h1 className="text-2xl font-semibold tracking-tight">Quỹ vàng</h1>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-6 text-[var(--tlkv-muted)]">
          Feature Flag Quỹ nhân viên đang TẮT. Hệ thống giữ luồng AS-IS. Bật flag tại{" "}
          <a className="text-[var(--tlkv-red)] underline" href={ROUTES.settings}>
            Cài đặt
          </a>
          .
        </p>
      </section>
    );
  }

  if (!gate.allowed) {
    redirect(roleHomePath(session.role));
  }

  const accounts = await listEmployeeGoldAccounts();
  const firstId = accounts[0]?.id ?? null;
  const [stock, ledger, counts, transfers] = await Promise.all([
    listEmployeeGoldStock(firstId),
    listEmployeeGoldLedger({ accountId: firstId, limit: 50, offset: 0 }),
    listEmployeeGoldCounts({ accountId: firstId, limit: 30 }),
    listEmployeeGoldTransfers({ limit: 50 }),
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
    <FundGoldWorkspace
      initialAccounts={accounts}
      initialStock={stock}
      initialLedger={ledger}
      initialCounts={counts}
      initialTransfers={transfers}
      canMutate={canMutateAdminData(session.role)}
      canTransfer={canTransfer}
      staffOptions={staffOptions}
    />
  );
}
