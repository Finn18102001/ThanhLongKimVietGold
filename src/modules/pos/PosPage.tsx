import { Suspense } from "react";
import { getWalkInCustomer } from "@/modules/customer/query";
import { PosTerminal } from "./PosTerminal";
import { listPosCatalog } from "./query";

export async function PosPage() {
  const [catalog, walkIn] = await Promise.all([listPosCatalog(), getWalkInCustomer()]);
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
      <PosTerminal catalog={catalog} walkIn={walkIn} />
    </Suspense>
  );
}
