import { Suspense } from "react";
import { getPosSession } from "@/shared/auth/session";
import { PosTerminal } from "./PosTerminal";
import { listHeldOrders, listPosBrands, listPosCatalog, listPosOperators } from "./query";

export async function PosPage() {
  const [catalog, brands, heldOrders, session, operators] = await Promise.all([
    listPosCatalog(),
    listPosBrands(),
    listHeldOrders(),
    getPosSession(),
    listPosOperators(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal
        catalog={catalog}
        brands={brands}
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
