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

  /** Một dòng gold_price_rows — giá đồng/chỉ hoặc giá cố định theo lượng ghi trên dòng (VD: 0.1 chỉ). */
  var KIM_GIA_BAO_GOLD_ROW_KEY = "Kim Gia Bảo";
  var NHAN_TRON_KIM_VIET_GOLD_ROW_KEY = "Nhẫn Tròn Kim Việt";
  var BONG_LUA_VANG_GOLD_ROW_KEY = "Bông Lúa Vàng 0.1 chỉ";
  var HAT_GAO_VANG_GOLD_ROW_KEY = "Hạt Gạo Vàng 0.1 chỉ";
  var VANG_RONG_SMALL_GOLD_ROW_KEY = "Vàng Rồng Thăng Long 0.5, 1, 2, 3 chỉ";
  var VANG_RONG_LARGE_GOLD_ROW_KEY = "Vàng Rồng Thăng Long 5, 10 chỉ";

  function isKimGiaBaoFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    if (/^Kim Gia Bảo\b/i.test(key)) return true;
    if (/b[oô]ng\s*sen\s*v[aà]ng/i.test(key)) return true;
    return false;
  }

  /** Bông Lúa Vàng* → dòng giá cố định 0.1 chỉ trên bảng giá (không dùng Vàng Rồng / giá/chỉ cũ). */
  function isBongLuaVangFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    return /^Bông Lúa Vàng\b/i.test(key);
  }

  /** Hạt Gạo Vàng* → dòng giá cố định 0.1 chỉ. */
  function isHatGaoVangFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    return /^Hạt Gạo Vàng\b/i.test(key);
  }

  /** Nhẫn Tròn Kim Việt, Nhẫn Tròn Kim Việt 1, … 0.1–10 chỉ → cùng dòng giá/chỉ. */
  function isNhanTronKimVietFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    return /^Nhẫn Tròn Kim Việt\b/i.test(key);
  }

  /** Vàng Rồng Thăng Long — nhóm 0.5–3 chỉ hoặc 5–10 chỉ tùy weight. */
  function isVangRongThangLongFamilyLabel(label) {
    var key = normalizeProductKey(label);
    if (!key) return false;
    return /v[àa]ng\s*r[ồo]ng\s*th[ăa]ng\s*long/i.test(key);
  }

  function resolveVangRongGoldRowKey(weight) {
    var w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return VANG_RONG_SMALL_GOLD_ROW_KEY;
    return w >= 5 ? VANG_RONG_LARGE_GOLD_ROW_KEY : VANG_RONG_SMALL_GOLD_ROW_KEY;
  }

  function resolveGoldRowLookupKeyFromLabel(label, index) {
    var key = normalizeProductKey(label);
    if (!key) return null;
    if (index && index.has && index.has(key)) return key;
    if (isBongLuaVangFamilyLabel(key)) {
      if (index && index.has && index.has(BONG_LUA_VANG_GOLD_ROW_KEY)) {
        return BONG_LUA_VANG_GOLD_ROW_KEY;
      }
      return BONG_LUA_VANG_GOLD_ROW_KEY;
    }
    if (isHatGaoVangFamilyLabel(key)) {
      if (index && index.has && index.has(HAT_GAO_VANG_GOLD_ROW_KEY)) {
        return HAT_GAO_VANG_GOLD_ROW_KEY;
      }
      return HAT_GAO_VANG_GOLD_ROW_KEY;
    }
    if (isKimGiaBaoFamilyLabel(key)) return KIM_GIA_BAO_GOLD_ROW_KEY;
    if (isNhanTronKimVietFamilyLabel(key)) return NHAN_TRON_KIM_VIET_GOLD_ROW_KEY;
    if (isVangRongThangLongFamilyLabel(key)) {
      if (index && index.has && index.has(VANG_RONG_SMALL_GOLD_ROW_KEY)) {
        return VANG_RONG_SMALL_GOLD_ROW_KEY;
      }
      if (index && index.has && index.has(VANG_RONG_LARGE_GOLD_ROW_KEY)) {
        return VANG_RONG_LARGE_GOLD_ROW_KEY;
      }
      return VANG_RONG_SMALL_GOLD_ROW_KEY;
    }
    return key;
  }

  /**
   * price_source_product (hoặc tên SP) → gold_price_rows.product.
   * - Kim Gia Bảo* / Bông Sen Vàng → một dòng Kim Gia Bảo.
   * - Bông Lúa Vàng* → dòng "Bông Lúa Vàng 0.1 chỉ" (giá mệnh giá 0.1 chỉ × tỉ lệ lượng).
   * - Hạt Gạo Vàng* → dòng "Hạt Gạo Vàng 0.1 chỉ".
   * - Nhẫn Tròn Kim Việt* → một dòng Nhẫn Tròn Kim Việt (giá/chỉ × weight).
   * - Khớp nguyên văn trước nếu đã có dòng riêng trên bảng giá.
   */
  function resolveGoldRowLookupKey(priceSourceProduct, productName, index, weight) {
    var fromSource = resolveGoldRowLookupKeyFromLabel(priceSourceProduct, index);
    if (fromSource) {
      if (isVangRongThangLongFamilyLabel(fromSource)) {
        return resolveVangRongGoldRowKey(weight);
      }
      return fromSource;
    }
    var fromName = resolveGoldRowLookupKeyFromLabel(productName, index);
    if (fromName && isVangRongThangLongFamilyLabel(fromName)) {
      return resolveVangRongGoldRowKey(weight);
    }
    return fromName;
  }

  /**
   * Suy ra price_source_product khi admin thêm SP (weight + tên dòng giá).
   * SP < 1 chỉ (0.1, 0.2…) — Bông Lúa/Hạt Gạo dùng giá mệnh giá 0.1 chỉ; còn lại giá/chỉ × weight.
   */
  function inferPriceSourceProduct(name, weight) {
    var label = normalizeProductKey(name);
    if (!label) return null;
    var w = weight != null ? Number(weight) : null;
    if (w != null && (!Number.isFinite(w) || w <= 0)) w = null;

    if (isBongLuaVangFamilyLabel(label)) return BONG_LUA_VANG_GOLD_ROW_KEY;
    if (isHatGaoVangFamilyLabel(label)) return HAT_GAO_VANG_GOLD_ROW_KEY;
    if (isNhanTronKimVietFamilyLabel(label)) return NHAN_TRON_KIM_VIET_GOLD_ROW_KEY;
    if (isKimGiaBaoFamilyLabel(label)) return KIM_GIA_BAO_GOLD_ROW_KEY;
    if (isVangRongThangLongFamilyLabel(label)) return resolveVangRongGoldRowKey(w);
    return null;
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

  /**
   * So sánh 2 SP theo lượng chỉ tăng dần (chỉ nhỏ hiển thị trước).
   * SP không có lượng → xếp cuối. Trả về 0 khi bằng nhau để giữ nguyên thứ tự
   * trước đó (Array.prototype.sort ổn định) → reload không đảo lộn.
   */
  function compareBySmallestWeight(a, b) {
    var wa = resolvePricingWeight(a);
    var wb = resolvePricingWeight(b);
    if (wa == null && wb == null) return 0;
    if (wa == null) return 1;
    if (wb == null) return -1;
    if (wa === wb) return 0;
    return wa - wb;
  }

  /** Sắp xếp in-place theo lượng chỉ nhỏ trước (giữ ổn định cho phần bằng nhau). */
  function sortBySmallestWeight(products) {
    if (!Array.isArray(products)) return products;
    return products.sort(compareBySmallestWeight);
  }

  /**
   * Lượng vàng mà giá trên bảng đang áp dụng (mặc định 1 chỉ = giá/chỉ).
   * Chỉ dùng mệnh giá cố định (< 1 chỉ) cho dòng SP đơn lẻ (Bông Lúa 0.1 chỉ).
   * Dòng Vàng Rồng "0.5, 1, 2, 3 chỉ" / "5, 10 chỉ" vẫn là giá/chỉ — không parse số cuối tên.
   */
  function resolveReferenceWeightForGoldRow(sourceKey) {
    var key = normalizeProductKey(sourceKey);
    if (!key) return 1;
    if (key === BONG_LUA_VANG_GOLD_ROW_KEY || key === HAT_GAO_VANG_GOLD_ROW_KEY) {
      return 0.1;
    }
    if (isVangRongThangLongFamilyLabel(key)) return 1;
    if (/,/.test(key)) return 1;
    var match = key.match(/(\d+(?:[.,]\d+)?)\s*ch[ỉi]\s*$/i);
    if (match) {
      var parsed = parseFloat(String(match[1]).replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) return parsed;
    }
    return 1;
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
    var weight = resolvePricingWeight(product);
    var lookupKey = resolveGoldRowLookupKey(
      product && product.priceSourceProduct,
      product && product.name,
      index,
      weight
    );
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
   * Integer-safe: basePrice (cho referenceWeight) × (productWeight / referenceWeight).
   * referenceWeight=1 → giá/chỉ × weight; referenceWeight=0.1 → giá món 0.1 chỉ × (weight/0.1).
   */
  function multiplyVndByReferenceWeight(basePriceVnd, productWeight, referenceWeight) {
    if (basePriceVnd == null || !Number.isFinite(basePriceVnd) || basePriceVnd < 0) return null;
    var w = Number(productWeight);
    var ref = Number(referenceWeight);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (!Number.isFinite(ref) || ref <= 0) return null;
    var weightTenths = Math.round(w * 10);
    var refTenths = Math.round(ref * 10);
    if (weightTenths <= 0 || refTenths <= 0) return null;
    return Math.round((basePriceVnd * weightTenths) / refTenths);
  }

  /**
   * Integer-safe: pricePerChi (VND integer) × weight numeric(5,1).
   * weight 0.5 → tenths=5 → (price * 5) / 10
   */
  function multiplyVndByWeight(pricePerChiVnd, weight) {
    return multiplyVndByReferenceWeight(pricePerChiVnd, weight, 1);
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

    var weight = resolvePricingWeight(product);
    var source = resolveGoldRowLookupKey(product.priceSourceProduct, product.name, index, weight);
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

    var basePrice = resolveBasePricePerChi(entry, side);
    var refWeight = resolveReferenceWeightForGoldRow(source);
    var amountVnd = multiplyVndByReferenceWeight(basePrice, weight, refWeight);
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

  async function resolveGoldRowsForPricing() {
    if (global.TLKVGold && typeof global.TLKVGold.getLastGoldRows === "function") {
      var cached = global.TLKVGold.getLastGoldRows();
      if (cached && cached.length) return cached;
    }
    if (global.TLKVGold && typeof global.TLKVGold.getGoldTable === "function") {
      var data = await global.TLKVGold.getGoldTable();
      return (data && data.rows) || [];
    }
    return [];
  }

  function applyDerivedPricesFromRows(products, goldRows, opts) {
    var index = buildGoldPriceIndex(goldRows);
    return applyDerivedPrices(products, index, opts);
  }

  global.TLKVProductPriceEngine = {
    buildGoldPriceIndex: buildGoldPriceIndex,
    multiplyVndByWeight: multiplyVndByWeight,
    multiplyVndByReferenceWeight: multiplyVndByReferenceWeight,
    resolveReferenceWeightForGoldRow: resolveReferenceWeightForGoldRow,
    formatVndInteger: formatVndInteger,
    isPriceMappable: isPriceMappable,
    deriveProductPrice: deriveProductPrice,
    applyDerivedPrices: applyDerivedPrices,
    applyDerivedPricesToBrandRows: applyDerivedPricesToBrandRows,
    applyDerivedPricesFromRows: applyDerivedPricesFromRows,
    resolveGoldRowsForPricing: resolveGoldRowsForPricing,
    inferPriceSourceProduct: inferPriceSourceProduct,
    compareBySmallestWeight: compareBySmallestWeight,
    sortBySmallestWeight: sortBySmallestWeight,
    normalizeProductKey: normalizeProductKey,
    resolveGoldRowLookupKey: resolveGoldRowLookupKey,
    resolvePricingWeight: resolvePricingWeight,
    isKimGiaBaoFamilyLabel: isKimGiaBaoFamilyLabel,
    isBongLuaVangFamilyLabel: isBongLuaVangFamilyLabel,
    isHatGaoVangFamilyLabel: isHatGaoVangFamilyLabel,
    isNhanTronKimVietFamilyLabel: isNhanTronKimVietFamilyLabel,
    isVangRongThangLongFamilyLabel: isVangRongThangLongFamilyLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
