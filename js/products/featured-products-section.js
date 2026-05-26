(function (global) {
  "use strict";

  var MAX_PRODUCTS_PER_BRAND =
    typeof global.TLKV_PRODUCTS_PER_BRAND_SECTION === "number"
      ? global.TLKV_PRODUCTS_PER_BRAND_SECTION
      : 6;
  var DEFAULT_BRAND_SLUGS = ["thang-long-kim-viet", "bao-tin-manh-hai", "bao-tin-minh-chau"];

  var state = {
    signature: "",
    brands: [],
    inFlight: null,
  };

  function resolveImageSrc(image) {
    if (global.TLKVProducts && typeof global.TLKVProducts.resolveProductImageSrc === "function") {
      return global.TLKVProducts.resolveProductImageSrc(image);
    }
    var s = String(image || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.includes("supabase.co/storage/v1/object/public/")) return s;
    if (s.startsWith("/")) return s;
    if (s.startsWith("assets/")) return "/" + s;
    return "/assets/" + s;
  }

  function getBrandLogoUrl(brand) {
    if (brand && brand.logo_url) return String(brand.logo_url);
    var slug = String((brand && brand.slug) || "");
    var map = global.TLKV_BRAND_LOGO_FALLBACKS || {};
    return map[slug] || "/assets/logo-thang-long-kim-viet.png";
  }

  function buildSignature(brands) {
    return JSON.stringify(
      (brands || []).map(function (brand) {
        return {
          id: brand.id,
          count: (brand.featured_products || []).length,
          order: brand.sort_order,
          products: (brand.featured_products || []).map(function (p) {
            return [p.id, p.sortOrder, p.priceText];
          }),
        };
      })
    );
  }

  function createBrandCard(brand) {
    var card = document.createElement("aside");
    card.className = "tlkv-featured-brand-card";

    var logoWrap = document.createElement("div");
    logoWrap.className = "tlkv-featured-brand-card__logo-wrap";

    var logo = document.createElement("img");
    logo.className = "tlkv-featured-brand-card__logo";
    logo.src = getBrandLogoUrl(brand);
    logo.alt = brand.name || "Thương hiệu";
    logo.loading = "lazy";
    logo.decoding = "async";
    logoWrap.appendChild(logo);

    var name = document.createElement("h3");
    name.className = "tlkv-featured-brand-card__name";
    name.textContent = brand.name || "";

    card.appendChild(logoWrap);
    card.appendChild(name);
    return card;
  }

  function createProductCarousel(products) {
    var rail = document.createElement("div");
    rail.className = "tlkv-featured-product-carousel";
    rail.setAttribute("role", "list");
    rail.setAttribute("aria-label", "Sản phẩm nổi bật");

    var createCard =
      global.TLKVProductCard && typeof global.TLKVProductCard.createProductCard === "function"
        ? global.TLKVProductCard.createProductCard
        : null;

    if (!createCard) return rail;

    (products || []).forEach(function (product) {
      var card = createCard(product, {
        cardVariant: "showcase",
        resolveImage: resolveImageSrc,
      });
      card.classList.add("tlkv-featured-product-card");
      rail.appendChild(card);
    });

    return rail;
  }

  function createEmptyProductsState() {
    var empty = document.createElement("div");
    empty.className = "tlkv-featured-product-empty";
    empty.textContent = "Hiện tại chưa có sản phẩm nổi bật.";
    return empty;
  }

  function createBrandRow(brand) {
    var row = document.createElement("article");
    row.className = "tlkv-featured-brand-row";
    row.setAttribute("aria-label", brand.name || "Thương hiệu");

    var brandCard = createBrandCard(brand);
    var productsWrap = document.createElement("div");
    productsWrap.className = "tlkv-featured-brand-row__products";
    var products = brand.featured_products || [];
    if (products.length > 0) {
      productsWrap.appendChild(createProductCarousel(products));
    } else {
      productsWrap.appendChild(createEmptyProductsState());
    }

    row.appendChild(brandCard);
    row.appendChild(productsWrap);
    return row;
  }

  function renderRows(host, brands) {
    host.innerHTML = "";
    if (!brands || !brands.length) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < brands.length; i += 1) {
      frag.appendChild(createBrandRow(brands[i]));
    }
    host.appendChild(frag);
  }

  async function fetchFeaturedBrandsWithProducts(limit) {
    if (!global.TLKVCatalogApi || typeof global.TLKVCatalogApi.fetchFeaturedBrandsWithProducts !== "function") {
      throw new Error("Thiếu TLKVCatalogApi.fetchFeaturedBrandsWithProducts.");
    }
    return global.TLKVCatalogApi.fetchFeaturedBrandsWithProducts(limit);
  }

  async function fetchBrandsList() {
    if (!global.TLKVCatalogApi || typeof global.TLKVCatalogApi.fetchBrandsList !== "function") return [];
    try {
      return await global.TLKVCatalogApi.fetchBrandsList();
    } catch (_) {
      return [];
    }
  }

  function normalizeDefaultBrands(allBrands) {
    var bySlug = {};
    (allBrands || []).forEach(function (brand) {
      if (!brand || !brand.slug) return;
      bySlug[String(brand.slug)] = brand;
    });

    return DEFAULT_BRAND_SLUGS.map(function (slug, idx) {
      var brand = bySlug[slug] || null;
      return {
        id: brand && brand.id ? brand.id : "default-" + slug,
        name: brand && brand.name ? brand.name : slug,
        slug: slug,
        logo_url: brand && brand.logo_url ? brand.logo_url : "",
        sort_order: brand && brand.sort_order != null ? brand.sort_order : idx + 1,
        featured_products: [],
      };
    });
  }

  function ensureDefaultBrandRows(featuredBrands, allBrands) {
    var defaults = normalizeDefaultBrands(allBrands);
    var bySlug = {};

    defaults.forEach(function (brand) {
      bySlug[brand.slug] = brand;
    });

    (featuredBrands || []).forEach(function (brand) {
      if (!brand || !brand.slug) return;
      if (bySlug[brand.slug]) {
        bySlug[brand.slug] = {
          id: brand.id || bySlug[brand.slug].id,
          name: brand.name || bySlug[brand.slug].name,
          slug: brand.slug,
          logo_url: brand.logo_url || bySlug[brand.slug].logo_url,
          sort_order: brand.sort_order != null ? brand.sort_order : bySlug[brand.slug].sort_order,
          featured_products: brand.featured_products || [],
        };
      }
    });

    return Object.keys(bySlug)
      .map(function (slug) {
        return bySlug[slug];
      })
      .sort(function (a, b) {
        var sa = a.sort_order != null ? Number(a.sort_order) : 0;
        var sb = b.sort_order != null ? Number(b.sort_order) : 0;
        if (sa !== sb) return sa - sb;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }

  async function loadFeaturedBrands(limit) {
    if (state.inFlight) return state.inFlight;
    state.inFlight = Promise.all([fetchFeaturedBrandsWithProducts(limit), fetchBrandsList()]).then(function (res) {
      var brands = res[0] || [];
      var allBrands = res[1] || [];
      var rows = ensureDefaultBrandRows(brands, allBrands);
      state.inFlight = null;
      state.brands = rows;
      state.signature = buildSignature(state.brands);
      return state.brands;
    }).catch(function (err) {
      state.inFlight = null;
      throw err;
    });
    return state.inFlight;
  }

  async function mountFeaturedProductsSection(containerSelector, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : MAX_PRODUCTS_PER_BRAND;
    var root =
      typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
    if (!root) return null;

    var host = root.querySelector("[data-featured-products-host]") || root;
    host.innerHTML = "";
    host.classList.remove("is-loading", "is-empty", "is-error");
    host.classList.add("is-loading");

    try {
      var brands = await loadFeaturedBrands(limit);
      host.classList.remove("is-loading");

      if (!brands.length) {
        host.classList.add("is-empty");
        return brands;
      }

      renderRows(host, brands);
      return brands;
    } catch (err) {
      host.classList.remove("is-loading");
      host.classList.add("is-error");
      host.textContent =
        "Không tải được sản phẩm nổi bật. Vui lòng kiểm tra dữ liệu brands và nguồn sản phẩm (gold_meta/products).";
      console.error("[TLKVFeaturedProductsSection]", err);
      return null;
    }
  }

  function refreshIfChanged(containerSelector, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : MAX_PRODUCTS_PER_BRAND;
    return Promise.all([fetchFeaturedBrandsWithProducts(limit), fetchBrandsList()])
      .then(function (res) {
        var next = ensureDefaultBrandRows(res[0] || [], res[1] || []);
        var nextSig = buildSignature(next);
        if (nextSig === state.signature) return next;
        state.brands = next;
        state.signature = nextSig;
        var root =
          typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
        if (!root) return next;
        var host = root.querySelector("[data-featured-products-host]") || root;
        renderRows(host, next);
        return next;
      })
      .catch(function (err) {
        console.warn("[TLKVFeaturedProductsSection] refresh skipped:", err);
        return null;
      });
  }

  global.TLKVFeaturedProductsSection = {
    fetchFeaturedBrandsWithProducts: fetchFeaturedBrandsWithProducts,
    mountFeaturedProductsSection: mountFeaturedProductsSection,
    refreshIfChanged: refreshIfChanged,
    createBrandRow: createBrandRow,
    createBrandCard: createBrandCard,
    createProductCarousel: createProductCarousel,
  };
})(typeof window !== "undefined" ? window : globalThis);
