import { calcGoldSellDongFromHesoBoard } from "@/modules/inventory/priceLink";
import { withPerfSpan } from "@/shared/lib/perf-span";
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

type ProductRow = {
  image: string | null;
  category: string | null;
  product_type_id: string | null;
  price_numeric: number | string | null;
};
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
  suggestedBuyDongPerPiece: number;
  goldTypeHint: string | null;
  goldAgeHint: string | null;
  allowDirectBuy: boolean;
  manualSellDong: number | null;
};

export type PosCatalogPricingItem = PosCatalogItem & Pick<
  CatalogMeta,
  | "priceRowId"
  | "referenceSellDongPerChi"
  | "suggestedBuyDongPerChi"
  | "suggestedBuyDongPerPiece"
  | "goldTypeHint"
  | "goldAgeHint"
  | "allowDirectBuy"
  | "lastCostDong"
  | "manualSellDong"
  | "msp"
>;

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * MSP in tem: piece.msp ưu tiên, không thì unit.shared_product_code. Không tự sinh.
 * PERF-012: load full (small) piece/unit maps in parallel with catalog — same first-wins
 * semantics as the old `.in(sku_id, …)` path (order created_at desc).
 */
async function loadMspCatalogMap(): Promise<Map<string, string>> {
  return withPerfSpan("pos.mspMap", async () => {
    const out = new Map<string, string>();
    const supabase = await createServerSupabase();
    const [piecesRes, unitsRes] = await Promise.all([
      supabase
        .from("pos_label_pieces")
        .select("sku_id, msp, created_at")
        .not("msp", "is", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("pos_inventory_units")
        .select("sku_id, shared_product_code, created_at")
        .not("shared_product_code", "is", null)
        .order("created_at", { ascending: false }),
    ]);
    for (const row of piecesRes.data ?? []) {
      const id = String(row.sku_id ?? "");
      const msp = String(row.msp ?? "").trim();
      if (!id || !msp || out.has(id)) continue;
      out.set(id, msp);
    }
    for (const row of unitsRes.data ?? []) {
      const id = String(row.sku_id ?? "");
      const code = String(row.shared_product_code ?? "").trim();
      if (!id || !code || out.has(id)) continue;
      out.set(id, code);
    }
    return out;
  });
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
  return withPerfSpan("pos.catalogMeta", async () => {
  const includeMarketGold = options?.includeMarketGold === true;
  const supabase = await createServerSupabase();
  let request = supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, stone_weight_chi, stone_quantity, stone_unit_price_dong, stone_price_dong, brand_id, price_row_id, allow_direct_buy, is_active, is_market_gold, sell_pricing_mode, sell_pricing_hl, sell_pricing_multiplier, manual_sell_dong, receive_metal_kind, gold_price_rows!pos_skus_price_row_id_fkey(sell, buy, product, purity, brand), pos_inventory_stock(quantity, last_cost_dong), products!pos_skus_catalog_product_id_fkey(image, category, product_type_id, price_numeric), brands!pos_skus_brand_id_fkey(id, name)",
    )
    .order("name");
  request = includeMarketGold
    ? request.or("is_active.eq.true,is_market_gold.eq.true")
    : request.eq("is_active", true).eq("is_market_gold", false);
  // PERF-012: MSP map parallel with SKU query (no serial stage after catalog).
  const [{ data, error }, mspBySku] = await Promise.all([request, loadMspCatalogMap()]);
  if (error) throw new Error(error.message);

  const rows = data ?? [];

  return rows.map((row) => {
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
    // P9 bạc: ưu tiên pos_skus.manual_sell_dong; fallback products.price_numeric (catalog cũ).
    const skuManualRaw = Number(
      (row as { manual_sell_dong?: number | string | null }).manual_sell_dong,
    );
    const productManualRaw =
      product?.price_numeric != null && product.price_numeric !== ""
        ? Number(product.price_numeric)
        : null;
    const manualSellDong =
      Number.isFinite(skuManualRaw) && skuManualRaw > 0
        ? Math.round(skuManualRaw)
        : productManualRaw != null && Number.isFinite(productManualRaw) && productManualRaw > 0
          ? Math.round(productManualRaw)
          : null;
    const receiveMetalKind = String(
      (row as { receive_metal_kind?: string | null }).receive_metal_kind ?? "",
    )
      .trim()
      .toUpperCase();
    const isSilverReceive = receiveMetalKind === "SILVER";
    const referenceSellDongPerChi = sell > 0 ? Math.round(sell / perChiDivisor) : 0;
    // Purchase: board buy / chỉ; never use sell column.
    const suggestedBuyDongPerChi = buy > 0 ? Math.round(buy / perChiDivisor) : 0;
    const suggestedBuyDongPerPiece =
      lastCost != null && Number.isFinite(lastCost) && lastCost > 0 ? Math.round(lastCost) : 0;
    const laborFeeDong = Number(row.labor_fee_dong ?? 0);
    const stonePriceDong = Number((row as { stone_price_dong?: number | string | null }).stone_price_dong ?? 0);
    const stoneWeightChi = Number((row as { stone_weight_chi?: number | string | null }).stone_weight_chi ?? 0);
    const stoneQuantity = Number((row as { stone_quantity?: number | string | null }).stone_quantity ?? 0);
    const stoneUnitPriceDong = Number(
      (row as { stone_unit_price_dong?: number | string | null }).stone_unit_price_dong ?? 0,
    );
    // Market SKUs get their gold price from the group price row in listPosCatalog (P4 C5).
    // Null/LINK = AS-IS board×TL; HESO = (TL×HL×board_per_chi + labor)×heso − labor (cart still +labor+stone).
    // P9 bạc: không dùng board sell để tính giá bán.
    const sellPricingMode =
      String((row as { sell_pricing_mode?: string | null }).sell_pricing_mode ?? "")
        .trim()
        .toUpperCase() === "HESO"
        ? "HESO"
        : "LINK";
    const sellPricingHl = Number((row as { sell_pricing_hl?: number | string | null }).sell_pricing_hl);
    const sellPricingMultiplier = Number(
      (row as { sell_pricing_multiplier?: number | string | null }).sell_pricing_multiplier,
    );
    let goldUnitDong: number | null = null;
    const hasPriceRow = row.price_row_id != null && String(row.price_row_id).trim() !== "";
    // P9.4: vàng không link + manual_sell = cơ sở (ex-labor). Bạc all-in xử lý riêng bên dưới.
    const goldManualBase =
      !isMarketGold &&
      !isSilverReceive &&
      !hasPriceRow &&
      manualSellDong != null &&
      manualSellDong > 0
        ? manualSellDong
        : null;
    if (goldManualBase != null) {
      goldUnitDong = goldManualBase;
    } else if (!isMarketGold && !isSilverReceive && sell > 0) {
      if (
        sellPricingMode === "HESO" &&
        Number.isFinite(sellPricingHl) &&
        sellPricingHl > 0 &&
        sellPricingHl <= 1 &&
        Number.isFinite(sellPricingMultiplier) &&
        sellPricingMultiplier > 0
      ) {
        const hesoUnit = calcGoldSellDongFromHesoBoard(
          sell,
          perChiDivisor,
          Number(row.weight_chi ?? 0),
          sellPricingHl,
          laborFeeDong,
          sellPricingMultiplier,
        );
        goldUnitDong = hesoUnit == null ? null : hesoUnit - laborFeeDong;
      } else {
        goldUnitDong = Math.round(sell * (Number(row.weight_chi) / perChiDivisor));
      }
    }
    // Board/HESO hoặc P9.4 gold manual base → +labor+stone; bạc all-in = manual_sell nguyên.
    const unitPriceDong =
      goldUnitDong !== null
        ? goldUnitDong + laborFeeDong + stonePriceDong
        : !isMarketGold && isSilverReceive && manualSellDong != null
          ? manualSellDong
          : !isMarketGold && !isSilverReceive && manualSellDong != null && !hasPriceRow
            ? manualSellDong + laborFeeDong + stonePriceDong
            : null;
    const category = isMarketGold
      ? product?.category ?? "Vàng thị trường"
      : product?.category ?? "Khác";
    const msp = mspBySku.get(String(row.id)) ?? "";
    return {
      skuId: row.id,
      sku: row.sku,
      msp,
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
      manualSellDong,
      priceRowId: row.price_row_id != null ? String(row.price_row_id) : null,
      referenceSellDongPerChi:
        referenceSellDongPerChi > 0
          ? referenceSellDongPerChi
          : lastCost != null && lastCost > 0 && Number(row.weight_chi) > 0
            ? Math.round(lastCost / Number(row.weight_chi))
            : 0,
      suggestedBuyDongPerChi,
      suggestedBuyDongPerPiece,
      goldTypeHint: price?.product ? String(price.product) : null,
      goldAgeHint: price?.purity != null ? String(price.purity) : null,
      allowDirectBuy: Boolean(row.allow_direct_buy),
    };
  });
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
  return withPerfSpan("pos.marketClassPrices", async () => {
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
  });
}

export async function listPosCatalog(options?: {
  /** PERF-001: share one prices fetch with PosPage (Promise or resolved map). */
  marketPrices?: MarketGoldClassPrices | Promise<MarketGoldClassPrices>;
}): Promise<PosCatalogItem[]> {
  return withPerfSpan("pos.listPosCatalog", async () => {
  const [meta, marketStock, classPrices] = await Promise.all([
    fetchPosCatalogMeta({ includeMarketGold: true }),
    fetchMarketGoldStock(),
    options?.marketPrices !== undefined
      ? Promise.resolve(options.marketPrices)
      : listMarketGoldClassPrices(),
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
    const boardUnit =
      goldUnitDong === null ? null : goldUnitDong + laborFeeDong + stonePriceDong;
    // Prefer meta unitPrice (P9 bạc all-in / P9.4 vàng manual+labor) when board path empty.
    const unitPriceDong =
      boardUnit !== null
        ? boardUnit
        : item.isMarketGold
          ? null
          : item.unitPriceDong != null
            ? item.unitPriceDong
            : item.manualSellDong != null && item.manualSellDong > 0
              ? item.manualSellDong
              : null;
    return {
      skuId: item.skuId,
      sku: item.sku,
      msp: item.msp ?? "",
      name: item.name,
      weightChi: item.weightChi,
      unitPriceDong,
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
      lastCostDong: item.lastCostDong ?? null,
      manualSellDong: item.manualSellDong ?? null,
      ...marketFields(market),
    };
  });
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
