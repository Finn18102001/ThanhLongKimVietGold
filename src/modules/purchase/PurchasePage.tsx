import { Suspense } from "react";
import { CashRequestCards } from "@/modules/fund-cash/CashRequestCards";
import { listCashRequests } from "@/modules/fund-cash/query";
import { resolveCashClerkShellMode } from "@/modules/fund-cash/resolveCashClerkShell";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import { PurchaseWorkspace } from "./PurchaseWorkspace";
import {
  listMarketGoldRefs,
  listPurchaseCatalog,
  listPurchaseMarketPrices,
  listPurchaseProductTypes,
} from "./query";

export async function PurchasePage() {
  const shellMode = await resolveCashClerkShellMode();
  if (shellMode === "cash_clerk") {
    const requests = await listCashRequests({ status: "PENDING", limit: 100, offset: 0 });
    return (
      <Suspense fallback={<p className="px-6 py-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải Quỹ tiền...</p>}>
        <CashRequestCards
          kind="CHI"
          title="Mua vào · YC chi chờ xác nhận"
          subtitle="Quỹ tiền: card phiếu chi — click để xem đủ và xác nhận. Không hiện danh mục SP."
          initialRequests={requests}
          canAct
        />
      </Suspense>
    );
  }

  const [catalog, marketRefs, marketPrices, productTypes, employeeFundEnabled] = await Promise.all([
    listPurchaseCatalog(),
    listMarketGoldRefs(),
    listPurchaseMarketPrices(),
    listPurchaseProductTypes(),
    isEmployeeFundEnabled(),
  ]);
  return (
    <Suspense fallback={<p className="px-6 py-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải mua vào...</p>}>
      <PurchaseWorkspace
        catalog={catalog}
        marketRefs={marketRefs}
        marketPrices={marketPrices}
        productTypes={productTypes}
        employeeFundEnabled={employeeFundEnabled}
      />
    </Suspense>
  );
}
