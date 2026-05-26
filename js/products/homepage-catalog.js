(function (global) {
  "use strict";

  var debounceTimer = null;

  function renderLoadingSkeleton(container) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "tlkv-home-featured__catalog is-loading";

    for (var i = 0; i < 3; i++) {
      var row = document.createElement("div");
      row.className = "tlkv-home-skeleton-row";
      row.setAttribute("aria-hidden", "true");

      var brand = document.createElement("div");
      brand.className = "tlkv-home-skeleton-brand";
      row.appendChild(brand);

      var track = document.createElement("div");
      track.className = "tlkv-home-skeleton-track";
      for (var j = 0; j < 3; j++) {
        var card = document.createElement("div");
        card.className = "tlkv-home-skeleton-card";
        track.appendChild(card);
      }
      row.appendChild(track);
      container.appendChild(row);
    }
  }

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
            limit: section.limit,
          },
          { layout: "home", homeContext: true }
        )
      );
    });

    if (!container.children.length) {
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Hiện chưa có sản phẩm để hiển thị theo thương hiệu.";
      container.appendChild(p);
    }
  }

  async function mountHomepageCatalog(selector, opts) {
    var el = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!el) return null;

    renderLoadingSkeleton(el);

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
      el.className = "tlkv-home-featured__catalog is-error";
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Không tải được sản phẩm trang chủ. Vui lòng thử lại sau.";
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
