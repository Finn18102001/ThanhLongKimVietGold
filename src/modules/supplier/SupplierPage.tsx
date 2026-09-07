import { ModulePlaceholder } from "@/shared/ui/ModulePlaceholder";
import { createServerSupabase } from "@/shared/supabase/server";
import { formatDong } from "@/shared/lib/money";

export async function SupplierPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_suppliers");
  if (error) {
    return (
      <ModulePlaceholder
        moduleId="supplier"
        title="Nhà cung cấp"
        summary={error.message}
      />
    );
  }
  const rows = (data as Array<Record<string, unknown>> | null) ?? [];

  const { data: debtRows } = await supabase
    .from("pos_supplier_debt_ledger")
    .select("supplier_id, supplier_name, amount_change_dong")
    .order("created_at", { ascending: false })
    .limit(500);

  const balanceBySupplier = new Map<string, { name: string; balance: number }>();
  for (const row of debtRows ?? []) {
    const key = String(row.supplier_id ?? row.supplier_name);
    const prev = balanceBySupplier.get(key) ?? {
      name: String(row.supplier_name ?? ""),
      balance: 0,
    };
    prev.balance += Number(row.amount_change_dong ?? 0);
    balanceBySupplier.set(key, prev);
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Nhà cung cấp / Nguồn hàng</h1>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Công nợ = tổng biến động ledger (dương = phải trả nguồn hàng; âm = tạm ứng / phải thu).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Tên</th>
              <th className="py-2 pr-3 font-medium">SĐT</th>
              <th className="py-2 font-medium">Công nợ hiện tại</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-[var(--tlkv-muted)]">
                  Chưa có nguồn hàng.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = String(row.id);
                const name = String(row.name ?? "");
                const bal =
                  balanceBySupplier.get(id)?.balance ??
                  balanceBySupplier.get(name)?.balance ??
                  0;
                return (
                  <tr key={id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3 font-medium">{name}</td>
                    <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                      {(row.phone as string | null) || "-"}
                    </td>
                    <td className="py-3 font-semibold">
                      {formatDong(bal)}
                      <span className="ml-2 text-[11px] font-normal text-[var(--tlkv-muted)]">
                        {bal > 0 ? "phải trả" : bal < 0 ? "tạm ứng/phải thu" : "cân bằng"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
