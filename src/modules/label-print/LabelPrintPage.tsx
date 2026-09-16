import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { listLabelSkus } from "./query";

export async function LabelPrintPage() {
  const skus = await listLabelSkus();
  return <LabelPrintWorkspace skus={skus} />;
}
