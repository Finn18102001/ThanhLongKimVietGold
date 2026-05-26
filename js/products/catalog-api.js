(function (global) {
  "use strict";

  /** Chỉ cột có trên bảng products thực tế (legacy có thể thiếu created_at). */
  var PRODUCT_SELECT =
    "id, name, slug, price_text, price_numeric, image, sort_order, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id, " +
    "brands ( id, name, slug ), categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

  var BRAND_SELECT = [
    "id, name, slug, description, logo_url, sort_order",
    "products (",
    "  id, name, slug, price_text, price_numeric, image, sort_order,",
    "  is_featured, is_best_seller, is_hot, is_active,",
    "  product_images ( role, public_url, sort_order )",
    ")",
  ].join("\n");

  // Homepage featured cache intentionally disabled to always reflect latest API data.

  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
  }

  function sortByOrder(a, b) {
    var sa = a.sort_order != null ? Number(a.sort_order) : NaN;
    var sb = b.sort_order != null ? Number(b.sort_order) : NaN;
    if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
    return String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""), undefined, {
      numeric: true,
    });
  }

  function resolveFn() {
    return global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc
      ? global.TLKVProducts.resolveProductImageSrc.bind(global.TLKVProducts)
      : function (x) {
          return x;
        };
  }

  function pickImageUrl(row, rfn) {
    var images = row.product_images || [];
    if (images.length) {
      var sorted = images.slice().sort(function (a, b) {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      var thumb = sorted.find(function (i) {
        return i.role === "thumbnail";
      });
      var main = sorted.find(function (i) {
        return i.role === "main";
      });
      var first = thumb || main || sorted[0];
      if (first && first.public_url) return first.public_url;
    }
    if (row.image && rfn) return rfn(row.image);
    return row.image || "";
  }

  function normalizeProduct(row, rfn) {
    rfn = rfn || resolveFn();
    var brand = row.brands || null;
    var cat = row.categories || null;
    return {
      id: row.id,
      name: row.name || "",
      slug: row.slug || "",
      priceText: row.price_text || "",
      priceNumeric: row.price_numeric != null ? Number(row.price_numeric) : null,
      image: row.image || "",
      thumbnailUrl: pickImageUrl(row, rfn),
      sortOrder: row.sort_order,
      isFeatured: !!row.is_featured,
      isBestSeller: !!row.is_best_seller,
      isHot: !!row.is_hot,
      isActive: row.is_active !== false,
      brandId: row.brand_id || (brand && brand.id) || null,
      brandName: brand && brand.name ? brand.name : "",
      brandSlug: brand && brand.slug ? brand.slug : "",
      categoryId: row.category_id || (cat && cat.id) || null,
      categoryName: cat && cat.name ? cat.name : "",
      categorySlug: cat && cat.slug ? cat.slug : "",
      createdAt: row.created_at || null,
    };
  }

  function normalizeBrand(row, rfn, productLimit) {
    var products = (row.products || [])
      .filter(function (p) {
        return p.is_active !== false;
      })
      .sort(sortByOrder)
      .map(function (p) {
        return normalizeProduct(p, rfn);
      });
    if (productLimit > 0) products = products.slice(0, productLimit);

    return {
      brand: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description || "",
        logoUrl: row.logo_url || "",
        sortOrder: row.sort_order,
      },
      products: products,
    };
  }

  function readHomeCache() {
    return null;
  }

  function writeHomeCache(data) {
    return data;
  }

  function invalidateHomeCache() {
    return null;
  }

  /** Temporary homepage: all products, no is_active / is_featured filter. */
  async function fetchAllProductsForHomepage() {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var rfn = resolveFn();
    var res = await runProductsQuery(function (q) {
      return q.order("sort_order", { ascending: true }).order("id", { ascending: true });
    });
    return (res.data || []).map(function (row) {
      return normalizeProduct(row, rfn);
    });
  }

  async function fetchFeaturedProducts(limit) {
    var all = await fetchAllProductsForHomepage();
    var cap = limit || 8;
    return all.slice(0, cap);
  }

  async function fetchBrandCatalogSections(productLimitPerBrand) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var limit = productLimitPerBrand != null ? productLimitPerBrand : 6;
    var rfn = resolveFn();

    var res = await sb
      .from("brands")
      .select(BRAND_SELECT)
      .eq("is_active", true)
      .eq("products.is_active", true)
      .order("sort_order", { ascending: true })
      .order("sort_order", { foreignTable: "products", ascending: true });

    if (res.error) throw res.error;

    return (res.data || [])
      .map(function (row) {
        return normalizeBrand(row, rfn, limit);
      })
      .filter(function (s) {
        return s.products && s.products.length > 0;
      });
  }

  function getHomepageFeaturedLimit(override) {
    if (global.TLKVHomepageBrandGrouping && global.TLKVHomepageBrandGrouping.resolvePerBrandLimit) {
      return global.TLKVHomepageBrandGrouping.resolvePerBrandLimit(override);
    }
    if (override != null && override > 0) return Math.min(24, Math.floor(override));
    return 6;
  }

  function getHomepageBrandDefinitions() {
    var defs = Array.isArray(global.TLKV_HOMEPAGE_BRAND_SECTIONS)
      ? global.TLKV_HOMEPAGE_BRAND_SECTIONS
      : [];
    return defs
      .map(function (d) {
        return d || {};
      })
      .filter(function (d) {
        return !!String(d.slug || "").trim();
      });
  }

  async function fetchAllBrandsForHomepage() {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var res = await sb
      .from("brands")
      .select("id, name, slug, description, logo_url, sort_order")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  /** Per-brand slice from full catalog (temporary — no featured/active filter). */
  async function fetchFeaturedProductsForBrand(sb, brandId, limit, rfn) {
    if (!brandId) return [];
    var all = await fetchAllProductsForHomepage();
    var Group = global.TLKVHomepageBrandGrouping;
    var grouped = Group ? Group.groupByBrandId(all) : {};
    var list = grouped[String(brandId)] || [];
    var cap = getHomepageFeaturedLimit(limit);
    return Group ? Group.takeFirst(list, cap) : list.slice(0, cap);
  }

  /**
   * Homepage data flow:
   * 1) get all brands
   * 2) get all products
   * 3) match config brand with API brand by slug/name
   * 4) group products by brand_id
   * 5) limit max 6 products per brand
   * 6) render dynamic sections
   */
  async function fetchHomeFeaturedBrandSections(productLimitPerBrand) {
    var perBrand = getHomepageFeaturedLimit(productLimitPerBrand);
    var configBrands = getHomepageBrandDefinitions();
    if (!configBrands.length) return [];

    var apiBrands = [];
    try {
      apiBrands = await fetchAllBrandsForHomepage();
    } catch (e) {
      console.warn("[TLKVCatalog] homepage brands:", e);
      apiBrands = [];
    }

    var allProducts = [];
    try {
      allProducts = await fetchAllProductsForHomepage();
    } catch (e) {
      console.warn("[TLKVCatalog] homepage products:", e);
      allProducts = [];
    }

    if (
      global.TLKVHomepageBrandGrouping &&
      global.TLKVHomepageBrandGrouping.buildRenderableBrandSections
    ) {
      return global.TLKVHomepageBrandGrouping.buildRenderableBrandSections({
        configBrands: configBrands,
        apiBrands: apiBrands,
        products: allProducts,
        perBrandLimit: perBrand,
      });
    }

    return [];
  }

  async function fetchHomepageCatalog(opts) {
    opts = opts || {};
    var brandLimit =
      opts.brandProductLimit != null
        ? opts.brandProductLimit
        : getHomepageFeaturedLimit();

    var brandSections = [];
    try {
      brandSections = await fetchHomeFeaturedBrandSections(brandLimit);
    } catch (e) {
      console.warn("[TLKVCatalog] homepage sections:", e);
    }

    var payload = { brandSections: brandSections };
    writeHomeCache(payload);
    return payload;
  }

  function applyProductFilters(q, filters) {
    filters = filters || {};
    if (filters.brandId) q = q.eq("brand_id", filters.brandId);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.featured) q = q.eq("is_featured", true);
    if (filters.hot) q = q.eq("is_hot", true);
    if (filters.bestSeller) q = q.eq("is_best_seller", true);
    return q;
  }

  function applyProductSort(q, sort, usePriceNumeric) {
    usePriceNumeric = usePriceNumeric !== false;
    switch (sort) {
      case "price_asc":
        if (usePriceNumeric) {
          return q.order("price_numeric", { ascending: true, nullsFirst: false });
        }
        return q.order("sort_order", { ascending: true, nullsFirst: false });
      case "price_desc":
        if (usePriceNumeric) {
          return q.order("price_numeric", { ascending: false, nullsFirst: false });
        }
        return q.order("sort_order", { ascending: false, nullsFirst: false });
      case "newest":
        return q
          .order("sort_order", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false });
      default:
        return q.order("sort_order", { ascending: true, nullsFirst: false });
    }
  }

  function isMissingColumnError(err, col) {
    var msg = String((err && (err.message || err.details)) || "").toLowerCase();
    return msg.indexOf(col.toLowerCase()) >= 0 && msg.indexOf("does not exist") >= 0;
  }

  var PRODUCT_SELECT_LEGACY =
    "id, name, price_text, image, sort_order, category, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id";

  /** buildQuery nhận query đã .select(); fallback nếu thiếu cột/join. */
  async function runProductsQuery(buildQuery, selectFields, countExact) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var sel = selectFields || PRODUCT_SELECT;

    function startQuery(fields) {
      return countExact
        ? sb.from("products").select(fields, { count: "exact" })
        : sb.from("products").select(fields);
    }

    var res = await buildQuery(startQuery(sel));
    if (!res.error) return res;
    if (
      isMissingColumnError(res.error, "price_numeric") ||
      isMissingColumnError(res.error, "slug") ||
      isMissingColumnError(res.error, "product_images") ||
      isMissingColumnError(res.error, "brands") ||
      isMissingColumnError(res.error, "categories")
    ) {
      res = await buildQuery(startQuery(PRODUCT_SELECT_LEGACY));
    }
    if (res.error) throw res.error;
    return res;
  }

  async function resolveFilterIds(sb, filters) {
    var out = {
      brandId: filters.brandId || null,
      categoryId: filters.categoryId || null,
      featured: !!filters.featured,
      hot: !!filters.hot,
      bestSeller: !!filters.bestSeller,
      sort: filters.sort || "sort",
    };
    if (filters.brandSlug && !out.brandId) {
      var br = await sb.from("brands").select("id").eq("slug", filters.brandSlug).maybeSingle();
      if (br.data) out.brandId = br.data.id;
    }
    if (filters.categorySlug && !out.categoryId) {
      var ct = await sb.from("categories").select("id").eq("slug", filters.categorySlug).maybeSingle();
      if (ct.data) out.categoryId = ct.data.id;
    }
    return out;
  }

  async function fetchProductsPage(filters, page, pageSize) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var size = pageSize || 24;
    var pg = Math.max(1, page || 1);
    var resolved = await resolveFilterIds(sb, filters || {});
    var rfn = resolveFn();

    var from = (pg - 1) * size;
    var to = from + size - 1;

    var res = await runProductsQuery(
      function (q) {
        q = q.eq("is_active", true);
        q = applyProductFilters(q, resolved);
        q = applyProductSort(q, resolved.sort);
        return q.range(from, to);
      },
      PRODUCT_SELECT,
      true
    );

    return {
      items: (res.data || []).map(function (row) {
        return normalizeProduct(row, rfn);
      }),
      total: res.count != null ? res.count : (res.data || []).length,
      page: pg,
      pageSize: size,
    };
  }

  async function fetchBrandsList() {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var res = await sb
      .from("brands")
      .select("id, name, slug, logo_url, sort_order, is_active")
      .order("sort_order", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function fetchCategoriesList() {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var res = await sb
      .from("categories")
      .select("id, name, slug, sort_order, is_active")
      .order("sort_order", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function fetchBrandBySlug(slug) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var res = await sb
      .from("brands")
      .select(BRAND_SELECT)
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("products.is_active", true)
      .maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    return normalizeBrand(res.data, resolveFn(), 0);
  }

  async function fetchProductBySlugs(categorySlug, productSlug) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var res = await runProductsQuery(function (q) {
      return q.eq("slug", productSlug).eq("is_active", true).maybeSingle();
    });
    if (!res.data) return null;
    var p = normalizeProduct(res.data, resolveFn());
    if (categorySlug && p.categorySlug && p.categorySlug !== categorySlug) return null;
    return p;
  }

  async function fetchFlatLegacyProducts() {
    if (!global.TLKVProducts || typeof global.TLKVProducts.getProducts !== "function") {
      return [];
    }
    var data = await global.TLKVProducts.getProducts();
    return (data && data.items) || [];
  }

  global.TLKVCatalogApi = {
    getSupabaseClient: getSupabaseClient,
    fetchFeaturedProducts: fetchFeaturedProducts,
    fetchFeaturedProductsForBrand: fetchFeaturedProductsForBrand,
    fetchHomeFeaturedBrandSections: fetchHomeFeaturedBrandSections,
    fetchBrandCatalogSections: fetchBrandCatalogSections,
    fetchHomepageCatalog: fetchHomepageCatalog,
    fetchProductsPage: fetchProductsPage,
    fetchBrandsList: fetchBrandsList,
    fetchCategoriesList: fetchCategoriesList,
    fetchBrandBySlug: fetchBrandBySlug,
    fetchProductBySlugs: fetchProductBySlugs,
    fetchFlatLegacyProducts: fetchFlatLegacyProducts,
    normalizeProduct: normalizeProduct,
    normalizeBrand: normalizeBrand,
    invalidateHomeCache: invalidateHomeCache,
    parsePriceNumeric:
      global.TLKVProducts && global.TLKVProducts.parsePriceNumeric
        ? global.TLKVProducts.parsePriceNumeric
        : function (t) {
            var d = String(t || "").replace(/[^0-9]/g, "");
            return d ? Number(d) : null;
          },
  };
})(typeof window !== "undefined" ? window : globalThis);
