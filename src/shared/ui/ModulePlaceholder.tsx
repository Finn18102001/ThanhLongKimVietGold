export function ModulePlaceholder({
  title,
  moduleId: _moduleId,
  summary,
}: {
  title: string;
  moduleId: string;
  summary: string;
}) {
  return (
    <section className="rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)] uppercase">
        Đang phát triển
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-6 text-[var(--tlkv-muted)]">{summary}</p>
      <p className="mt-6 rounded-lg bg-[var(--tlkv-bg)] px-4 py-3 text-[13px] text-[var(--tlkv-text)]">
        Tính năng này đang được xây dựng. Các màn hình khác vẫn hoạt động bình thường.
      </p>
    </section>
  );
}
