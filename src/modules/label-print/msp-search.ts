"use server";

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
