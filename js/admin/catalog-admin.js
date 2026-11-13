/**
 * TLKV Catalog Admin — brands, categories, enhanced products (Step 10).
 */
(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var brandsCache = [];
  var categoriesCache = [];
  var productTypesCache = [];
  /** brand_categories rows: { brand_id, category_id } */
  var linksCache = [];
  /** Ignore stale admin table renders when a newer refresh is already in flight. */
  var adminTableFetchId = 0;
  var suppressProductsChangedRefresh = false;
  /** UI state: lọc sản phẩm theo kim loại + phân trang (client-side). */
  var productMetalTab = "gold"; // "gold" | "silver"
  var productsPage = 1;
  var PRODUCTS_PAGE_SIZE = 20;
  /** Cache map gold_price_rows.id -> metal ("gold"|"silver") để phân loại SP theo priceRowId. */
  var priceRowMetalById = null;
  /** Cache kết quả sau khi filter (brand/category/search + metal) để chuyển trang không cần refetch. */
  var lastFilteredProducts = [];

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normKey(value) {
    return String(value || "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function resetProductsToFirstPage() {
    productsPage = 1;
  }

  function updateProductMetalTabUi() {
    document.querySelectorAll("[data-product-metal-tab]").forEach(function (btn) {
      var metal = btn.getAttribute("data-product-metal-tab");
      btn.classList.toggle("admin-tab--active", metal === productMetalTab);
      if (btn.getAttribute("role") === "tab") {
        btn.setAttribute("aria-selected", metal === productMetalTab ? "true" : "false");
      }
    });
  }

  async function ensurePriceRowMetalMap() {
    if (priceRowMetalById) return priceRowMetalById;
    var sb = await getSb();
    priceRowMetalById = Object.create(null);
    if (!sb) return priceRowMetalById;
    try {
      var res = await sb.from("gold_price_rows").select("id, metal").limit(2000);
      if (res && res.data) {
        (res.data || []).forEach(function (row) {
          var id = row && row.id != null ? String(row.id) : "";
          if (!id) return;
          priceRowMetalById[id] = row.metal === "silver" ? "silver" : "gold";
        });
      }
    } catch (_) {
      // swallow — fallback classification below
    }
    return priceRowMetalById;
  }

  function resolveProductMetalKind(p) {
    // Priority 1: priceRowId -> gold_price_rows.metal
    var rowId = p && p.priceRowId ? String(p.priceRowId).trim() : "";
    if (rowId && priceRowMetalById && priceRowMetalById[rowId]) return priceRowMetalById[rowId];

    // Priority 2: category slug/name (existing taxonomy already has "Bạc")
    var catSlug = normKey(p && p.categorySlug);
    var catName = normKey(p && (p.categoryName || p.category));
    if (catSlug === "bac" || catName === "bac" || catName.indexOf("bạc") >= 0) return "silver";

    // Priority 3: name heuristic (best-effort; avoid false positives when name includes both)
    var name = normKey(p && p.name);
    if (name && name.indexOf("bạc") >= 0 && name.indexOf("vàng") < 0) return "silver";

    return "gold";
  }

  function paginate(items, page, pageSize) {
    var total = items.length;
    var size = pageSize || PRODUCTS_PAGE_SIZE;
    var totalPages = Math.max(1, Math.ceil(total / size));
    var pg = Math.max(1, Math.min(totalPages, page || 1));
    var from = (pg - 1) * size;
    var slice = items.slice(from, from + size);
    return { items: slice, total: total, page: pg, pageSize: size, totalPages: totalPages };
  }

  function renderProductsPagination(pager) {
    var host = $("admin-products-pagination");
    var info = $("admin-products-pagination-info");
    if (host) host.innerHTML = "";
    if (info) info.textContent = "";
    if (!host || !pager) return;

    if (!pager.total || pager.totalPages <= 1) {
      if (info) info.textContent = "Tổng: " + (pager.total || 0) + " sản phẩm · Trang 1/1";
      return;
    }

    function addBtn(label, page, disabled, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (active) b.classList.add("active");
      if (disabled) b.disabled = true;
      b.addEventListener("click", function () {
        if (disabled) return;
        productsPage = page;
        var next = paginate(lastFilteredProducts, productsPage, pager.pageSize);
        renderProductsTable(next.items);
        renderProductsPagination(next);
      });
      host.appendChild(b);
    }

    addBtn("‹", pager.page - 1, pager.page <= 1, false);
    var windowSize = 2;
    var start = Math.max(1, pager.page - windowSize);
    var end = Math.min(pager.totalPages, pager.page + windowSize);
    if (start > 1) {
      addBtn("1", 1, false, pager.page === 1);
      if (start > 2) addBtn("…", pager.page, true, false);
    }
    for (var p = start; p <= end; p++) {
      addBtn(String(p), p, false, p === pager.page);
    }
    if (end < pager.totalPages) {
      if (end < pager.totalPages - 1) addBtn("…", pager.page, true, false);
      addBtn(String(pager.totalPages), pager.totalPages, false, pager.page === pager.totalPages);
    }
    addBtn("›", pager.page + 1, pager.page >= pager.totalPages, false);

    if (info) info.textContent = "Tổng: " + pager.total + " sản phẩm · Trang " + pager.page + "/" + pager.totalPages;
  }

  async function getSb() {
    if (window.TLKVCatalogApi && window.TLKVCatalogApi.getSupabaseClient) {
      return window.TLKVCatalogApi.getSupabaseClient();
    }
    return null;
  }

  function toast(msg, type) {
    if (typeof window.showAdminToast === "function") window.showAdminToast(msg, type);
    else if (typeof window.showToast === "function") window.showToast(msg, type);
    else console.log(msg);
  }

  async function loadTaxonomies() {
    // Admin needs ALL rows (including inactive). Public catalog APIs filter is_active.
    var tx = window.TLKVTaxonomy;
    if (!tx) throw new Error("Thiếu js/admin/taxonomy-data.js.");
    var loaded = await Promise.all([
      tx.listAll("brand"),
      tx.listAll("category"),
      tx.listAll("productType"),
      tx.listLinks(),
    ]);
    brandsCache = loaded[0];
    categoriesCache = loaded[1];
    productTypesCache = loaded[2];
    linksCache = loaded[3];
    fillSelect($("pf-brand-id"), brandsCache, "Tất cả thương hiệu");
    fillSelect($("catalog-admin-filter-brand"), brandsCache, "Thương hiệu");
    fillSelect($("catalog-admin-filter-category"), categoriesCache, "Danh mục");
    fillSelect($("catalog-admin-filter-product-type"), productTypesCache, "Loại sản phẩm");
    if (window.TLKVProductFormAdmin && typeof window.TLKVProductFormAdmin.setTaxonomy === "function") {
      window.TLKVProductFormAdmin.setTaxonomy({
        categories: categoriesCache,
        productTypes: productTypesCache,
        links: linksCache,
      });
    }
    if (window.TLKVProductFormAdmin && typeof window.TLKVProductFormAdmin.refreshPriceRowOptions === "function") {
      window.TLKVProductFormAdmin.refreshPriceRowOptions();
    }
  }

  function fillSelect(sel, rows, placeholder) {
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = "";
    if (placeholder && sel.id !== "pf-brand-id" && sel.id !== "pf-category-id") {
      var o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = placeholder;
      sel.appendChild(o0);
    }
    if (sel.id === "pf-brand-id") {
      var ob = document.createElement("option");
      ob.value = "";
      ob.textContent = "— Chọn thương hiệu —";
      sel.appendChild(ob);
    }
    if (sel.id === "pf-category-id") {
      var oc = document.createElement("option");
      oc.value = "";
      oc.textContent = "— Chọn danh mục —";
      sel.appendChild(oc);
    }
    (rows || []).forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name + (r.is_active === false ? " (ẩn)" : "");
      sel.appendChild(o);
    });
    if (current) sel.value = current;
  }

  function fillProductForm(item) {
    if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.loadForEdit) {
      window.TLKVProductFormAdmin.loadForEdit(item);
    }
  }

  function formatWeightCell(p) {
    if (window.TLKVProducts && window.TLKVProducts.formatProductWeightDisplay) {
      return window.TLKVProducts.formatProductWeightDisplay(p && p.weight);
    }
    if (p && p.weight != null && Number.isFinite(Number(p.weight))) return String(Number(p.weight));
    return "—";
  }

  function flagBadges(p) {
    var parts = [];
    if (p.isFeatured) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--featured">Nổi bật</span>');
    if (p.isBestSeller) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--best">Bán chạy</span>');
    if (p.isHot) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--hot">Hot</span>');
    if (!p.isActive) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--off">Ẩn</span>');
    return parts.join(" ");
  }

  function renderProductsTable(items) {
    var tb = $("admin-product-rows");
    if (!tb) return;
    tb.innerHTML = "";
    if (!items.length) {
      tb.innerHTML = '<tr><td colspan="10" class="admin-empty-hint">0 sản phẩm.</td></tr>';
      return;
    }
    items.forEach(function (p) {
      var tr = document.createElement("tr");
      var imgRaw = p.thumbnailUrl || p.image || "";
      var imgSrc = window.TLKVProducts.resolveProductImageSrc(imgRaw);
      var tdThumb = imgSrc
        ? '<td><img class="admin-product-thumb" src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" width="48" height="48" loading="lazy" decoding="async" /></td>'
        : "<td>—</td>";
      tr.innerHTML =
        "<td><small>" +
        escapeHtml(p.id) +
        "</small></td>" +
        tdThumb +
        "<td>" +
        escapeHtml(p.name) +
        "</td>" +
        "<td>" +
        escapeHtml(p.brandName || "—") +
        "</td>" +
        "<td>" +
        escapeHtml(p.categoryName || p.category || "—") +
        "</td>" +
        "<td>" +
        escapeHtml(p.productTypeName || "—") +
        "</td>" +
        "<td>" +
        escapeHtml(p.priceText) +
        "</td>" +
        "<td>" +
        escapeHtml(formatWeightCell(p)) +
        "</td>" +
        "<td>" +
        flagBadges(p) +
        "</td>" +
        '<td><div class="admin-cell-actions">' +
        '<button type="button" class="btn-edit btn-edit-product" data-id="' +
        escapeHtml(p.id) +
        '">Sửa</button>' +
        '<button type="button" class="btn-del btn-del-product" data-id="' +
        escapeHtml(p.id) +
        '">Xóa</button></div></td>';
      tb.appendChild(tr);
    });

    tb.querySelectorAll(".btn-edit-product").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (
          window.TLKVProductFormAdmin &&
          typeof window.TLKVProductFormAdmin.confirmDiscardIfDirty === "function" &&
          !window.TLKVProductFormAdmin.confirmDiscardIfDirty()
        ) {
          return;
        }
        // Always load the row from Supabase — never from session cache.
        var loader =
          window.TLKVProducts.getProductById
            ? window.TLKVProducts.getProductById(id)
            : window.TLKVProducts.getProducts({ forceRefresh: true }).then(function (d) {
                return ((d && d.items) || []).find(function (x) {
                  return x.id === id;
                });
              });
        loader
          .then(function (row) {
            if (row) fillProductForm(row);
            else toast("Không tìm thấy sản phẩm.", "error");
          })
          .catch(function (e) {
            toast(e.message || String(e), "error");
          });
      });
    });

    tb.querySelectorAll(".btn-del-product").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!confirm("Xóa sản phẩm này?")) return;
        suppressProductsChangedRefresh = true;
        window.TLKVProducts.deleteProductById(id)
          .then(function () {
            toast("Đã xóa sản phẩm.", "success");
            return afterProductMutation();
          })
          .catch(function (e) {
            toast(e.message || String(e), "error");
          })
          .finally(function () {
            suppressProductsChangedRefresh = false;
          });
      });
    });
  }

  function refreshProductsTableAdmin() {
    if (!window.TLKVProducts) return Promise.resolve();
    var fetchId = ++adminTableFetchId;
    // Admin table loads ALL products (including ẩn). Website filters separately.
    // Do not forceRefresh on every keystroke; rely on session cache + tlkv:products-changed invalidation.
    return ensurePriceRowMetalMap()
      .then(function () {
        return window.TLKVProducts.getProducts();
      })
      .then(function (data) {
        if (fetchId !== adminTableFetchId) return;
        var items = (data && data.items) || [];
        var q = ($("catalog-admin-search") && $("catalog-admin-search").value.trim().toLowerCase()) || "";
        var bf = $("catalog-admin-filter-brand") && $("catalog-admin-filter-brand").value;
        var cf = $("catalog-admin-filter-category") && $("catalog-admin-filter-category").value;
        var tf = $("catalog-admin-filter-product-type") && $("catalog-admin-filter-product-type").value;
        items = items.filter(function (p) {
          if (bf && p.brandId !== bf) return false;
          if (cf && p.categoryId !== cf) return false;
          if (tf && p.productTypeId !== tf) return false;
          if (q && String(p.name || "").toLowerCase().indexOf(q) < 0) return false;
          var metal = resolveProductMetalKind(p);
          if (productMetalTab === "silver") return metal === "silver";
          return metal === "gold";
        });
        lastFilteredProducts = items;
        var pager = paginate(items, productsPage, PRODUCTS_PAGE_SIZE);
        productsPage = pager.page;
        renderProductsTable(pager.items);
        renderProductsPagination(pager);
      })
      .catch(function (e) {
        if (fetchId !== adminTableFetchId) return;
        toast(e.message || String(e), "error");
      });
  }

  /** After CUD: clear public catalog caches + reload admin table from Supabase. */
  function afterProductMutation() {
    if (window.TLKVCatalogApi && typeof window.TLKVCatalogApi.clearCatalogSessionCaches === "function") {
      window.TLKVCatalogApi.clearCatalogSessionCaches();
    }
    if (window.TLKVProducts && typeof window.TLKVProducts.clearProductsSessionCache === "function") {
      window.TLKVProducts.clearProductsSessionCache();
    }
    return refreshProductsTableAdmin();
  }

  /* ───── Brand / Category / Product Type panels (data: TLKVTaxonomy) ───── */

  var TAXONOMY_PANELS = {
    brand: {
      formId: "brand-form",
      idInput: "brand-form-id",
      nameInput: "brand-form-name",
      activeInput: "brand-form-active",
      titleId: "brand-form-title",
      errorId: "brand-form-error",
      pickerId: "brand-form-categories",
      rowsId: "admin-brand-rows",
      createTitle: "Thêm thương hiệu",
      editTitle: "Sửa thương hiệu",
      label: "thương hiệu",
    },
    category: {
      formId: "category-form",
      idInput: "category-form-id",
      nameInput: "category-form-name",
      activeInput: "category-form-active",
      titleId: "category-form-title",
      errorId: "category-form-error",
      pickerId: "category-form-brands",
      rowsId: "admin-category-rows",
      createTitle: "Thêm danh mục",
      editTitle: "Sửa danh mục",
      label: "danh mục",
    },
    productType: {
      formId: "product-type-form",
      idInput: "product-type-form-id",
      nameInput: "product-type-form-name",
      activeInput: "product-type-form-active",
      titleId: "product-type-form-title",
      errorId: "product-type-form-error",
      pickerId: null,
      rowsId: "admin-product-type-rows",
      createTitle: "Thêm loại sản phẩm",
      editTitle: "Sửa loại sản phẩm",
      label: "loại sản phẩm",
    },
  };

  function taxonomyRows(kind) {
    if (kind === "brand") return brandsCache;
    if (kind === "category") return categoriesCache;
    return productTypesCache;
  }

  function linkedIdsOf(kind, id) {
    return linksCache
      .filter(function (l) {
        return kind === "brand" ? l.brand_id === id : l.category_id === id;
      })
      .map(function (l) {
        return kind === "brand" ? l.category_id : l.brand_id;
      });
  }

  function setPanelError(kind, message) {
    var el = $(TAXONOMY_PANELS[kind].errorId);
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  /** Multi-select checkbox list with a filter box. Inactive options can only stay checked, not be newly added. */
  function renderPicker(hostId, options, selectedIds) {
    var host = $(hostId);
    if (!host) return;
    var selected = selectedIds || [];
    host.innerHTML =
      '<input type="search" class="catalog-admin-picker__search" placeholder="Lọc…" aria-label="Lọc danh sách" autocomplete="off" />' +
      '<div class="catalog-admin-picker__list"></div>' +
      '<p class="catalog-admin-picker__count"></p>';
    var list = host.querySelector(".catalog-admin-picker__list");
    if (!options.length) {
      list.innerHTML = '<p class="catalog-admin-picker__empty">Chưa có dữ liệu.</p>';
    }
    options.forEach(function (o) {
      var on = selected.indexOf(o.id) >= 0;
      var locked = o.is_active === false && !on;
      var label = document.createElement("label");
      label.className = "catalog-admin-check";
      label.setAttribute("data-search", (window.TLKVTaxonomy ? window.TLKVTaxonomy.nameKey(o.name) : String(o.name).toLowerCase()));
      label.innerHTML =
        '<input type="checkbox" value="' + escapeHtml(o.id) + '"' + (on ? " checked" : "") + (locked ? " disabled" : "") + " /> " +
        escapeHtml(o.name) + (o.is_active === false ? ' <span class="catalog-admin-muted">(ẩn)</span>' : "");
      list.appendChild(label);
    });
    var countEl = host.querySelector(".catalog-admin-picker__count");
    function updateCount() {
      countEl.textContent = "Đã chọn " + getPickerValues(hostId).length + " / " + options.length;
    }
    host.querySelector(".catalog-admin-picker__search").addEventListener("input", function (e) {
      var needle = window.TLKVTaxonomy ? window.TLKVTaxonomy.nameKey(e.target.value) : e.target.value.toLowerCase();
      list.querySelectorAll("label").forEach(function (l) {
        l.style.display = !needle || l.getAttribute("data-search").indexOf(needle) >= 0 ? "" : "none";
      });
    });
    list.addEventListener("change", updateCount);
    updateCount();
  }

  function getPickerValues(hostId) {
    var host = $(hostId);
    if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll('input[type="checkbox"]:checked'), function (cb) {
      return cb.value;
    });
  }

  function pickerOptionsFor(kind) {
    if (kind === "brand") return categoriesCache;
    if (kind === "category") return brandsCache;
    return [];
  }

  function resetTaxonomyForm(kind) {
    var p = TAXONOMY_PANELS[kind];
    var form = $(p.formId);
    if (form) form.reset();
    if ($(p.idInput)) $(p.idInput).value = "";
    if ($(p.activeInput)) $(p.activeInput).checked = true;
    if ($(p.titleId)) $(p.titleId).textContent = p.createTitle;
    setPanelError(kind, "");
    if (p.pickerId) renderPicker(p.pickerId, pickerOptionsFor(kind), []);
  }

  function fillTaxonomyForm(kind, row) {
    var p = TAXONOMY_PANELS[kind];
    setPanelError(kind, "");
    $(p.idInput).value = row.id;
    $(p.nameInput).value = row.name || "";
    if ($(p.activeInput)) $(p.activeInput).checked = row.is_active !== false;
    if ($(p.titleId)) $(p.titleId).textContent = p.editTitle;
    if (kind === "brand") {
      if ($("brand-form-desc")) $("brand-form-desc").value = row.description || "";
      if ($("brand-form-logo")) $("brand-form-logo").value = row.logo_url || "";
    }
    if (p.pickerId) renderPicker(p.pickerId, pickerOptionsFor(kind), linkedIdsOf(kind, row.id));
    $(p.formId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function linkedNames(kind, id) {
    var others = kind === "brand" ? categoriesCache : brandsCache;
    return linkedIdsOf(kind, id)
      .map(function (otherId) {
        var o = others.find(function (x) {
          return x.id === otherId;
        });
        return o ? o.name : null;
      })
      .filter(Boolean);
  }

  function statusBadge(active) {
    return active
      ? '<span class="tlkv-admin-badge tlkv-admin-badge--on">Đang dùng</span>'
      : '<span class="tlkv-admin-badge tlkv-admin-badge--off">Ngừng dùng</span>';
  }

  function renderTaxonomyTable(kind) {
    var p = TAXONOMY_PANELS[kind];
    var tb = $(p.rowsId);
    if (!tb) return;
    var rows = taxonomyRows(kind);
    var cols = kind === "productType" ? 3 : 4;
    tb.innerHTML = "";
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="' + cols + '" class="admin-empty-hint">Chưa có ' + p.label + ".</td></tr>";
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var linkCell = "";
      if (kind !== "productType") {
        var names = linkedNames(kind, r.id);
        linkCell =
          "<td>" +
          (names.length
            ? names.map(function (n) { return '<span class="catalog-admin-chip">' + escapeHtml(n) + "</span>"; }).join(" ")
            : '<span class="catalog-admin-muted">Chưa liên kết</span>') +
          "</td>";
      }
      var active = r.is_active !== false;
      tr.innerHTML =
        "<td><strong>" + escapeHtml(r.name) + '</strong><br /><small class="catalog-admin-muted">' + escapeHtml(r.slug) + "</small></td>" +
        linkCell +
        "<td>" + statusBadge(active) + "</td>" +
        '<td><div class="admin-cell-actions">' +
        '<button type="button" class="btn-edit" data-tx-edit="' + escapeHtml(r.id) + '">Sửa</button>' +
        '<button type="button" class="' + (active ? "btn-del" : "btn-edit") + '" data-tx-toggle="' + escapeHtml(r.id) + '">' +
        (active ? "Ngừng dùng" : "Kích hoạt") +
        "</button></div></td>";
      tb.appendChild(tr);
    });
  }

  function bindTaxonomyTable(kind) {
    var tb = $(TAXONOMY_PANELS[kind].rowsId);
    if (!tb || tb.dataset.txBound === "1") return;
    tb.dataset.txBound = "1";
    tb.addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-tx-edit]");
      var toggleBtn = e.target.closest("[data-tx-toggle]");
      var id = (editBtn && editBtn.getAttribute("data-tx-edit")) || (toggleBtn && toggleBtn.getAttribute("data-tx-toggle"));
      if (!id) return;
      var row = taxonomyRows(kind).find(function (x) {
        return x.id === id;
      });
      if (!row) return;
      if (editBtn) fillTaxonomyForm(kind, row);
      else toggleTaxonomyActive(kind, row);
    });
  }

  async function toggleTaxonomyActive(kind, row) {
    var p = TAXONOMY_PANELS[kind];
    var next = row.is_active === false;
    var count = await window.TLKVTaxonomy.countProducts(kind, row.id);
    var usage = count == null ? "" : count + " sản phẩm đang dùng " + p.label + " này và sẽ giữ nguyên dữ liệu. ";
    var visibility =
      kind === "productType"
        ? "Loại này sẽ không còn trong danh sách chọn khi tạo/sửa sản phẩm."
        : "Mục này sẽ bị ẩn trên website và khỏi các danh sách chọn chỉ hiện mục đang dùng (gồm danh sách ở POS).";
    var msg = next
      ? "Kích hoạt lại " + p.label + " «" + row.name + "»?"
      : "Ngừng sử dụng " + p.label + " «" + row.name + "»?\n\n" + usage + visibility + "\nKhông xóa dữ liệu, có thể kích hoạt lại.";
    if (!confirm(msg)) return;
    try {
      await window.TLKVTaxonomy.setActive(kind, row.id, next);
      toast(next ? "Đã kích hoạt lại." : "Đã ngừng sử dụng.", "success");
      afterTaxonomyChange(kind);
    } catch (err) {
      toast(err.message || String(err), "error");
    }
  }

  async function saveTaxonomyForm(kind, e) {
    e.preventDefault();
    var p = TAXONOMY_PANELS[kind];
    var form = $(p.formId);
    var submitBtn = form && form.querySelector('button[type="submit"]');
    var input = {
      id: ($(p.idInput) && $(p.idInput).value) || "",
      name: ($(p.nameInput) && $(p.nameInput).value) || "",
      isActive: $(p.activeInput) ? $(p.activeInput).checked : true,
    };
    if (kind === "brand") {
      input.description = ($("brand-form-desc") && $("brand-form-desc").value) || "";
      input.logoUrl = ($("brand-form-logo") && $("brand-form-logo").value) || "";
    }
    if (p.pickerId) input.linkedIds = getPickerValues(p.pickerId);

    setPanelError(kind, "");
    if (submitBtn) submitBtn.disabled = true;
    try {
      var result = await window.TLKVTaxonomy.save(kind, input);
      var links = result.links;
      var linkNote =
        links && (links.added.length || links.removed.length)
          ? " (liên kết: +" + links.added.length + " / -" + links.removed.length + ")"
          : "";
      toast((input.id ? "Đã cập nhật " : "Đã thêm ") + p.label + " «" + result.record.name + "»" + linkNote + ".", "success");
      resetTaxonomyForm(kind);
      afterTaxonomyChange(kind);
    } catch (err) {
      setPanelError(kind, err.message || String(err));
      if (err.field === "name" && $(p.nameInput)) $(p.nameInput).focus();
      if (err.record) afterTaxonomyChange(kind);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function afterTaxonomyChange(kind) {
    if (window.TLKVCatalogApi && typeof window.TLKVCatalogApi.clearCatalogSessionCaches === "function") {
      window.TLKVCatalogApi.clearCatalogSessionCaches();
    }
    if (kind === "brand") {
      try {
        window.dispatchEvent(new CustomEvent("tlkv:brands-changed"));
      } catch (_) {}
    }
    return loadTaxonomies()
      .then(renderAllTaxonomyTables)
      .catch(function (err) {
        toast(err.message || String(err), "error");
      });
  }

  function renderAllTaxonomyTables() {
    renderTaxonomyTable("brand");
    renderTaxonomyTable("category");
    renderTaxonomyTable("productType");
  }

  function hookProductForm() {
    var form = $("product-form");
    if (!form || form.dataset.catalogHooked === "1") return;
    form.dataset.catalogHooked = "1";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!window.TLKVProducts || !window.TLKVProducts.saveProduct) return;

      var submitBtn = form.querySelector('button[type="submit"]');
      var orig = submitBtn && submitBtn.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Đang lưu...";
      }

      var isEdit =
        window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.getMode() === "edit";

      var payloadPromise =
        window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.buildPayload
          ? window.TLKVProductFormAdmin.buildPayload(categoriesCache)
          : Promise.reject(new Error("TLKVProductFormAdmin chưa load."));

      // Prevent products-changed listener from racing with afterProductMutation refresh.
      suppressProductsChangedRefresh = true;

      payloadPromise
        .then(function (payload) {
          return window.TLKVProducts.saveProduct(payload, {
            mode: isEdit ? "edit" : "create",
            existingSlug:
              isEdit && window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.getOriginalSlug
                ? window.TLKVProductFormAdmin.getOriginalSlug()
                : "",
          }).then(function (saved) {
            return { saved: saved, payload: payload };
          });
        })
        .then(function (result) {
          var saved = result.saved;
          if (!window.TLKVAudit || !window.TLKVAudit.logProductSafe) return saved;
          return getSb().then(async function (client) {
            if (!client) return saved;
            var actorEmail = "";
            try {
              var u = await client.auth.getUser();
              actorEmail = (u.data && u.data.user && u.data.user.email) || "";
            } catch (_) {}
            var change = saved.__change || null;
            var changedColumns = change && change.changedColumns ? change.changedColumns : null;
            var changedLabels =
              changedColumns && window.TLKVProductSaveRules
                ? window.TLKVProductSaveRules.describeChanges(
                    changedColumns.reduce(function (acc, c) {
                      acc[c] = true;
                      return acc;
                    }, {})
                  )
                : [];
            var summary = isEdit
              ? changedColumns && !changedColumns.length
                ? "Cập nhật sản phẩm (catalog): không có trường nào thay đổi"
                : "Cập nhật sản phẩm (catalog)" + (changedLabels.length ? ": " + changedLabels.join(", ") : "")
              : "Thêm sản phẩm (catalog)";
            var payload = Object.assign({}, saved, {
              before: change ? change.before : null,
              changed_fields: changedColumns,
            });
            var audit = await window.TLKVAudit.logProductSafe(
              client,
              {
                action: isEdit ? "product_update" : "product_insert",
                entity_name: saved.name,
                entity_id: saved.id,
                summary: summary,
                payload: payload,
              },
              actorEmail
            );
            if (!audit.ok && !audit.skipped) {
              toast("Đã lưu sản phẩm nhưng không ghi được lịch sử.", "error");
            }
            return saved;
          });
        })
        .then(function (saved) {
          toast(isEdit ? "Đã cập nhật." : "Đã thêm sản phẩm.", "success");
          if (window.TLKVProductFormAdmin) {
            window.TLKVProductFormAdmin.resetToCreateMode();
          } else if (typeof window.clearProductForm === "function") window.clearProductForm();
          return afterProductMutation();
        })
        .catch(function (err) {
          toast(err.message || String(err), "error");
        })
        .finally(function () {
          suppressProductsChangedRefresh = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = orig || "💾 Lưu sản phẩm";
          }
        });
    });

  }

  function initSubTabs() {
    document.querySelectorAll("[data-catalog-subtab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-catalog-subtab");
        document.querySelectorAll("[data-catalog-subtab]").forEach(function (b) {
          b.classList.toggle("admin-tab--active", b === btn);
        });
        document.querySelectorAll("[data-catalog-panel]").forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-catalog-panel") !== tab;
        });
      });
    });
  }

  function boot() {
    if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.init) {
      window.TLKVProductFormAdmin.init();
    }
    hookProductForm();
    initSubTabs();
    ["brand", "category", "productType"].forEach(bindTaxonomyTable);
    loadTaxonomies()
      .then(function () {
        refreshProductsTableAdmin();
        renderAllTaxonomyTables();
        resetTaxonomyForm("brand");
        resetTaxonomyForm("category");
      })
      .catch(function (e) {
        toast(e.message || String(e), "error");
      });

    // Tabs lọc sản phẩm theo kim loại (Vàng/Bạc) — giữ nguyên các điều kiện search/filter khác.
    document.querySelectorAll("[data-product-metal-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-product-metal-tab") === "silver" ? "silver" : "gold";
        if (next === productMetalTab) return;
        productMetalTab = next;
        resetProductsToFirstPage();
        updateProductMetalTabUi();
        refreshProductsTableAdmin();
      });
    });
    updateProductMetalTabUi();

    $("catalog-admin-search")?.addEventListener("input", function () {
      resetProductsToFirstPage();
      refreshProductsTableAdmin();
    });
    $("catalog-admin-filter-brand")?.addEventListener("change", function () {
      resetProductsToFirstPage();
      refreshProductsTableAdmin();
    });
    $("catalog-admin-filter-category")?.addEventListener("change", function () {
      resetProductsToFirstPage();
      refreshProductsTableAdmin();
    });
    $("catalog-admin-filter-product-type")?.addEventListener("change", function () {
      resetProductsToFirstPage();
      refreshProductsTableAdmin();
    });
    $("brand-form")?.addEventListener("submit", function (e) {
      saveTaxonomyForm("brand", e);
    });
    $("category-form")?.addEventListener("submit", function (e) {
      saveTaxonomyForm("category", e);
    });
    $("product-type-form")?.addEventListener("submit", function (e) {
      saveTaxonomyForm("productType", e);
    });
    [
      ["brand-form-refresh", "brand"],
      ["category-form-refresh", "category"],
      ["product-type-form-refresh", "productType"],
    ].forEach(function (pair) {
      $(pair[0])?.addEventListener("click", function () {
        resetTaxonomyForm(pair[1]);
      });
    });

    window.addEventListener("tlkv:products-changed", function () {
      if (suppressProductsChangedRefresh) return;
      refreshProductsTableAdmin();
    });

    // Nếu bảng giá thay đổi (thêm/sửa/xóa dòng), reload map priceRowId -> metal để lọc Vàng/Bạc chính xác.
    window.addEventListener("tlkv:gold-table-changed", function () {
      priceRowMetalById = null;
    });
    window.addEventListener("tlkv:gold-rows-updated", function () {
      priceRowMetalById = null;
    });
  }

  window.TLKVCatalogAdmin = {
    boot: boot,
    refreshProductsTableAdmin: refreshProductsTableAdmin,
    fillProductForm: fillProductForm,
    loadTaxonomies: loadTaxonomies,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
