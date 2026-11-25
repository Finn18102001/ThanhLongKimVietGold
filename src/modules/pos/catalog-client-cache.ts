import type { PosCatalogItem } from "./types";

/** In-tab client cache so soft-nav away/back does not wait on full catalog again. */
const TTL_MS = 3 * 60 * 1000;

let cached: { at: number; items: PosCatalogItem[] } | null = null;

export function peekPosCatalogCache(): PosCatalogItem[] | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) return null;
  return cached.items;
}

export function setPosCatalogCache(items: PosCatalogItem[]): void {
  cached = { at: Date.now(), items };
}

export function invalidatePosCatalogCache(): void {
  cached = null;
}
