import { Suspense } from "react";
import { CashRequestCards } from "@/modules/fund-cash/CashRequestCards";
import { listCashRequests } from "@/modules/fund-cash/query";
import { resolveCashClerkShellMode } from "@/modules/fund-cash/resolveCashClerkShell";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import { listBuysAwaitingFund } from "./actions";
import { PurchaseWorkspace } from "./PurchaseWorkspace";
import {
  listMarketGoldRefs,
  listPurchaseMarketPrices,
  listPurchaseProductTypes,
} from "./query";
import type { BuyAwaitingFundList } from "./types";

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

  // Shell-first: do not await full catalog here. Client loads same listPurchaseCatalog.
  const [marketRefs, marketPrices, productTypes, employeeFundEnabled] = await Promise.all([
    listMarketGoldRefs(),
    listPurchaseMarketPrices(),
    listPurchaseProductTypes(),
    isEmployeeFundEnabled(),
  ]);

  let initialAwaitingFund: BuyAwaitingFundList = { items: [], total: 0, seesAll: false };
  if (employeeFundEnabled) {
    try {
      initialAwaitingFund = await listBuysAwaitingFund({ limit: 50, offset: 0 });
    } catch {
      initialAwaitingFund = { items: [], total: 0, seesAll: false };
    }
  }

  return (
    <Suspense fallback={<p className="px-6 py-4 text-[13px] text-[var(--tlkv-muted)]">Đang tải mua vào...</p>}>
      <PurchaseWorkspace
        catalog={[]}
        catalogDeferred
        marketRefs={marketRefs}
        marketPrices={marketPrices}
        productTypes={productTypes}
        employeeFundEnabled={employeeFundEnabled}
        initialAwaitingFund={initialAwaitingFund}
      />
    </Suspense>
  );
}
