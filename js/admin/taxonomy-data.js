/**
 * Admin taxonomy data layer — brands, categories, product types and brand↔category links.
 *
 * Rules (also enforced in DB by *_name_norm_key unique indexes):
 *  - Name required; duplicates blocked after trimming, collapsing spaces, ignoring case.
 *  - Slug generated from the name on create, never edited, kept on rename (URLs use it).
 *  - No hard delete: deactivate only.
 *  - Link changes touch brand_categories only; products are never modified here.
 */
(function (global) {
  "use strict";

  var KINDS = {
    brand: {
      table: "brands",
      label: "thương hiệu",
      columns: "id, name, slug, description, logo_url, is_active, sort_order, created_at, updated_at",
      duplicate: "Tên thương hiệu đã tồn tại. Vui lòng kiểm tra lại tên thương hiệu.",
      usageColumn: "brand_id",
    },
    category: {
      table: "categories",
      label: "danh mục",
      columns: "id, name, slug, is_active, sort_order, created_at, updated_at",
      duplicate: "Tên danh mục đã tồn tại. Vui lòng kiểm tra lại tên danh mục.",
      usageColumn: "category_id",
    },
    productType: {
      table: "product_types",
      label: "loại sản phẩm",
      columns: "id, name, slug, is_active, sort_order, created_at, updated_at",
      duplicate: "Tên loại sản phẩm đã tồn tại. Vui lòng kiểm tra lại tên loại sản phẩm.",
      usageColumn: "product_type_id",
    },
  };

  function kindOf(kind) {
    var k = KINDS[kind];
    if (!k) throw new Error("Loại dữ liệu không hợp lệ: " + kind);
    return k;
  }

  /** Trim + collapse inner whitespace; keeps the casing the user typed. */
  function cleanName(value) {
    return String(value == null ? "" : value)
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Same key as the DB index: lower(normalize(regexp_replace(btrim(name), '\s+', ' ', 'g'), NFC)). */
  function nameKey(value) {
    return cleanName(value).toLowerCase();
  }

  function slugify(value) {
    if (global.TLKVProducts && typeof global.TLKVProducts.slugifySimple === "function") {
      return global.TLKVProducts.slugifySimple(value);
    }
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function fieldError(field, message) {
    var err = new Error(message);
    err.name = "TaxonomyError";
    err.field = field;
    return err;
  }

  /**
   * @param {{ id: string, name: string, slug: string }[]} rows existing rows of one kind
   * @param {string} name
   * @param {string} [excludeId] record being edited
   */
  function findDuplicateName(rows, name, excludeId) {
    var key = nameKey(name);
    return (rows || []).find(function (r) {
      return r.id !== excludeId && nameKey(r.name) === key;
    }) || null;
  }

  function findSlugOwner(rows, slug, excludeId) {
    return (rows || []).find(function (r) {
      return r.id !== excludeId && r.slug === slug;
    }) || null;
  }

  function mapDbError(kind, err) {
    var k = kindOf(kind);
    var blob = String((err && (err.message + " " + (err.details || ""))) || "");
    if (err && err.code === "23505" && /name_norm_key/.test(blob)) return fieldError("name", k.duplicate);
    if (err && err.code === "23505" && /slug/.test(blob)) {
      return fieldError("name", "Tên này tạo ra đường dẫn trùng với một " + k.label + " khác. Vui lòng kiểm tra lại tên.");
    }
    if (err && (err.code === "42501" || /row-level security/i.test(blob))) {
      return new Error("Không có quyền ghi " + k.label + ". Đăng nhập bằng tài khoản admin rồi thử lại.");
    }
    return new Error((err && err.message) || "Lỗi không xác định khi lưu " + k.label + ".");
  }

  async function getSb() {
    var sb = null;
    if (global.TLKVCatalogApi && typeof global.TLKVCatalogApi.getSupabaseClient === "function") {
      sb = await global.TLKVCatalogApi.getSupabaseClient();
    } else if (global.TLKVSupabase && typeof global.TLKVSupabase.getSupabaseClient === "function") {
      sb = await global.TLKVSupabase.getSupabaseClient();
    }
    if (!sb) throw new Error("Chưa có kết nối Supabase.");
    return sb;
  }

  async function listAll(kind) {
    var k = kindOf(kind);
    var sb = await getSb();
    var res = await sb.from(k.table).select(k.columns).order("sort_order").order("name");
    if (res.error) throw mapDbError(kind, res.error);
    return res.data || [];
  }

  async function listLinks() {
    var sb = await getSb();
    var res = await sb.from("brand_categories").select("brand_id, category_id");
    if (res.error) throw new Error("Không tải được liên kết thương hiệu - danh mục: " + res.error.message);
    return res.data || [];
  }

  async function replaceLinks(sb, kind, id, nextIds) {
    var key = kind === "brand" ? "brand_id" : "category_id";
    var otherKey = kind === "brand" ? "category_id" : "brand_id";
    var cur = await sb.from("brand_categories").select(otherKey).eq(key, id);
    if (cur.error) throw new Error("Không đọc được liên kết hiện tại: " + cur.error.message);
    var current = (cur.data || []).map(function (r) { return r[otherKey]; });
    var toAdd = nextIds.filter(function (x) { return current.indexOf(x) < 0; });
    var toRemove = current.filter(function (x) { return nextIds.indexOf(x) < 0; });
    if (toAdd.length) {
      var rows = toAdd.map(function (otherId) {
        var r = {};
        r[key] = id;
        r[otherKey] = otherId;
        return r;
      });
      var ins = await sb.from("brand_categories").insert(rows);
      if (ins.error) throw new Error("Không thêm được liên kết: " + ins.error.message);
    }
    if (toRemove.length) {
      var del = await sb.from("brand_categories").delete().eq(key, id).in(otherKey, toRemove);
      if (del.error) throw new Error("Không bỏ được liên kết: " + del.error.message);
    }
    return { added: toAdd, removed: toRemove };
  }

  function uniqueIds(ids) {
    var seen = Object.create(null);
    return (ids || []).filter(function (x) {
      var s = String(x || "").trim();
      if (!s || seen[s]) return false;
      seen[s] = true;
      return true;
    });
  }

  /**
   * Create or update one record.
   * @param {"brand"|"category"|"productType"} kind
   * @param {{ id?: string, name: string, description?: string, logoUrl?: string, isActive: boolean, linkedIds?: string[] }} input
   * @returns {Promise<{ record: object, links: { added: string[], removed: string[] } | null }>}
   */
  async function save(kind, input) {
    var k = kindOf(kind);
    input = input || {};
    var id = String(input.id || "").trim();
    var name = cleanName(input.name);
    if (!name) throw fieldError("name", "Nhập tên " + k.label + ".");

    var sb = await getSb();
    var existing = await sb.from(k.table).select("id, name, slug");
    if (existing.error) throw mapDbError(kind, existing.error);
    var rows = existing.data || [];

    if (findDuplicateName(rows, name, id || null)) throw fieldError("name", k.duplicate);

    var payload = { name: name, is_active: input.isActive !== false };
    if (kind === "brand") {
      payload.description = String(input.description || "").trim() || null;
      payload.logo_url = String(input.logoUrl || "").trim() || null;
    }

    var res;
    if (id) {
      res = await sb.from(k.table).update(payload).eq("id", id).select(k.columns);
    } else {
      var slug = slugify(name);
      if (!slug) throw fieldError("name", "Tên không tạo được đường dẫn hợp lệ. Vui lòng dùng chữ hoặc số.");
      if (findSlugOwner(rows, slug, null)) {
        throw fieldError("name", "Tên này tạo ra đường dẫn «" + slug + "» trùng với một " + k.label + " khác. Vui lòng kiểm tra lại tên.");
      }
      payload.slug = slug;
      payload.sort_order = 0;
      res = await sb.from(k.table).insert(payload).select(k.columns);
    }
    if (res.error) throw mapDbError(kind, res.error);
    var record = (res.data || [])[0];
    if (!record) throw new Error("Không lưu được " + k.label + " (không tìm thấy hoặc không có quyền).");

    var links = null;
    if ((kind === "brand" || kind === "category") && Array.isArray(input.linkedIds)) {
      try {
        links = await replaceLinks(sb, kind, record.id, uniqueIds(input.linkedIds));
      } catch (linkErr) {
        var partial = new Error("Đã lưu " + k.label + " «" + record.name + "» nhưng chưa lưu được liên kết. " + linkErr.message);
        partial.record = record;
        throw partial;
      }
    }
    return { record: record, links: links };
  }

  async function setActive(kind, id, active) {
    var k = kindOf(kind);
    var sb = await getSb();
    var res = await sb.from(k.table).update({ is_active: !!active }).eq("id", id).select(k.columns);
    if (res.error) throw mapDbError(kind, res.error);
    if (!res.data || !res.data.length) throw new Error("Không cập nhật được trạng thái " + k.label + ".");
    return res.data[0];
  }

  /** Number of products referencing the record (null if the count cannot be read). */
  async function countProducts(kind, id) {
    var k = kindOf(kind);
    var sb = await getSb();
    var res = await sb.from("products").select("id", { count: "exact", head: true }).eq(k.usageColumn, id);
    if (res.error) return null;
    return typeof res.count === "number" ? res.count : null;
  }

  async function isLinked(brandId, categoryId) {
    var sb = await getSb();
    var res = await sb
      .from("brand_categories")
      .select("brand_id")
      .eq("brand_id", brandId)
      .eq("category_id", categoryId)
      .limit(1);
    if (res.error) throw new Error("Không kiểm tra được liên kết thương hiệu - danh mục: " + res.error.message);
    return (res.data || []).length > 0;
  }

  global.TLKVTaxonomy = Object.freeze({
    KINDS: KINDS,
    cleanName: cleanName,
    nameKey: nameKey,
    slugify: slugify,
    findDuplicateName: findDuplicateName,
    findSlugOwner: findSlugOwner,
    mapDbError: mapDbError,
    listAll: listAll,
    listLinks: listLinks,
    save: save,
    setActive: setActive,
    countProducts: countProducts,
    isLinked: isLinked,
  });
})(typeof window !== "undefined" ? window : globalThis);
