export default function LabelPrintLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-[var(--tlkv-line)]/40" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-[420px] animate-pulse rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]" />
        <div className="h-[420px] animate-pulse rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]" />
      </div>
    </div>
  );
}
