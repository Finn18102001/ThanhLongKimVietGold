"use server";

import { listPosCatalogWithPricing } from "@/modules/pos/query";
import { listMarketGoldRefs as listMarketGoldRefsAction } from "./actions";
import type { MarketGoldRef, PurchaseCatalogItem } from "./types";

/** RSC initial load: market gold reference prices (optional hints only). */
export async function listMarketGoldRefs(): Promise<MarketGoldRef[]> {
  return listMarketGoldRefsAction();
}

/**
 * Cross-module: use the POS module's published enriched catalog contract.
 * Metadata and stock are fetched in parallel without a second pos_skus round trip.
 */
export async function listPurchaseCatalog(): Promise<PurchaseCatalogItem[]> {
  const catalog = await listPosCatalogWithPricing();
  return catalog.map((item) => {
    return {
      skuId: item.skuId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceDong: item.unitPriceDong,
      imageUrl: item.imageUrl,
      browseGroup: item.browseGroup,
      category: item.category,
      brandName: item.brandName,
      weightChi: item.weightChi,
      referenceSellDongPerChi: item.referenceSellDongPerChi,
      suggestedBuyDongPerChi: item.suggestedBuyDongPerChi,
      priceRowId: item.priceRowId,
      goldTypeHint: item.goldTypeHint,
      goldAgeHint: item.goldAgeHint,
      allowDirectBuy: item.allowDirectBuy,
    };
  });
}
