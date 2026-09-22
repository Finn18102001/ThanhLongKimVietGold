import { listBrands } from "./actions";
import { ReceiveForm } from "./components/ReceiveForm";
import { listCategories, listPriceRows, listStock } from "./query";

export async function ReceivePage() {
  const [rows, brands, categories, priceRows] = await Promise.all([
    listStock(),
    listBrands(),
    listCategories(),
    listPriceRows(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Nhập hàng</p>
      </div>
      <ReceiveForm rows={rows} brands={brands} categories={categories} priceRows={priceRows} />
    </div>
  );
}
