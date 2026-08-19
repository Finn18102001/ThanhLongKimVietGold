import { formatDong } from "@/shared/lib/money";
import { InventoryKpis } from "./components/InventoryKpis";
import { InventorySidePanels } from "./components/InventorySidePanels";
import { StockTable } from "./components/StockTable";
import { listLedger, listStock } from "./query";
import { LOW_STOCK_DISPLAY_QTY, stockStatus } from "./types";

export async function InventoryPage() {
  const [rows, ledger] = await Promise.all([listStock(), listLedger()]);
  const skuCount = rows.length;
  const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  const value = rows.reduce(
    (sum, row) => sum + (row.unitPriceDong === null ? 0 : row.unitPriceDong * row.quantity),
    0,
  );
  const lowStock = rows.filter((row) => stockStatus(row.quantity) !== "IN_STOCK").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Tồn kho hiện tại</p>
      </div>
      <InventoryKpis
        skuCount={String(skuCount)}
        totalQty={String(totalQty)}
        valueLabel={formatDong(value)}
        lowStock={String(lowStock)}
        lowStockHint={`Sắp hết / hết hàng (tồn ≤ ${LOW_STOCK_DISPLAY_QTY})`}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <StockTable rows={rows} />
        <InventorySidePanels ledger={ledger} />
      </div>
    </div>
  );
}
