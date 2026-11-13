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
    /** Saved classification + price link of the product being edited (null in create mode). */
    original: null,
    /** Becomes true only when the user changes the price row (or the brand, which clears it). */
    priceRowTouched: false,
    /** Serialized form values right after the form was filled; used to detect unsaved changes. */
    baseline: "",
    taxonomy: { categories: [], productTypes: [], links: [] },
  };

  var DEFAULTS = {
    id: "",
    name: "",
    brandId: "",
    categoryId: "",
    productTypeId: "",
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

  var WEIGHT_UNIT_SCALE = 100000;
  var WEIGHT_MAX = 9999.99999;

  function weightFractionDigits(raw) {
    var s = String(raw != null ? raw : "").trim().replace(",", ".");
    var frac = (s.split(".")[1] || "").replace(/0+$/, "");
    return frac.length;
  }

  function weightInputError(raw) {
    var s = String(raw != null ? raw : "").trim().replace(",", ".");
    if (!s) return "";
    if (!/^\d+(\.\d+)?$/.test(s)) return "Định lượng phải là số chỉ lớn hơn 0.";
    if (weightFractionDigits(s) > 5) return "Định lượng tối đa 5 chữ số sau dấu phẩy.";
    var n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return "Định lượng phải là số chỉ lớn hơn 0.";
    if (n > WEIGHT_MAX) return "Định lượng tối đa 9999.99999 chỉ.";
    return "";
  }

  function parseWeightInput(raw) {
    if (weightInputError(raw)) return null;
    var s = String(raw != null ? raw : "").trim().replace(",", ".");
    if (!s) return null;
    var n = Number(s);
    if (!Number.isFinite(n) || n <= 0 || n > WEIGHT_MAX) return null;
    var rounded = Math.round(n * WEIGHT_UNIT_SCALE) / WEIGHT_UNIT_SCALE;
    return rounded > 0 ? rounded : null;
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

  /**
   * Giá SP khi đã chọn dòng bảng giá = giá niêm yết × (số chỉ SP / mệnh giá dòng).
   * Mọi mã giá. Trùng số chỉ với dòng (vd cùng 0.1 chỉ) → giá bằng giá dòng.
   * Ô định lượng trống → giữ nguyên giá niêm yết trên dòng.
   */
  function linkedProductPriceText(row) {
    if (!row) return "";
    var engine = global.TLKVProductPriceEngine;
    var weight = parseWeightInput($("pf-weight") && $("pf-weight").value);
    if (
      engine &&
      typeof engine.deriveProductPrice === "function" &&
      typeof engine.buildGoldPriceIndex === "function"
    ) {
      var derived = engine.deriveProductPrice(
        {
          priceRowId: row.id,
          priceSourceProduct: row.product,
          priceSource: "LINKED_PRICE",
          weight: weight,
        },
        engine.buildGoldPriceIndex([row])
      );
      if (
        derived &&
        derived.showPrice &&
        derived.amountVnd != null &&
        Number.isFinite(Number(derived.amountVnd))
      ) {
        if (typeof engine.formatVndInteger === "function") {
          var formatted = engine.formatVndInteger(derived.amountVnd);
          return formatted ? formatted + "đ" : "";
        }
        if (derived.priceText) return String(derived.priceText).replace(/đ\s*$/, "") + "đ";
      }
    }
    if (weight == null) return formatGoldSell(row);
    var sell = row.sellNum != null ? Number(row.sellNum) : null;
    if (sell == null || !Number.isFinite(sell) || sell <= 0) return formatGoldSell(row);
    var ref =
      engine && typeof engine.resolveReferenceWeightForGoldRow === "function"
        ? engine.resolveReferenceWeightForGoldRow(row.product)
        : 1;
    var amount = null;
    if (engine && typeof engine.multiplyVndByReferenceWeight === "function") {
      amount = engine.multiplyVndByReferenceWeight(sell, weight, ref);
    } else {
      var weightUnits = Math.round(weight * WEIGHT_UNIT_SCALE);
      var refUnits = Math.round(Number(ref) * WEIGHT_UNIT_SCALE);
      if (weightUnits > 0 && refUnits > 0) amount = Math.round((sell * weightUnits) / refUnits);
    }
    if (amount == null) return formatGoldSell(row);
    if (engine && typeof engine.formatVndInteger === "function") {
      var text = engine.formatVndInteger(amount);
      return text ? text + "đ" : "";
    }
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
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

  function savedPriceRowId() {
    return formState.mode === "edit" && formState.original ? formState.original.priceRowId || "" : "";
  }

  function fillPriceRowSelect(selectedId) {
    var sel = $("pf-price-row-id");
    if (!sel) return;
    var brandId = $("pf-brand-id") && $("pf-brand-id").value;
    var keep = String(selectedId || sel.value || "").trim();
    var saved = savedPriceRowId();
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
    var hasKeep = keep && Array.prototype.some.call(sel.options, function (opt) {
      return opt.value === keep;
    });
    if (!hasKeep && keep && keep === saved && !formState.priceRowTouched) {
      // Saved row not listed under this brand's name: show it so the link is never dropped silently.
      var savedRow = findGoldRow(keep);
      var extra = document.createElement("option");
      extra.value = keep;
      extra.textContent = (savedRow ? savedRow.product : keep) + " (dòng giá đang lưu)";
      if (savedRow) extra.setAttribute("data-product", savedRow.product);
      sel.appendChild(extra);
      hasKeep = true;
    }
    sel.value = hasKeep ? keep : "";
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
      var weightError = weightInputError($("pf-weight") && $("pf-weight").value);
      if (weightError) {
        if (currentEl) {
          currentEl.hidden = false;
          currentEl.textContent = weightError;
        }
        if (noteEl) {
          noteEl.hidden = true;
          noteEl.textContent = "";
        }
        return;
      }
      var current = linkedProductPriceText(row);
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
    formState.priceRowTouched = true;
    fillPriceRowSelect("");
    updatePriceSourceStatus();
    refreshPriceRowOptions({ selectedId: "" });
    var catSel = $("pf-category-id");
    renderCategoryOptions(catSel ? catSel.value : "", { brandChanged: true });
  }

  /* ───── Category (filtered by Brand–Category links) and Product Type ───── */

  function findById(list, id) {
    return (list || []).find(function (x) {
      return x.id === id;
    }) || null;
  }

  function linkedCategoryIds(brandId) {
    return (formState.taxonomy.links || [])
      .filter(function (l) {
        return l.brand_id === brandId;
      })
      .map(function (l) {
        return l.category_id;
      });
  }

  function setCategoryNote(message, tone) {
    var note = $("pf-category-note");
    if (!note) return;
    note.textContent = message || "";
    note.hidden = !message;
    note.setAttribute("data-tone", tone || "info");
  }

  /**
   * Lists only categories linked to the selected brand. A saved legacy value that is not
   * linked stays selected (marked) while the brand is unchanged; it is never replaced silently.
   */
  function renderCategoryOptions(selectedId, opts) {
    opts = opts || {};
    var sel = $("pf-category-id");
    if (!sel) return;
    var brandId = $("pf-brand-id") ? $("pf-brand-id").value : "";
    var selected = String(selectedId || "").trim();
    var orig = formState.original;
    var categories = formState.taxonomy.categories || [];
    var linked = brandId ? linkedCategoryIds(brandId) : [];
    var options = categories.filter(function (c) {
      return linked.indexOf(c.id) >= 0 && (c.is_active !== false || c.id === selected);
    });

    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = !brandId
      ? "— Chọn thương hiệu trước —"
      : options.length
      ? "— Chọn danh mục —"
      : "— Thương hiệu chưa có danh mục liên kết —";
    sel.appendChild(ph);
    options.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name + (c.is_active === false ? " (ẩn)" : "");
      sel.appendChild(o);
    });

    var message = "";
    var tone = "info";
    var keepLegacy =
      formState.mode === "edit" && orig && selected && selected === orig.categoryId && brandId === orig.brandId;
    if (selected && options.some(function (c) { return c.id === selected; })) {
      sel.value = selected;
    } else if (keepLegacy) {
      var legacy = findById(categories, selected);
      var lo = document.createElement("option");
      lo.value = selected;
      lo.textContent = (legacy ? legacy.name : "Danh mục đang lưu") + " (chưa liên kết với thương hiệu)";
      sel.appendChild(lo);
      sel.value = selected;
      message =
        "Danh mục đang lưu chưa được liên kết với thương hiệu này. Dữ liệu được giữ nguyên; muốn đổi thì chọn danh mục khác.";
      tone = "warn";
    } else {
      sel.value = "";
      if (selected && opts.brandChanged) {
        var old = findById(categories, selected);
        message = "Danh mục «" + (old ? old.name : "đã chọn") + "» không thuộc thương hiệu mới. Vui lòng chọn lại danh mục.";
        tone = "warn";
      }
    }
    if (!message && brandId && !options.length) {
      message = "Thương hiệu này chưa được liên kết danh mục nào. Liên kết ở tab Thương hiệu hoặc Danh mục.";
      tone = "warn";
    }
    sel.disabled = !brandId;
    setCategoryNote(message, tone);
  }

  function renderProductTypeOptions(selectedId) {
    var sel = $("pf-product-type-id");
    if (!sel) return;
    var selected = String(selectedId || "").trim();
    var types = formState.taxonomy.productTypes || [];
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "— Không chọn —";
    sel.appendChild(none);
    types
      .filter(function (t) {
        return t.is_active !== false || t.id === selected;
      })
      .forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.name + (t.is_active === false ? " (ngừng dùng)" : "");
        sel.appendChild(o);
      });
    if (selected && !findById(types, selected)) {
      var missing = document.createElement("option");
      missing.value = selected;
      missing.textContent = "Loại đang lưu (không còn trong danh sách)";
      sel.appendChild(missing);
    }
    sel.value = selected;
  }

  /** Called by catalog-admin after brands/categories/product types/links are (re)loaded. */
  function setTaxonomy(taxonomy) {
    var wasDirty = isDirty();
    formState.taxonomy = {
      categories: (taxonomy && taxonomy.categories) || [],
      productTypes: (taxonomy && taxonomy.productTypes) || [],
      links: (taxonomy && taxonomy.links) || [],
    };
    var catSel = $("pf-category-id");
    var typeSel = $("pf-product-type-id");
    var orig = formState.original;
    renderCategoryOptions((catSel && catSel.value) || (orig && orig.categoryId) || "");
    renderProductTypeOptions((typeSel && typeSel.value) || (orig && orig.productTypeId) || "");
    if (!wasDirty) formState.baseline = snapshot();
  }

  /* ───── Unsaved-change tracking ───── */

  function snapshot() {
    var v = readFromDom();
    return JSON.stringify([
      v.name, v.brandId, v.categoryId, v.productTypeId, v.priceText, v.priceRowId, v.weight, v.image,
      v.isFeatured, v.isBestSeller, v.isHot, v.isActive,
    ]);
  }

  function isDirty() {
    if (!formState.baseline) return false;
    return snapshot() !== formState.baseline;
  }

  /** @returns {boolean} true when it is fine to leave the current form state */
  function confirmDiscardIfDirty() {
    if (!isDirty()) return true;
    return global.confirm("Form sản phẩm có thay đổi chưa lưu. Bỏ các thay đổi này?");
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
    renderCategoryOptions(data.categoryId || "");
    renderProductTypeOptions(data.productTypeId || "");
    if ($("pf-category")) $("pf-category").value = data.category || "";
    if ($("pf-priceText")) $("pf-priceText").value = data.priceText || "";
    if ($("pf-weight")) $("pf-weight").value = formatWeightInputValue(data.weight);
    if ($("pf-image")) $("pf-image").value = data.image || "";
    if ($("pf-image-path")) $("pf-image-path").value = data.imageStoragePath || "";
    setCheckboxes(data);
    updateSlugPreview(data.name || "");
    formState.suppressBrandClear = true;
    // Baseline is taken now: the async price-row fill below never changes the compared values
    // (in edit mode the saved price row is used until the user changes it).
    formState.baseline = snapshot();
    return refreshPriceRowOptions({
      selectedId: data.priceRowId || "",
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
    var priceSourceProduct = priceRowId ? String(linkedProduct).trim() : "";
    if (formState.mode === "edit" && formState.original && !formState.priceRowTouched) {
      // Price row is only changed by an explicit user action.
      priceRowId = formState.original.priceRowId || "";
      priceSourceProduct = formState.original.priceSourceProduct || "";
    }
    return {
      id: ($("pf-id") && $("pf-id").value.trim()) || "",
      name: ($("pf-name") && $("pf-name").value.trim()) || "",
      brandId: brandId,
      categoryId: categoryId,
      productTypeId: ($("pf-product-type-id") && $("pf-product-type-id").value) || "",
      category: catRow ? catRow.name : ($("pf-category") && $("pf-category").value.trim()) || "",
      priceText: ($("pf-priceText") && $("pf-priceText").value.trim()) || "",
      priceRowId: priceRowId,
      priceSourceProduct: priceSourceProduct,
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
    var cancel = $("btn-product-cancel");
    if (cancel) cancel.hidden = formState.mode !== "edit";
  }

  function resetToCreateMode() {
    formState.mode = "create";
    formState.productId = "";
    formState.originalSlug = "";
    formState.original = null;
    formState.priceRowTouched = false;

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
    formState.priceRowTouched = false;
    formState.original = {
      brandId: item.brandId || "",
      categoryId: item.categoryId || "",
      productTypeId: item.productTypeId || "",
      priceRowId: item.priceRowId || "",
      priceSourceProduct: item.priceSourceProduct || "",
    };

    applyToDom({
      id: item.id || "",
      name: item.name || "",
      brandId: item.brandId || "",
      categoryId: item.categoryId || "",
      productTypeId: item.productTypeId || "",
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
    var weightError = weightInputError($("pf-weight") && $("pf-weight").value);
    if (weightError) return { ok: false, errors: [weightError] };
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
    $("pf-category-id")?.addEventListener("change", function () {
      var catSel = $("pf-category-id");
      var orig = formState.original;
      var stillLegacy =
        formState.mode === "edit" && orig && catSel && catSel.value === orig.categoryId &&
        linkedCategoryIds($("pf-brand-id").value).indexOf(orig.categoryId) < 0;
      if (!stillLegacy) setCategoryNote("");
    });
    $("pf-price-row-id")?.addEventListener("change", function () {
      formState.priceRowTouched = true;
      updatePriceSourceStatus();
    });

    // Capture phase on the form so the guard runs before any other "Mục mới" listener.
    form.addEventListener(
      "click",
      function (e) {
        var btn = e.target && e.target.closest ? e.target.closest("#btn-product-new") : null;
        if (!btn) return;
        if (!confirmDiscardIfDirty()) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
    $("btn-product-cancel")?.addEventListener("click", function () {
      if (!confirmDiscardIfDirty()) return;
      resetToCreateMode();
    });
    $("pf-priceText")?.addEventListener("input", updatePriceSourceStatus);
    $("pf-weight")?.addEventListener("input", updatePriceSourceStatus);

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
    setTaxonomy: setTaxonomy,
    isDirty: isDirty,
    confirmDiscardIfDirty: confirmDiscardIfDirty,
    getMode: function () {
      return formState.mode;
    },
    getOriginalSlug: function () {
      return formState.originalSlug || "";
    },
  };

  global.clearProductForm = resetToCreateMode;
})(typeof window !== "undefined" ? window : globalThis);
