import { formatViDateTime } from "@/shared/lib/datetime";
import { ledgerTypeLabel } from "./labels";
import { listLedger } from "./query";

export async function HistoryPage() {
  const ledger = await listLedger();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">Kho hàng</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Lịch sử biến động</p>
      </div>
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Sổ biến động kho</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 pr-3 font-medium">Thời gian</th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Loại</th>
                <th className="py-2 pr-3 font-medium">SL</th>
                <th className="py-2 pr-3 font-medium">Trước → Sau</th>
                <th className="py-2 pr-3 font-medium">Lý do</th>
                <th className="py-2 font-medium">Người làm</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td className="py-4 text-[var(--tlkv-muted)]" colSpan={7}>
                    Chưa có biến động. Hãy nhập hàng hoặc bán hàng hoàn tất.
                  </td>
                </tr>
              ) : (
                ledger.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">{formatViDateTime(row.createdAt)}</td>
                    <td className="py-3 pr-3">
                      {row.sku} · {row.name}
                    </td>
                    <td className="py-3 pr-3">{ledgerTypeLabel(row.type)}</td>
                    <td className="py-3 pr-3 font-medium">{row.quantity}</td>
                    <td className="py-3 pr-3">
                      {row.beforeQuantity} → {row.afterQuantity}
                    </td>
                    <td className="py-3 pr-3">{row.reason}</td>
                    <td className="py-3">{row.actorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
