import { formatDong } from "@/shared/lib/money";
import type { RevenuePoint } from "../types";

export function RevenueChart({ series }: { series: RevenuePoint[] }) {
  const max = Math.max(
    ...series.map((point) => Math.max(point.amountDong, point.purchaseDong ?? 0)),
    1,
  );

  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">7 ngày gần nhất</h2>
        <div className="flex items-center gap-3 text-[12px] text-[var(--tlkv-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--tlkv-red)]" />
            Bán hàng
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--tlkv-amber)]" />
            Mua hàng
          </span>
        </div>
      </div>
      <div className="flex h-[220px] items-end gap-2">
        {series.map((point) => {
          const sellH = Math.max(6, Math.round((point.amountDong / max) * 180));
          const buyH = Math.max(6, Math.round(((point.purchaseDong ?? 0) / max) * 180));
          return (
            <div key={point.isoDate} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full max-w-12 items-end justify-center gap-0.5">
                <div
                  className="w-[45%] rounded-t-md"
                  style={{
                    height: sellH,
                    background: point.isCurrent ? "var(--tlkv-red)" : "var(--tlkv-red-bar)",
                  }}
                  title={`Bán: ${formatDong(point.amountDong)}`}
                />
                <div
                  className="w-[45%] rounded-t-md bg-[var(--tlkv-amber)]"
                  style={{ height: buyH, opacity: point.isCurrent ? 1 : 0.75 }}
                  title={`Mua: ${formatDong(point.purchaseDong ?? 0)}`}
                />
              </div>
              <span className="text-[11px] text-[var(--tlkv-muted)]">{point.label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
