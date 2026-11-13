/**
 * Product update rules — which columns an edit is allowed to write.
 *
 * Edits send only the columns whose value really changed, so an UPDATE that touches
 * only category_id / product_type_id / flags does not fire trg_products_sync_pos_sku
 * (AFTER UPDATE OF name, weight, price_source_product, brand_id, is_active).
 * Derived columns are written only together with the column they derive from.
 */
(function (global) {
  "use strict";

  var NUMERIC_COLUMNS = { weight: true, price_numeric: true, sort_order: true };
  var BOOLEAN_COLUMNS = { is_featured: true, is_best_seller: true, is_hot: true, is_active: true };

  /** derived column → source column it follows */
  var DERIVED_FROM = {
    price_numeric: "price_text",
    category: "category_id",
    price_source_product: "price_row_id",
  };

  /** Columns an edit never rewrites. */
  var IMMUTABLE_ON_EDIT = { id: true, slug: true, sort_order: true };

  var SKU_SYNC_COLUMNS = ["name", "weight", "price_source_product", "brand_id", "is_active"];

  function canonical(column, value) {
    if (value === undefined || value === null) return null;
    if (NUMERIC_COLUMNS[column]) {
      var n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    if (BOOLEAN_COLUMNS[column]) return !!value;
    var s = String(value).trim();
    return s === "" ? null : s;
  }

  function sameValue(column, a, b) {
    return canonical(column, a) === canonical(column, b);
  }

  /**
   * @param {Record<string, any>} beforeRow  current DB row
   * @param {Record<string, any>} afterRow   row built from the form (productAppToDb)
   * @returns {Record<string, any>} columns to send in UPDATE
   */
  function diffProductUpdate(beforeRow, afterRow) {
    beforeRow = beforeRow || {};
    afterRow = afterRow || {};
    var changes = {};
    Object.keys(afterRow).forEach(function (col) {
      if (IMMUTABLE_ON_EDIT[col] || DERIVED_FROM[col]) return;
      if (!sameValue(col, beforeRow[col], afterRow[col])) changes[col] = afterRow[col];
    });
    Object.keys(DERIVED_FROM).forEach(function (col) {
      var source = DERIVED_FROM[col];
      if (!Object.prototype.hasOwnProperty.call(changes, source)) return;
      if (!Object.prototype.hasOwnProperty.call(afterRow, col)) return;
      if (!sameValue(col, beforeRow[col], afterRow[col])) changes[col] = afterRow[col];
    });
    return changes;
  }

  function touchesSkuSync(changes) {
    return SKU_SYNC_COLUMNS.some(function (c) {
      return Object.prototype.hasOwnProperty.call(changes || {}, c);
    });
  }

  var COLUMN_LABELS = {
    name: "Tên",
    brand_id: "Thương hiệu",
    category_id: "Danh mục",
    category: "Danh mục (chữ)",
    product_type_id: "Loại sản phẩm",
    price_row_id: "Dòng bảng giá",
    price_source_product: "Nguồn giá",
    price_text: "Giá / ghi chú",
    price_numeric: "Giá (số)",
    weight: "Định lượng",
    image: "Ảnh",
    is_active: "Hiển thị",
    is_featured: "Nổi bật",
    is_best_seller: "Bán chạy",
    is_hot: "Hot",
  };

  function describeChanges(changes) {
    return Object.keys(changes || {}).map(function (c) {
      return COLUMN_LABELS[c] || c;
    });
  }

  global.TLKVProductSaveRules = Object.freeze({
    SKU_SYNC_COLUMNS: SKU_SYNC_COLUMNS,
    DERIVED_FROM: DERIVED_FROM,
    diffProductUpdate: diffProductUpdate,
    touchesSkuSync: touchesSkuSync,
    describeChanges: describeChanges,
    sameValue: sameValue,
  });
})(typeof window !== "undefined" ? window : globalThis);
