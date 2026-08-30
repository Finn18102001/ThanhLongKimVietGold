import { PurchaseWorkspace } from "./PurchaseWorkspace";
import { listBuys, listMarketGoldRefs, listPurchaseCatalog } from "./query";

export async function PurchasePage() {
  const [catalog, marketRefs, recentBuys] = await Promise.all([
    listPurchaseCatalog(),
    listMarketGoldRefs(),
    listBuys(30),
  ]);
  return (
    <PurchaseWorkspace catalog={catalog} marketRefs={marketRefs} recentBuys={recentBuys} />
  );
}
