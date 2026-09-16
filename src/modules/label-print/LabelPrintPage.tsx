import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { listLabelSkus, listPrintHistory } from "./query";

export async function LabelPrintPage() {
  const [skus, history] = await Promise.all([listLabelSkus(), listPrintHistory()]);
  return <LabelPrintWorkspace skus={skus} initialHistory={history} />;
}
