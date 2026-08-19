"use client";

import { useState, useTransition } from "react";
import { Printer } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { fetchReportingSnapshot } from "./actions";
import type { ReportingSnapshot } from "./types";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function ReportingWorkspace({ initial }: { initial: ReportingSnapshot }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const maxRevenue = Math.max(...snapshot.daily.map((row) => row.revenueDong), 1);

  function refresh(nextFrom = from, nextTo = to) {
    startTransition(async () => {
      try {
        setSnapshot(await fetchReportingSnapshot(nextFrom, nextTo));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải báo cáo");
      }
    });
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-[18px] font-semibold">Báo cáo doanh thu</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Chỉ tính các đơn bán đã hoàn tất. Trừ các phiếu trả hàng đã xử lý xong. Số liệu lấy
              trực tiếp từ hệ thống, không nhập tay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => refresh()}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
            >
              Lọc
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <Printer size={16} />
              In / PDF
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

        <div className={`mt-4 grid grid-cols-1 gap-3 md:grid-cols-4 ${pending ? "opacity-60" : ""}`}>
          <Kpi label="Doanh thu trước hoàn" value={formatDong(snapshot.totalRevenueDong)} />
          <Kpi label="Số hóa đơn" value={String(snapshot.invoiceCount)} />
          <Kpi label="TB / hóa đơn" value={formatDong(snapshot.avgInvoiceDong)} />
          <Kpi
            label="Doanh thu sau hoàn"
            value={formatDong(snapshot.netRevenueDong)}
            hint={`Đã trừ hoàn: ${formatDong(snapshot.returnsTotalDong)}`}
          />
        </div>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[15px] font-semibold">Doanh thu theo ngày</h2>
        <div className="mt-4 flex h-[192px] items-end gap-2">
          {snapshot.daily.length === 0 ? (
            <p className="text-[13px] text-[var(--tlkv-muted)]">Không có dữ liệu trong khoảng thời gian.</p>
          ) : (
            snapshot.daily.map((row) => {
              const height = Math.max(8, Math.round((row.revenueDong / maxRevenue) * 160));
              return (
                <div key={row.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full max-w-10 rounded-t-md bg-[var(--tlkv-red)]"
                    style={{ height }}
                    title={formatDong(row.revenueDong)}
                  />
                  <span className="text-[10px] text-[var(--tlkv-muted)]">
                    {row.date.slice(8, 10)}/{row.date.slice(5, 7)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[15px] font-semibold">Top sản phẩm bán chạy</h2>
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Mã hàng</th>
              <th className="py-2 font-medium">Sản phẩm</th>
              <th className="py-2 font-medium">SL bán</th>
              <th className="py-2 text-right font-medium">Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.topProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có dữ liệu bán.
                </td>
              </tr>
            ) : (
              snapshot.topProducts.map((row) => (
                <tr key={row.sku} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2.5">{row.sku}</td>
                  <td className="py-2.5 font-medium">{row.name}</td>
                  <td className="py-2.5">{row.quantitySold}</td>
                  <td className="py-2.5 text-right">{formatDong(row.revenueDong)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[20px] font-bold">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">{hint}</p> : null}
    </div>
  );
}
