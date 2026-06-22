(function (global) {
  "use strict";

  var MAX_PRODUCTS_PER_BRAND =
    typeof global.TLKV_PRODUCTS_PER_BRAND_SECTION === "number"
      ? global.TLKV_PRODUCTS_PER_BRAND_SECTION
      : 7;
  var DEFAULT_BRAND_SLUGS = ["thang-long-kim-viet", "bao-tin-manh-hai", "bao-tin-minh-chau"];
  var BTMH_BRAND_SLUG = "bao-tin-manh-hai";

  var state = {
    signature: "",
    brands: [],
    inFlight: null,
    mountedRoot: null,
    goldListenerBound: false,
    productMetaById: Object.create(null),
  };

  function getPriceEngine() {
    return global.TLKVProductPriceEngine || null;
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

  function buildGoldIndexFromRows(rows) {
    var engine = getPriceEngine();
    if (!engine || typeof engine.buildGoldPriceIndex !== "function") return new Map();
    return engine.buildGoldPriceIndex(rows);
  }

  function applyDerivedPricesToStateBrands(rows) {
    var engine = getPriceEngine();
    if (!engine || typeof engine.applyDerivedPricesToBrandRows !== "function") return;
    var index = buildGoldIndexFromRows(rows);
    engine.applyDerivedPricesToBrandRows(state.brands, index);
    rebuildProductMetaIndex();
  }

  function rebuildProductMetaIndex() {
    state.productMetaById = Object.create(null);
    (state.brands || []).forEach(function (brand) {
      (brand.featured_products || []).forEach(function (p) {
        if (!p || !p.id) return;
        state.productMetaById[String(p.id)] = p;
      });
    });
  }

  function formatPriceLabel(priceText) {
    var t = String(priceText || "").trim();
    if (!t) return null;
    if (/^li[eê]n\s*h[eệ]$/i.test(t)) return null;
    if (/^contact$/i.test(t)) return null;
    return t;
  }

  function syncCardPriceDisplay(card, product) {
    if (!card || !product) return;
    var footer = card.querySelector(".tlkv-product-card__footer");
    var priceEl = footer
      ? footer.querySelector(".tlkv-product-card__price--derived")
      : card.querySelector(".tlkv-product-card__price--derived");

    card.querySelectorAll(".tlkv-product-card__content .tlkv-product-card__price").forEach(function (el) {
      el.remove();
    });

    if (product.showPrice !== true) {
      if (priceEl) priceEl.remove();
      card.classList.remove("tlkv-product-card--has-price");
      return;
    }

    var label = formatPriceLabel(product.priceText);
    if (!label) {
      if (priceEl) priceEl.remove();
      card.classList.remove("tlkv-product-card--has-price");
      return;
    }

    if (!priceEl) {
      if (!footer) return;
      var cta = footer.querySelector(".tlkv-product-card__cta");
      priceEl = document.createElement("p");
      priceEl.className = "tlkv-product-card__price tlkv-product-card__price--derived";
      if (cta) {
        footer.insertBefore(priceEl, cta);
      } else {
        footer.appendChild(priceEl);
      }
    }

    priceEl.textContent = label;
    card.classList.add("tlkv-product-card--has-price");
  }

  function patchFeaturedPricesInDom(host) {
    if (!host) return;
    var engine = getPriceEngine();
    if (!engine) return;
    var rows =
      global.TLKVGold && typeof global.TLKVGold.getLastGoldRows === "function"
        ? global.TLKVGold.getLastGoldRows()
        : null;
    if (!rows || !rows.length) return;
    var index = buildGoldIndexFromRows(rows);
    var cards = host.querySelectorAll("[data-tlkv-product-id]");
    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      var id = card.getAttribute("data-tlkv-product-id");
      var product = id ? state.productMetaById[id] : null;
      if (!product) continue;
      var derived = engine.deriveProductPrice(product, index);
      product.isPriceDerived = derived.isDerived;
      product.showPrice = derived.showPrice === true;
      product.priceNumeric = derived.amountVnd;
      product.priceText = derived.showPrice ? derived.priceText : "";
      syncCardPriceDisplay(card, product);
    }
    state.signature = buildSignature(state.brands);
  }

  function finalizeFeaturedPrices(host) {
    if (!host) return;
    var rows = null;
    if (global.TLKVGold && typeof global.TLKVGold.getLastGoldRows === "function") {
      rows = global.TLKVGold.getLastGoldRows();
    }
    if (!rows || !rows.length) return;
    applyDerivedPricesToStateBrands(rows);
    patchFeaturedPricesInDom(host);
  }

  function bindGoldPriceListener() {
    if (state.goldListenerBound) return;
    state.goldListenerBound = true;
    global.addEventListener("tlkv:gold-rows-updated", function (ev) {
      if (!state.mountedRoot) return;
      var rows = ev && ev.detail && ev.detail.rows ? ev.detail.rows : [];
      if (!rows.length && global.TLKVGold && typeof global.TLKVGold.getLastGoldRows === "function") {
        rows = global.TLKVGold.getLastGoldRows() || [];
      }
      if (!rows.length) return;
      var host = state.mountedRoot.querySelector("[data-featured-products-host]") || state.mountedRoot;
      applyDerivedPricesToStateBrands(rows);
      patchFeaturedPricesInDom(host);
    });
  }

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
    return map[slug] || global.TLKV_SITE_LOGO_URL || "/assets/tlkv-logo-mark.png?v=20260623";
  }

  function buildSignature(brands) {
    return JSON.stringify(
      (brands || []).map(function (brand) {
        return {
          id: brand.id,
          count: (brand.featured_products || []).length,
          order: brand.sort_order,
          products: (brand.featured_products || []).map(function (p) {
            return [p.id, p.sortOrder, p.showPrice, p.priceText, p.weight, p.priceSourceProduct];
          }),
        };
      })
    );
  }

  function needsLogoPlate(brand) {
    var slug = String((brand && brand.slug) || "");
    if (global.TLKV_BRAND_NEEDS_LOGO_PLATE) {
      return global.TLKV_BRAND_NEEDS_LOGO_PLATE(slug);
    }
    return slug === "thang-long-kim-viet";
  }

  function createBrandCard(brand) {
    var card = document.createElement("aside");
    card.className = "tlkv-featured-brand-card";

    var logoWrap = document.createElement("div");
    logoWrap.className = "tlkv-featured-brand-card__logo-wrap";
    if (needsLogoPlate(brand)) {
      logoWrap.classList.add("tlkv-brand-logo-plate");
    }

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
        hideCta: true,
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

  function bindProductRailDrag(host) {
    if (!host || host._tlkvFeaturedRailDragBound) return;
    host._tlkvFeaturedRailDragBound = true;

    var drag = null;
    var inertiaId = null;

    function canScroll(track) {
      return track && track.scrollWidth > track.clientWidth + 1;
    }

    function stopInertia() {
      if (inertiaId) {
        cancelAnimationFrame(inertiaId);
        inertiaId = null;
      }
    }

    function runInertia(track, velocity) {
      stopInertia();
      var vx = velocity;
      var step = function () {
        if (Math.abs(vx) < 0.4) {
          inertiaId = null;
          return;
        }
        track.scrollLeft -= vx;
        vx *= 0.92;
        inertiaId = requestAnimationFrame(step);
      };
      inertiaId = requestAnimationFrame(step);
    }

    host.addEventListener("mousedown", function (ev) {
      if (ev.button !== 0) return;
      var track = ev.target.closest(".tlkv-featured-brand-row__products");
      if (!canScroll(track)) return;
      if (ev.target.closest("a, button, input, textarea, select, label")) return;

      stopInertia();
      drag = {
        track: track,
        startX: ev.clientX,
        startScrollLeft: track.scrollLeft,
        lastX: ev.clientX,
        lastTime: Date.now(),
        velocity: 0,
        moved: false,
      };
      track.classList.add("is-dragging");
      ev.preventDefault();
    });

    window.addEventListener("mousemove", function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.startX;
      if (Math.abs(dx) > 4) drag.moved = true;
      drag.track.scrollLeft = drag.startScrollLeft - dx;

      var now = Date.now();
      var dt = now - drag.lastTime;
      if (dt > 0) {
        drag.velocity = ((ev.clientX - drag.lastX) / dt) * 16;
      }
      drag.lastX = ev.clientX;
      drag.lastTime = now;
      ev.preventDefault();
    });

    window.addEventListener("mouseup", function () {
      if (!drag) return;
      var track = drag.track;
      var velocity = drag.velocity;
      var moved = drag.moved;

      track.classList.remove("is-dragging");
      drag = null;

      if (moved) {
        track._tlkvSuppressClick = true;
        window.setTimeout(function () {
          track._tlkvSuppressClick = false;
        }, 150);
        if (Math.abs(velocity) > 0.5) runInertia(track, velocity);
      }
    });

    host.addEventListener(
      "click",
      function (ev) {
        var track = ev.target.closest(".tlkv-featured-brand-row__products");
        if (track && track._tlkvSuppressClick) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      },
      true
    );
  }

  function renderRows(host, brands) {
    host.innerHTML = "";
    if (!brands || !brands.length) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < brands.length; i += 1) {
      frag.appendChild(createBrandRow(brands[i]));
    }
    host.appendChild(frag);
    bindProductRailDrag(host);
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

  function isBongSenVangProduct(product) {
    var name = String((product && product.name) || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return name.indexOf("bong sen vang") >= 0;
  }

  function prioritizeBongSenVangForBtmh(brandRows) {
    (brandRows || []).forEach(function (brand) {
      if (!brand || brand.slug !== BTMH_BRAND_SLUG) return;
      var products = brand.featured_products;
      if (!products || products.length < 2) return;
      var idx = -1;
      for (var i = 0; i < products.length; i += 1) {
        if (isBongSenVangProduct(products[i])) {
          idx = i;
          break;
        }
      }
      if (idx <= 0) return;
      var next = products.slice();
      var featured = next.splice(idx, 1)[0];
      next.unshift(featured);
      brand.featured_products = next;
    });
    return brandRows;
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
    state.inFlight = Promise.all([
      fetchFeaturedBrandsWithProducts(limit),
      fetchBrandsList(),
      resolveGoldRowsForPricing(),
    ])
      .then(function (res) {
        var brands = res[0] || [];
        var allBrands = res[1] || [];
        var goldRows = res[2] || [];
        var rows = prioritizeBongSenVangForBtmh(ensureDefaultBrandRows(brands, allBrands));
        state.inFlight = null;
        state.brands = rows;
        applyDerivedPricesToStateBrands(goldRows);
        state.signature = buildSignature(state.brands);
        return state.brands;
      })
      .catch(function (err) {
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
      state.mountedRoot = root;
      bindGoldPriceListener();
      var brands = await loadFeaturedBrands(limit);
      host.classList.remove("is-loading");

      if (!brands.length) {
        host.classList.add("is-empty");
        return brands;
      }

      renderRows(host, brands);
      finalizeFeaturedPrices(host);
      return brands;
    } catch (err) {
      host.classList.remove("is-loading");
      host.classList.add("is-error");
      host.textContent =
        "Không tải được sản phẩm nổi bật. Vui lòng kiểm tra brands, products (weight, price_source_product) và bảng giá vàng.";
      console.error("[TLKVFeaturedProductsSection]", err);
      return null;
    }
  }

  function refreshIfChanged(containerSelector, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : MAX_PRODUCTS_PER_BRAND;
    return Promise.all([fetchFeaturedBrandsWithProducts(limit), fetchBrandsList(), resolveGoldRowsForPricing()])
      .then(function (res) {
        var next = ensureDefaultBrandRows(res[0] || [], res[1] || []);
        state.brands = next;
        applyDerivedPricesToStateBrands(res[2] || []);
        var nextSig = buildSignature(state.brands);
        if (nextSig === state.signature) return state.brands;
        state.signature = nextSig;
        var root =
          typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
        if (!root) return next;
        var host = root.querySelector("[data-featured-products-host]") || root;
        renderRows(host, state.brands);
        finalizeFeaturedPrices(host);
        return state.brands;
      })
      .catch(function (err) {
        console.warn("[TLKVFeaturedProductsSection] refresh skipped:", err);
        return null;
      });
  }

  async function refreshDerivedPrices() {
    var rows = await resolveGoldRowsForPricing();
    applyDerivedPricesToStateBrands(rows);
    state.signature = buildSignature(state.brands);
    return state.brands;
  }

  global.TLKVFeaturedProductsSection = {
    fetchFeaturedBrandsWithProducts: fetchFeaturedBrandsWithProducts,
    loadFeaturedBrands: loadFeaturedBrands,
    getBrandRows: function () {
      return state.brands;
    },
    refreshDerivedPrices: refreshDerivedPrices,
    mountFeaturedProductsSection: mountFeaturedProductsSection,
    refreshIfChanged: refreshIfChanged,
    patchFeaturedPricesInDom: patchFeaturedPricesInDom,
    finalizeFeaturedPrices: finalizeFeaturedPrices,
    createBrandRow: createBrandRow,
    createBrandCard: createBrandCard,
    createProductCarousel: createProductCarousel,
  };
})(typeof window !== "undefined" ? window : globalThis);
