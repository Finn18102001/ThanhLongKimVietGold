(function (global) {
  "use strict";

  var DEFAULT_LIMIT =
    typeof global.TLKV_PRODUCTS_PER_BRAND_SECTION === "number"
      ? global.TLKV_PRODUCTS_PER_BRAND_SECTION
      : 6;

  /**
   * @param {{
   *   brand: { id, name, slug, description?, logoUrl? },
   *   products: object[],
   *   limit?: number
   * }} section
   * @param {{ resolveImage?: function, layout?: string }} [opts]
   * @returns {HTMLElement}
   */
  function createBrandSection(section, opts) {
    opts = opts || {};
    var brand = section.brand || {};
    var limit = section.limit != null ? section.limit : DEFAULT_LIMIT;
    var products = (section.products || []).slice(0, limit);
    var isHome = opts.layout === "home" || opts.homeContext === true;

    var root = document.createElement("section");
    root.className = isHome
      ? "tlkv-brand-showcase tlkv-brand-showcase--home"
      : "tlkv-brand-section";
    root.id = "brand-" + (brand.slug || brand.id || "section");
    root.setAttribute("aria-labelledby", root.id + "-title");

    if (isHome) {
      var brandCol = document.createElement("aside");
      brandCol.className = "tlkv-brand-showcase__brand";

      var logoFrame = document.createElement("div");
      logoFrame.className = "tlkv-brand-showcase__logo-frame";

      if (brand.logoUrl) {
        var logo = document.createElement("img");
        logo.className = "tlkv-brand-showcase__logo";
        logo.src = brand.logoUrl;
        logo.alt = "";
        logo.loading = "lazy";
        logo.decoding = "async";
        logoFrame.appendChild(logo);
      } else {
        var monogram = document.createElement("span");
        monogram.className = "tlkv-brand-showcase__monogram";
        monogram.textContent = (brand.name || "B").charAt(0).toUpperCase();
        logoFrame.appendChild(monogram);
      }
      brandCol.appendChild(logoFrame);

      var title = document.createElement("h3");
      title.className = "tlkv-brand-showcase__name";
      title.id = root.id + "-title";
      if (brand.slug) {
        var nameLink = document.createElement("a");
        nameLink.href = "/thuong-hieu/" + encodeURIComponent(brand.slug);
        nameLink.textContent = brand.name || "";
        nameLink.className = "tlkv-brand-showcase__name-link";
        title.appendChild(nameLink);
      } else {
        title.textContent = brand.name || "";
      }
      brandCol.appendChild(title);

      if (brand.description) {
        var desc = document.createElement("p");
        desc.className = "tlkv-brand-showcase__desc";
        desc.textContent = brand.description;
        brandCol.appendChild(desc);
      }

      root.appendChild(brandCol);

      var productsCol = document.createElement("div");
      productsCol.className = "tlkv-brand-showcase__products";

      if (products.length && global.TLKVProductGrid) {
        productsCol.appendChild(
          global.TLKVProductGrid.createProductGrid(products, {
            resolveImage: opts.resolveImage,
            gridClass: "tlkv-product-grid tlkv-product-grid--showcase",
            cardVariant: "showcase",
          })
        );
      } else {
        var empty = document.createElement("p");
        empty.className = "tlkv-product-empty";
        empty.textContent = "Chưa có sản phẩm cho thương hiệu này.";
        productsCol.appendChild(empty);
      }

      root.appendChild(productsCol);
      return root;
    }

    /* —— Archive / legacy brand section —— */
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
