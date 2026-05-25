(function (global) {
  "use strict";

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

  async function mountProductDetail() {
    var root = document.getElementById("product-detail-root");
    var parsed = parsePath();
    if (!root || !parsed) return;

    try {
      var p = await global.TLKVCatalogApi.fetchProductBySlugs(parsed.categorySlug, parsed.productSlug);
      if (!p) {
        root.innerHTML = "<p class=\"tlkv-product-empty\">Không tìm thấy sản phẩm.</p>";
        return;
      }

      var canonical =
        "https://thanglongkimviet.vn/sanpham/" +
        (p.categorySlug || parsed.categorySlug) +
        "/" +
        p.slug;
      setMeta(p.name + " | Thăng Long Kim Việt", p.priceText || p.name, canonical);
      injectJsonLd(p);

      var imgSrc = p.thumbnailUrl || (global.TLKVProducts && global.TLKVProducts.resolveProductImageSrc(p.image));
      root.innerHTML =
        '<article class="tlkv-product-detail">' +
        '<div class="tlkv-product-detail__media">' +
        (imgSrc ? '<img src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" loading="eager" />' : "") +
        "</div>" +
        '<div class="tlkv-product-detail__body">' +
        "<h1>" +
        (p.name || "") +
        "</h1>" +
        (p.brandName ? '<p class="tlkv-product-detail__brand">' + p.brandName + "</p>" : "") +
        (p.categoryName ? '<p class="tlkv-product-detail__cat">' + p.categoryName + "</p>" : "") +
        '<p class="tlkv-product-detail__price">' +
        (p.priceText || "Liên hệ") +
        "</p>" +
        '<a class="tlkv-product-card__cta" href="' +
        (global.TLKV_PRODUCT_ZALO_URL || "https://zalo.me/0995682568") +
        '" target="_blank" rel="noopener noreferrer">Liên hệ</a>' +
        "</div></article>";
    } catch (err) {
      console.error(err);
      root.innerHTML = "<p class=\"tlkv-product-empty\">Lỗi tải sản phẩm.</p>";
    }
  }

  document.addEventListener("DOMContentLoaded", mountProductDetail);

  global.TLKVProductDetailPage = { mountProductDetail: mountProductDetail };
})(typeof window !== "undefined" ? window : globalThis);
