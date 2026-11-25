import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { parseLabelPrefill } from "./prefill";
import { listLabelProductTypes, listLabelReceiveOptions, listLabelSkus } from "./query";
import type { LabelReceiveOptions } from "./types";

const EMPTY_RECEIVE_OPTIONS: LabelReceiveOptions = {
  brands: [],
  categories: [],
  priceRows: [],
  productTypes: [],
  brandCategories: [],
};

export async function LabelPrintPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Tab «In tem kiêm nhập kho» luôn hiện — không ẩn theo assertAdminWrite / lỗi load options.
  const [skus, productTypes, receiveOptions] = await Promise.all([
    listLabelSkus(),
    listLabelProductTypes(),
    listLabelReceiveOptions().catch(() => EMPTY_RECEIVE_OPTIONS),
  ]);

  return (
    <LabelPrintWorkspace
      skus={skus}
      productTypes={productTypes}
      receiveOptions={receiveOptions}
      prefill={parseLabelPrefill(searchParams)}
    />
  );
}
