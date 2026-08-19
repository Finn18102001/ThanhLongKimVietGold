import type { StockAlert } from "../types";

export function StockAlerts({ items }: { items: StockAlert[] }) {
  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="mb-4 text-[15px] font-semibold">Cảnh báo tồn kho</h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.sku}
            className="flex items-center justify-between gap-3 border-b border-[var(--tlkv-line)] pb-3 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium">{item.productName}</p>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                {item.sku} · còn {item.quantity}
              </p>
            </div>
            <span className="rounded-full bg-[var(--tlkv-red-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-red)]">
              Thấp
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
