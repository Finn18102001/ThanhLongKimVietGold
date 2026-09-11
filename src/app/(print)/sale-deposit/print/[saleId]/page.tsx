import { DepositPrintPage } from "@/modules/sale-deposit/components/DepositPrintPage";
import type { DepositDocKind } from "@/modules/sale-deposit/types";

function asKind(raw: string | undefined): DepositDocKind {
  if (raw === "SLIP" || raw === "HANDOVER" || raw === "AGREEMENT") return raw;
  return "AGREEMENT";
}

export default async function SaleDepositPrintRoute({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ kind?: string; auto?: string }>;
}) {
  const { saleId } = await params;
  const q = await searchParams;
  return (
    <DepositPrintPage
      saleId={saleId}
      kind={asKind(q.kind)}
      autoPrint={q.auto === "1"}
    />
  );
}
