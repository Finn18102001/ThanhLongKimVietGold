import { formatDong } from "@/shared/lib/money";
import type { RevenuePoint } from "../types";

export function RevenueChart({ series }: { series: RevenuePoint[] }) {
  const max = Math.max(...series.map((point) => point.amountDong), 1);

  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Doanh thu</h2>
        <p className="text-[12px] text-[var(--tlkv-muted)]">7 ngày gần nhất</p>
      </div>
      <div className="flex h-[220px] items-end gap-3">
        {series.map((point) => {
          const height = Math.max(8, Math.round((point.amountDong / max) * 180));
          return (
            <div key={point.isoDate} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full max-w-10 rounded-t-md"
                style={{
                  height,
                  background: point.isCurrent ? "var(--tlkv-red)" : "var(--tlkv-red-bar)",
                }}
                title={formatDong(point.amountDong)}
              />
              <span className="text-[11px] text-[var(--tlkv-muted)]">{point.label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
