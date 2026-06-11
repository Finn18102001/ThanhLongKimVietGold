/**
 * TLKV Product Price Engine — derived pricing from gold_price_rows (single source of truth).
 *
 * - No DB writes, no duplicated price storage on products.
 * - O(1) lookup via Map keyed by gold row `product` (= products.price_source_product).
 * - Integer VND math (weight scaled to tenths) to avoid float drift.
 */
(function (global) {
  "use strict";

  var DEFAULT_PRICE_SIDE = "sell";

  function readPriceSide() {
    var s = global.TLKV_PRODUCT_DERIVED_PRICE_SIDE;
    if (s === "buy" || s === "sell") return s;
    return DEFAULT_PRICE_SIDE;
  }

  function parseMoney(value) {
    if (global.TLKVGold && typeof global.TLKVGold.parseGoldMoneyToInt === "function") {
      return global.TLKVGold.parseGoldMoneyToInt(value);
    }
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    var digits = String(value).replace(/[^\d]/g, "");
    if (!digits) return null;
    var n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeProductKey(productLabel) {
    var s = String(productLabel || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!s || /^empty$/i.test(s)) return null;
    return s;
  }

  /** Một dòng gold_price_rows — giá đồng/chỉ; SP nhân theo weight. */
  var KIM_GIA_BAO_GOLD_ROW_KEY = "Kim Gia Bảo";
  var NHAN_TRON_KIM_VIET_GOLD_ROW_KEY = "Nhẫn Tròn Kim Việt";

  function isKimGiaBaoFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    if (/^Kim Gia Bảo\b/i.test(key)) return true;
    if (/b[oô]ng\s*sen\s*v[aà]ng/i.test(key)) return true;
    return false;
  }

  /** Nhẫn Tròn Kim Việt, Nhẫn Tròn Kim Việt 1, … 0.5, 2, 3, 5, 10 → cùng dòng giá/chỉ. */
  function isNhanTronKimVietFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    return /^Nhẫn Tròn Kim Việt\b/i.test(key);
  }

  function resolveGoldRowLookupKeyFromLabel(label, index) {
    var key = normalizeProductKey(label);
    if (!key) return null;
    if (index && index.has && index.has(key)) return key;
    if (isKimGiaBaoFamilyLabel(key)) return KIM_GIA_BAO_GOLD_ROW_KEY;
    if (isNhanTronKimVietFamilyLabel(key)) return NHAN_TRON_KIM_VIET_GOLD_ROW_KEY;
    return key;
  }

  /**
   * price_source_product (hoặc tên SP) → gold_price_rows.product.
   * - Kim Gia Bảo* / Bông Sen Vàng → một dòng Kim Gia Bảo.
   * - Nhẫn Tròn Kim Việt* → một dòng Nhẫn Tròn Kim Việt (giá/chỉ × weight).
   * - Khớp nguyên văn trước nếu đã có dòng riêng trên bảng giá.
   */
  function resolveGoldRowLookupKey(priceSourceProduct, productName, index) {
    var fromSource = resolveGoldRowLookupKeyFromLabel(priceSourceProduct, index);
    if (fromSource) return fromSource;
    return resolveGoldRowLookupKeyFromLabel(productName, index);
  }

  function resolvePricingWeight(product) {
    var weight = product && product.weight != null ? Number(product.weight) : null;
    if (weight != null && Number.isFinite(weight) && weight > 0) return weight;
    var name = String((product && product.name) || "");
    if (/b[oô]ng\s*sen\s*v[aà]ng/i.test(name)) return 1;
    var match = name.match(/(\d+(?:[.,]\d+)?)\s*ch[ỉi]/i);
    if (match) {
      var parsed = parseFloat(String(match[1]).replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function resolveBasePricePerChi(entry, side) {
    if (!entry) return null;
    var primary = side === "buy" ? entry.buyNum : entry.sellNum;
    var alternate = side === "buy" ? entry.sellNum : entry.buyNum;
    if (primary != null && Number.isFinite(primary) && primary > 0) return primary;
    if (alternate != null && Number.isFinite(alternate) && alternate > 0) return alternate;
    if (primary != null && Number.isFinite(primary)) return primary;
    return alternate != null && Number.isFinite(alternate) ? alternate : null;
  }

  /** SP có khối lượng + khớp được dòng gold_price_rows (trực tiếp hoặc qua alias). */
  function isPriceMappable(product, index) {
    var lookupKey = resolveGoldRowLookupKey(
      product && product.priceSourceProduct,
      product && product.name,
      index
    );
    var weight = resolvePricingWeight(product);
    return !!(lookupKey && weight != null);
  }

  /**
   * @param {Array<{ product?: string, buy?: string, sell?: string, buyNum?: number|null, sellNum?: number|null }>} rows
   * @returns {Map<string, { product: string, buyNum: number|null, sellNum: number|null }>}
   */
  function buildGoldPriceIndex(rows) {
    var index = new Map();
    (rows || []).forEach(function (row) {
      if (!row) return;
      var key = normalizeProductKey(row.product);
      if (!key) return;
      var buyNum = row.buyNum != null ? row.buyNum : parseMoney(row.buy);
      var sellNum = row.sellNum != null ? row.sellNum : parseMoney(row.sell);
      index.set(key, {
        product: key,
        buyNum: buyNum,
        sellNum: sellNum,
      });
    });
    return index;
  }

  /**
   * Integer-safe: pricePerChi (VND integer) × weight numeric(5,1).
   * weight 0.5 → tenths=5 → (price * 5) / 10
   */
  function multiplyVndByWeight(pricePerChiVnd, weight) {
    if (pricePerChiVnd == null || !Number.isFinite(pricePerChiVnd) || pricePerChiVnd < 0) return null;
    var w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return null;
    var weightTenths = Math.round(w * 10);
    if (weightTenths <= 0) return null;
    return Math.round((pricePerChiVnd * weightTenths) / 10);
  }

  function formatVndInteger(amountVnd) {
    if (amountVnd == null || !Number.isFinite(amountVnd)) return "";
    if (global.TLKVGold && typeof global.TLKVGold.formatPriceDisplay === "function") {
      return global.TLKVGold.formatPriceDisplay(amountVnd, "gold", "buy");
    }
    var abs = Math.abs(Math.round(amountVnd));
    return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /**
   * @param {{ priceSourceProduct?: string|null, weight?: number|null, priceText?: string }} product
   * @param {Map<string, { buyNum: number|null, sellNum: number|null }>} index
   * @param {{ side?: 'buy'|'sell' }} [opts]
   * @returns {{ amountVnd: number|null, priceText: string, isDerived: boolean }}
   */
  function deriveProductPrice(product, index, opts) {
    opts = opts || {};
    var side = opts.side === "buy" || opts.side === "sell" ? opts.side : readPriceSide();

    if (!isPriceMappable(product, index)) {
      return { amountVnd: null, priceText: "", isDerived: false, showPrice: false };
    }

    var source = resolveGoldRowLookupKey(product.priceSourceProduct, product.name, index);
    var weight = resolvePricingWeight(product);
    var entry = index && index.get ? index.get(source) : null;

    if (!entry) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[TLKV price] Không khớp gold_price_rows.product:",
          source,
          "(price_source_product:",
          normalizeProductKey(product.priceSourceProduct) + ")",
          "— kiểm tra alias hoặc tên dòng giá trên bảng giá."
        );
      }
      return { amountVnd: null, priceText: "", isDerived: true, showPrice: false };
    }

    var basePerChi = resolveBasePricePerChi(entry, side);
    var amountVnd = multiplyVndByWeight(basePerChi, weight);
    if (amountVnd == null) {
      return { amountVnd: null, priceText: "", isDerived: true, showPrice: false };
    }

    return {
      amountVnd: amountVnd,
      priceText: formatVndInteger(amountVnd),
      isDerived: true,
      showPrice: true,
    };
  }

  /**
   * Mutates products in-place: sets priceText + priceNumeric + isPriceDerived.
   * @param {object[]} products
   */
  function applyDerivedPrices(products, index, opts) {
    (products || []).forEach(function (p) {
      if (!p) return;
      p.isPriceMappable = isPriceMappable(p, index);
      if (!p.isPriceMappable) {
        p.isPriceDerived = false;
        p.showPrice = false;
        p.priceNumeric = null;
        p.priceText = "";
        return;
      }
      var derived = deriveProductPrice(p, index, opts);
      p.isPriceDerived = derived.isDerived;
      p.showPrice = derived.showPrice === true;
      p.priceNumeric = derived.amountVnd;
      p.priceText = derived.showPrice ? derived.priceText : "";
    });
    return products;
  }

  /**
   * Apply derived prices to featured brand rows structure.
   */
  function applyDerivedPricesToBrandRows(brandRows, index, opts) {
    (brandRows || []).forEach(function (brand) {
      applyDerivedPrices(brand && brand.featured_products, index, opts);
    });
    return brandRows;
  }

  global.TLKVProductPriceEngine = {
    buildGoldPriceIndex: buildGoldPriceIndex,
    multiplyVndByWeight: multiplyVndByWeight,
    formatVndInteger: formatVndInteger,
    isPriceMappable: isPriceMappable,
    deriveProductPrice: deriveProductPrice,
    applyDerivedPrices: applyDerivedPrices,
    applyDerivedPricesToBrandRows: applyDerivedPricesToBrandRows,
    normalizeProductKey: normalizeProductKey,
    resolveGoldRowLookupKey: resolveGoldRowLookupKey,
    resolvePricingWeight: resolvePricingWeight,
    isKimGiaBaoFamilyLabel: isKimGiaBaoFamilyLabel,
    isNhanTronKimVietFamilyLabel: isNhanTronKimVietFamilyLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
