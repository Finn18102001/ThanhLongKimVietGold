/**
 * Centralized product create/edit form state — admin catalog.
 */
(function (global) {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var formState = {
    mode: "create",
    productId: "",
    originalSlug: "",
    goldRows: [],
    goldRowsLoaded: false,
    suppressBrandClear: false,
  };

  var DEFAULTS = {
    id: "",
    name: "",
    brandId: "",
    categoryId: "",
    category: "",
    priceText: "",
    priceRowId: "",
    priceSourceProduct: "",
    weight: null,
    image: "",
    isFeatured: false,
    isBestSeller: false,
    isHot: false,
    isActive: true,
  };

  function slugify(name) {
    if (global.TLKVProducts && global.TLKVProducts.slugifySimple) {
      return global.TLKVProducts.slugifySimple(name);
    }
    return String(name || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");
  }

  function updateSlugPreview(name) {
    var el = $("pf-slug-preview");
    if (!el) return;
    var text = slugify(name);
    if (formState.mode === "edit" && formState.originalSlug) {
      el.textContent = formState.originalSlug;
      el.setAttribute("data-slug-mode", "locked");
    } else if (text) {
      el.textContent = text;
      el.setAttribute("data-slug-mode", "auto");
    } else {
      el.textContent = "—";
      el.removeAttribute("data-slug-mode");
    }
  }

  function pathFromProductPublicUrl(url) {
    if (global.TLKVImageCDN && typeof global.TLKVImageCDN.pathFromStorageUrl === "function") {
      return global.TLKVImageCDN.pathFromStorageUrl(url);
    }
    var s = String(url || "").trim();
    var marker = "/storage/v1/object/public/";
    var idx = s.indexOf(marker);
    if (idx === -1) return "";
    var rest = s.slice(idx + marker.length);
    var slash = rest.indexOf("/");
    if (slash === -1) return "";
    return rest.slice(slash + 1);
  }

  function resetImageUi() {
    if (typeof global.__tlkvResetProductImageUpload === "function") {
      global.__tlkvResetProductImageUpload();
      return;
    }
    var imageField = $("pf-image");
    if (imageField) imageField.value = "";
    var preview = $("pf-image-preview");
    if (preview) preview.removeAttribute("src");
    var previewContainer = $("image-preview-container");
    if (previewContainer) previewContainer.style.display = "none";
    var statusDiv = $("upload-status");
    if (statusDiv) {
      statusDiv.style.display = "none";
      statusDiv.innerHTML = "";
      statusDiv.className = "upload-status";
    }
    var fileInput = $("pf-image-file");
    if (fileInput) fileInput.value = "";
    var fileInfo = $("selected-file-info");
    if (fileInfo) fileInfo.style.display = "none";
    var fileNameSpan = $("file-name");
    var fileSizeSpan = $("file-size");
    if (fileNameSpan) fileNameSpan.textContent = "";
    if (fileSizeSpan) fileSizeSpan.textContent = "";
    var progressEl = $("product-upload-progress");
    var progressLabel = $("product-upload-progress-label");
    if (progressEl) progressEl.style.display = "none";
    if (progressEl && progressEl.firstElementChild) progressEl.firstElementChild.style.width = "0%";
    if (progressLabel) {
      progressLabel.style.display = "none";
      progressLabel.textContent = "";
    }
  }

  function parseWeightInput(raw) {
    var s = String(raw != null ? raw : "").trim();
    if (!s) return null;
    var n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 10) / 10;
  }

  function formatWeightInputValue(w) {
    if (w == null || w === "" || !Number.isFinite(Number(w))) return "";
    return String(Number(w));
  }

  function brandKey(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function selectedBrandName() {
    var sel = $("pf-brand-id");
    if (!sel || !sel.value) return "";
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return "";
    return String(opt.textContent || "").replace(/\s*\(ẩn\)\s*$/, "").trim();
  }

  function formatGoldSell(row) {
    var engine = global.TLKVProductPriceEngine;
      var n = row && row.sellNum != null ? row.sellNum : null;
    if (n == null && row && row.sell != null) {
      if (global.TLKVGold && typeof global.TLKVGold.parseGoldMoneyToInt === "function") {
        n = global.TLKVGold.parseGoldMoneyToInt(row.sell);
      } else {
        n = Number(row.sell);
      }
    }
    if (n == null || !Number.isFinite(Number(n)) || Number(n) <= 0) return "";
    if (engine && typeof engine.formatVndInteger === "function") {
      return engine.formatVndInteger(Math.round(Number(n))) + "đ";
    }
    return Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
  }

  function rowsForSelectedBrand() {
    var brand = brandKey(selectedBrandName());
    if (!brand) return [];
    return (formState.goldRows || []).filter(function (row) {
      if (!row || !String(row.product || "").trim()) return false;
      return brandKey(row.brand) === brand;
    });
  }

  function findGoldRow(id) {
    var key = String(id || "").trim();
    if (!key) return null;
    return (formState.goldRows || []).find(function (row) {
      return row && row.id === key;
    }) || null;
  }

  async function ensureGoldRows() {
    if (formState.goldRowsLoaded) return formState.goldRows;
    var sb = null;
    if (global.TLKVCatalogApi && typeof global.TLKVCatalogApi.getSupabaseClient === "function") {
      sb = await global.TLKVCatalogApi.getSupabaseClient();
    } else if (global.TLKVSupabase && typeof global.TLKVSupabase.getSupabaseClient === "function") {
      sb = await global.TLKVSupabase.getSupabaseClient();
    }
    if (!sb) {
      formState.goldRows = [];
      formState.goldRowsLoaded = true;
      return formState.goldRows;
    }
    var res = await sb
      .from("gold_price_rows")
      .select("id, brand, product, purity, buy, sell, sort_order")
      .order("sort_order")
      .order("product");
    if (res.error) throw res.error;
    formState.goldRows = (res.data || []).map(function (row) {
      var sellNum =
        global.TLKVGold && typeof global.TLKVGold.parseGoldMoneyToInt === "function"
          ? global.TLKVGold.parseGoldMoneyToInt(row.sell)
          : Number(row.sell);
      var buyNum =
        global.TLKVGold && typeof global.TLKVGold.parseGoldMoneyToInt === "function"
          ? global.TLKVGold.parseGoldMoneyToInt(row.buy)
          : Number(row.buy);
      return {
        id: String(row.id || ""),
        brand: String(row.brand || ""),
        product: String(row.product || "").trim().replace(/\s+/g, " "),
        purity: String(row.purity || ""),
        buy: row.buy,
        sell: row.sell,
        buyNum: Number.isFinite(buyNum) ? Math.round(buyNum) : null,
        sellNum: Number.isFinite(sellNum) ? Math.round(sellNum) : null,
        sortOrder: row.sort_order,
      };
    });
    formState.goldRowsLoaded = true;
    return formState.goldRows;
  }

  function fillPriceRowSelect(selectedId) {
    var sel = $("pf-price-row-id");
    if (!sel) return;
    var brandId = $("pf-brand-id") && $("pf-brand-id").value;
    var keep = String(selectedId || sel.value || "").trim();
    sel.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    if (!brandId) {
      placeholder.textContent = "Chọn thương hiệu trước";
      sel.appendChild(placeholder);
      sel.disabled = true;
      sel.value = "";
      return;
    }
    placeholder.textContent = "Chưa liên kết";
    sel.appendChild(placeholder);
    var rows = rowsForSelectedBrand();
    rows.forEach(function (row) {
      var o = document.createElement("option");
      o.value = row.id;
      o.textContent = row.product;
      o.setAttribute("data-product", row.product);
      sel.appendChild(o);
    });
    sel.disabled = false;
    if (keep && Array.prototype.some.call(sel.options, function (opt) {
      return opt.value === keep;
    })) {
      sel.value = keep;
    } else {
      sel.value = "";
    }
  }

  function matchPriceRowId(item) {
    var explicit = item && item.priceRowId ? String(item.priceRowId).trim() : "";
    if (explicit && findGoldRow(explicit)) return explicit;
    var source = item && item.priceSourceProduct ? String(item.priceSourceProduct).trim() : "";
    if (!source) return "";
    var brandRows = rowsForSelectedBrand();
    var exact = brandRows.find(function (row) {
      return brandKey(row.product) === brandKey(source);
    });
    if (exact) return exact.id;
    var engine = global.TLKVProductPriceEngine;
    if (engine && typeof engine.resolveGoldRowLookupKey === "function") {
      var index = engine.buildGoldPriceIndex ? engine.buildGoldPriceIndex(brandRows) : null;
      var lookup = engine.resolveGoldRowLookupKey(source, null, index, item && item.weight);
      if (lookup) {
        var aliased = brandRows.find(function (row) {
          return brandKey(row.product) === brandKey(lookup);
        });
        if (aliased) return aliased.id;
      }
    }
    return "";
  }

  function updatePriceSourceStatus() {
    var box = $("pf-price-source-status");
    var labelEl = $("pf-price-source-label");
    var currentEl = $("pf-price-source-current");
    var noteEl = $("pf-price-source-note");
    if (!box || !labelEl) return;
    var rowId = $("pf-price-row-id") && $("pf-price-row-id").value;
    var manual = ($("pf-priceText") && $("pf-priceText").value.trim()) || "";
    var row = rowId ? findGoldRow(rowId) : null;
    if (row) {
      box.hidden = false;
      labelEl.innerHTML = "Nguồn giá: <strong>Bảng giá liên kết</strong>";
      var current = formatGoldSell(row);
      if (currentEl) {
        currentEl.hidden = !current;
        currentEl.textContent = current ? "Giá hiện tại: " + current : "";
      }
      if (noteEl) {
        var showNote = !!manual;
        noteEl.hidden = !showNote;
        noteEl.textContent = showNote
          ? "Sản phẩm đang sử dụng giá từ bảng giá liên kết. Giá nhập tay sẽ không được sử dụng."
          : "";
      }
      return;
    }
    if (manual) {
      box.hidden = false;
      labelEl.innerHTML = "Nguồn giá: <strong>Giá nhập tay</strong>";
      if (currentEl) {
        currentEl.hidden = true;
        currentEl.textContent = "";
      }
      if (noteEl) {
        noteEl.hidden = true;
        noteEl.textContent = "";
      }
      return;
    }
    box.hidden = true;
    labelEl.textContent = "";
    if (currentEl) {
      currentEl.hidden = true;
      currentEl.textContent = "";
    }
    if (noteEl) {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }
  }

  function refreshPriceRowOptions(opts) {
    opts = opts || {};
    var selectedId = opts.selectedId != null ? opts.selectedId : undefined;
    return ensureGoldRows()
      .then(function () {
        var selectedId = opts.selectedId != null ? opts.selectedId : undefined;
        if (!selectedId && opts.item) selectedId = matchPriceRowId(opts.item);
        fillPriceRowSelect(selectedId);
        updatePriceSourceStatus();
      })
      .catch(function () {
        fillPriceRowSelect("");
        updatePriceSourceStatus();
      });
  }

  function onBrandChangedByUser() {
    if (formState.suppressBrandClear) return;
    fillPriceRowSelect("");
    updatePriceSourceStatus();
    refreshPriceRowOptions({ selectedId: "" });
  }

  function setCheckboxes(flags) {
    flags = flags || DEFAULTS;
    if ($("pf-is-featured")) $("pf-is-featured").checked = !!flags.isFeatured;
    if ($("pf-is-best-seller")) $("pf-is-best-seller").checked = !!flags.isBestSeller;
    if ($("pf-is-hot")) $("pf-is-hot").checked = !!flags.isHot;
    if ($("pf-is-active")) $("pf-is-active").checked = flags.isActive !== false;
  }

  function applyToDom(data) {
    data = data || DEFAULTS;
    if ($("pf-id")) $("pf-id").value = data.id || "";
    if ($("pf-name")) $("pf-name").value = data.name || "";
    if ($("pf-brand-id")) $("pf-brand-id").value = data.brandId || "";
    if ($("pf-category-id")) $("pf-category-id").value = data.categoryId || "";
    if ($("pf-category")) $("pf-category").value = data.category || "";
    if ($("pf-priceText")) $("pf-priceText").value = data.priceText || "";
    if ($("pf-weight")) $("pf-weight").value = formatWeightInputValue(data.weight);
    if ($("pf-image")) $("pf-image").value = data.image || "";
    if ($("pf-image-path")) $("pf-image-path").value = data.imageStoragePath || "";
    setCheckboxes(data);
    updateSlugPreview(data.name || "");
    formState.suppressBrandClear = true;
    refreshPriceRowOptions({
      selectedId: data.priceRowId || "",
      item: data,
    }).then(function () {
      formState.suppressBrandClear = false;
    });
  }

  function readFromDom(categoriesCache) {
    var brandId = $("pf-brand-id") ? $("pf-brand-id").value : "";
    var categoryId = $("pf-category-id") ? $("pf-category-id").value : "";
    var catRow = (categoriesCache || []).find(function (c) {
      return c.id === categoryId;
    });
    var priceRowSel = $("pf-price-row-id");
    var priceRowId = priceRowSel ? String(priceRowSel.value || "").trim() : "";
    var priceRowOpt = priceRowSel && priceRowId ? priceRowSel.options[priceRowSel.selectedIndex] : null;
    var linkedProduct =
      (priceRowOpt && priceRowOpt.getAttribute("data-product")) ||
      (findGoldRow(priceRowId) && findGoldRow(priceRowId).product) ||
      "";
    return {
      id: ($("pf-id") && $("pf-id").value.trim()) || "",
      name: ($("pf-name") && $("pf-name").value.trim()) || "",
      brandId: brandId,
      categoryId: categoryId,
      category: catRow ? catRow.name : ($("pf-category") && $("pf-category").value.trim()) || "",
      priceText: ($("pf-priceText") && $("pf-priceText").value.trim()) || "",
      priceRowId: priceRowId,
      priceSourceProduct: priceRowId ? String(linkedProduct).trim() : "",
      weight: parseWeightInput($("pf-weight") && $("pf-weight").value),
      image: ($("pf-image") && $("pf-image").value.trim()) || "",
      imageStoragePath: ($("pf-image-path") && $("pf-image-path").value.trim()) || "",
      sortOrder: null,
      isFeatured: !!($("pf-is-featured") && $("pf-is-featured").checked),
      isBestSeller: !!($("pf-is-best-seller") && $("pf-is-best-seller").checked),
      isHot: !!($("pf-is-hot") && $("pf-is-hot").checked),
      isActive: !($("pf-is-active") && $("pf-is-active").checked === false),
    };
  }

  function setFormTitle() {
    var title = $("product-form-title");
    if (!title) return;
    title.textContent = formState.mode === "edit" ? "Sửa sản phẩm" : "Thêm sản phẩm mới";
  }

  function resetToCreateMode() {
    formState.mode = "create";
    formState.productId = "";
    formState.originalSlug = "";

    var form = $("product-form");
    if (form) form.reset();

    applyToDom(DEFAULTS);
    resetImageUi();
    setFormTitle();

    var formEl = $("product-form");
    if (formEl) {
      formEl.classList.remove("is-edit-mode");
      formEl.classList.add("is-create-mode");
    }
  }

  function loadForEdit(item, opts) {
    if (!item) return;
    opts = opts || {};
    formState.mode = "edit";
    formState.productId = item.id || "";
    formState.originalSlug = String(item.slug || "").trim();

    applyToDom({
      id: item.id || "",
      name: item.name || "",
      brandId: item.brandId || "",
      categoryId: item.categoryId || "",
      category: item.category || "",
      priceText: item.priceText || "",
      priceRowId: item.priceRowId || "",
      priceSourceProduct: item.priceSourceProduct || "",
      weight: item.weight != null ? item.weight : null,
      image: item.image || "",
      imageStoragePath: item.imageStoragePath || pathFromProductPublicUrl(item.image || ""),
      isFeatured: !!item.isFeatured,
      isBestSeller: !!item.isBestSeller,
      isHot: !!item.isHot,
      isActive: item.isActive !== false,
    });

    resetImageUi();
    var src = global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc(item.thumbnailUrl || item.image);
    if (src && $("pf-image-preview")) {
      $("pf-image-preview").src = src;
      if ($("image-preview-container")) $("image-preview-container").style.display = "flex";
    }
    if ($("pf-image")) $("pf-image").value = item.image || "";

    setFormTitle();
    var formEl = $("product-form");
    if (formEl) {
      formEl.classList.add("is-edit-mode");
      formEl.classList.remove("is-create-mode");
    }

    if (opts.scroll !== false) {
      $("product-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function validateForm(categoriesCache) {
    var payload = readFromDom(categoriesCache);
    if (global.TLKVProductCrud && global.TLKVProductCrud.validateForSave) {
      return global.TLKVProductCrud.validateForSave(payload);
    }
    if (global.TLKVProducts && global.TLKVProducts.validateProductForSave) {
      return global.TLKVProducts.validateProductForSave(payload);
    }
    return { ok: true, errors: [] };
  }

  async function buildPayload(categoriesCache) {
    var validation = validateForm(categoriesCache);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }
    var payload = readFromDom(categoriesCache);
    if (!payload.id && global.TLKVProductCrud && global.TLKVProductCrud.resolveProductId) {
      payload.id = global.TLKVProductCrud.resolveProductId(payload, formState.mode);
    } else if (!payload.id) {
      payload.id = "p-" + Date.now();
    }
    return payload;
  }

  function init() {
    var form = $("product-form");
    if (!form || form.dataset.pfStateInit === "1") return;
    form.dataset.pfStateInit = "1";

    $("pf-name")?.addEventListener("input", function () {
      if (formState.mode === "create") {
        updateSlugPreview($("pf-name").value);
      }
    });

    $("pf-brand-id")?.addEventListener("change", onBrandChangedByUser);
    $("pf-price-row-id")?.addEventListener("change", updatePriceSourceStatus);
    $("pf-priceText")?.addEventListener("input", updatePriceSourceStatus);

    window.addEventListener("tlkv:gold-table-changed", function () {
      formState.goldRowsLoaded = false;
      refreshPriceRowOptions();
    });
    window.addEventListener("tlkv:gold-rows-updated", function () {
      formState.goldRowsLoaded = false;
      refreshPriceRowOptions();
    });

    $("btn-product-new")?.addEventListener("click", function () {
      resetToCreateMode();
    });

    resetToCreateMode();
  }

  global.TLKVProductFormAdmin = {
    init: init,
    resetToCreateMode: resetToCreateMode,
    loadForEdit: loadForEdit,
    buildPayload: buildPayload,
    validateForm: validateForm,
    readFromDom: readFromDom,
    updateSlugPreview: updateSlugPreview,
    refreshPriceRowOptions: refreshPriceRowOptions,
    updatePriceSourceStatus: updatePriceSourceStatus,
    getMode: function () {
      return formState.mode;
    },
    getOriginalSlug: function () {
      return formState.originalSlug || "";
    },
  };

  global.clearProductForm = resetToCreateMode;
})(typeof window !== "undefined" ? window : globalThis);
