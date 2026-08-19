import { Suspense } from "react";
import { CustomerDirectory } from "./CustomerDirectory";
import { getCustomerDirectoryStats, listCustomers } from "./query";

export async function CustomerPage() {
  const [initial, stats] = await Promise.all([
    listCustomers({ limit: 20, offset: 0 }),
    getCustomerDirectoryStats(),
  ]);

  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-[var(--tlkv-muted)]">Đang tải khách hàng...</div>}>
      <CustomerDirectory initial={initial} stats={stats} />
    </Suspense>
  );
}
