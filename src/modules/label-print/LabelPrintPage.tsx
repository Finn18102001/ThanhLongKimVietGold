import { canMutateAdminData } from "@/shared/auth/permissions";
import { getPosSession } from "@/shared/auth/session";
import { LabelPrintWorkspace } from "./components/LabelPrintWorkspace";
import { parseLabelPrefill } from "./prefill";
import { listLabelReceiveOptions, listLabelSkus } from "./query";

export async function LabelPrintPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getPosSession();
  const canReceive = Boolean(session && canMutateAdminData(session.role));
  const [skus, receiveOptions] = await Promise.all([
    listLabelSkus(),
    canReceive ? listLabelReceiveOptions() : Promise.resolve(null),
  ]);
  return (
    <LabelPrintWorkspace
      skus={skus}
      receiveOptions={receiveOptions}
      prefill={parseLabelPrefill(searchParams)}
    />
  );
}
