/**
 * Product domain rules — single source for CRUD validation & featured filters.
 * Data access: TLKVProducts (write), TLKVCatalogApi (public read).
 */
(function (global) {
  "use strict";

  /** 0 = no cap on homepage featured per brand (safety max still applied in API). */
  var FEATURED_PER_BRAND_CAP = 0;
  var FEATURED_SAFETY_MAX = 200;

  var PRODUCT_PUBLIC_SELECT =
    "id, name, slug, price_text, price_numeric, image, sort_order, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id, " +
    "brands ( id, name, slug ), categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

  /**
   * Homepage featured: brand_id + is_active + is_featured only.
   * @returns {{ brandId: string, isActive: true, isFeatured: true }}
   */
  function featuredFilter(brandId) {
    return {
      brandId: String(brandId || ""),
      isActive: true,
      isFeatured: true,
    };
  }

  function resolveFeaturedLimit(override) {
    if (override != null && override > 0) return Math.min(FEATURED_SAFETY_MAX, Math.floor(override));
    var cfg =
      typeof global.TLKV_HOMEPAGE_FEATURED_LIMIT === "number"
        ? global.TLKV_HOMEPAGE_FEATURED_LIMIT
        : FEATURED_PER_BRAND_CAP;
    if (cfg <= 0) return FEATURED_SAFETY_MAX;
    return Math.min(FEATURED_SAFETY_MAX, cfg);
  }

  /**
   * @param {object} item — app-shaped product from form
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateForSave(item) {
    var errors = [];
    item = item || {};
    var name = String(item.name || "").trim();
    if (!name) errors.push("Tên sản phẩm là bắt buộc.");
    if (!String(item.brandId || "").trim()) errors.push("Chọn thương hiệu.");
    if (!String(item.categoryId || "").trim()) errors.push("Chọn danh mục.");
    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Create: new id. Edit: keep id.
   */
  function resolveProductId(item, mode) {
    var id = String((item && item.id) || "").trim();
    if (mode === "edit" && id) return id;
    if (id) return id;
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "p-" + Date.now();
  }

  global.TLKVProductCrud = {
    FEATURED_PER_BRAND_CAP: FEATURED_PER_BRAND_CAP,
    FEATURED_SAFETY_MAX: FEATURED_SAFETY_MAX,
    PRODUCT_PUBLIC_SELECT: PRODUCT_PUBLIC_SELECT,
    featuredFilter: featuredFilter,
    resolveFeaturedLimit: resolveFeaturedLimit,
    validateForSave: validateForSave,
    resolveProductId: resolveProductId,
  };
})(typeof window !== "undefined" ? window : globalThis);
