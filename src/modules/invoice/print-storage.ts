"use client";

import {
  DEFAULT_PRINTER_PROFILE,
  PRINT_PROFILE_STORAGE_KEY,
  type PrinterProfile,
} from "./print-template";

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function loadPrinterProfile(): PrinterProfile {
  if (typeof window === "undefined") return DEFAULT_PRINTER_PROFILE;
  try {
    const raw = window.localStorage.getItem(PRINT_PROFILE_STORAGE_KEY);
    // Migrate v1 key once if v2 empty.
    const legacy =
      raw ?? window.localStorage.getItem("tlkv.invoice.print.gold-certificate.v1");
    if (!legacy) return DEFAULT_PRINTER_PROFILE;
    const parsed = JSON.parse(legacy) as Partial<PrinterProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_PRINTER_PROFILE.name,
      offsetX: num(parsed.offsetX),
      offsetY: num(parsed.offsetY),
      scale: num(parsed.scale, 1) > 0 ? num(parsed.scale, 1) : 1,
      amountInWordsOffsetX: num(parsed.amountInWordsOffsetX),
      amountInWordsOffsetY: num(parsed.amountInWordsOffsetY),
      totalAmountOffsetX: num(parsed.totalAmountOffsetX),
      totalAmountOffsetY: num(parsed.totalAmountOffsetY),
    };
  } catch {
    return DEFAULT_PRINTER_PROFILE;
  }
}

export function savePrinterProfile(profile: PrinterProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PRINT_PROFILE_STORAGE_KEY,
    JSON.stringify({
      name: profile.name.trim() || DEFAULT_PRINTER_PROFILE.name,
      offsetX: num(profile.offsetX),
      offsetY: num(profile.offsetY),
      scale: num(profile.scale, 1) > 0 ? num(profile.scale, 1) : 1,
      amountInWordsOffsetX: num(profile.amountInWordsOffsetX),
      amountInWordsOffsetY: num(profile.amountInWordsOffsetY),
      totalAmountOffsetX: num(profile.totalAmountOffsetX),
      totalAmountOffsetY: num(profile.totalAmountOffsetY),
    }),
  );
}
