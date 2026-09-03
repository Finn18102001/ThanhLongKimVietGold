"use server";

import { listPosCatalog } from "@/modules/pos/query";
import { createServerSupabase } from "@/shared/supabase/server";
import { listBuys as listBuysAction, listMarketGoldRefs as listMarketGoldRefsAction } from "./actions";
import type { BuyListRow, MarketGoldRef, PurchaseCatalogItem } from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** RSC initial load: recent buys. */
export async function listBuys(limit = 30): Promise<BuyListRow[]> {
  return listBuysAction({ limit, offset: 0 });
}

/** RSC initial load: market gold reference prices (optional hints only). */
export async function listMarketGoldRefs(): Promise<MarketGoldRef[]> {
  return listMarketGoldRefsAction();
}

/**
 * POS catalog merged with weight_chi + gold_price_rows sell/buy per chỉ.
 * Cross-module: reads published `listPosCatalog` then enriches from pos_skus.
 */
export async function listPurchaseCatalog(): Promise<PurchaseCatalogItem[]> {
  const catalog = await listPosCatalog();
  if (catalog.length === 0) return [];

  const supabase = await createServerSupabase();
  const skuIds = catalog.map((item) => item.skuId);
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, weight_chi, board_unit_chi, price_row_id, gold_price_rows!pos_skus_price_row_id_fkey(sell, buy, product, purity, brand), brands!pos_skus_brand_id_fkey(name)",
    )
    .in("id", skuIds);
  if (error) throw new Error(error.message);

  type PriceEmbed = {
    sell: number | string | null;
    buy: number | string | null;
    product: string | null;
    purity: string | null;
    brand: string | null;
  };

  const byId = new Map<
    string,
    {
      weightChi: number;
      priceRowId: string | null;
      /** Normalized VND per 1 chỉ (sell/board_unit). */
      sellPerChi: number;
      buyPerChi: number;
      goldTypeHint: string | null;
      goldAgeHint: string | null;
      brandName: string | null;
    }
  >();

  for (const row of data ?? []) {
    const price = firstEmbed(row.gold_price_rows as PriceEmbed | PriceEmbed[] | null);
    const brandEmbed = firstEmbed(
      (row as { brands?: { name: string } | { name: string }[] | null }).brands,
    );
    const sell = asNumber(price?.sell);
    const buy = asNumber(price?.buy);
    const boardUnit = asNumber(row.board_unit_chi);
    // gold_price_rows.sell/buy are priced per board_unit_chi (e.g. 0.1 chỉ → 1.45M).
    // SRS ±300k is per 1 chỉ — normalize.
    const perChiDivisor = boardUnit > 0 ? boardUnit : 1;
    const sellPerChi = sell > 0 ? Math.round(sell / perChiDivisor) : 0;
    const buyPerChi = buy > 0 ? Math.round(buy / perChiDivisor) : 0;
    byId.set(String(row.id), {
      weightChi: asNumber(row.weight_chi),
      priceRowId: row.price_row_id != null ? String(row.price_row_id) : null,
      sellPerChi,
      buyPerChi,
      goldTypeHint: price?.product ? String(price.product) : null,
      goldAgeHint: price?.purity != null ? String(price.purity) : null,
      brandName: brandEmbed?.name || (price?.brand ? String(price.brand) : null),
    });
  }

  return catalog.map((item) => {
    const enrich = byId.get(item.skuId);
    const sellPerChi = enrich?.sellPerChi ?? 0;
    const buyPerChi = enrich?.buyPerChi ?? 0;
    return {
      skuId: item.skuId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceDong: item.unitPriceDong,
      imageUrl: item.imageUrl,
      browseGroup: item.browseGroup,
      category: item.category,
      brandName: enrich?.brandName ?? null,
      weightChi: enrich?.weightChi ?? 0,
      referenceSellDongPerChi: sellPerChi,
      suggestedBuyDongPerChi: buyPerChi > 0 ? buyPerChi : sellPerChi,
      priceRowId: enrich?.priceRowId ?? null,
      goldTypeHint: enrich?.goldTypeHint ?? null,
      goldAgeHint: enrich?.goldAgeHint ?? null,
    };
  });
}
