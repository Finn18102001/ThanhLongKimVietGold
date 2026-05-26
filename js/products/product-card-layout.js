/**
 * Product card layout normalization — fixed media ratio, CLS-safe images, equal-height body.
 */
(function (global) {
  "use strict";

  var ASPECT_CATALOG = { w: 320, h: 252, css: "4 / 5" };
  var ASPECT_SHOWCASE = { w: 1, h: 1, css: "1 / 1" };

  var PLACEHOLDER_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect width='400' height='500' fill='%23F5F3EE'/%3E%3Cpath d='M200 210c-22 0-40-18-40-40s18-40 40-40 40 18 40 40-18 40-40 40zm-72 118h144l24-72c6-18-6-36-24-36H128c-18 0-30 18-24 36l24 72z' fill='%23D4CFC4'/%3E%3C/svg%3E";

  function getAspectConfig(variant) {
    if (variant === "showcase") return ASPECT_SHOWCASE;
    return ASPECT_CATALOG;
  }

  function applyCardShellClasses(card, variant) {
    card.classList.add("tlkv-product-card--normalized");
    if (variant === "showcase") {
      card.classList.add("tlkv-product-card--ratio-1-1");
    } else {
      card.classList.add("tlkv-product-card--ratio-4-5");
    }
  }

  /**
   * @returns {{ media: HTMLElement, imgWrap: HTMLElement, skeleton: HTMLElement }}
   */
  function createMediaRegion(variant) {
    var aspect = getAspectConfig(variant);
    var media = document.createElement("div");
    media.className = "tlkv-product-card__media";
    media.style.setProperty("--tlkv-card-aspect", aspect.css);

    var imgWrap = document.createElement("div");
    imgWrap.className = "tlkv-product-card__img-wrap";

    var skeleton = document.createElement("div");
    skeleton.className = "tlkv-product-card__skeleton";
    skeleton.setAttribute("aria-hidden", "true");

    imgWrap.appendChild(skeleton);
    media.appendChild(imgWrap);

    return { media: media, imgWrap: imgWrap, skeleton: skeleton, aspect: aspect };
  }

  function markMediaLoaded(imgWrap) {
    imgWrap.classList.remove("is-loading");
    imgWrap.classList.add("is-loaded");
  }

  function markMediaEmpty(imgWrap, skeleton) {
    if (skeleton && skeleton.parentNode) skeleton.remove();
    imgWrap.classList.remove("is-loading");
    imgWrap.classList.add("is-empty", "is-loaded");
  }

  /**
   * @param {HTMLElement} imgWrap
   * @param {HTMLElement} skeleton
   * @param {string} src
   * @param {string} alt
   * @param {{ w: number, h: number }} aspect
   */
  function mountProductImage(imgWrap, skeleton, src, alt, aspect) {
    if (!src) {
      var noImg = document.createElement("div");
      noImg.className = "tlkv-product-card__noimg";
      noImg.setAttribute("aria-hidden", "true");
      noImg.textContent = "";
      imgWrap.appendChild(noImg);
      markMediaEmpty(imgWrap, skeleton);
      return null;
    }

    var img = document.createElement("img");
    img.className = "tlkv-product-card__img";
    img.alt = alt || "Sản phẩm";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = aspect.w;
    img.height = aspect.h;
    img.setAttribute("sizes", "(max-width: 575px) 320px, (max-width: 991px) 320px, 320px");

    imgWrap.classList.add("is-loading");

    function onSuccess() {
      markMediaLoaded(imgWrap);
    }

    function onError() {
      img.removeEventListener("load", onSuccess);
      img.removeEventListener("error", onError);
      img.src = PLACEHOLDER_SVG;
      imgWrap.classList.add("is-error");
      onSuccess();
    }

    img.addEventListener("load", onSuccess, { once: true });
    img.addEventListener("error", onError, { once: true });

    imgWrap.appendChild(img);
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      onSuccess();
    }

    return img;
  }

  function createBodyRegions() {
    var body = document.createElement("div");
    body.className = "tlkv-product-card__body";

    var content = document.createElement("div");
    content.className = "tlkv-product-card__content";

    var footer = document.createElement("div");
    footer.className = "tlkv-product-card__footer";

    body.appendChild(content);
    body.appendChild(footer);

    return { body: body, content: content, footer: footer };
  }

  /** Always reserve price row height (with or without visible price). */
  function appendPriceSlot(content, priceLabel) {
    var priceEl = document.createElement("p");
    priceEl.className = "tlkv-product-card__price";
    if (priceLabel) {
      priceEl.textContent = priceLabel;
    } else {
      priceEl.classList.add("tlkv-product-card__price--placeholder");
      priceEl.setAttribute("aria-hidden", "true");
      priceEl.innerHTML = "&#8203;";
    }
    content.appendChild(priceEl);
    return priceEl;
  }

  global.TLKVProductCardLayout = {
    PLACEHOLDER_SVG: PLACEHOLDER_SVG,
    getAspectConfig: getAspectConfig,
    applyCardShellClasses: applyCardShellClasses,
    createMediaRegion: createMediaRegion,
    mountProductImage: mountProductImage,
    createBodyRegions: createBodyRegions,
    appendPriceSlot: appendPriceSlot,
  };
})(typeof window !== "undefined" ? window : globalThis);
