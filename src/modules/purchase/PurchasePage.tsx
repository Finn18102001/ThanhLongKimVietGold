import { Suspense } from "react";
import { PurchaseWorkspace } from "./PurchaseWorkspace";
import { listBuys, listMarketGoldRefs, listPurchaseCatalog } from "./query";

export async function PurchasePage() {
  const [catalog, marketRefs, recentBuys] = await Promise.all([
    listPurchaseCatalog(),
    listMarketGoldRefs(),
    listBuys(30),
  ]);
  return (
    <Suspense fallback={<p className="px-6 py-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải mua vào...</p>}>
      <PurchaseWorkspace catalog={catalog} marketRefs={marketRefs} recentBuys={recentBuys} />
    </Suspense>
  );
}
