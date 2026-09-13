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
    if (!raw) return DEFAULT_PRINTER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<PrinterProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_PRINTER_PROFILE.name,
      offsetX: num(parsed.offsetX, DEFAULT_PRINTER_PROFILE.offsetX),
      offsetY: num(parsed.offsetY, DEFAULT_PRINTER_PROFILE.offsetY),
      scale: num(parsed.scale, 1) > 0 ? num(parsed.scale, 1) : 1,
      amountInWordsOffsetX: num(
        parsed.amountInWordsOffsetX,
        DEFAULT_PRINTER_PROFILE.amountInWordsOffsetX,
      ),
      amountInWordsOffsetY: num(
        parsed.amountInWordsOffsetY,
        DEFAULT_PRINTER_PROFILE.amountInWordsOffsetY,
      ),
      totalAmountOffsetX: num(
        parsed.totalAmountOffsetX,
        DEFAULT_PRINTER_PROFILE.totalAmountOffsetX,
      ),
      totalAmountOffsetY: num(
        parsed.totalAmountOffsetY,
        DEFAULT_PRINTER_PROFILE.totalAmountOffsetY,
      ),
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
      offsetX: num(profile.offsetX, DEFAULT_PRINTER_PROFILE.offsetX),
      offsetY: num(profile.offsetY, DEFAULT_PRINTER_PROFILE.offsetY),
      scale: num(profile.scale, 1) > 0 ? num(profile.scale, 1) : 1,
      amountInWordsOffsetX: num(
        profile.amountInWordsOffsetX,
        DEFAULT_PRINTER_PROFILE.amountInWordsOffsetX,
      ),
      amountInWordsOffsetY: num(
        profile.amountInWordsOffsetY,
        DEFAULT_PRINTER_PROFILE.amountInWordsOffsetY,
      ),
      totalAmountOffsetX: num(
        profile.totalAmountOffsetX,
        DEFAULT_PRINTER_PROFILE.totalAmountOffsetX,
      ),
      totalAmountOffsetY: num(
        profile.totalAmountOffsetY,
        DEFAULT_PRINTER_PROFILE.totalAmountOffsetY,
      ),
    }),
  );
}
