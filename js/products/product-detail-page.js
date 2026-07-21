(function (global) {
  "use strict";

  var state = { product: null, goldListenerBound: false };

  function parsePath() {
    var p = (window.location.pathname || "").replace(/\/+$/, "");
    var m = p.match(/^\/sanpham\/([^/]+)\/([^/]+)$/i);
    if (!m) return null;
    if (m[1].toLowerCase() === "danh-muc" || m[1].toLowerCase() === "gia-vang") return null;
    return { categorySlug: decodeURIComponent(m[1]), productSlug: decodeURIComponent(m[2]) };
  }

  function setMeta(title, desc, canonical) {
    if (title) document.title = title;
    var d = document.querySelector('meta[name="description"]');
    if (d && desc) d.setAttribute("content", desc);
    var c = document.querySelector('link[rel="canonical"]');
    if (c && canonical) c.setAttribute("href", canonical);
  }

  function formatPriceLabel(product) {
    if (!product || product.showPrice !== true) return "";
    var t = String(product.priceText || "").trim();
    if (!t) return "";
    if (/^li[eê]n\s*h[eệ]$/i.test(t)) return "";
    if (/^contact$/i.test(t)) return "";
    return t;
  }

  async function applyDerivedPrice(product, goldRows) {
    var engine = global.TLKVProductPriceEngine;
    if (!engine || typeof engine.applyDerivedPricesFromRows !== "function") return product;
    var rows = goldRows;
    if (!rows || !rows.length) {
      if (typeof engine.resolveGoldRowsForPricing === "function") {
        rows = await engine.resolveGoldRowsForPricing();
      }
    }
    if (!rows || !rows.length) return product;
    var list = [product];
    engine.applyDerivedPricesFromRows(list, rows);
    return list[0];
  }

  function injectJsonLd(product) {
    var script = document.getElementById("product-jsonld");
    if (!script) {
      script = document.createElement("script");
      script.id = "product-jsonld";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: product.thumbnailUrl || product.image,
      brand: product.brandName ? { "@type": "Brand", name: product.brandName } : undefined,
      offers: {
        "@type": "Offer",
        price: product.priceNumeric || undefined,
        priceCurrency: "VND",
        availability: "https://schema.org/InStock",
      },
    });
  }

  function renderProductDetail(root, product) {
    var canonical =
      "https://thanglongkimviet.vn/sanpham/" +
      (product.categorySlug || "") +
      "/" +
      product.slug;
    var priceLabel = formatPriceLabel(product);
    setMeta(product.name + " | Thăng Long Kim Việt", priceLabel || product.name, canonical);
    injectJsonLd(product);

    var imgSrc = product.thumbnailUrl || (global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc(product.image));
    root.innerHTML =
      '<article class="tlkv-product-detail">' +
      '<div class="tlkv-product-detail__media">' +
      (imgSrc ? '<img src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" loading="eager" />' : "") +
      "</div>" +
      '<div class="tlkv-product-detail__body">' +
      "<h1>" +
      (product.name || "") +
      "</h1>" +
      (product.brandName ? '<p class="tlkv-product-detail__brand">' + product.brandName + "</p>" : "") +
      (product.categoryName ? '<p class="tlkv-product-detail__cat">' + product.categoryName + "</p>" : "") +
      '<p class="tlkv-product-detail__price" id="product-detail-price">' +
      (priceLabel || "Liên hệ") +
      "</p>" +
      '<a class="tlkv-product-card__cta" href="' +
      (global.TLKV_PRODUCT_ZALO_URL || "https://zalo.me/0995682568") +
      '" target="_blank" rel="noopener noreferrer">Liên hệ</a>' +
      "</div></article>";
  }

  function patchDetailPrice(product) {
    var priceEl = document.getElementById("product-detail-price");
    if (!priceEl) return;
    var label = formatPriceLabel(product);
    priceEl.textContent = label || "Liên hệ";
    if (product && product.priceNumeric != null) {
      injectJsonLd(product);
    }
  }

  function bindGoldPriceListener() {
    if (state.goldListenerBound) return;
    state.goldListenerBound = true;
    global.addEventListener("tlkv:gold-rows-updated", function (ev) {
      if (!state.product) return;
      var rows = ev && ev.detail && ev.detail.rows ? ev.detail.rows : null;
      applyDerivedPrice(state.product, rows).then(function (updated) {
        state.product = updated;
        patchDetailPrice(updated);
      });
    });
  }

  async function mountProductDetail() {
    var root = document.getElementById("product-detail-root");
    var parsed = parsePath();
    if (!root || !parsed) return;

    bindGoldPriceListener();

    try {
      var p = await global.TLKVCatalogApi.fetchProductBySlugs(parsed.categorySlug, parsed.productSlug);
      if (!p) {
        root.innerHTML = '<p class="tlkv-product-empty">Không tìm thấy sản phẩm.</p>';
        return;
      }

      p = await applyDerivedPrice(p);
      state.product = p;
      renderProductDetail(root, p);
    } catch (err) {
      console.error(err);
      root.innerHTML = '<p class="tlkv-product-empty">Lỗi tải sản phẩm.</p>';
    }
  }

  document.addEventListener("DOMContentLoaded", mountProductDetail);

  global.TLKVProductDetailPage = { mountProductDetail: mountProductDetail };
})(typeof window !== "undefined" ? window : globalThis);
