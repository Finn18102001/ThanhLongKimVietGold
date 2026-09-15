export default function AdminRouteLoading() {
  return (
    <div
      className="flex min-h-[240px] items-center justify-center text-[13px] text-[var(--tlkv-muted)]"
      role="status"
      aria-live="polite"
    >
      Đang tải dữ liệu...
    </div>
  );
}
