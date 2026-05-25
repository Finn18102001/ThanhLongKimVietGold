(function (global) {
  "use strict";

  function slugFromPath() {
    if (global.TLKVCatalogFilters && global.TLKVCatalogFilters.brandSlugFromPath) {
      return global.TLKVCatalogFilters.brandSlugFromPath();
    }
    var m = (window.location.pathname || "").match(/^\/thuong-hieu\/([^/]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function setMeta(title, desc, canonical) {
    if (title) document.title = title;
    var d = document.querySelector('meta[name="description"]');
    if (d && desc) d.setAttribute("content", desc);
    var c = document.querySelector('link[rel="canonical"]');
    if (c && canonical) c.setAttribute("href", canonical);
  }

  async function mountBrandPage() {
    var root = document.getElementById("brand-catalog-root");
    if (!root) return;

    var slug = slugFromPath();
    if (!slug) {
      root.innerHTML = "<p class=\"tlkv-product-empty\">Thiếu thương hiệu.</p>";
      return;
    }

    try {
      var section = await global.TLKVCatalogApi.fetchBrandBySlug(slug);
      if (!section) {
        root.innerHTML = "<p class=\"tlkv-product-empty\">Không tìm thấy thương hiệu.</p>";
        return;
      }

      var b = section.brand;
      setMeta(
        b.name + " - Thăng Long Kim Việt",
        b.description || "Sản phẩm " + b.name,
        "https://thanglongkimviet.vn/thuong-hieu/" + b.slug
      );

      var h1 = document.getElementById("brand-page-title");
      if (h1) h1.textContent = b.name;

      root.innerHTML = "";
      if (global.TLKVBrandSection) {
        root.appendChild(
          global.TLKVBrandSection.createBrandSection({
            brand: b,
            products: section.products,
            limit: 0,
          })
        );
      }
    } catch (err) {
      console.error(err);
      root.innerHTML = "<p class=\"tlkv-product-empty\">Lỗi tải thương hiệu.</p>";
    }
  }

  document.addEventListener("DOMContentLoaded", mountBrandPage);

  global.TLKVBrandPage = { mountBrandPage: mountBrandPage };
})(typeof window !== "undefined" ? window : globalThis);
