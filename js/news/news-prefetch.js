/**
 * Bind prefetch of news article detail on hover / pointerdown.
 * Speeds up navigation from Home + News list → /tin-tuc/:slug.
 */
(function (global) {
  "use strict";

  var BOUND = false;

  function slugFromNewsHref(href) {
    try {
      var u = new URL(href, global.location.origin);
      var m = u.pathname.replace(/\/+$/, "").match(/^\/tin-tuc\/([^/?#]+)$/i);
      if (!m) return null;
      var slug = decodeURIComponent(m[1] || "").trim();
      if (!slug) return null;
      if (slug === "danh-sach" || slug === "thi-truong") return null;
      return slug;
    } catch (_) {
      return null;
    }
  }

  function prefetchFromEvent(ev) {
    var t = ev && ev.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href*="/tin-tuc/"]');
    if (!a) return;
    var slug = slugFromNewsHref(a.getAttribute("href") || a.href);
    if (!slug) return;
    if (!global.TLKVNewsAPI || typeof global.TLKVNewsAPI.prefetchBySlug !== "function") return;
    global.TLKVNewsAPI.prefetchBySlug(slug);
  }

  function bindNewsPrefetch() {
    if (BOUND || typeof document === "undefined") return;
    BOUND = true;
    // pointerdown fires before click/navigation — warm cache while browser starts load.
    document.addEventListener("pointerdown", prefetchFromEvent, { capture: true, passive: true });
    document.addEventListener("mouseover", prefetchFromEvent, { capture: true, passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNewsPrefetch);
  } else {
    bindNewsPrefetch();
  }

  global.TLKVNewsPrefetch = { bind: bindNewsPrefetch, slugFromNewsHref: slugFromNewsHref };
})(typeof window !== "undefined" ? window : globalThis);
