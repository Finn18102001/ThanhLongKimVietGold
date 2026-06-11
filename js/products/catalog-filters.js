(function (global) {
  "use strict";

  var ARCHIVE_PAGE_SIZE = 24;

  function normPath() {
    var p = (window.location.pathname || "").replace(/\/+$/, "");
    return p || "/";
  }

  /** SEO path: /sanpham/danh-muc/:slug */
  function categorySlugFromPath() {
    var m = normPath().match(/^\/sanpham\/danh-muc\/([^/]+)$/i);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /** SEO path: /thuong-hieu/:slug */
  function brandSlugFromPath() {
    var m = normPath().match(/^\/thuong-hieu\/([^/]+)$/i);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /** Catalog page kind from URL */
  function catalogPageKind() {
    var p = normPath();
    if (p === "/sanpham/vang-tich-luy") return "accumulation";
    if (p === "/sanpham/vang-trang-suc") return "jewelry";
    return "all";
  }

  function readUrlState() {
    var u = new URL(window.location.href);
    var sortRaw = String(u.searchParams.get("sort") || "").trim().toLowerCase();
    var sort = ["price_asc", "price_desc", "newest", "sort"].indexOf(sortRaw) >= 0 ? sortRaw : "sort";
    return {
      page: Math.max(1, parseInt(u.searchParams.get("page"), 10) || 1),
      brandSlug: String(u.searchParams.get("brand") || "").trim() || brandSlugFromPath(),
      categorySlug: String(u.searchParams.get("cat") || "").trim() || categorySlugFromPath(),
      featured: u.searchParams.get("featured") === "1",
      hot: u.searchParams.get("hot") === "1",
      bestSeller: u.searchParams.get("bestseller") === "1",
      sort: sort,
      q: String(u.searchParams.get("q") || "").trim(),
    };
  }

  function writeUrlState(state, replace) {
    var u = new URL(window.location.href);
    if (state.page > 1) u.searchParams.set("page", String(state.page));
    else u.searchParams.delete("page");
    if (state.brandSlug) u.searchParams.set("brand", state.brandSlug);
    else u.searchParams.delete("brand");
    if (state.categorySlug) u.searchParams.set("cat", state.categorySlug);
    else u.searchParams.delete("cat");
    if (state.featured) u.searchParams.set("featured", "1");
    else u.searchParams.delete("featured");
    if (state.hot) u.searchParams.set("hot", "1");
    else u.searchParams.delete("hot");
    if (state.bestSeller) u.searchParams.set("bestseller", "1");
    else u.searchParams.delete("bestseller");
    if (state.sort && state.sort !== "sort") u.searchParams.set("sort", state.sort);
    else u.searchParams.delete("sort");
    if (state.q) u.searchParams.set("q", state.q);
    else u.searchParams.delete("q");
    if (replace) window.history.replaceState(null, "", u.toString());
    else window.history.pushState(null, "", u.toString());
  }

  function clientFilterByQuery(items, q) {
    if (!q) return items;
    var needle = q.toLowerCase();
    return items.filter(function (p) {
      return (
        String(p.name || "").toLowerCase().indexOf(needle) >= 0 ||
        String(p.brandName || "").toLowerCase().indexOf(needle) >= 0 ||
        String(p.categoryName || "").toLowerCase().indexOf(needle) >= 0
      );
    });
  }

  global.TLKVCatalogFilters = {
    ARCHIVE_PAGE_SIZE: ARCHIVE_PAGE_SIZE,
    readUrlState: readUrlState,
    writeUrlState: writeUrlState,
    categorySlugFromPath: categorySlugFromPath,
    brandSlugFromPath: brandSlugFromPath,
    catalogPageKind: catalogPageKind,
    clientFilterByQuery: clientFilterByQuery,
  };
})(typeof window !== "undefined" ? window : globalThis);
