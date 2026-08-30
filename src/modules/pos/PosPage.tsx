import { Suspense } from "react";
import { getWalkInCustomer } from "@/modules/customer/query";
import { PosTerminal } from "./PosTerminal";
import { listHeldOrders, listPosCatalog } from "./query";

export async function PosPage() {
  const [catalog, walkIn, heldOrders] = await Promise.all([
    listPosCatalog(),
    getWalkInCustomer(),
    listHeldOrders(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal catalog={catalog} walkIn={walkIn} initialHeldOrders={heldOrders} />
    </Suspense>
  );
}
