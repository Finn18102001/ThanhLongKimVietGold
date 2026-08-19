/** Integer Vietnamese dong. Never pass a float into these helpers. */
export type Dong = number;

export function assertDong(amount: Dong): Dong {
  if (!Number.isInteger(amount)) {
    throw new Error("Money must be integer dong");
  }
  return amount;
}

export function formatDong(amount: Dong): string {
  return `${new Intl.NumberFormat("vi-VN").format(assertDong(amount))} đ`;
}

export function formatDongCompact(amount: Dong): string {
  return new Intl.NumberFormat("vi-VN").format(assertDong(amount));
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
