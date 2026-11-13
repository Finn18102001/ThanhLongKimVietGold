import { CatalogTaxonomyView } from "./CatalogTaxonomyView";
import { getTaxonomyOverview } from "./taxonomy-query";
import type { TaxonomyOverview } from "./types";

export async function CategoryPage() {
  let overview: TaxonomyOverview = { brands: [], categories: [], productTypes: [] };
  let loadError: string | null = null;
  try {
    overview = await getTaxonomyOverview();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Không tải được danh mục.";
  }
  return (
    <>
      {loadError ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {loadError}
        </p>
      ) : null}
      <CatalogTaxonomyView overview={overview} />
    </>
  );
}
