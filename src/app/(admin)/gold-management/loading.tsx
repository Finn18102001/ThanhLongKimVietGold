export default function GoldManagementLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-56 animate-pulse rounded-lg bg-[var(--tlkv-line)]/40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-[12px] border border-[var(--tlkv-line)]/40 bg-white"
          />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]" />
    </div>
  );
}
