import type { GoldPriceQuote } from "./types";

/** Preview quote until Pricing module reads the live price table. */
export const PREVIEW_GOLD_QUOTE: GoldPriceQuote = {
  label: "Giá vàng hôm nay",
  purity: "Vàng 99.99",
  buyDong: 6_820_000,
  sellDong: 6_920_000,
  quotedAt: "2026-08-15T10:30:00+07:00",
};
