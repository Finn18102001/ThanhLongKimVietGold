(function (global) {
  "use strict";

  /** Chỉ cột có trên bảng products thực tế (legacy có thể thiếu created_at). */
  var PRODUCT_SELECT =
    "id, name, slug, price_text, price_numeric, image, sort_order, weight, price_source_product, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id, " +
    "brands ( id, name, slug ), categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

  var ACCUMULATION_CATEGORY_SLUGS = ["vang-mieng", "nhan-tron"];
  var JEWELRY_CATEGORY_SLUGS = ["trang-suc", "bac"];

  var BRAND_SELECT = [
    "id, name, slug, description, logo_url, sort_order",
    "products (",
    "  id, name, slug, price_text, price_numeric, image, sort_order,",
    "  is_featured, is_best_seller, is_hot, is_active,",
    "  product_images ( role, public_url, sort_order )",
    ")",
  ].join("\n");
  var FEATURED_BRAND_SELECT = "id, name, slug, logo_url, sort_order";
  var FEATURED_PRODUCT_SELECT = "id, name, slug, image, price_text, sort_order";
  var FEATURED_FALLBACK_PRODUCT_SELECT =
    "id, name, slug, image, price_text, price_numeric, sort_order, weight, price_source_product, brand_id, " +
    "is_featured, is_best_seller, is_hot, " +
    "categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

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
    rfn = rfn || resolveFn();
    if (global.TLKVProducts && typeof global.TLKVProducts.pickProductDisplayImageUrl === "function") {
      return global.TLKVProducts.pickProductDisplayImageUrl(row, rfn);
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
      weight: row.weight != null ? Number(row.weight) : null,
      priceSourceProduct:
        row.price_source_product != null
          ? String(row.price_source_product).trim().replace(/\s+/g, " ")
          : null,
      createdAt: row.created_at || null,
    };
  }

  function normalizeFeaturedProduct(row, rfn) {
    rfn = rfn || resolveFn();
    var cat = row.categories || null;
    var weight = row.weight != null ? Number(row.weight) : null;
    if (weight != null && !Number.isFinite(weight)) weight = null;
    var priceSourceProduct =
      row.price_source_product != null
        ? String(row.price_source_product).trim().replace(/\s+/g, " ")
        : "";
    var isPriceMappable = !!(priceSourceProduct && weight != null && weight > 0);
    return {
      id: row.id,
      name: row.name || "",
      slug: row.slug || "",
      image: row.image || "",
      thumbnailUrl: pickImageUrl(row, rfn),
      priceText: "",
      priceNumeric: row.price_numeric != null ? Number(row.price_numeric) : null,
      weight: weight,
      priceSourceProduct: priceSourceProduct || null,
      isPriceMappable: isPriceMappable,
      isPriceDerived: false,
      showPrice: false,
      sortOrder: row.sort_order,
      isFeatured: row.is_featured !== false,
      isBestSeller: !!row.is_best_seller,
      isHot: !!row.is_hot,
      categoryId: cat && cat.id ? cat.id : null,
      categoryName: cat && cat.name ? cat.name : "",
      categorySlug: cat && cat.slug ? cat.slug : "",
      brandName: "",
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

  async function fetchBrandCatalogSections(productLimitPerBrand) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var limit = productLimitPerBrand != null ? productLimitPerBrand : 7;
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

  /**
   * Homepage featured flow:
   * 1) load active brands ordered by sort_order
   * 2) per brand, load featured products (weight + price_source_product for derived pricing)
   * 3) attach to featured_products and drop empty brands
   */
  async function fetchFeaturedBrandsBundle(productLimitPerBrand) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var rfn = resolveFn();
    /** undefined → 7 (homepage); 0 or null → không giới hạn */
    var limit = productLimitPerBrand === undefined ? 7 : productLimitPerBrand;

    var brandRes = await sb
      .from("brands")
      .select(FEATURED_BRAND_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (brandRes.error) throw brandRes.error;

    var brands = brandRes.data || [];
    var brandIds = brands.map(function (b) {
      return b.id;
    });
    var productsByBrand = {};
    if (brandIds.length) {
      var productQuery = sb
        .from("products")
        .select(FEATURED_FALLBACK_PRODUCT_SELECT)
        .in("brand_id", brandIds)
        .eq("is_featured", true)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      // Soft cap: tránh kéo toàn bộ featured khi catalog lớn (slice vẫn theo brand phía dưới).
      if (limit > 0) {
        productQuery = productQuery.limit(Math.max(limit * brandIds.length, limit * 4));
      }
      var allProductRes = await productQuery;
      if (allProductRes.error) throw allProductRes.error;
      (allProductRes.data || []).forEach(function (row) {
        var bid = row.brand_id;
        if (!bid) return;
        if (!productsByBrand[bid]) productsByBrand[bid] = [];
        productsByBrand[bid].push(row);
      });
    }

    var out = [];

    for (var i = 0; i < brands.length; i += 1) {
      var brand = brands[i];
      var rows = productsByBrand[brand.id] || [];
      if (limit > 0) rows = rows.slice(0, limit);
      var featuredProducts = rows.map(function (row) {
        return normalizeFeaturedProduct(row, rfn);
      });

      if (featuredProducts.length > 0) {
        out.push({
          id: brand.id,
          name: brand.name || "",
          slug: brand.slug || "",
          logo_url: brand.logo_url || "",
          sort_order: brand.sort_order,
          featured_products: featuredProducts,
        });
      }
    }

    return {
      featuredBrands: out,
      allBrands: brands.map(function (brand) {
        return {
          id: brand.id,
          name: brand.name || "",
          slug: brand.slug || "",
          logo_url: brand.logo_url || "",
          sort_order: brand.sort_order,
          is_active: true,
        };
      }),
    };
  }

  async function fetchFeaturedBrandsWithProducts(productLimitPerBrand) {
    var bundle = await fetchFeaturedBrandsBundle(productLimitPerBrand);
    return bundle.featuredBrands;
  }

  function applyProductFilters(q, filters) {
    filters = filters || {};
    if (filters.brandId) q = q.eq("brand_id", filters.brandId);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    else if (filters.includeCategoryIds && filters.includeCategoryIds.length) {
      q = q.in("category_id", filters.includeCategoryIds);
    }
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

  async function resolveCategoryIds(sb, slugs) {
    if (!slugs || !slugs.length) return [];
    var res = await sb.from("categories").select("id, slug").in("slug", slugs);
    if (res.error) throw res.error;
    return (res.data || []).map(function (row) {
      return row.id;
    });
  }

  async function resolveFilterIds(sb, filters) {
    var out = {
      brandId: filters.brandId || null,
      categoryId: filters.categoryId || null,
      featured: !!filters.featured,
      hot: !!filters.hot,
      bestSeller: !!filters.bestSeller,
      sort: filters.sort || "sort",
      catalogGroup: filters.catalogGroup || "",
    };
    if (filters.brandSlug && !out.brandId) {
      var br = await sb.from("brands").select("id").eq("slug", filters.brandSlug).maybeSingle();
      if (br.data) out.brandId = br.data.id;
    }
    if (filters.categorySlug && !out.categoryId) {
      var ct = await sb.from("categories").select("id").eq("slug", filters.categorySlug).maybeSingle();
      if (ct.data) out.categoryId = ct.data.id;
    }
    if (!out.categoryId && out.catalogGroup === "accumulation") {
      out.includeCategoryIds = await resolveCategoryIds(sb, ACCUMULATION_CATEGORY_SLUGS);
    }
    return out;
  }

  async function fetchProductsPage(filters, page, pageSize, opts) {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var size = pageSize || 24;
    var pg = Math.max(1, page || 1);
    var resolved = await resolveFilterIds(sb, filters || {});
    var rfn = resolveFn();
    var signal = opts && opts.signal;

    var from = (pg - 1) * size;
    var to = from + size - 1;

    var res = await runProductsQuery(
      function (q) {
        q = q.eq("is_active", true);
        q = applyProductFilters(q, resolved);
        q = applyProductSort(q, resolved.sort);
        if (signal && typeof q.abortSignal === "function") q = q.abortSignal(signal);
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

  var DEFAULT_BRAND_SLUGS = ["thang-long-kim-viet", "bao-tin-minh-chau", "bao-tin-manh-hai"];

  var BRAND_DESCRIPTION_FALLBACKS = {
    "thang-long-kim-viet":
      "Thương hiệu kim hoàn tinh xảo, Nhẫn Vàng Kim Việt thể hiện tôn vinh truyền thống và bản sắc văn hóa Việt Nam.",
    "bao-tin-minh-chau":
      "Vàng Rồng Thăng Long, biểu tượng khởi đầu và thịnh vượng trong văn hóa Việt.",
    "bao-tin-manh-hai":
      "Bông sen vàng cùng Kim Gia Bảo — tích lũy tinh tế, gần gũi phong cách Việt.",
  };

  /**
   * Vàng tích lũy — products grouped by brand (vang-mieng, nhan-tron).
   */
  async function fetchAccumulationByBrands() {
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    var rfn = resolveFn();
    var categoryIds = await resolveCategoryIds(sb, ACCUMULATION_CATEGORY_SLUGS);
    if (!categoryIds.length) return [];

    var brandRes = await sb
      .from("brands")
      .select("id, name, slug, description, logo_url, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (brandRes.error) throw brandRes.error;

    var brandsBySlug = {};
    (brandRes.data || []).forEach(function (b) {
      brandsBySlug[b.slug] = b;
    });

    var orderedBrands = DEFAULT_BRAND_SLUGS.map(function (slug, idx) {
      var b = brandsBySlug[slug];
      return {
        id: b && b.id ? b.id : "default-" + slug,
        name: b && b.name ? b.name : slug,
        slug: slug,
        description:
          (b && b.description) ||
          BRAND_DESCRIPTION_FALLBACKS[slug] ||
          "",
        logo_url: b && b.logo_url ? b.logo_url : "",
        sort_order: b && b.sort_order != null ? b.sort_order : idx + 1,
      };
    });

    var out = [];
    var realBrandIds = orderedBrands
      .filter(function (b) {
        return b.id && String(b.id).indexOf("default-") !== 0;
      })
      .map(function (b) {
        return b.id;
      });
    var productsByBrand = {};
    if (realBrandIds.length) {
      var batchRes = await sb
        .from("products")
        .select(PRODUCT_SELECT)
        .in("brand_id", realBrandIds)
        .eq("is_active", true)
        .in("category_id", categoryIds)
        .order("sort_order", { ascending: true });
      if (batchRes.error) throw batchRes.error;
      (batchRes.data || []).forEach(function (row) {
        var bid = row.brand_id;
        if (!bid) return;
        if (!productsByBrand[bid]) productsByBrand[bid] = [];
        productsByBrand[bid].push(row);
      });
    }

    for (var i = 0; i < orderedBrands.length; i += 1) {
      var brand = orderedBrands[i];
      if (!brand.id || String(brand.id).indexOf("default-") === 0) {
        out.push({ brand: brand, products: [] });
        continue;
      }
      out.push({
        brand: brand,
        products: (productsByBrand[brand.id] || []).map(function (row) {
          return normalizeProduct(row, rfn);
        }),
      });
    }
    return out;
  }

  global.TLKVCatalogApi = {
    getSupabaseClient: getSupabaseClient,
    fetchBrandCatalogSections: fetchBrandCatalogSections,
    fetchFeaturedBrandsBundle: fetchFeaturedBrandsBundle,
    fetchFeaturedBrandsWithProducts: fetchFeaturedBrandsWithProducts,
    fetchProductsPage: fetchProductsPage,
    fetchBrandsList: fetchBrandsList,
    fetchCategoriesList: fetchCategoriesList,
    fetchBrandBySlug: fetchBrandBySlug,
    fetchProductBySlugs: fetchProductBySlugs,
    fetchFlatLegacyProducts: fetchFlatLegacyProducts,
    fetchAccumulationByBrands: fetchAccumulationByBrands,
    ACCUMULATION_CATEGORY_SLUGS: ACCUMULATION_CATEGORY_SLUGS,
    JEWELRY_CATEGORY_SLUGS: JEWELRY_CATEGORY_SLUGS,
    normalizeProduct: normalizeProduct,
    normalizeBrand: normalizeBrand,
    parsePriceNumeric:
      global.TLKVProducts && global.TLKVProducts.parsePriceNumeric
        ? global.TLKVProducts.parsePriceNumeric
        : function (t) {
            var d = String(t || "").replace(/[^0-9]/g, "");
            return d ? Number(d) : null;
          },
  };
})(typeof window !== "undefined" ? window : globalThis);
