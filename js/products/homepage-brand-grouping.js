/**
 * Homepage brand grouping pipeline.
 * Source of truth: config brands + API brands + API products.
 */
(function (global) {
  "use strict";

  var DEFAULT_PER_BRAND = 6;

  function resolvePerBrandLimit(override) {
    if (override != null && override > 0) return Math.min(24, Math.floor(override));
    if (typeof global.TLKV_HOMEPAGE_FEATURED_LIMIT === "number" && global.TLKV_HOMEPAGE_FEATURED_LIMIT > 0) {
      return Math.min(24, global.TLKV_HOMEPAGE_FEATURED_LIMIT);
    }
    return DEFAULT_PER_BRAND;
  }

  /** Stable sort: sort_order ASC, then id ASC. */
  function compareProducts(a, b) {
    var sa = a.sortOrder != null ? Number(a.sortOrder) : NaN;
    var sb = b.sortOrder != null ? Number(b.sortOrder) : NaN;
    if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
    return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true });
  }

  /**
   * One pass: bucket by brandId.
   * @param {object[]} products — normalized app products
   * @returns {Record<string, object[]>}
   */
  function groupByBrandId(products) {
    var map = Object.create(null);
    (products || []).forEach(function (p) {
      var bid = String(p.brandId || "").trim();
      if (!bid) return;
      if (!map[bid]) map[bid] = [];
      map[bid].push(p);
    });
    Object.keys(map).forEach(function (bid) {
      map[bid].sort(compareProducts);
    });
    return map;
  }

  function takeFirst(products, limit) {
    if (!products || !products.length) return [];
    if (limit <= 0) return products.slice();
    return products.slice(0, limit);
  }

  function normalizeKey(input) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function normalizeBrandMeta(raw, fallback) {
    raw = raw || {};
    fallback = fallback || {};
    var slug = String(raw.slug || fallback.slug || "").trim();
    var name = String(raw.name || fallback.name || "").trim();
    var id = String(raw.id || fallback.id || "").trim();
    var fallbackLogos = global.TLKV_BRAND_LOGO_FALLBACKS || {};
    var logo =
      String(raw.logo_url || raw.logoUrl || fallback.logoUrl || "").trim() ||
      (slug ? String(fallbackLogos[slug] || "") : "");

    return {
      id: id || slug || name || "",
      name: name || slug || "Thương hiệu",
      slug: slug || "",
      description: String(raw.description || fallback.description || ""),
      logoUrl: logo,
      sortOrder: raw.sort_order != null ? Number(raw.sort_order) : null,
    };
  }

  function compareConfigOrder(a, b) {
    var ao = a && a.config && a.config.order != null ? Number(a.config.order) : NaN;
    var bo = b && b.config && b.config.order != null ? Number(b.config.order) : NaN;
    if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
    if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
    if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
    return 0;
  }

  function compareSections(a, b) {
    var sa = a && a.brand ? a.brand.sortOrder : null;
    var sb = b && b.brand ? b.brand.sortOrder : null;
    var fa = Number.isFinite(sa);
    var fb = Number.isFinite(sb);
    if (fa && fb && sa !== sb) return sa - sb;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    return String((a && a.brand && a.brand.name) || "").localeCompare(
      String((b && b.brand && b.brand.name) || ""),
      undefined,
      { numeric: true }
    );
  }

  function indexApiBrands(apiBrands) {
    var bySlug = Object.create(null);
    var byName = Object.create(null);
    (apiBrands || []).forEach(function (b) {
      if (!b) return;
      var slugKey = normalizeKey(b.slug);
      var nameKey = normalizeKey(b.name);
      if (slugKey && !bySlug[slugKey]) bySlug[slugKey] = b;
      if (nameKey && !byName[nameKey]) byName[nameKey] = b;
    });
    return { bySlug: bySlug, byName: byName };
  }

  function matchConfiguredBrand(config, brandIndex) {
    config = config || {};
    brandIndex = brandIndex || {};
    var slugKey = normalizeKey(config.slug);
    var nameKey = normalizeKey(config.name);
    if (slugKey && brandIndex.bySlug && brandIndex.bySlug[slugKey]) {
      return brandIndex.bySlug[slugKey];
    }
    if (nameKey && brandIndex.byName && brandIndex.byName[nameKey]) {
      return brandIndex.byName[nameKey];
    }
    return null;
  }

  function mergeConfiguredBrandsWithApiBrands(configBrands, apiBrands) {
    var index = indexApiBrands(apiBrands);
    var merged = [];
    (configBrands || []).forEach(function (cfg, idx) {
      var api = matchConfiguredBrand(cfg, index);
      var meta = normalizeBrandMeta(api || {}, cfg || {});
      var id = api && api.id ? String(api.id) : String((cfg && cfg.id) || "");
      merged.push({
        config: Object.assign({ order: idx }, cfg || {}),
        api: api,
        sectionBrand: {
          id: id || meta.slug || meta.name,
          name: meta.name,
          slug: meta.slug,
          description: meta.description || "",
          logoUrl: meta.logoUrl || "",
          sortOrder: meta.sortOrder,
          viewAllHref: meta.slug
            ? "/thuong-hieu/" + encodeURIComponent(meta.slug)
            : "/san-pham?brand=" + encodeURIComponent(id || meta.name),
        },
      });
    });
    merged.sort(compareConfigOrder);
    return merged;
  }

  /**
   * Single pass grouping with cap-per-brand.
   * Products are only accepted if brand_id matches mapped brands.
   */
  function groupProductsByMappedBrand(products, mergedBrands, limit) {
    var sections = (mergedBrands || []).map(function (entry) {
      return {
        brand: entry.sectionBrand,
        products: [],
        limit: resolvePerBrandLimit(limit),
      };
    });
    var indexByBrandId = Object.create(null);
    sections.forEach(function (section, idx) {
      var bid = String((section.brand && section.brand.id) || "").trim();
      if (!bid) return;
      indexByBrandId[bid] = idx;
    });
    var cap = resolvePerBrandLimit(limit);
    var seenProductIds = Object.create(null);

    (products || []).forEach(function (p) {
      if (!p || !p.id) return;
      var pid = String(p.id);
      if (seenProductIds[pid]) return;
      var bid = String(p.brandId || "").trim();
      var idx = indexByBrandId[bid];
      if (idx == null) return;
      if (sections[idx].products.length >= cap) return;
      sections[idx].products.push(p);
      seenProductIds[pid] = true;
    });
    return sections;
  }

  /**
   * Build renderable sections from config brands + API brands + API products.
   * Always keeps configured brand section order.
   * @param {{
   *   configBrands: Array<{ slug?: string, name?: string, logoUrl?: string, description?: string, order?: number }>,
   *   apiBrands: object[],
   *   products: object[],
   *   perBrandLimit?: number
   * }} input
   */
  function buildRenderableBrandSections(input) {
    input = input || {};
    var configBrands = Array.isArray(input.configBrands) ? input.configBrands : [];
    var apiBrands = Array.isArray(input.apiBrands) ? input.apiBrands : [];
    var products = Array.isArray(input.products) ? input.products : [];
    var merged = mergeConfiguredBrandsWithApiBrands(configBrands, apiBrands);
    var sections = groupProductsByMappedBrand(products, merged, input.perBrandLimit);
    return sections;
  }

  global.TLKVHomepageBrandGrouping = {
    DEFAULT_PER_BRAND: DEFAULT_PER_BRAND,
    resolvePerBrandLimit: resolvePerBrandLimit,
    groupByBrandId: groupByBrandId,
    groupProductsByMappedBrand: groupProductsByMappedBrand,
    takeFirst: takeFirst,
    normalizeKey: normalizeKey,
    normalizeBrandMeta: normalizeBrandMeta,
    indexApiBrands: indexApiBrands,
    matchConfiguredBrand: matchConfiguredBrand,
    mergeConfiguredBrandsWithApiBrands: mergeConfiguredBrandsWithApiBrands,
    buildRenderableBrandSections: buildRenderableBrandSections,
    compareSections: compareSections,
    compareProducts: compareProducts,
  };
})(typeof window !== "undefined" ? window : globalThis);
