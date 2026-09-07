import { listSuppliers } from "./actions";
import { WarehouseOrderForm } from "./components/WarehouseOrderForm";
import { listStock } from "./query";

export async function OrderPage() {
  const [rows, suppliers] = await Promise.all([listStock(), listSuppliers()]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Đặt hàng cho kho</p>
      <WarehouseOrderForm rows={rows} suppliers={suppliers} />
    </div>
  );
}
