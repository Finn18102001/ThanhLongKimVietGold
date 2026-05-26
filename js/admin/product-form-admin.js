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
  };

  var DEFAULTS = {
    id: "",
    name: "",
    brandId: "",
    categoryId: "",
    category: "",
    priceText: "",
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
    var uploadBtn = $("btn-upload-supabase");
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "☁️ Upload lên Supabase trước khi tạo mới";
    }
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
    if ($("pf-image")) $("pf-image").value = data.image || "";
    setCheckboxes(data);
    updateSlugPreview(data.name || "");
  }

  function readFromDom(categoriesCache) {
    var brandId = $("pf-brand-id") ? $("pf-brand-id").value : "";
    var categoryId = $("pf-category-id") ? $("pf-category-id").value : "";
    var catRow = (categoriesCache || []).find(function (c) {
      return c.id === categoryId;
    });
    return {
      id: ($("pf-id") && $("pf-id").value.trim()) || "",
      name: ($("pf-name") && $("pf-name").value.trim()) || "",
      brandId: brandId,
      categoryId: categoryId,
      category: catRow ? catRow.name : ($("pf-category") && $("pf-category").value.trim()) || "",
      priceText: ($("pf-priceText") && $("pf-priceText").value.trim()) || "",
      image: ($("pf-image") && $("pf-image").value.trim()) || "",
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
      image: item.image || "",
      isFeatured: !!item.isFeatured,
      isBestSeller: !!item.isBestSeller,
      isHot: !!item.isHot,
      isActive: item.isActive !== false,
    });

    resetImageUi();
    var src = global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc(item.image);
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
    getMode: function () {
      return formState.mode;
    },
    getOriginalSlug: function () {
      return formState.originalSlug || "";
    },
  };

  global.clearProductForm = resetToCreateMode;
})(typeof window !== "undefined" ? window : globalThis);
