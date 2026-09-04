"use client";

import {
  DEFAULT_PRINTER_PROFILE,
  PRINT_PROFILE_STORAGE_KEY,
  type PrinterProfile,
} from "./print-template";

export function loadPrinterProfile(): PrinterProfile {
  if (typeof window === "undefined") return DEFAULT_PRINTER_PROFILE;
  try {
    const raw = window.localStorage.getItem(PRINT_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRINTER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<PrinterProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_PRINTER_PROFILE.name,
      offsetX: Number.isFinite(parsed.offsetX) ? Number(parsed.offsetX) : 0,
      offsetY: Number.isFinite(parsed.offsetY) ? Number(parsed.offsetY) : 0,
      scale: Number.isFinite(parsed.scale) && Number(parsed.scale) > 0 ? Number(parsed.scale) : 1,
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
      offsetX: Number(profile.offsetX) || 0,
      offsetY: Number(profile.offsetY) || 0,
      scale: Number(profile.scale) > 0 ? Number(profile.scale) : 1,
    }),
  );
}
