import { formatDongCompact } from "@/shared/lib/money";
import { formatViClock } from "@/shared/lib/datetime";
import { ROUTES } from "@/shared/navigation/routes";
import type { GoldPriceQuote } from "@/modules/pricing/types";

export function GoldPriceWidget({ quote }: { quote: GoldPriceQuote }) {
  return (
    <section className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)] uppercase">
        {quote.label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--tlkv-text)]">{quote.purity}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-lg bg-[var(--tlkv-bg)] px-2.5 py-2">
          <dt className="text-[var(--tlkv-muted)]">Mua vào</dt>
          <dd className="mt-0.5 font-semibold text-[var(--tlkv-text)]">
            {formatDongCompact(quote.buyDong)}
          </dd>
        </div>
        <div className="rounded-lg bg-[var(--tlkv-red-soft)] px-2.5 py-2">
          <dt className="text-[var(--tlkv-red)]">Bán ra</dt>
          <dd className="mt-0.5 font-semibold text-[var(--tlkv-red)]">
            {formatDongCompact(quote.sellDong)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-[var(--tlkv-faint)]">
        Cập nhật {formatViClock(quote.quotedAt)}
      </p>
      <a
        href={ROUTES.reports}
        className="mt-2 inline-block text-[12px] font-medium text-[var(--tlkv-red)] hover:underline"
      >
        Xem bảng giá đầy đủ
      </a>
    </section>
  );
}
