import Link from "next/link";
import { ROUTES } from "@/shared/navigation/routes";
import { formatDong } from "@/shared/lib/money";
import { formatViClock } from "@/shared/lib/datetime";
import type { RecentInvoice } from "../types";

const STATUS_LABEL: Record<RecentInvoice["status"], string> = {
  COMPLETED: "Hoàn thành",
};

export function RecentInvoices({ items }: { items: RecentInvoice[] }) {
  return (
    <article className="min-w-0 rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Hóa đơn gần đây</h2>
        <Link
          href={ROUTES.invoices}
          className="text-[13px] font-medium text-[var(--tlkv-red)] hover:underline"
        >
          Xem tất cả
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã HĐ</th>
              <th className="py-2 pr-3 font-medium">Khách hàng</th>
              <th className="py-2 pr-3 font-medium">Tổng tiền</th>
              <th className="py-2 pr-3 font-medium">Thanh toán</th>
              <th className="py-2 pr-3 font-medium">Giờ</th>
              <th className="py-2 pr-3 font-medium">Nhân viên</th>
              <th className="py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((invoice) => (
              <tr key={invoice.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                <td className="py-3 pr-3 font-semibold text-[var(--tlkv-red)]">{invoice.id}</td>
                <td className="py-3 pr-3">{invoice.customerName}</td>
                <td className="py-3 pr-3 font-medium">{formatDong(invoice.totalDong)}</td>
                <td className="py-3 pr-3">{invoice.paymentMethod}</td>
                <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                  {formatViClock(invoice.issuedAt)}
                </td>
                <td className="py-3 pr-3">{invoice.staffName}</td>
                <td className="py-3">
                  <span className="rounded-full bg-[var(--tlkv-green-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-green)]">
                    {STATUS_LABEL[invoice.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
