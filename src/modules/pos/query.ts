import { createServerSupabase } from "@/shared/supabase/server";
import { mapHeldOrderList } from "./heldOrderMap";
import {
  browseGroupFromProduct,
  MARKET_GOLD_CLASSES,
  MARKET_GOLD_GROUP,
  type HeldOrderListResult,
  type MarketGoldClass,
  type MarketGoldClassPrices,
  type PosBrandOption,
  type PosCatalogItem,
  type PosProductTypeOption,
} from "./types";

type ProductRow = { image: string | null; category: string | null; product_type_id: string | null };
type ProductEmbed = ProductRow | ProductRow[] | null;

type PriceEmbed = {
  sell: number | string | null;
  buy: number | string | null;
  product: string | null;
  purity: string | null;
  brand: string | null;
};

type CatalogMeta = PosCatalogItem & {
  lastCostDong: number | null;
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
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, stone_weight_chi, stone_quantity, stone_unit_price_dong, stone_price_dong, brand_id, price_row_id, allow_direct_buy, is_active, is_market_gold, gold_price_rows!pos_skus_price_row_id_fkey(sell, buy, product, purity, brand), pos_inventory_stock(quantity, last_cost_dong), products!pos_skus_catalog_product_id_fkey(image, category, product_type_id), brands!pos_skus_brand_id_fkey(id, name)",
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
    const laborFeeDong = Number(row.labor_fee_dong ?? 0);
    const stonePriceDong = Number((row as { stone_price_dong?: number | string | null }).stone_price_dong ?? 0);
    const stoneWeightChi = Number((row as { stone_weight_chi?: number | string | null }).stone_weight_chi ?? 0);
    const stoneQuantity = Number((row as { stone_quantity?: number | string | null }).stone_quantity ?? 0);
    const stoneUnitPriceDong = Number(
      (row as { stone_unit_price_dong?: number | string | null }).stone_unit_price_dong ?? 0,
    );
    // Market SKUs get their gold price from the group price row in listPosCatalog (P4 C5).
    const goldUnitDong =
      !isMarketGold && sell > 0 ? Math.round(sell * (Number(row.weight_chi) / perChiDivisor)) : null;
    const unitPriceDong = goldUnitDong === null ? null : goldUnitDong + laborFeeDong + stonePriceDong;
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
      browseGroup:
        isMarketGold || category.trim().toLowerCase() === MARKET_GOLD_GROUP.toLowerCase()
          ? MARKET_GOLD_GROUP
          : browseGroupFromProduct(row.name, category),
      brandId: brand?.id ?? row.brand_id ?? null,
      brandName: brand?.name ?? price?.brand ?? null,
      productTypeId: product?.product_type_id ?? null,
      quantity: Number(stock?.quantity ?? 0),
      isMarketGold,
      goldUnitDong,
      laborFeeDong,
      stoneWeightChi,
      stoneQuantity,
      stoneUnitPriceDong,
      stonePriceDong,
      lastCostDong: lastCost,
      priceRowId: row.price_row_id != null ? String(row.price_row_id) : null,
      referenceSellDongPerChi:
        referenceSellDongPerChi > 0
          ? referenceSellDongPerChi
          : lastCost != null && lastCost > 0 && Number(row.weight_chi) > 0
            ? Math.round(lastCost / Number(row.weight_chi))
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

/** Published contract: active product types (Loại sản phẩm) for catalog filters. */
export async function listPosProductTypes(): Promise<PosProductTypeOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("product_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
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

type MarketStockRow = {
  skuId: string;
  marketClass: MarketGoldClass;
  goldType: string | null;
  goldAge: string | null;
  boughtAt: string | null;
};

/** In-stock MG SKUs with their group; empty on failure (grid then shows empty groups). */
async function fetchMarketGoldStock(): Promise<Map<string, MarketStockRow>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_market_gold_stock");
  const map = new Map<string, MarketStockRow>();
  if (error || !Array.isArray(data)) return map;
  for (const raw of data as Array<Record<string, unknown>>) {
    const cls = String(raw.marketClass ?? "") as MarketGoldClass;
    if (!MARKET_GOLD_CLASSES.includes(cls)) continue;
    map.set(String(raw.skuId), {
      skuId: String(raw.skuId),
      marketClass: cls,
      goldType: raw.goldType == null ? null : String(raw.goldType),
      goldAge: raw.goldAge == null ? null : String(raw.goldAge),
      boughtAt: raw.boughtAt == null ? null : String(raw.boughtAt),
    });
  }
  return map;
}

/** Display-only price per chỉ for the market group cards (mua / bán tabs). */
export async function listMarketGoldClassPrices(): Promise<MarketGoldClassPrices> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_market_gold_class_prices");
  if (error || !data || typeof data !== "object") return {};
  const out: MarketGoldClassPrices = {};
  for (const [cls, raw] of Object.entries(data as Record<string, Record<string, unknown>>)) {
    if (!MARKET_GOLD_CLASSES.includes(cls as MarketGoldClass)) continue;
    out[cls as MarketGoldClass] = {
      priceRowId: String(raw.priceRowId ?? ""),
      buyDong: Number(raw.buyDong ?? 0),
      sellDong: Number(raw.sellDong ?? 0),
    };
  }
  return out;
}

export async function listPosCatalog(): Promise<PosCatalogItem[]> {
  const [meta, marketStock, classPrices] = await Promise.all([
    fetchPosCatalogMeta({ includeMarketGold: true }),
    fetchMarketGoldStock(),
    listMarketGoldClassPrices(),
  ]);
  return meta.map((item) => {
    const market = item.isMarketGold ? marketStock.get(item.skuId) : undefined;
    // MG: giá bán / chỉ của dòng giá nhóm × TL vàng. Không có giá bán → không bán được (C5).
    const classSell = market ? (classPrices[market.marketClass]?.sellDong ?? 0) : 0;
    const goldUnitDong = item.isMarketGold
      ? classSell > 0
        ? Math.round(classSell * item.weightChi)
        : null
      : (item.goldUnitDong ?? null);
    const laborFeeDong = item.laborFeeDong ?? 0;
    const stonePriceDong = item.stonePriceDong ?? 0;
    return {
      skuId: item.skuId,
      sku: item.sku,
      name: item.name,
      weightChi: item.weightChi,
      unitPriceDong: goldUnitDong === null ? null : goldUnitDong + laborFeeDong + stonePriceDong,
      goldUnitDong,
      laborFeeDong,
      stoneWeightChi: item.stoneWeightChi ?? 0,
      stoneQuantity: item.stoneQuantity ?? 0,
      stoneUnitPriceDong: item.stoneUnitPriceDong ?? 0,
      stonePriceDong,
      imageUrl: item.imageUrl,
      category: item.category,
      browseGroup: item.browseGroup,
      brandId: item.brandId,
      brandName: item.brandName,
      productTypeId: item.productTypeId ?? null,
      quantity: item.quantity,
      isMarketGold: item.isMarketGold,
      ...marketFields(market),
    };
  });
}

function marketFields(row: MarketStockRow | undefined): Partial<PosCatalogItem> {
  if (!row) return {};
  return {
    marketClass: row.marketClass,
    goldType: row.goldType,
    goldAge: row.goldAge,
    boughtAt: row.boughtAt,
  };
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
