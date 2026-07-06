(function (global) {
  "use strict";

  var DEFAULT_BRAND_SLUGS = ["thang-long-kim-viet", "bao-tin-minh-chau", "bao-tin-manh-hai"];
  var CHI_TO_GRAM = 3.75;
  var STORAGE_KEY = "tlkv-vtl-active-brand";

  var BRAND_DESCRIPTIONS = {
    "thang-long-kim-viet":
      "Thương hiệu kim hoàn tinh xảo, Nhẫn Vàng Kim Việt thể hiện tôn vinh truyền thống và bản sắc văn hóa Việt Nam.",
    "bao-tin-minh-chau":
      "Vàng Rồng Thăng Long, biểu tượng khởi đầu và thịnh vượng trong văn hóa Việt.",
    "bao-tin-manh-hai":
      "Bông sen vàng cùng Kim Gia Bảo - tích lũy tinh tế, gần gũi phong cách Việt.",
  };

  var state = {
    sections: [],
    productsByBrand: Object.create(null),
    activeBrand: DEFAULT_BRAND_SLUGS[0],
    filter: {
      q: "",
      sort: "sort",
    },
    toolbarReady: false,
    searchTimer: null,
    loading: false,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function cloneProduct(product) {
    return Object.assign({}, product);
  }

  function resolveImageSrc(product) {
    if (global.TLKVProducts && typeof global.TLKVProducts.resolveProductImageSrc === "function") {
      return global.TLKVProducts.resolveProductImageSrc(product.thumbnailUrl || product.image);
    }
    var s = String(product.thumbnailUrl || product.image || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return s;
    return "/assets/" + s.replace(/^assets\//, "");
  }

  function getBrandLogoUrl(brand) {
    if (brand && brand.logo_url) return brand.logo_url;
    var map = global.TLKV_BRAND_LOGO_FALLBACKS || {};
    return map[brand.slug] || global.TLKV_SITE_LOGO_URL || "/assets/tlkv-logo-mark.png?v=20260623";
  }

  function formatWeightLabel(weight) {
    var w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return "";
    var grams = w * CHI_TO_GRAM;
    var gramsText = Number.isInteger(grams) ? String(grams) : grams.toFixed(3).replace(/\.?0+$/, "");
    return w + " chỉ (" + gramsText + "g)";
  }

  function formatPriceLabel(product) {
    if (!product || product.showPrice !== true) return "";
    var t = String(product.priceText || "").trim();
    if (!t) return "";
    if (/^li[eê]n\s*h[eệ]$/i.test(t)) return "";
    if (/^contact$/i.test(t)) return "";
    return t;
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

  function buildSectionsFromAccumulation(rows) {
    state.productsByBrand = Object.create(null);
    return DEFAULT_BRAND_SLUGS.map(function (slug) {
      var entry = (rows || []).find(function (row) {
        return row && row.brand && row.brand.slug === slug;
      });
      var brand = entry
        ? Object.assign({}, entry.brand, {
            description: entry.brand.description || BRAND_DESCRIPTIONS[slug] || "",
          })
        : {
            id: "default-" + slug,
            name: slug,
            slug: slug,
            logo_url: "",
            description: BRAND_DESCRIPTIONS[slug] || "",
          };
      var products = ((entry && entry.products) || []).map(function (product) {
        var copy = cloneProduct(product);
        copy.brandSlug = slug;
        copy.brandName = brand.name;
        return copy;
      });
      state.productsByBrand[slug] = products;
      return { brand: brand, products: products };
    });
  }

  function buildSectionsFromBrandRows(brandRows, allBrands) {
    state.productsByBrand = Object.create(null);
    var bySlug = {};
    (allBrands || []).forEach(function (brand) {
      if (brand && brand.slug) bySlug[brand.slug] = brand;
    });

    return DEFAULT_BRAND_SLUGS.map(function (slug, idx) {
      var meta = bySlug[slug] || {};
      var row = (brandRows || []).find(function (b) {
        return b && b.slug === slug;
      });
      var brand = {
        id: (row && row.id) || meta.id || "default-" + slug,
        name: (row && row.name) || meta.name || slug,
        slug: slug,
        logo_url: (row && row.logo_url) || meta.logo_url || "",
        description: BRAND_DESCRIPTIONS[slug] || (meta.description || ""),
      };
      var products = ((row && row.featured_products) || []).map(function (product) {
        var copy = cloneProduct(product);
        copy.brandSlug = slug;
        copy.brandName = brand.name;
        return copy;
      });
      state.productsByBrand[slug] = products;
      return { brand: brand, products: products };
    });
  }

  function applyDerivedPricesToAllSections(goldRows) {
    var engine = global.TLKVProductPriceEngine;
    if (!engine || typeof engine.applyDerivedPrices !== "function") return;

    var rows = goldRows;
    if (!rows || !rows.length) {
      rows =
        global.TLKVGold && typeof global.TLKVGold.getLastGoldRows === "function"
          ? global.TLKVGold.getLastGoldRows() || []
          : [];
    }
    if (!rows.length) return;

    var index = engine.buildGoldPriceIndex(rows);
    DEFAULT_BRAND_SLUGS.forEach(function (slug) {
      if (state.productsByBrand[slug]) {
        engine.applyDerivedPrices(state.productsByBrand[slug], index);
      }
    });
    state.sections.forEach(function (section) {
      var slug = section.brand.slug;
      section.products = state.productsByBrand[slug] || [];
    });
  }

  function getSectionBySlug(slug) {
    for (var i = 0; i < state.sections.length; i += 1) {
      if (state.sections[i].brand.slug === slug) return state.sections[i];
    }
    return null;
  }

  function readBrandFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get("brand");
    if (fromQuery && DEFAULT_BRAND_SLUGS.indexOf(fromQuery) >= 0) return fromQuery;
    try {
      var stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && DEFAULT_BRAND_SLUGS.indexOf(stored) >= 0) return stored;
    } catch (_) {}
    return DEFAULT_BRAND_SLUGS[0];
  }

  function readFilterFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var sortRaw = String(params.get("sort") || "").trim().toLowerCase();
    var sort = ["price_asc", "price_desc", "newest", "sort"].indexOf(sortRaw) >= 0 ? sortRaw : "sort";
    return {
      q: String(params.get("q") || "").trim(),
      sort: sort,
    };
  }

  function writeFilterToUrl(replace) {
    var url = new URL(window.location.href);
    var f = state.filter;

    if (f.q) url.searchParams.set("q", f.q);
    else url.searchParams.delete("q");

    if (f.sort && f.sort !== "sort") url.searchParams.set("sort", f.sort);
    else url.searchParams.delete("sort");

    if (replace) window.history.replaceState(null, "", url.toString());
    else window.history.pushState(null, "", url.toString());
  }

  function persistActiveBrand(slug) {
    try {
      sessionStorage.setItem(STORAGE_KEY, slug);
    } catch (_) {}
    var url = new URL(window.location.href);
    if (slug === DEFAULT_BRAND_SLUGS[0]) {
      url.searchParams.delete("brand");
    } else {
      url.searchParams.set("brand", slug);
    }
    window.history.replaceState(null, "", url.toString());
  }

  function productSortValue(product, sort) {
    if (sort === "price_asc" || sort === "price_desc") {
      if (product.priceNumeric != null && Number.isFinite(Number(product.priceNumeric))) {
        return Number(product.priceNumeric);
      }
      return null;
    }
    if (sort === "newest") {
      return product.sortOrder != null ? Number(product.sortOrder) : 0;
    }
    return product.sortOrder != null ? Number(product.sortOrder) : 0;
  }

  function sortProducts(items, sort) {
    var list = items.slice();
    list.sort(function (a, b) {
      if (sort === "price_asc") {
        var pa = productSortValue(a, sort);
        var pb = productSortValue(b, sort);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      }
      if (sort === "price_desc") {
        var pda = productSortValue(a, sort);
        var pdb = productSortValue(b, sort);
        if (pda == null && pdb == null) return 0;
        if (pda == null) return 1;
        if (pdb == null) return -1;
        return pdb - pda;
      }
      if (sort === "newest") {
        var sa = productSortValue(a, sort);
        var sb = productSortValue(b, sort);
        if (sa !== sb) return sb - sa;
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      var oa = a.sortOrder != null ? Number(a.sortOrder) : 0;
      var ob = b.sortOrder != null ? Number(b.sortOrder) : 0;
      if (oa !== ob) return oa - ob;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true });
    });
    return list;
  }

  function applyFilters(products) {
    var items = (products || []).slice();
    if (
      state.filter.q &&
      global.TLKVCatalogFilters &&
      typeof global.TLKVCatalogFilters.clientFilterByQuery === "function"
    ) {
      items = global.TLKVCatalogFilters.clientFilterByQuery(items, state.filter.q);
    }
    return sortProducts(items, state.filter.sort);
  }

  function createProductCard(product) {
    var card = document.createElement("li");
    card.className = "vtl-product-card";
    if (product && product.id) card.setAttribute("data-tlkv-product-id", String(product.id));

    var media = document.createElement("div");
    media.className = "vtl-product-card__media";
    var img = document.createElement("img");
    img.className = "vtl-product-card__img";
    img.src = resolveImageSrc(product);
    img.alt = product.name || "Sản phẩm vàng tích lũy";
    img.loading = "lazy";
    img.decoding = "async";
    media.appendChild(img);

    var body = document.createElement("div");
    body.className = "vtl-product-card__body";

    var name = document.createElement("p");
    name.className = "vtl-product-card__name";
    name.textContent = product.name || "";

    var weight = document.createElement("p");
    weight.className = "vtl-product-card__weight";
    weight.textContent = formatWeightLabel(product.weight);

    var priceLabel = formatPriceLabel(product);
    var price = document.createElement("p");
    price.className = "vtl-product-card__price";
    if (priceLabel) price.textContent = priceLabel;

    body.appendChild(name);
    if (weight.textContent) body.appendChild(weight);
    if (priceLabel) body.appendChild(price);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function needsLogoPlate(brand) {
    var slug = String((brand && brand.slug) || "");
    if (global.TLKV_BRAND_NEEDS_LOGO_PLATE) {
      return global.TLKV_BRAND_NEEDS_LOGO_PLATE(slug);
    }
    return slug === "thang-long-kim-viet";
  }

  function renderBrandHead(brand) {
    var headEl = $("#vtl-brand-head");
    if (!headEl) return;

    headEl.innerHTML = "";
    headEl.className = "vtl-brand-view__head";

    var logo = document.createElement("img");
    logo.className = "vtl-brand-view__logo";
    if (needsLogoPlate(brand)) {
      logo.classList.add("tlkv-brand-logo-plate");
    }
    logo.src = getBrandLogoUrl(brand);
    logo.alt = brand.name || "";
    logo.loading = "lazy";

    var copy = document.createElement("div");
    copy.className = "vtl-brand-view__copy";

    var title = document.createElement("h2");
    title.className = "vtl-brand-view__title";
    title.textContent = brand.name || "";

    var desc = document.createElement("p");
    desc.className = "vtl-brand-view__desc";
    desc.textContent = brand.description || "";

    copy.appendChild(title);
    if (desc.textContent) copy.appendChild(desc);
    headEl.appendChild(logo);
    headEl.appendChild(copy);
  }

  function getProductsForBrand(slug) {
    var key = slug || state.activeBrand;
    var list = state.productsByBrand[key];
    if (!Array.isArray(list)) return [];
    return list.map(cloneProduct);
  }

  function renderProductGrid(products) {
    var host = $("#vtl-product-grid-host");
    if (!host) return;

    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
    host.className = "vtl-brand-view";
    host.setAttribute("role", "tabpanel");
    host.setAttribute("data-active-brand", state.activeBrand);

    var section = getSectionBySlug(state.activeBrand);
    if (section) {
      host.setAttribute("aria-labelledby", "vtl-tab-" + section.brand.slug);
    }

    var filtered = applyFilters(products);

    if (!filtered.length) {
      var empty = document.createElement("p");
      empty.className = "vtl-empty";
      empty.textContent = products.length
        ? "Không có sản phẩm phù hợp bộ lọc."
        : "Chưa có sản phẩm vàng tích lũy cho thương hiệu này.";
      host.appendChild(empty);
      return;
    }

    var grid = document.createElement("ul");
    grid.className = "vtl-product-grid";
    var frag = document.createDocumentFragment();
    filtered.forEach(function (product) {
      frag.appendChild(createProductCard(product));
    });
    grid.appendChild(frag);
    host.appendChild(grid);
  }

  function patchProductPricesInDom() {
    var host = $("#vtl-product-grid-host");
    if (!host) return;
    var cards = host.querySelectorAll("[data-tlkv-product-id]");
    if (!cards.length) return;
    cards.forEach(function (card) {
      var id = card.getAttribute("data-tlkv-product-id");
      if (!id) return;
      var product = null;
      var slug = state.activeBrand;
      var list = state.productsByBrand[slug] || [];
      for (var i = 0; i < list.length; i += 1) {
        if (String(list[i].id) === String(id)) {
          product = list[i];
          break;
        }
      }
      if (!product) return;
      var priceEl = card.querySelector(".vtl-product-card__price");
      var label = formatPriceLabel(product);
      if (!priceEl && label) {
        var body = card.querySelector(".vtl-product-card__body");
        if (body) {
          priceEl = document.createElement("p");
          priceEl.className = "vtl-product-card__price";
          body.appendChild(priceEl);
        }
      }
      if (priceEl) {
        if (label) {
          priceEl.textContent = label;
          priceEl.hidden = false;
        } else {
          priceEl.textContent = "";
          priceEl.hidden = true;
        }
      }
    });
  }

  function renderBrandView() {
    var toolbarEl = $("#vtl-filter-toolbar");
    var section = getSectionBySlug(state.activeBrand);

    if (!section) {
      var headEl = $("#vtl-brand-head");
      var host = $("#vtl-product-grid-host");
      if (headEl) headEl.innerHTML = "";
      if (host) {
        host.innerHTML = '<p class="vtl-empty">Không tìm thấy thương hiệu.</p>';
      }
      if (toolbarEl) toolbarEl.hidden = true;
      return;
    }

    renderBrandHead(section.brand);
    if (toolbarEl) toolbarEl.hidden = false;
    syncFilterFormFromState();
    renderProductGrid(getProductsForBrand(state.activeBrand));
  }

  function renderBrandTabs() {
    var tabsEl = $("#vtl-brand-tabs");
    if (!tabsEl) return;

    tabsEl.innerHTML = "";
    var frag = document.createDocumentFragment();

    state.sections.forEach(function (section) {
      var slug = section.brand.slug;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vtl-brand-tab" + (slug === state.activeBrand ? " is-active" : "");
      btn.id = "vtl-tab-" + slug;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", slug === state.activeBrand ? "true" : "false");
      btn.setAttribute("aria-controls", "vtl-product-grid-host");
      btn.setAttribute("data-brand-slug", slug);

      var logo = document.createElement("img");
      logo.className = "vtl-brand-tab__logo";
      if (needsLogoPlate(section.brand)) {
        logo.classList.add("tlkv-brand-logo-plate");
      }
      logo.src = getBrandLogoUrl(section.brand);
      logo.alt = "";
      logo.loading = "lazy";

      var label = document.createElement("span");
      label.className = "vtl-brand-tab__label";
      label.textContent = section.brand.name || slug;

      btn.appendChild(logo);
      btn.appendChild(label);

      btn.addEventListener("click", (function (targetSlug) {
        return function () {
          if (state.activeBrand === targetSlug) return;
          state.activeBrand = targetSlug;
          persistActiveBrand(targetSlug);
          renderBrandTabs();
          renderBrandView();
        };
      })(slug));

      frag.appendChild(btn);
    });

    tabsEl.appendChild(frag);
  }

  function renderAll() {
    renderBrandTabs();
    renderBrandView();
  }

  function readFormIntoFilterState() {
    state.filter.q = ($("#vtl-filter-q") && $("#vtl-filter-q").value.trim()) || "";
    state.filter.sort = ($("#vtl-filter-sort") && $("#vtl-filter-sort").value) || "sort";
  }

  function syncFilterFormFromState() {
    var f = state.filter;
    var qIn = $("#vtl-filter-q");
    if (qIn) qIn.value = f.q || "";

    var sortSel = $("#vtl-filter-sort");
    if (sortSel) sortSel.value = f.sort || "sort";
  }

  function applyFilterAndRender(replaceUrl) {
    readFormIntoFilterState();
    writeFilterToUrl(replaceUrl !== false);
    renderBrandView();
  }

  function bindFilterToolbar() {
    if (state.toolbarReady) return;
    state.toolbarReady = true;

    var sortSel = $("#vtl-filter-sort");
    if (sortSel) {
      sortSel.addEventListener("change", function () {
        applyFilterAndRender(false);
      });
    }

    var qIn = $("#vtl-filter-q");
    if (qIn) {
      qIn.addEventListener("input", function () {
        if (state.searchTimer) clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(function () {
          applyFilterAndRender(true);
        }, 280);
      });
      qIn.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (state.searchTimer) clearTimeout(state.searchTimer);
          applyFilterAndRender(false);
        }
      });
    }
  }

  async function fetchSectionsData() {
    if (!global.TLKVCatalogApi) {
      throw new Error("Thiếu TLKVCatalogApi.");
    }

    var useAccumulation = typeof global.TLKVCatalogApi.fetchAccumulationByBrands === "function";
    var productPromise = useAccumulation
      ? global.TLKVCatalogApi.fetchAccumulationByBrands()
      : Promise.all([
          global.TLKVCatalogApi.fetchFeaturedBrandsWithProducts(0),
          global.TLKVCatalogApi.fetchBrandsList(),
        ]);

    var results = await Promise.all([productPromise, resolveGoldRowsForPricing()]);
    var productResult = results[0];
    var goldRows = results[1] || [];

    if (useAccumulation) {
      state.sections = buildSectionsFromAccumulation(productResult);
    } else {
      state.sections = buildSectionsFromBrandRows(productResult[0], productResult[1]);
    }

    applyDerivedPricesToAllSections(goldRows);
  }

  async function loadAndRender() {
    if (state.loading) return;
    state.loading = true;
    var panelEl = $("#vtl-showcase-panel");
    if (panelEl) panelEl.classList.add("is-loading");

    try {
      await fetchSectionsData();
      state.activeBrand = readBrandFromUrl();
      if (!getSectionBySlug(state.activeBrand)) {
        state.activeBrand = DEFAULT_BRAND_SLUGS[0];
      }
      renderAll();
    } catch (err) {
      console.error("[TLKVAccumulationPage]", err);
      var host = $("#vtl-product-grid-host");
      if (host) {
        host.innerHTML =
          '<p class="vtl-empty">Không tải được danh sách vàng tích lũy. Vui lòng thử lại sau.</p>';
      }
    } finally {
      state.loading = false;
      if (panelEl) panelEl.classList.remove("is-loading");
    }
  }

  function bindListeners() {
    global.addEventListener("tlkv:gold-rows-updated", function (ev) {
      var rows = ev && ev.detail && ev.detail.rows ? ev.detail.rows : null;
      applyDerivedPricesToAllSections(rows);
      patchProductPricesInDom();
    });

    global.addEventListener("tlkv:products-changed", loadAndRender);

    window.addEventListener("popstate", function () {
      state.filter = readFilterFromUrl();
      syncFilterFormFromState();
      var next = readBrandFromUrl();
      if (next !== state.activeBrand) {
        state.activeBrand = next;
        renderBrandTabs();
      }
      renderBrandView();
    });
  }

  async function mountAccumulationPage() {
    state.filter = readFilterFromUrl();
    bindFilterToolbar();
    bindListeners();
    await loadAndRender();
  }

  global.TLKVAccumulationPage = {
    mountAccumulationPage: mountAccumulationPage,
    loadAndRender: loadAndRender,
  };
})(typeof window !== "undefined" ? window : globalThis);
