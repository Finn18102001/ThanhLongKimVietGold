import { formatDong } from "@/shared/lib/money";
import type { BestSeller } from "../types";

export function BestSellers({ items }: { items: BestSeller[] }) {
  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="mb-4 text-[15px] font-semibold">Sản phẩm bán chạy</h2>
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.rank} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                item.rank === 1
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]"
              }`}
            >
              {item.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{item.name}</p>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Đã bán {item.quantitySold}
              </p>
            </div>
            <p className="text-[13px] font-semibold">{formatDong(item.revenueDong)}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
