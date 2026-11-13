/**
 * Admin product catalog rules. Run: node --test tests/product-catalog.test.js
 * Pure functions only — no Supabase calls.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/products/product-save-rules.js");
require("../js/admin/taxonomy-data.js");

const R = globalThis.TLKVProductSaveRules;
const T = globalThis.TLKVTaxonomy;

const BEFORE = {
  id: "p1",
  name: "Nhẫn tròn 1 chỉ",
  slug: "nhan-tron-1-chi",
  category: "Nhẫn Trơn",
  price_text: "5.120.000đ",
  price_numeric: 5120000,
  weight: 1,
  price_source_product: "Nhẫn Tròn Kim Việt",
  price_row_id: "row-1",
  image: "https://x/img.webp",
  sort_order: 12,
  brand_id: "b1",
  category_id: "c1",
  product_type_id: null,
  is_featured: false,
  is_best_seller: false,
  is_hot: false,
  is_active: true,
};

function after(overrides) {
  return Object.assign({}, BEFORE, overrides);
}

test("nothing changed → empty update", () => {
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({})), {});
});

test("category only → only category_id + its derived text, no SKU-sync column", () => {
  const changes = R.diffProductUpdate(BEFORE, after({ category_id: "c2", category: "Vàng 24K" }));
  assert.deepEqual(changes, { category_id: "c2", category: "Vàng 24K" });
  assert.equal(R.touchesSkuSync(changes), false);
});

test("product type only → only product_type_id", () => {
  const changes = R.diffProductUpdate(BEFORE, after({ product_type_id: "t1" }));
  assert.deepEqual(changes, { product_type_id: "t1" });
  assert.equal(R.touchesSkuSync(changes), false);
});

test("derived columns are not written unless their source changed", () => {
  const changes = R.diffProductUpdate(
    BEFORE,
    after({ category: "Tên cũ khác", price_source_product: "Tên dòng giá mới", price_numeric: 1 })
  );
  assert.deepEqual(changes, {}, "renamed price row / legacy category text / parsed price must not leak into UPDATE");
});

test("price row change carries price_source_product and touches SKU sync", () => {
  const changes = R.diffProductUpdate(BEFORE, after({ price_row_id: "row-2", price_source_product: "Kim Gia Bảo" }));
  assert.deepEqual(changes, { price_row_id: "row-2", price_source_product: "Kim Gia Bảo" });
  assert.equal(R.touchesSkuSync(changes), true);
});

test("business fields still go through as before", () => {
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ name: "Nhẫn tròn 2 chỉ" })), { name: "Nhẫn tròn 2 chỉ" });
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ weight: 2 })), { weight: 2 });
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ brand_id: "b2" })), { brand_id: "b2" });
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ is_active: false })), { is_active: false });
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ price_text: "Liên hệ", price_numeric: null })), {
    price_text: "Liên hệ",
    price_numeric: null,
  });
  assert.equal(R.touchesSkuSync({ name: "x" }), true);
});

test("cosmetic differences are not changes", () => {
  const changes = R.diffProductUpdate(
    Object.assign({}, BEFORE, { name: "Nhẫn tròn 1 chỉ  ", weight: "1.00000", image: null }),
    after({ image: "" })
  );
  assert.deepEqual(changes, {});
});

test("slug, id and sort_order are never rewritten on edit", () => {
  assert.deepEqual(R.diffProductUpdate(BEFORE, after({ slug: "khac", sort_order: 1, id: "p9" })), {});
});

test("name rule: trim, collapse spaces, ignore case, keep diacritics", () => {
  assert.equal(T.nameKey("  Bảo  Tín   MINH châu "), "bảo tín minh châu");
  assert.notEqual(T.nameKey("Bạc"), T.nameKey("Bác"));
  assert.equal(T.cleanName("  Vàng   24K "), "Vàng 24K");
});

test("duplicate check excludes the record being edited", () => {
  const rows = [
    { id: "1", name: "Vàng 24K", slug: "vang-24k" },
    { id: "2", name: "Nhẫn Trơn", slug: "nhan-tron" },
  ];
  assert.equal(T.findDuplicateName(rows, " vàng  24k ").id, "1");
  assert.equal(T.findDuplicateName(rows, "Vàng 24K", "1"), null, "renaming itself is not a duplicate");
  assert.equal(T.findDuplicateName(rows, "Vàng 24K", "2").id, "1", "renaming another record to an existing name is blocked");
  assert.equal(T.findSlugOwner(rows, "nhan-tron", null).id, "2");
});

test("DB unique violations map to the spec messages", () => {
  const dup = T.mapDbError("brand", { code: "23505", message: 'duplicate key value violates unique constraint "brands_name_norm_key"' });
  assert.equal(dup.message, "Tên thương hiệu đã tồn tại. Vui lòng kiểm tra lại tên thương hiệu.");
  assert.equal(dup.field, "name");
  assert.equal(
    T.mapDbError("category", { code: "23505", message: "categories_name_norm_key" }).message,
    "Tên danh mục đã tồn tại. Vui lòng kiểm tra lại tên danh mục."
  );
  assert.equal(
    T.mapDbError("productType", { code: "23505", message: "product_types_name_norm_key" }).message,
    "Tên loại sản phẩm đã tồn tại. Vui lòng kiểm tra lại tên loại sản phẩm."
  );
});

test("slugify matches the existing product slug rule", () => {
  assert.equal(T.slugify("Lắc Tay Đẹp 24K"), "lac-tay-dep-24k");
});
