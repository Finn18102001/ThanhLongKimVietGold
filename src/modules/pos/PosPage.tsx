import { Suspense } from "react";
import { getWalkInCustomer } from "@/modules/customer/query";
import { getPosSession } from "@/shared/auth/session";
import { PosTerminal } from "./PosTerminal";
import { listHeldOrders, listPosCatalog, listPosOperators } from "./query";

export async function PosPage() {
  const [catalog, walkIn, heldOrders, session, operators] = await Promise.all([
    listPosCatalog(),
    getWalkInCustomer(),
    listHeldOrders(),
    getPosSession(),
    listPosOperators(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal
        catalog={catalog}
        walkIn={walkIn}
        initialHeldOrders={heldOrders}
        saleContext={{
          staffId: session?.staffId ?? null,
          isShared: Boolean(session?.isShared),
          operators,
        }}
      />
    </Suspense>
  );
}
