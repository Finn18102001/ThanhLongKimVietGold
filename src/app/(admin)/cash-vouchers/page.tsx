import { CashVoucherPage } from "@/modules/cash-voucher/CashVoucherPage";

export default async function CashVouchersRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CashVoucherPage searchParams={await searchParams} />;
}
