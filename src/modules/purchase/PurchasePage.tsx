import { Suspense } from "react";
import { PurchaseWorkspace } from "./PurchaseWorkspace";
import {
  listMarketGoldRefs,
  listPurchaseCatalog,
  listPurchaseMarketPrices,
  listPurchaseProductTypes,
} from "./query";

export async function PurchasePage() {
  const [catalog, marketRefs, marketPrices, productTypes] = await Promise.all([
    listPurchaseCatalog(),
    listMarketGoldRefs(),
    listPurchaseMarketPrices(),
    listPurchaseProductTypes(),
  ]);
  return (
    <Suspense fallback={<p className="px-6 py-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải mua vào...</p>}>
      <PurchaseWorkspace
        catalog={catalog}
        marketRefs={marketRefs}
        marketPrices={marketPrices}
        productTypes={productTypes}
      />
    </Suspense>
  );
}
