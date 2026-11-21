/** Normalize MSP / barcode for equality checks (case + hyphen insensitive). */
export function normalizeLabelCode(code: string): string {
  return code.trim().toUpperCase().replace(/-/g, "");
}
