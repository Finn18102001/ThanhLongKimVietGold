import { formatDong } from "@/shared/lib/money";

export function trendFrom(today: number, yesterday: number): {
  trendPercent: number | null;
  trendDirection: "up" | "down" | "flat";
} {
  if (yesterday === 0) {
    return {
      trendPercent: null,
      trendDirection: today === 0 ? "flat" : "up",
    };
  }
  const percent = Math.round(((today - yesterday) / yesterday) * 1000) / 10;
  if (percent === 0) {
    return { trendPercent: 0, trendDirection: "flat" };
  }
  return {
    trendPercent: Math.abs(percent),
    trendDirection: percent > 0 ? "up" : "down",
  };
}

export function formatTrendHint(direction: "up" | "down" | "flat"): string {
  return direction === "flat" ? "không đổi" : "so với hôm qua";
}

export function kpiValue(label: string, amountDong?: number): string {
  if (amountDong !== undefined) {
    return formatDong(amountDong);
  }
  return label;
}
