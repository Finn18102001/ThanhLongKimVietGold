(function (global) {
  "use strict";

  var STATE = { page: 1, brandSlug: "", categorySlug: "", featured: false, hot: false, bestSeller: false, sort: "sort", q: "" };

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

  function renderGrid(container, items) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "tlkv-catalog-root";

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

  async function loadAndRender() {
    var listEl = $("#product-list");
    var pagEl = $("#catalog-pagination");
    if (!listEl) return;

    listEl.setAttribute("aria-busy", "true");

    try {
      var pageSize = global.TLKVCatalogFilters.ARCHIVE_PAGE_SIZE;
      var result = await global.TLKVCatalogApi.fetchProductsPage(
        {
          brandSlug: STATE.brandSlug,
          categorySlug: STATE.categorySlug,
          featured: STATE.featured,
          hot: STATE.hot,
          bestSeller: STATE.bestSeller,
          sort: STATE.sort,
        },
        STATE.page,
        pageSize
      );

      var items = global.TLKVCatalogFilters.clientFilterByQuery(result.items, STATE.q);
      renderGrid(listEl, items);
      renderPagination(pagEl, result.total, result.page, pageSize);

      var titleEl = $("#catalog-page-title");
      if (titleEl) {
        var parts = ["Sản phẩm"];
        if (STATE.categorySlug) parts.push(STATE.categorySlug.replace(/-/g, " "));
        if (STATE.brandSlug) parts.push("— " + STATE.brandSlug.replace(/-/g, " "));
        titleEl.textContent = parts.join(" ");
      }
    } catch (err) {
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
    await populateFilterSelects();
    bindToolbar();
    await loadAndRender();
  }

  global.TLKVCatalogArchive = {
    mountCatalogArchive: mountCatalogArchive,
    loadAndRender: loadAndRender,
  };
})(typeof window !== "undefined" ? window : globalThis);
