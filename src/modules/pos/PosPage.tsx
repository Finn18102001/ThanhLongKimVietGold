import { Suspense } from "react";
import { getPosSession } from "@/shared/auth/session";
import { withPerfSpan } from "@/shared/lib/perf-span";
import { CashRequestCards } from "@/modules/fund-cash/CashRequestCards";
import { listCashRequests } from "@/modules/fund-cash/query";
import { resolveCashClerkShellMode } from "@/modules/fund-cash/resolveCashClerkShell";
import { listSalesAwaitingGold } from "@/modules/fund-gold/awaitingGoldActions";
import { canOpenEmployeeGoldModule } from "@/modules/fund-gold/query";
import type { SaleAwaitingGoldRow } from "@/modules/fund-gold/types";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import { PosTerminal } from "./PosTerminal";
import {
  listHeldOrders,
  listMarketGoldClassPrices,
  listPosBrands,
  listPosCatalog,
  listPosOperators,
  listPosProductTypes,
} from "./query";
import { isSharedPosCounterEmail } from "./types";

export async function PosPage() {
  return withPerfSpan("page.pos", async () => {
    const shellMode = await resolveCashClerkShellMode();
    if (shellMode === "cash_clerk") {
      const requests = await listCashRequests({ status: "PENDING", limit: 100, offset: 0 });
      return (
        <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải Quỹ tiền...</div>}>
          <CashRequestCards
            kind="THU"
            title="Bán hàng · YC thu chờ xác nhận"
            subtitle="Quỹ tiền: card hóa đơn thu — click để xem đủ và xác nhận. Không hiện danh mục SP."
            initialRequests={requests}
            canAct
          />
        </Suspense>
      );
    }

    // PERF-001: one market-prices RPC shared by catalog mapper + PosTerminal props.
    const marketPricesPromise = listMarketGoldClassPrices();
    const [catalog, brands, productTypes, heldOrders, session, marketPrices, flagOn] =
      await Promise.all([
        listPosCatalog({ marketPrices: marketPricesPromise }),
        listPosBrands(),
        listPosProductTypes(),
        listHeldOrders(),
        getPosSession(),
        marketPricesPromise,
        isEmployeeFundEnabled(),
      ]);

    let awaitingGoldItems: SaleAwaitingGoldRow[] = [];
    if (flagOn) {
      try {
        const gold = await canOpenEmployeeGoldModule();
        if (gold.allowed && (gold.access.staffAccountId || gold.access.isAdmin)) {
          const list = await listSalesAwaitingGold();
          awaitingGoldItems = list.items;
        }
      } catch {
        awaitingGoldItems = [];
      }
    }

    const showCounterStaffPicker = isSharedPosCounterEmail(session?.email);
    const operators = showCounterStaffPicker ? await listPosOperators() : [];
    return (
      <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải quầy...</div>}>
        <PosTerminal
          catalog={catalog}
          marketPrices={marketPrices}
          brands={brands}
          productTypes={productTypes}
          initialHeldOrders={heldOrders}
          employeeFundEnabled={flagOn}
          initialAwaitingGold={awaitingGoldItems}
          saleContext={{
            staffId: session?.staffId ?? null,
            isShared: showCounterStaffPicker,
            operators,
          }}
        />
      </Suspense>
    );
  });
}
