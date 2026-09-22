import { createServerSupabase } from "@/shared/supabase/server";
import type { CategoryOption, LedgerRow, PriceRowOption, StockRow } from "./types";

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

/**
 * Stock rows for warehouse screens.
 * `includeMarketGold` is only for Kho hàng → Tồn kho. Market SKUs and
 * not-yet-active Order jewelry stay off receive / adjust / order pickers
 * and off Mua/Bán product cards.
 */
export async function listStock(options?: { includeMarketGold?: boolean }): Promise<StockRow[]> {
  const supabase = await createServerSupabase();
  let request = supabase
    .from("pos_skus")
    .select(
      "id, sku, name, brand_id, weight_chi, board_unit_chi, labor_fee_dong, is_market_gold, gold_price_rows!pos_skus_price_row_id_fkey(sell), pos_inventory_stock(quantity, last_cost_dong), products!pos_skus_catalog_product_id_fkey(image, category), brands!pos_skus_brand_id_fkey(name)",
    )
    .order("name");
  request = options?.includeMarketGold
    ? request.or("is_active.eq.true,is_market_gold.eq.true,is_order_jewelry.eq.true")
    : request.eq("is_active", true);
  const { data, error } = await request;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows);
    const stock = firstEmbed(row.pos_inventory_stock);
    const product = firstEmbed(row.products as { image: string | null; category: string | null }[] | { image: string | null; category: string | null } | null);
    const brand = firstEmbed(
      (row as { brands?: { name: string } | { name: string }[] | null }).brands,
    );
    const isMarketGold = Boolean((row as { is_market_gold?: boolean }).is_market_gold);
    const lastCost =
      stock && "last_cost_dong" in stock && stock.last_cost_dong != null
        ? Number(stock.last_cost_dong)
        : null;
    const boardPrice = unitPrice(
      price?.sell === undefined ? null : Number(price.sell),
      Number(row.weight_chi),
      Number(row.board_unit_chi),
      Number(row.labor_fee_dong),
    );
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      quantity: Number(stock?.quantity ?? 0),
      weightChi: Number(row.weight_chi),
      unitPriceDong: isMarketGold ? lastCost : boardPrice,
      lastCostDong: lastCost,
      imageUrl: product?.image || null,
      category: product?.category ?? "Khác",
      brandId: (row as { brand_id?: string | null }).brand_id ?? null,
      brandName: brand?.name ?? null,
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
      costPriceDong: null,
      brandName: null,
      customerName: null,
      customerPhone: null,
      customerCitizenId: null,
    };
  });
}

export async function listCategories(): Promise<CategoryOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
}

export async function listPriceRows(): Promise<PriceRowOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("gold_price_rows")
    .select("id, product, brand, purity")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    product: String(row.product ?? ""),
    brand: String(row.brand ?? ""),
    purity: String(row.purity ?? ""),
  }));
}
