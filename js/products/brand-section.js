(function (global) {
  "use strict";

  var DEFAULT_LIMIT =
    typeof global.TLKV_PRODUCTS_PER_BRAND_SECTION === "number"
      ? global.TLKV_PRODUCTS_PER_BRAND_SECTION
      : 6;

  function createHomeBrandCard(brand) {
    var card = document.createElement("article");
    card.className = "tlkv-brand-card tlkv-brand-card--home";
    card.setAttribute("aria-label", brand.name || "Thương hiệu");

    var inner = document.createElement("div");
    inner.className = "tlkv-brand-card__inner";

    var logoFrame = document.createElement("div");
    logoFrame.className = "tlkv-brand-card__logo-frame";

    if (brand.logoUrl) {
      var logo = document.createElement("img");
      logo.className = "tlkv-brand-card__logo";
      logo.src = brand.logoUrl;
      logo.alt = brand.name || "";
      logo.loading = "lazy";
      logo.decoding = "async";
      logo.width = 160;
      logo.height = 160;
      logoFrame.appendChild(logo);
    } else {
      var monogram = document.createElement("span");
      monogram.className = "tlkv-brand-card__monogram";
      monogram.textContent = (brand.name || "B").charAt(0).toUpperCase();
      logoFrame.appendChild(monogram);
    }

    inner.appendChild(logoFrame);

    var title = document.createElement("h3");
    title.className = "tlkv-brand-card__name";
    title.id = "brand-" + (brand.slug || brand.id || "card") + "-title";
    if (brand.slug) {
      var nameLink = document.createElement("a");
      nameLink.href = brand.viewAllHref || "/thuong-hieu/" + encodeURIComponent(brand.slug);
      nameLink.className = "tlkv-brand-card__name-link";
      nameLink.textContent = brand.name || "";
      title.appendChild(nameLink);
    } else {
      title.textContent = brand.name || "";
    }
    inner.appendChild(title);

    card.appendChild(inner);
    return card;
  }

  function createHomeFeaturedEmpty(brand) {
    var panel = document.createElement("div");
    panel.className = "tlkv-featured-empty";
    panel.setAttribute("role", "status");

    var name = document.createElement("p");
    name.className = "tlkv-featured-empty__brand";
    name.textContent = brand.name || "";
    panel.appendChild(name);

    var msg = document.createElement("p");
    msg.className = "tlkv-featured-empty__message";
    msg.textContent = "Hiện tại chưa có sản phẩm nổi bật";
    panel.appendChild(msg);

    return panel;
  }

  function mountHomeProductsCarousel(productsCol, products, opts) {
    var carousel = document.createElement("div");
    carousel.className = "tlkv-featured-carousel";
    carousel.setAttribute("data-tlkv-featured-carousel", "");

    var viewport = document.createElement("div");
    viewport.className = "tlkv-featured-carousel__viewport";
    viewport.setAttribute("data-carousel-viewport", "");
    viewport.setAttribute("tabindex", "0");

    var track = document.createElement("div");
    track.className = "tlkv-featured-carousel__track";
    track.setAttribute("data-carousel-track", "");

    var grid = global.TLKVProductGrid.createProductGrid(products, {
      resolveImage: opts.resolveImage,
      gridClass: "tlkv-product-grid tlkv-product-grid--home-featured",
      cardVariant: "home-featured",
    });

    Array.prototype.forEach.call(grid.children, function (card) {
      var slide = document.createElement("div");
      slide.className = "tlkv-featured-carousel__slide";
      slide.setAttribute("data-carousel-slide", "");
      slide.appendChild(card);
      track.appendChild(slide);
    });

    viewport.appendChild(track);
    carousel.appendChild(viewport);
    productsCol.appendChild(carousel);

    global.requestAnimationFrame(function () {
      if (global.TLKVFeaturedCarousel) {
        global.TLKVFeaturedCarousel.mount(carousel, { gap: 14, autoplay: true });
      }
    });
  }

  /**
   * @param {{
   *   brand: { id, name, slug, description?, logoUrl?, viewAllHref? },
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
    var isHome = opts.layout === "home" || opts.homeContext === true;
    var products = section.products || [];
    if (!isHome && limit > 0) {
      products = products.slice(0, limit);
    }

    var root = document.createElement("section");
    root.className = isHome
      ? "tlkv-brand-showcase tlkv-brand-showcase--home"
      : "tlkv-brand-section";
    root.id = "brand-" + (brand.slug || brand.id || "section");
    root.setAttribute("aria-labelledby", root.id + "-title");

    if (isHome) {
      var row = document.createElement("div");
      row.className = "tlkv-brand-showcase__row";

      row.appendChild(createHomeBrandCard(brand));

      var productsCol = document.createElement("div");
      productsCol.className = "tlkv-brand-showcase__products";

      if (products.length && global.TLKVProductGrid) {
        mountHomeProductsCarousel(productsCol, products, opts);
      } else {
        productsCol.appendChild(createHomeFeaturedEmpty(brand));
      }

      row.appendChild(productsCol);
      root.appendChild(row);
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
    createHomeBrandCard: createHomeBrandCard,
    createHomeFeaturedEmpty: createHomeFeaturedEmpty,
  };
})(typeof window !== "undefined" ? window : globalThis);
