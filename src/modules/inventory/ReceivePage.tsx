import { listBrands } from "./actions";
import { DraftReceivePanel } from "./components/DraftReceivePanel";
import { ReceiveForm } from "./components/ReceiveForm";
import {
  listBrandCategoryLinks,
  listCategories,
  listPriceRows,
  listProductTypes,
  listStock,
} from "./query";

export async function ReceivePage() {
  const [rows, brands, categories, priceRows, productTypes, brandCategories] = await Promise.all([
    listStock(),
    listBrands(),
    listCategories(),
    listPriceRows(),
    listProductTypes(),
    listBrandCategoryLinks(),
  ]);
  const activeBrands = brands.filter((brand) => brand.isActive);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Nhập hàng</p>
      </div>
      <DraftReceivePanel
        brands={activeBrands}
        categories={categories}
        priceRows={priceRows}
        productTypes={productTypes}
        brandCategories={brandCategories}
      />
      <ReceiveForm
        rows={rows}
        brands={activeBrands}
        categories={categories}
        priceRows={priceRows}
        productTypes={productTypes}
        brandCategories={brandCategories}
      />
    </div>
  );
}
