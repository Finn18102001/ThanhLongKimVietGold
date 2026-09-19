/** Browser CSV download. Values are escaped; does not change money precision. */

/**
 * Filename-safe Asia/Ho_Chi_Minh export clock for `hh:mm dd/mm/yyyy`.
 * Uses `hh-mm_dd-mm-yyyy` because `:` and `/` are invalid in Windows filenames.
 * Display-only stamp for downloads — not a business event time.
 */
export function exportFileTimeStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  // hh:mm dd/mm/yyyy → hh-mm_dd-mm-yyyy
  return `${get("hour")}-${get("minute")}_${get("day")}-${get("month")}-${get("year")}`;
}

/** Insert `-hh-mm_dd-mm-yyyy` before the file extension to avoid download name collisions. */
export function withExportTime(filename: string, now = new Date()): string {
  const stamp = exportFileTimeStamp(now);
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return `${filename}-${stamp}`;
  }
  return `${filename.slice(0, dot)}-${stamp}${filename.slice(dot)}`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map((cell) => escapeCsv(cell ?? "")).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = withExportTime(filename);
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
