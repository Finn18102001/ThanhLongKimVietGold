/**
 * Display-only catalog ordering: gold groups/products first, then others.
 * Does not change filters, prices, stock, or search matching.
 */

export function isGoldBrowseGroup(group: string): boolean {
  const n = group.trim().toLowerCase();
  if (!n || n === "tất cả" || n === "khác") return false;
  if (n.includes("bạc")) return false;
  if (n.includes("vàng")) return true;
  // Named jewelry groups in TLKV catalog (Nhẫn, Bông lúa, …) are gold SKUs.
  return true;
}

export function isGoldCatalogItem(item: {
  name: string;
  category: string;
  browseGroup: string;
}): boolean {
  const name = item.name.toLowerCase();
  const category = (item.category || "").toLowerCase();
  if (category.includes("bạc") || name.includes("bạc")) return false;
  if (category.includes("vàng") || name.includes("vàng")) return true;
  if (category && category !== "khác" && !category.includes("bạc")) return true;
  return isGoldBrowseGroup(item.browseGroup);
}

/** Stable partition: gold first, preserve relative order within each bucket. */
export function prioritizeGoldFirst<T>(items: readonly T[], isGold: (item: T) => boolean): T[] {
  const gold: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    (isGold(item) ? gold : other).push(item);
  }
  return gold.concat(other);
}

/** Keep "Tất cả" first; gold groups next; others last. Relative order preserved. */
export function prioritizeGoldGroupLabels(groups: readonly string[]): string[] {
  const head: string[] = [];
  const rest: string[] = [];
  for (const g of groups) {
    if (g === "Tất cả") head.push(g);
    else rest.push(g);
  }
  return head.concat(prioritizeGoldFirst(rest, isGoldBrowseGroup));
}
