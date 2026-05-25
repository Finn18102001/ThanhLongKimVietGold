(function (global) {
  "use strict";

  var debounceTimer = null;

  function renderHomepage(container, data) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "tlkv-home-featured__catalog";

    var brandSections = (data && data.brandSections) || [];
    if (!global.TLKVBrandSection) return;

    brandSections.forEach(function (section) {
      container.appendChild(
        global.TLKVBrandSection.createBrandSection(
          {
            brand: section.brand,
            products: section.products,
            limit: 6,
          },
          { layout: "home", homeContext: true }
        )
      );
    });

    if (!container.children.length) {
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Chưa có sản phẩm hiển thị.";
      container.appendChild(p);
    }
  }

  async function mountHomepageCatalog(selector, opts) {
    var el = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!el) return null;

    try {
      if (!global.TLKVCatalogApi || !global.TLKVCatalogApi.fetchHomepageCatalog) {
        throw new Error("TLKVCatalogApi chưa load.");
      }
      var data = await global.TLKVCatalogApi.fetchHomepageCatalog(opts || {});
      renderHomepage(el, data);
      return data;
    } catch (err) {
      console.error(err);
      el.innerHTML = "";
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Không tải được sản phẩm trang chủ.";
      el.appendChild(p);
      return null;
    }
  }

  function scheduleRefresh(selector) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (global.TLKVCatalogApi && global.TLKVCatalogApi.invalidateHomeCache) {
        global.TLKVCatalogApi.invalidateHomeCache();
      }
      mountHomepageCatalog(selector, { skipCache: true });
    }, 350);
  }

  global.TLKVHomepageCatalog = {
    mountHomepageCatalog: mountHomepageCatalog,
    renderHomepage: renderHomepage,
    scheduleRefresh: scheduleRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
