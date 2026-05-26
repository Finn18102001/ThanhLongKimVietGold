(function (global) {

  "use strict";



  var ZALO_URL =

    typeof global.TLKV_PRODUCT_ZALO_URL === "string"

      ? global.TLKV_PRODUCT_ZALO_URL

      : "https://zalo.me/0995682568";



  var Layout = global.TLKVProductCardLayout;



  function escapeHtml(str) {

    if (!str) return "";

    return String(str)

      .replace(/&/g, "&amp;")

      .replace(/</g, "&lt;")

      .replace(/>/g, "&gt;")

      .replace(/"/g, "&quot;")

      .replace(/'/g, "&#39;");

  }



  /** Tránh trùng "Liên hệ" ở giá và nút CTA. */

  function formatPriceLabel(priceText) {

    var t = String(priceText || "").trim();

    if (!t) return null;

    if (/^li[eê]n\s*h[eệ]$/i.test(t)) return null;

    if (/^contact$/i.test(t)) return null;

    return t;

  }



  function resolveImageSrc(product, resolveFn) {

    if (product.thumbnailUrl) return product.thumbnailUrl;

    if (product.image && resolveFn) return resolveFn(product.image);

    if (product.image) return product.image;

    return "";

  }



  /**

   * @param {object} product

   * @param {{ resolveImage?: function, cardVariant?: string }} [opts]

   * @returns {HTMLElement}

   */

  function createProductCard(product, opts) {

    opts = opts || {};

    var resolveFn =

      opts.resolveImage ||

      (global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc);

    var variant = opts.cardVariant === "showcase"
      ? "showcase"
      : opts.cardVariant === "home-featured"
        ? "home-featured"
        : "catalog";

    var isShowcase = variant === "showcase";
    var isHomeFeatured = variant === "home-featured";

    var card = document.createElement("article");

    card.className = isShowcase
      ? "tlkv-product-card tlkv-product-card--showcase"
      : isHomeFeatured
        ? "tlkv-product-card tlkv-product-card--home-featured"
        : "tlkv-product-card";

    card.setAttribute("role", "listitem");



    if (Layout) {

      Layout.applyCardShellClasses(card, variant);

      var mediaRegion = Layout.createMediaRegion(variant);

      var src = resolveImageSrc(product, resolveFn);

      Layout.mountProductImage(

        mediaRegion.imgWrap,

        mediaRegion.skeleton,

        src,

        product.name || "Sản phẩm",

        mediaRegion.aspect

      );

      card.appendChild(mediaRegion.media);



      var regions = Layout.createBodyRegions();

      var nameEl = document.createElement("h3");

      nameEl.className = "tlkv-product-card__name";

      if (!isShowcase && !isHomeFeatured && product.slug && product.categorySlug) {

        var nameLink = document.createElement("a");

        nameLink.href =

          "/sanpham/" +

          encodeURIComponent(product.categorySlug) +

          "/" +

          encodeURIComponent(product.slug);

        nameLink.textContent = product.name || "";

        nameLink.className = "tlkv-product-card__name-link";

        nameEl.appendChild(nameLink);

      } else {

        nameEl.textContent = product.name || "";

      }

      regions.content.appendChild(nameEl);

      Layout.appendPriceSlot(regions.content, formatPriceLabel(product.priceText));



      var cta = document.createElement("a");

      cta.className = "tlkv-product-card__cta";

      cta.href = ZALO_URL;

      cta.target = "_blank";

      cta.rel = "noopener noreferrer";

      cta.textContent = "Liên hệ";

      cta.setAttribute("aria-label", "Liên hệ qua Zalo — " + (product.name || "sản phẩm"));

      regions.footer.appendChild(cta);



      card.appendChild(regions.body);

      return card;

    }



    /* Fallback if layout script missing */

    return createProductCardLegacy(product, opts, resolveFn, isShowcase);

  }



  function createProductCardLegacy(product, opts, resolveFn, isShowcase) {

    var card = document.createElement("article");

    card.className = isShowcase

      ? "tlkv-product-card tlkv-product-card--showcase"

      : "tlkv-product-card";

    card.setAttribute("role", "listitem");



    var media = document.createElement("div");

    media.className = "tlkv-product-card__media";

    var imgWrap = document.createElement("div");

    imgWrap.className = "tlkv-product-card__img-wrap";

    var src = resolveImageSrc(product, resolveFn);

    if (src) {

      var img = document.createElement("img");

      img.src = src;

      img.alt = product.name || "Sản phẩm";

      img.className = "tlkv-product-card__img";

      img.loading = "lazy";

      img.decoding = "async";

      imgWrap.appendChild(img);

    } else {

      var noImg = document.createElement("div");

      noImg.className = "tlkv-product-card__noimg";

      imgWrap.appendChild(noImg);

    }

    media.appendChild(imgWrap);

    card.appendChild(media);



    var body = document.createElement("div");

    body.className = "tlkv-product-card__body";

    var nameEl = document.createElement("h3");

    nameEl.className = "tlkv-product-card__name";

    nameEl.textContent = product.name || "";

    body.appendChild(nameEl);

    var priceLabel = formatPriceLabel(product.priceText);

    if (priceLabel) {

      var priceEl = document.createElement("p");

      priceEl.className = "tlkv-product-card__price";

      priceEl.textContent = priceLabel;

      body.appendChild(priceEl);

    }

    var cta = document.createElement("a");

    cta.className = "tlkv-product-card__cta";

    cta.href = ZALO_URL;

    cta.target = "_blank";

    cta.rel = "noopener noreferrer";

    cta.textContent = "Liên hệ";

    body.appendChild(cta);

    card.appendChild(body);

    return card;

  }



  global.TLKVProductCard = {

    createProductCard: createProductCard,

    escapeHtml: escapeHtml,

    formatPriceLabel: formatPriceLabel,

  };

})(typeof window !== "undefined" ? window : globalThis);

