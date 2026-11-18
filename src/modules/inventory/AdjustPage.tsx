import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { AdjustWorkspace } from "./components/AdjustWorkspace";
import { listProductTypes, listStock } from "./query";

export async function AdjustPage() {
  const session = await getPosSession();
  const [rows, productTypes] = await Promise.all([listStock(), listProductTypes()]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Điều chỉnh kho</p>
      </div>
      <AdjustWorkspace
        initialRows={rows}
        productTypes={productTypes}
        canMutate={session ? canMutateAdminData(session.role) : false}
      />
    </div>
  );
}
