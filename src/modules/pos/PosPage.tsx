import { Suspense } from "react";
import { getPosSession } from "@/shared/auth/session";
import { PosTerminal } from "./PosTerminal";
import {
  listHeldOrders,
  listMarketGoldClassPrices,
  listPosBrands,
  listPosCatalog,
  listPosOperators,
} from "./query";
import { isSharedPosCounterEmail } from "./types";

export async function PosPage() {
  const [catalog, brands, heldOrders, session, marketPrices] = await Promise.all([
    listPosCatalog(),
    listPosBrands(),
    listHeldOrders(),
    getPosSession(),
    listMarketGoldClassPrices(),
  ]);
  const showCounterStaffPicker = isSharedPosCounterEmail(session?.email);
  const operators = showCounterStaffPicker ? await listPosOperators() : [];
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal
        catalog={catalog}
        marketPrices={marketPrices}
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
