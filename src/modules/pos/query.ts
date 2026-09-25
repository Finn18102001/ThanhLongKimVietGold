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
 * Default: active non-market SKUs (purchase catalog cards).
 * POS passes includeMarketGold to also list vàng/bạc thị trường
 * (soft-inactive by design; priced from last_cost when no board row).
 * Website `products.is_active` still does not gate store selling.
 */
async function fetchPosCatalogMeta(options?: {
  includeMarketGold?: boolean;
}): Promise<CatalogMeta[]> {
  const includeMarketGold = options?.includeMarketGold === true;
  const supabase = await createServerSupabase();
  let request = supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, brand_id, price_row_id, allow_direct_buy, is_active, is_market_gold, gold_price_rows!pos_skus_price_row_id_fkey(sell, buy, product, purity, brand), pos_inventory_stock(quantity, last_cost_dong), products!pos_skus_catalog_product_id_fkey(image, category), brands!pos_skus_brand_id_fkey(id, name)",
    )
    .order("name");
  request = includeMarketGold
    ? request.or("is_active.eq.true,is_market_gold.eq.true")
    : request.eq("is_active", true).eq("is_market_gold", false);
  const { data, error } = await request;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows as PriceEmbed | PriceEmbed[] | null);
    const product = firstEmbed(row.products as ProductEmbed);
    const stock = firstEmbed(
      row.pos_inventory_stock as
        | { quantity: number | string | null; last_cost_dong?: number | string | null }
        | { quantity: number | string | null; last_cost_dong?: number | string | null }[]
        | null,
    );
    const brand = firstEmbed(
      (row as { brands?: { id: string; name: string } | { id: string; name: string }[] | null })
        .brands,
    );
    const isMarketGold = Boolean(row.is_market_gold);
    const sell = price?.sell == null ? 0 : Number(price.sell);
    const buy = price?.buy == null ? 0 : Number(price.buy);
    const boardUnitChi = Number(row.board_unit_chi);
    const perChiDivisor = boardUnitChi > 0 ? boardUnitChi : 1;
    const lastCost =
      stock?.last_cost_dong != null && stock.last_cost_dong !== ""
        ? Number(stock.last_cost_dong)
        : null;
    const referenceSellDongPerChi = sell > 0 ? Math.round(sell / perChiDivisor) : 0;
    // Purchase catalog price. Never fall back to the sell column.
    const suggestedBuyDongPerChi = buy > 0 ? Math.round(buy / perChiDivisor) : 0;
    const boardUnitPrice =
      sell && sell > 0
        ? Math.round(sell * (Number(row.weight_chi) / perChiDivisor)) +
          Number(row.labor_fee_dong)
        : null;
    // Market SKUs usually have no price_row — use last inbound cost as POS reference.
    const unitPriceDong =
      boardUnitPrice ??
      (isMarketGold && lastCost != null && lastCost > 0 ? Math.round(lastCost) : null);
    const category = isMarketGold
      ? product?.category ?? "Vàng thị trường"
      : product?.category ?? "Khác";
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      weightChi: Number(row.weight_chi ?? 0),
      unitPriceDong,
      imageUrl: product?.image || null,
      category,
      browseGroup: isMarketGold
        ? "Vàng thị trường"
        : browseGroupFromProduct(row.name, category),
      brandId: brand?.id ?? row.brand_id ?? null,
      brandName: brand?.name ?? price?.brand ?? null,
      quantity: Number(stock?.quantity ?? 0),
      isMarketGold,
      priceRowId: row.price_row_id != null ? String(row.price_row_id) : null,
      referenceSellDongPerChi:
        referenceSellDongPerChi > 0
          ? referenceSellDongPerChi
          : unitPriceDong != null && Number(row.weight_chi) > 0
            ? Math.round(unitPriceDong / Number(row.weight_chi))
            : 0,
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
  const meta = await fetchPosCatalogMeta({ includeMarketGold: true });
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
    isMarketGold: item.isMarketGold,
  }));
}

/**
 * Published catalog contract for consumers that also need board buy/sell metadata.
 * Purchase cards stay non-market (market gold uses the dedicated buy slip).
 */
export async function listPosCatalogWithPricing(): Promise<PosCatalogPricingItem[]> {
  return fetchPosCatalogMeta({ includeMarketGold: false });
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
