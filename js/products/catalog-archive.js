(function (global) {
  "use strict";

  var STATE = { page: 1, brandSlug: "", categorySlug: "", featured: false, hot: false, bestSeller: false, sort: "sort", q: "" };
  var lastRenderedItems = [];
  var goldListenerBound = false;

  function $(sel) {
    return document.querySelector(sel);
  }

  function renderPagination(container, total, page, pageSize) {
    if (!container) return;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    container.innerHTML = "";
    if (pages <= 1) return;

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "tlkv-catalog-page-btn";
    prev.textContent = "← Trước";
    prev.disabled = page <= 1;
    prev.addEventListener("click", function () {
      STATE.page = Math.max(1, page - 1);
      global.TLKVCatalogFilters.writeUrlState(STATE, false);
      loadAndRender();
    });

    var info = document.createElement("span");
    info.className = "tlkv-catalog-page-info";
    info.textContent = "Trang " + page + " / " + pages;

    var next = document.createElement("button");
    next.type = "button";
    next.className = "tlkv-catalog-page-btn";
    next.textContent = "Sau →";
    next.disabled = page >= pages;
    next.addEventListener("click", function () {
      STATE.page = Math.min(pages, page + 1);
      global.TLKVCatalogFilters.writeUrlState(STATE, false);
      loadAndRender();
    });

    container.appendChild(prev);
    container.appendChild(info);
    container.appendChild(next);
  }

  function formatPriceLabel(priceText) {
    var t = String(priceText || "").trim();
    if (!t) return null;
    if (/^li[eê]n\s*h[eệ]$/i.test(t)) return null;
    if (/^contact$/i.test(t)) return null;
    return t;
  }

  async function applyDerivedPricesToItems(items, goldRows) {
    var engine = global.TLKVProductPriceEngine;
    if (!engine || typeof engine.applyDerivedPricesFromRows !== "function") return items;
    var rows = goldRows;
    if (!rows || !rows.length) {
      if (typeof engine.resolveGoldRowsForPricing === "function") {
        rows = await engine.resolveGoldRowsForPricing();
      }
    }
    if (!rows || !rows.length) return items;
    engine.applyDerivedPricesFromRows(items, rows);
    return items;
  }

  function patchProductPricesInDom(items) {
    var listEl = $("#product-list");
    if (!listEl) return;
    var byId = Object.create(null);
    (items || []).forEach(function (p) {
      if (p && p.id != null) byId[String(p.id)] = p;
    });
    listEl.querySelectorAll("[data-tlkv-product-id]").forEach(function (card) {
      var id = card.getAttribute("data-tlkv-product-id");
      var product = id ? byId[id] : null;
      if (!product) return;
      var label = product.showPrice === true ? formatPriceLabel(product.priceText) : null;
      var priceEl = card.querySelector(".tlkv-product-card__price--derived, .tlkv-product-card__price");
      if (label) {
        if (!priceEl) {
          var footer = card.querySelector(".tlkv-product-card__footer");
          var body = card.querySelector(".tlkv-product-card__body");
          var host = footer || body;
          if (!host) return;
          priceEl = document.createElement("p");
          priceEl.className = "tlkv-product-card__price tlkv-product-card__price--derived";
          var cta = host.querySelector(".tlkv-product-card__cta");
          if (cta) host.insertBefore(priceEl, cta);
          else host.appendChild(priceEl);
        }
        priceEl.textContent = label;
        priceEl.hidden = false;
        card.classList.add("tlkv-product-card--has-price");
      } else if (priceEl) {
        priceEl.remove();
        card.classList.remove("tlkv-product-card--has-price");
      }
    });
  }

  function bindGoldPriceListener() {
    if (goldListenerBound) return;
    goldListenerBound = true;
    global.addEventListener("tlkv:gold-rows-updated", function (ev) {
      var rows = ev && ev.detail && ev.detail.rows ? ev.detail.rows : null;
      if (!lastRenderedItems.length) return;
      applyDerivedPricesToItems(lastRenderedItems, rows).then(function () {
        patchProductPricesInDom(lastRenderedItems);
      });
    });
  }

  function renderGrid(container, items) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "tlkv-catalog-root";
    lastRenderedItems = items || [];

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "tlkv-product-empty";
      empty.textContent = "Không có sản phẩm phù hợp bộ lọc.";
      container.appendChild(empty);
      return;
    }

    if (global.TLKVProductGrid) {
      container.appendChild(global.TLKVProductGrid.createProductGrid(items));
    }
  }

  async function populateFilterSelects() {
    if (!global.TLKVCatalogApi) return;
    var brands = await global.TLKVCatalogApi.fetchBrandsList();
    var cats = await global.TLKVCatalogApi.fetchCategoriesList();

    var brandSel = $("#catalog-filter-brand");
    if (brandSel) {
      brandSel.innerHTML = '<option value="">Tất cả thương hiệu</option>';
      brands
        .filter(function (b) {
          return b.is_active !== false;
        })
        .forEach(function (b) {
          var o = document.createElement("option");
          o.value = b.slug;
          o.textContent = b.name;
          if (STATE.brandSlug === b.slug) o.selected = true;
          brandSel.appendChild(o);
        });
    }

    var catSel = $("#catalog-filter-category");
    if (catSel) {
      catSel.innerHTML = '<option value="">Tất cả danh mục</option>';
      cats
        .filter(function (c) {
          return c.is_active !== false;
        })
        .forEach(function (c) {
          var o = document.createElement("option");
          o.value = c.slug;
          o.textContent = c.name;
          if (STATE.categorySlug === c.slug) o.selected = true;
          catSel.appendChild(o);
        });
    }

    var sortSel = $("#catalog-filter-sort");
    if (sortSel) sortSel.value = STATE.sort || "sort";

    var qIn = $("#catalog-filter-q");
    if (qIn) qIn.value = STATE.q || "";

    ["featured", "hot", "bestseller"].forEach(function (key) {
      var el = document.getElementById("catalog-filter-" + key);
      if (!el) return;
      if (key === "featured") el.checked = !!STATE.featured;
      if (key === "hot") el.checked = !!STATE.hot;
      if (key === "bestseller") el.checked = !!STATE.bestSeller;
    });
  }

  function readFormIntoState() {
    STATE.brandSlug = ($("#catalog-filter-brand") && $("#catalog-filter-brand").value) || "";
    STATE.categorySlug = ($("#catalog-filter-category") && $("#catalog-filter-category").value) || "";
    STATE.sort = ($("#catalog-filter-sort") && $("#catalog-filter-sort").value) || "sort";
    STATE.q = ($("#catalog-filter-q") && $("#catalog-filter-q").value.trim()) || "";
    STATE.featured = !!($("#catalog-filter-featured") && $("#catalog-filter-featured").checked);
    STATE.hot = !!($("#catalog-filter-hot") && $("#catalog-filter-hot").checked);
    STATE.bestSeller = !!($("#catalog-filter-bestseller") && $("#catalog-filter-bestseller").checked);
  }

  var __catalogFetchAbort = null;

  async function loadAndRender() {
    var listEl = $("#product-list");
    var pagEl = $("#catalog-pagination");
    if (!listEl) return;

    if (__catalogFetchAbort) {
      try {
        __catalogFetchAbort.abort();
      } catch (_) {}
    }
    __catalogFetchAbort =
      typeof AbortController === "function" ? new AbortController() : null;
    var signal = __catalogFetchAbort ? __catalogFetchAbort.signal : null;

    listEl.setAttribute("aria-busy", "true");
    var pageSize =
      (global.TLKVCatalogFilters && global.TLKVCatalogFilters.ARCHIVE_PAGE_SIZE) || 24;
    if (global.TLKVSkeleton && typeof global.TLKVSkeleton.productGrid === "function") {
      global.TLKVSkeleton.productGrid(listEl, Math.min(pageSize, 8));
    }

    try {
      var catalogGroup = global.TLKVCatalogFilters.catalogPageKind();
      var result = await global.TLKVCatalogApi.fetchProductsPage(
        {
          brandSlug: STATE.brandSlug,
          categorySlug: STATE.categorySlug,
          featured: STATE.featured,
          hot: STATE.hot,
          bestSeller: STATE.bestSeller,
          sort: STATE.sort,
          catalogGroup: catalogGroup === "all" ? "" : catalogGroup,
        },
        STATE.page,
        pageSize,
        { signal: signal }
      );

      var items = global.TLKVCatalogFilters.clientFilterByQuery(result.items, STATE.q);
      await applyDerivedPricesToItems(items);
      renderGrid(listEl, items);
      renderPagination(pagEl, result.total, result.page, pageSize);

      var titleEl = $("#catalog-page-title");
      if (titleEl) {
        var pageKind = global.TLKVCatalogFilters.catalogPageKind();
        var parts = [pageKind === "jewelry" ? "Vàng trang sức" : "Sản phẩm"];
        if (STATE.categorySlug) parts.push(STATE.categorySlug.replace(/-/g, " "));
        if (STATE.brandSlug) parts.push("— " + STATE.brandSlug.replace(/-/g, " "));
        titleEl.textContent = parts.join(" ");
      }
    } catch (err) {
      if (err && (err.name === "AbortError" || err.code === "20")) return;
      console.error(err);
      listEl.innerHTML = "";
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Không tải được danh sách: " + (err.message || String(err));
      listEl.appendChild(p);
    } finally {
      listEl.removeAttribute("aria-busy");
    }
  }

  function bindToolbar() {
    $("#catalog-filter-apply")?.addEventListener("click", function () {
      readFormIntoState();
      STATE.page = 1;
      global.TLKVCatalogFilters.writeUrlState(STATE, false);
      loadAndRender();
    });

    $("#catalog-filter-reset")?.addEventListener("click", function () {
      STATE = { page: 1, brandSlug: "", categorySlug: "", featured: false, hot: false, bestSeller: false, sort: "sort", q: "" };
      global.TLKVCatalogFilters.writeUrlState(STATE, true);
      populateFilterSelects().then(loadAndRender);
    });

    window.addEventListener("popstate", function () {
      STATE = global.TLKVCatalogFilters.readUrlState();
      populateFilterSelects().then(loadAndRender);
    });
  }

  async function mountCatalogArchive() {
    STATE = global.TLKVCatalogFilters.readUrlState();
    bindGoldPriceListener();
    await populateFilterSelects();
    bindToolbar();
    await loadAndRender();
  }

  global.TLKVCatalogArchive = {
    mountCatalogArchive: mountCatalogArchive,
    loadAndRender: loadAndRender,
  };
})(typeof window !== "undefined" ? window : globalThis);
