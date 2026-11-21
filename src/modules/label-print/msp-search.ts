"use server";

import { normalizeLabelCode } from "@/shared/lib/label-code";
import { createServerSupabase } from "@/shared/supabase/server";

/**
 * Published contract: resolve SKU ids that have a real MSP/piece or unit shared-code link.
 * Callers must OR this into existing filters — never invent MSP for unlinked history.
 */
export async function findSkuIdsByMspQuery(query: string): Promise<string[]> {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_find_sku_ids_by_msp", {
    p_query: q,
    p_limit: 100,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map((id) => String(id)) : [];
}

export type LabelCodeResolveResult =
  | { status: "ok"; skuId: string }
  | { status: "empty" }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number };

/**
 * Scan-to-cart contract: map MSP / barcode / shared code → exactly one SKU.
 * Prefers exact (hyphen-insensitive) piece.msp / barcode / shared_product_code when LIKE returns many.
 */
export async function resolveUniqueSkuIdByLabelCode(
  query: string,
): Promise<LabelCodeResolveResult> {
  const q = String(query || "").trim();
  if (q.length < 2) return { status: "empty" };

  const supabase = await createServerSupabase();
  const flat = normalizeLabelCode(q);

  const { data: exactRows, error: exactError } = await supabase.rpc(
    "pos_find_sku_ids_by_msp",
    { p_query: q, p_limit: 100 },
  );
  if (exactError) throw new Error(exactError.message);

  const ids = Array.isArray(exactRows) ? exactRows.map((id) => String(id)) : [];
  if (ids.length === 0) return { status: "not_found" };
  if (ids.length === 1) return { status: "ok", skuId: ids[0] };

  // Disambiguate: load piece/unit codes for candidate SKUs and keep exact matches only.
  const { data: pieces, error: pieceError } = await supabase
    .from("pos_label_pieces")
    .select("sku_id, msp, barcode")
    .in("sku_id", ids);
  if (pieceError) throw new Error(pieceError.message);

  const exactSku = new Set<string>();
  for (const row of pieces ?? []) {
    const skuId = String(row.sku_id ?? "");
    if (!skuId) continue;
    const msp = normalizeLabelCode(String(row.msp ?? ""));
    const barcode = normalizeLabelCode(String(row.barcode ?? ""));
    if (msp === flat || barcode === flat) exactSku.add(skuId);
  }

  if (exactSku.size === 0) {
    const { data: units, error: unitError } = await supabase
      .from("pos_inventory_units")
      .select("sku_id, shared_product_code")
      .in("sku_id", ids)
      .not("shared_product_code", "is", null);
    if (unitError) throw new Error(unitError.message);
    for (const row of units ?? []) {
      const skuId = String(row.sku_id ?? "");
      const code = normalizeLabelCode(String(row.shared_product_code ?? ""));
      if (skuId && code === flat) exactSku.add(skuId);
    }
  }

  if (exactSku.size === 1) return { status: "ok", skuId: [...exactSku][0] };
  if (exactSku.size > 1) return { status: "ambiguous", count: exactSku.size };
  return { status: "ambiguous", count: ids.length };
}
