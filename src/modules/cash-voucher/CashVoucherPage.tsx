import { searchCashVouchers } from "./actions";
import { CashVoucherDirectory } from "./CashVoucherDirectory";
import type { CashVoucherListFilter, CashVoucherListPage } from "./types";

function pick(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

export async function CashVoucherPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const filter: CashVoucherListFilter = {
    from: pick(sp, "from") || null,
    to: pick(sp, "to") || null,
    code: pick(sp, "code") || null,
    kind: pick(sp, "kind") || null,
    status: pick(sp, "status") || null,
    createdBy: pick(sp, "createdBy") || null,
    confirmedBy: pick(sp, "confirmedBy") || null,
    cashHolder: pick(sp, "cashHolder") || null,
    goldHolder: pick(sp, "goldHolder") || null,
    limit: Number(pick(sp, "limit") || 50) || 50,
    offset: Number(pick(sp, "offset") || 0) || 0,
  };

  let initial: CashVoucherListPage = {
    items: [],
    total: 0,
    limit: filter.limit ?? 50,
    offset: filter.offset ?? 0,
  };
  try {
    initial = await searchCashVouchers(filter);
  } catch {
    // RPC chưa apply / chưa có quyền
  }
  return <CashVoucherDirectory initial={initial} initialFilter={filter} />;
}
