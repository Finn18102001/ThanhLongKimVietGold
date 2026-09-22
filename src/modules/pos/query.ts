import { createServerSupabase } from "@/shared/supabase/server";
import { mapHeldOrderList } from "./heldOrderMap";
import { browseGroupFromProduct, type HeldOrderListResult, type PosBrandOption, type PosCatalogItem } from "./types";

type ProductEmbed =
  | { image: string | null; category: string | null }
  | { image: string | null; category: string | null }[]
  | null;

type PriceEmbed = {
  sell: number | string | null;
  buy: number | string | null;
  product: string | null;
  purity: string | null;
  brand: string | null;
};

type CatalogMeta = PosCatalogItem & {
  priceRowId: string | null;
  referenceSellDongPerChi: number;
  suggestedBuyDongPerChi: number;
  goldTypeHint: string | null;
  goldAgeHint: string | null;
  allowDirectBuy: boolean;
};

export type PosCatalogPricingItem = PosCatalogItem & Pick<
  CatalogMeta,
  | "priceRowId"
  | "referenceSellDongPerChi"
  | "suggestedBuyDongPerChi"
  | "goldTypeHint"
  | "goldAgeHint"
  | "allowDirectBuy"
>;

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Catalog metadata plus the initial authoritative stock snapshot.
 * Not using unstable_cache: createServerSupabase is cookie-bound.
 * Initial stock comes from the same authoritative table in this query.
 * Client refreshes only stock through the scoped RPC after mount.
 *
 * Active non-market SKUs only. Market gold/silver stays on the buy slip
 * (is_market_gold) and must not appear as POS/purchase product cards.
 * Website `products.is_active` still does not gate store selling.
 */
async function fetchPosCatalogMeta(): Promise<CatalogMeta[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, brand_id, price_row_id, allow_direct_buy, is_active, is_market_gold, gold_price_rows!pos_skus_price_row_id_fkey(sell, buy, product, purity, brand), pos_inventory_stock(quantity), products!pos_skus_catalog_product_id_fkey(image, category), brands!pos_skus_brand_id_fkey(id, name)",
    )
    .eq("is_active", true)
    .eq("is_market_gold", false)
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows as PriceEmbed | PriceEmbed[] | null);
    const product = firstEmbed(row.products as ProductEmbed);
    const stock = firstEmbed(
      row.pos_inventory_stock as
        | { quantity: number | string | null }
        | { quantity: number | string | null }[]
        | null,
    );
    const brand = firstEmbed(
      (row as { brands?: { id: string; name: string } | { id: string; name: string }[] | null })
        .brands,
    );
    const sell = price?.sell == null ? 0 : Number(price.sell);
    const buy = price?.buy == null ? 0 : Number(price.buy);
    const boardUnitChi = Number(row.board_unit_chi);
    const perChiDivisor = boardUnitChi > 0 ? boardUnitChi : 1;
    const referenceSellDongPerChi = sell > 0 ? Math.round(sell / perChiDivisor) : 0;
    // Purchase catalog price. Never fall back to the sell column.
    const suggestedBuyDongPerChi = buy > 0 ? Math.round(buy / perChiDivisor) : 0;
    const unitPriceDong =
      sell && sell > 0
        ? Math.round(sell * (Number(row.weight_chi) / perChiDivisor)) +
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
      brandId: brand?.id ?? row.brand_id ?? null,
      brandName: brand?.name ?? price?.brand ?? null,
      quantity: Number(stock?.quantity ?? 0),
      priceRowId: row.price_row_id != null ? String(row.price_row_id) : null,
      referenceSellDongPerChi,
      suggestedBuyDongPerChi,
      goldTypeHint: price?.product ? String(price.product) : null,
      goldAgeHint: price?.purity != null ? String(price.purity) : null,
      allowDirectBuy: Boolean(row.allow_direct_buy),
    };
  });
}

export async function listPosBrands(): Promise<PosBrandOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_brands");
  if (error) throw new Error(error.message);
  const rows = (data as Array<{ id: string; name: string; slug: string; isActive?: boolean }> | null) ?? [];
  return rows
    .filter((row) => row.isActive !== false)
    .map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
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
  const meta = await fetchPosCatalogMeta();
  return meta.map((item) => ({
    skuId: item.skuId,
    sku: item.sku,
    name: item.name,
    weightChi: item.weightChi,
    unitPriceDong: item.unitPriceDong,
    imageUrl: item.imageUrl,
    category: item.category,
    browseGroup: item.browseGroup,
    brandId: item.brandId,
    brandName: item.brandName,
    quantity: item.quantity,
  }));
}

/** Published catalog contract for consumers that also need board buy/sell metadata. */
export async function listPosCatalogWithPricing(): Promise<PosCatalogPricingItem[]> {
  return fetchPosCatalogMeta();
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
