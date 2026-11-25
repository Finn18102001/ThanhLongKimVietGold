import type { PurchaseCatalogItem } from "./types";

/** In-tab client cache so soft-nav away/back does not wait on full catalog again. */
const TTL_MS = 3 * 60 * 1000;

let cached: { at: number; items: PurchaseCatalogItem[] } | null = null;

export function peekPurchaseCatalogCache(): PurchaseCatalogItem[] | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) return null;
  return cached.items;
}

export function setPurchaseCatalogCache(items: PurchaseCatalogItem[]): void {
  cached = { at: Date.now(), items };
}

export function invalidatePurchaseCatalogCache(): void {
  cached = null;
}
