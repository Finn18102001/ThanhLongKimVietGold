import { assertAdminWrite } from "@/shared/auth/assert";
import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { parseLabelPrefill } from "./prefill";
import { listLabelProductTypes, listLabelReceiveOptions, listLabelSkus } from "./query";

export async function LabelPrintPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [skus, productTypes] = await Promise.all([listLabelSkus(), listLabelProductTypes()]);

  let receiveOptions = null;
  try {
    await assertAdminWrite();
    receiveOptions = await listLabelReceiveOptions();
  } catch {
    // STAFF / viewer: no combined receive tab (require_admin).
  }

  return (
    <LabelPrintWorkspace
      skus={skus}
      productTypes={productTypes}
      receiveOptions={receiveOptions}
      prefill={parseLabelPrefill(searchParams)}
    />
  );
}
