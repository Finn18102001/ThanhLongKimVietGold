import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { parseLabelPrefill } from "./prefill";
import { listLabelProductTypes, listLabelSkus } from "./query";

export async function LabelPrintPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // P7 PRE-10: nhập kho chuyển sang Kho > Nhập hàng (picker draft). Không còn LabelReceiveSection.
  const [skus, productTypes] = await Promise.all([listLabelSkus(), listLabelProductTypes()]);
  return (
    <LabelPrintWorkspace
      skus={skus}
      productTypes={productTypes}
      prefill={parseLabelPrefill(searchParams)}
    />
  );
}
