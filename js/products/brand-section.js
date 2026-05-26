(function (global) {
  "use strict";

  var DEFAULT_LIMIT =
    typeof global.TLKV_PRODUCTS_PER_BRAND_SECTION === "number"
      ? global.TLKV_PRODUCTS_PER_BRAND_SECTION
      : 6;

  /**
   * @param {{
   *   brand: { id, name, slug, description?, logoUrl?, viewAllHref? },
   *   products: object[],
   *   limit?: number
   * }} section
   * @param {{ resolveImage?: function }} [opts]
   * @returns {HTMLElement}
   */
  function createBrandSection(section, opts) {
    opts = opts || {};
    var brand = section.brand || {};
    var limit = section.limit != null ? section.limit : DEFAULT_LIMIT;
    var products = section.products || [];
    if (limit > 0) {
      products = products.slice(0, limit);
    }

    var root = document.createElement("section");
    root.className = "tlkv-brand-section";
    root.id = "brand-" + (brand.slug || brand.id || "section");
    root.setAttribute("aria-labelledby", root.id + "-title");

    var header = document.createElement("header");
    header.className = "tlkv-brand-section__header";

    if (brand.logoUrl) {
      var logoWrap = document.createElement("div");
      logoWrap.className = "tlkv-brand-section__logo";
      var logoImg = document.createElement("img");
      logoImg.src = brand.logoUrl;
      logoImg.alt = brand.name || "";
      logoImg.loading = "lazy";
      logoImg.decoding = "async";
      logoWrap.appendChild(logoImg);
      header.appendChild(logoWrap);
    }

    var copy = document.createElement("div");
    copy.className = "tlkv-brand-section__copy";

    var h2 = document.createElement("h2");
    h2.className = "tlkv-brand-section__title";
    h2.id = root.id + "-title";
    if (brand.slug) {
      var titleLink = document.createElement("a");
      titleLink.href = "/thuong-hieu/" + encodeURIComponent(brand.slug);
      titleLink.textContent = brand.name || "";
      titleLink.className = "tlkv-brand-section__title-link";
      h2.appendChild(titleLink);
    } else {
      h2.textContent = brand.name || "";
    }
    copy.appendChild(h2);

    if (brand.description) {
      var descLegacy = document.createElement("p");
      descLegacy.className = "tlkv-brand-section__desc";
      descLegacy.textContent = brand.description;
      copy.appendChild(descLegacy);
    }

    header.appendChild(copy);
    root.appendChild(header);

    if (products.length && global.TLKVProductGrid) {
      root.appendChild(global.TLKVProductGrid.createProductGrid(products, opts));
    } else {
      var emptyLegacy = document.createElement("p");
      emptyLegacy.className = "tlkv-product-empty";
      emptyLegacy.textContent = "Chưa có sản phẩm cho thương hiệu này.";
      root.appendChild(emptyLegacy);
    }

    return root;
  }

  global.TLKVBrandSection = {
    createBrandSection: createBrandSection,
  };
})(typeof window !== "undefined" ? window : globalThis);
