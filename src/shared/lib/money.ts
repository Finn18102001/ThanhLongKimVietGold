/** Integer Vietnamese dong. Never pass a float into these helpers. */
export type Dong = number;

export function assertDong(amount: Dong): Dong {
  if (!Number.isInteger(amount)) {
    throw new Error("Money must be integer dong");
  }
  return amount;
}

/**
 * Format integer VND with `.` thousand separators (no decimals, no currency suffix).
 * Guarantees `.` even if runtime locale grouping differs.
 */
export function formatDongDigits(amount: Dong): string {
  const n = assertDong(amount);
  const neg = n < 0;
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? `-${grouped}` : grouped;
}

export function formatDong(amount: Dong): string {
  return `${formatDongDigits(assertDong(amount))} đ`;
}

export function formatDongCompact(amount: Dong): string {
  return formatDongDigits(assertDong(amount));
}

/** Strip grouping / spaces / commas → digit string. Empty input → "". Keeps a lone "0". */
export function extractDongDigits(raw: string): string {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "");
}

/**
 * Parse typed/pasted VND text to integer dong.
 * Empty / no digits → 0 (legacy purchase helpers). Prefer `parseDongInputOptional` when empty ≠ 0.
 */
export function parseDongInput(raw: string): number {
  const digits = extractDongDigits(raw);
  return digits ? Number(digits) : 0;
}

/** Empty / blank → null; otherwise non-negative integer dong. */
export function parseDongInputOptional(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const digits = extractDongDigits(trimmed);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) ? n : null;
}

/** Digits before caret in a (possibly formatted) money string. */
export function dongDigitIndexBeforeCaret(formatted: string, caret: number): number {
  const safe = Math.max(0, Math.min(caret, formatted.length));
  return formatted.slice(0, safe).replace(/[^\d]/g, "").length;
}

/** Caret position in formatted string after `digitIndex` digits. */
export function dongCaretFromDigitIndex(formatted: string, digitIndex: number): number {
  if (digitIndex <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i]!)) {
      seen += 1;
      if (seen >= digitIndex) return i + 1;
    }
  }
  return formatted.length;
}

const ONES = [
  "không",
  "một",
  "hai",
  "ba",
  "bốn",
  "năm",
  "sáu",
  "bảy",
  "tám",
  "chín",
];

function readTriple(value: number, leading: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(ONES[hundreds], "trăm");
  } else if (!leading && value > 0) {
    parts.push("không", "trăm");
  }

  if (tens > 1) {
    parts.push(ONES[tens], "mươi");
    if (ones === 1) parts.push("mốt");
    else if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(ONES[ones]);
  } else if (tens === 1) {
    parts.push("mười");
    if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(ONES[ones]);
  } else if (ones > 0) {
    if (hundreds > 0 || !leading) parts.push("lẻ");
    parts.push(ONES[ones]);
  }

  return parts.join(" ");
}

export function formatDongInWords(amount: Dong): string {
  const dong = assertDong(amount);
  if (dong === 0) return "Không đồng";

  const scales = ["", "nghìn", "triệu", "tỷ"];
  const groups: number[] = [];
  let remaining = dong;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    parts.push(readTriple(group, index === groups.length - 1));
    if (scales[index]) parts.push(scales[index]);
  }

  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} đồng`;
}
