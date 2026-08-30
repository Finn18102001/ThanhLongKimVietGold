export function parseDongInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function parseWeightInput(raw: string): number {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  if (!normalized) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function defaultDueDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolvePaidDong(
  payMode: "FULL" | "PARTIAL" | "UNPAID",
  paidDong: number,
  totalDong: number,
): number {
  if (payMode === "FULL") return totalDong;
  if (payMode === "UNPAID") return 0;
  return Math.max(0, Math.min(paidDong, totalDong));
}

export const purchaseInputClass =
  "h-9 w-full rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";
