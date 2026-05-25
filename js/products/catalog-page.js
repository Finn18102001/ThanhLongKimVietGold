(function (global) {
  "use strict";

  function renderLegacyFlatGrid(container, items) {
    if (global.TLKVProducts && global.TLKVProducts.renderProductGrid) {
      global.TLKVProducts.renderProductGrid(container, items);
      return;
    }
    container.innerHTML = "<p class=\"tlkv-product-empty\">Chưa có sản phẩm.</p>";
  }

  function renderBrandSections(container, sections) {
    container.innerHTML = "";
    container.className = "tlkv-catalog-root";

    if (!sections || !sections.length) {
      var empty = document.createElement("p");
      empty.className = "tlkv-product-empty";
      empty.textContent = "Chưa có sản phẩm nào.";
      container.appendChild(empty);
      return;
    }

    if (!global.TLKVBrandSection) {
      renderLegacyFlatGrid(
        container,
        sections.reduce(function (acc, s) {
          return acc.concat(s.products || []);
        }, [])
      );
      return;
    }

    sections.forEach(function (section) {
      container.appendChild(global.TLKVBrandSection.createBrandSection(section));
    });
  }

  async function mountBrandSectionsOnly(containerSelector) {
    var el =
      typeof containerSelector === "string"
        ? document.querySelector(containerSelector)
        : containerSelector;
    if (!el) return null;

    try {
      if (global.TLKVCatalogApi && global.TLKVCatalogApi.fetchBrandCatalogSections) {
        var sections = await global.TLKVCatalogApi.fetchBrandCatalogSections(6);
        if (sections.length) {
          renderBrandSections(el, sections);
          return { mode: "brand-sections", sections: sections };
        }
      }
    } catch (e) {
      console.warn("[TLKVCatalog] brand sections:", e);
    }

    try {
      var items =
        global.TLKVCatalogApi && global.TLKVCatalogApi.fetchFlatLegacyProducts
          ? await global.TLKVCatalogApi.fetchFlatLegacyProducts()
          : [];
      renderLegacyFlatGrid(el, items);
      return { mode: "legacy-flat", items: items };
    } catch (err) {
      console.error(err);
      el.innerHTML = "";
      var p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent = "Không tải được danh sách sản phẩm.";
      el.appendChild(p);
      return null;
    }
  }

  /** @deprecated Prefer TLKVCatalogArchive on /sanpham */
  async function mountCatalogPage(containerSelector) {
    if (global.TLKVCatalogArchive && document.getElementById("catalog-filter-toolbar")) {
      return global.TLKVCatalogArchive.mountCatalogArchive();
    }
    return mountBrandSectionsOnly(containerSelector);
  }

  global.TLKVCatalogPage = {
    mountCatalogPage: mountCatalogPage,
    mountBrandSectionsOnly: mountBrandSectionsOnly,
    renderBrandSections: renderBrandSections,
  };
})(typeof window !== "undefined" ? window : globalThis);
