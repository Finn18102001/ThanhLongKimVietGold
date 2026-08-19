import { createServerSupabase } from "@/shared/supabase/server";
import type { LedgerRow, StockRow } from "./types";

function unitPrice(
  sell: number | null,
  weightChi: number,
  boardUnitChi: number,
  labor: number,
): number | null {
  if (sell === null || sell <= 0 || boardUnitChi <= 0) return null;
  return Math.round(sell * (weightChi / boardUnitChi)) + labor;
}

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listStock(): Promise<StockRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, gold_price_rows!pos_skus_price_row_id_fkey(sell), pos_inventory_stock(quantity), products!pos_skus_catalog_product_id_fkey(image, category)",
    )
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows);
    const stock = firstEmbed(row.pos_inventory_stock);
    const product = firstEmbed(row.products as { image: string | null; category: string | null }[] | { image: string | null; category: string | null } | null);
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      quantity: Number(stock?.quantity ?? 0),
      weightChi: Number(row.weight_chi),
      unitPriceDong: unitPrice(
        price?.sell === undefined ? null : Number(price.sell),
        Number(row.weight_chi),
        Number(row.board_unit_chi),
        Number(row.labor_fee_dong),
      ),
      imageUrl: product?.image || null,
      category: product?.category ?? "Khác",
    };
  });
}

export async function listLedger(): Promise<LedgerRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_inventory_transactions")
    .select(
      "id, type, quantity, before_quantity, after_quantity, reason, created_at, actor_email, reference_type, reference_id, pos_skus(sku, name)",
    )
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const sku = Array.isArray(row.pos_skus) ? row.pos_skus[0] : row.pos_skus;
    return {
      id: row.id,
      sku: sku?.sku ?? "",
      name: sku?.name ?? "",
      type: row.type,
      quantity: Number(row.quantity),
      beforeQuantity: Number(row.before_quantity),
      afterQuantity: Number(row.after_quantity),
      reason: row.reason,
      createdAt: row.created_at,
      actorEmail: row.actor_email,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
    };
  });
}
