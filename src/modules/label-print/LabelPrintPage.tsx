import { canMutateAdminData } from "@/shared/auth/permissions";
import { getPosSession } from "@/shared/auth/session";
import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { parseLabelPrefill } from "./prefill";
import { listLabelProductTypes, listLabelReceiveOptions, listLabelSkus } from "./query";

export async function LabelPrintPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getPosSession();
  const canReceive = Boolean(session && canMutateAdminData(session.role));
  const [skus, productTypes, receiveOptions] = await Promise.all([
    listLabelSkus(),
    listLabelProductTypes(),
    canReceive ? listLabelReceiveOptions() : Promise.resolve(null),
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
