import { createServerSupabase } from "@/shared/supabase/server";
import { mapHeldOrderList } from "./heldOrderMap";
import { browseGroupFromProduct, type HeldOrderListResult, type PosCatalogItem } from "./types";

type ProductEmbed =
  | { image: string | null; category: string | null }
  | { image: string | null; category: string | null }[]
  | null;

type CatalogMeta = Omit<PosCatalogItem, "quantity">;

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Catalog meta (image, sku, name, price) — no stock.
 * Not using unstable_cache: createServerSupabase is cookie-bound.
 * Client keeps meta in memory; only stock is refreshed on tab focus.
 *
 * POS lists every SKU in DB. Website "Hiển thị" (`products.is_active`) must not
 * hide items here — store can sell catalog-hidden products.
 */
async function fetchPosCatalogMeta(): Promise<CatalogMeta[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, gold_price_rows!pos_skus_price_row_id_fkey(sell), products!pos_skus_catalog_product_id_fkey(image, category)",
    )
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows);
    const product = firstEmbed(row.products as ProductEmbed);
    const sell = price?.sell === undefined ? null : Number(price.sell);
    const unitPriceDong =
      sell && sell > 0
        ? Math.round(sell * (Number(row.weight_chi) / Number(row.board_unit_chi))) +
          Number(row.labor_fee_dong)
        : null;
    const category = product?.category ?? "Khác";
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      weightChi: Number(row.weight_chi ?? 0),
      unitPriceDong,
      imageUrl: product?.image || null,
      category,
      browseGroup: browseGroupFromProduct(row.name, category),
    };
  });
}

async function fetchPosStockMap(skuIds?: string[]): Promise<Record<string, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_sku_stock", {
    p_sku_ids: skuIds?.length ? skuIds : null,
  });
  if (error) {
    let builder = supabase.from("pos_inventory_stock").select("sku_id, quantity");
    if (skuIds?.length) builder = builder.in("sku_id", skuIds);
    const { data: rows, error: stockError } = await builder;
    if (stockError) throw new Error(error.message);
    const map: Record<string, number> = {};
    for (const row of rows ?? []) {
      map[row.sku_id] = Number(row.quantity ?? 0);
    }
    return map;
  }
  const items = (
    data as { items?: Array<{ sku_id: string; quantity: number | string }> } | null
  )?.items;
  const map: Record<string, number> = {};
  for (const row of items ?? []) {
    map[row.sku_id] = Number(row.quantity ?? 0);
  }
  return map;
}

export async function listPosCatalog(): Promise<PosCatalogItem[]> {
  const [meta, stock] = await Promise.all([fetchPosCatalogMeta(), fetchPosStockMap()]);
  return meta.map((item) => ({
    ...item,
    quantity: stock[item.skuId] ?? 0,
  }));
}

export async function listPosStockOnly(skuIds?: string[]): Promise<Record<string, number>> {
  return fetchPosStockMap(skuIds);
}

export async function listHeldOrders(): Promise<HeldOrderListResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_held_orders");
  if (error) throw new Error(error.message);
  return mapHeldOrderList(data);
}

export async function listPosOperators(): Promise<import("./types").PosOperatorOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_sale_operators");
  if (error) throw new Error(error.message);
  const items = (
    data as { items?: Array<{ id: string; staff_no: string; full_name: string }> } | null
  )?.items;
  return (items ?? []).map((row) => ({
    id: row.id,
    staffNo: row.staff_no,
    fullName: row.full_name,
  }));
}
