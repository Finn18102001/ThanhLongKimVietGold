/**
 * Product domain rules — single source for CRUD validation.
 * Data access: TLKVProducts (write), TLKVCatalogApi (public read).
 */
(function (global) {
  "use strict";

  var PRODUCT_PUBLIC_SELECT =
    "id, name, slug, price_text, price_numeric, image, sort_order, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id, " +
    "brands ( id, name, slug ), categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

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
    PRODUCT_PUBLIC_SELECT: PRODUCT_PUBLIC_SELECT,
    validateForSave: validateForSave,
    resolveProductId: resolveProductId,
  };
})(typeof window !== "undefined" ? window : globalThis);
