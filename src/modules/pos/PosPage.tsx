import { Suspense } from "react";
import { getPosSession } from "@/shared/auth/session";
import { PosTerminal } from "./PosTerminal";
import { listHeldOrders, listPosBrands, listPosCatalog, listPosOperators } from "./query";
import { isSharedPosCounterEmail } from "./types";

export async function PosPage() {
  const [catalog, brands, heldOrders, session] = await Promise.all([
    listPosCatalog(),
    listPosBrands(),
    listHeldOrders(),
    getPosSession(),
  ]);
  const showCounterStaffPicker = isSharedPosCounterEmail(session?.email);
  const operators = showCounterStaffPicker ? await listPosOperators() : [];
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal
        catalog={catalog}
        brands={brands}
        initialHeldOrders={heldOrders}
        saleContext={{
          staffId: session?.staffId ?? null,
          isShared: showCounterStaffPicker,
          operators,
        }}
      />
    </Suspense>
  );
}
