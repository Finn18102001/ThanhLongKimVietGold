/**
 * Browser-side image CDN helper.
 *
 * All public images are served through the Cloudflare Worker CDN.
 * The CDN base URL is injected at page render time via window.__TLKV_IMAGE_CDN__.
 *
 * To switch CDN domains later, only change:
 *   NEXT_PUBLIC_IMAGE_CDN in .env / .env.local
 * — no code changes needed for the active domain.
 *
 * Usage:
 *   TLKVImageCDN.buildStorageImageUrl("product-media", "products/123/thumbnail/abc.jpg")
 *   TLKVImageCDN.pathFromStorageUrl("https://cdn.thanglongkimviet.vn/product-media/products/123/thumbnail/abc.jpg")
 */
(function (global) {
  "use strict";

  /** CDN base URL — injected by the server via window.__TLKV_IMAGE_CDN__ */
  var IMAGE_CDN = (
    (global.__TLKV_IMAGE_CDN__ && String(global.__TLKV_IMAGE_CDN__).trim()) || ""
  ).replace(/\/$/, "");

  /** Previous Worker hostnames — rewrite to IMAGE_CDN at render time. */
  var LEGACY_CDN_ORIGINS = [
    "https://tlkv-image-cdn.tuananh18101.workers.dev",
  ];

  function warnMissingCdn() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[TLKVImageCDN] __TLKV_IMAGE_CDN__ is not set — image may not load.");
    }
  }

  function matchCdnOrigin(url) {
    var s = String(url || "").trim();
    if (!s) return null;
    if (IMAGE_CDN && s.indexOf(IMAGE_CDN) === 0) return IMAGE_CDN;
    for (var i = 0; i < LEGACY_CDN_ORIGINS.length; i++) {
      var origin = LEGACY_CDN_ORIGINS[i];
      if (origin && s.indexOf(origin) === 0) return origin;
    }
    return null;
  }

  /**
   * Build a public CDN URL for a Supabase Storage object.
   *
   * @param {string} bucket - Storage bucket name
   * @param {string} path   - Object path inside the bucket
   * @returns {string}
   */
  function buildStorageImageUrl(bucket, path) {
    var base = IMAGE_CDN;
    if (!base) {
      warnMissingCdn();
      return "";
    }
    var cleanPath = String(path || "").replace(/^\//, "");
    return base + "/" + bucket + "/" + cleanPath;
  }

  /**
   * Extract the storage path (everything after the bucket name) from either a
   * CDN URL or a legacy Supabase Storage URL.
   *
   * @param {string} url - Any public image URL
   * @returns {string}   - Path after the bucket segment, or ""
   */
  function pathFromStorageUrl(url) {
    var s = String(url || "").trim();
    if (!s) return "";

    var origin = matchCdnOrigin(s);
    if (origin) {
      var rest = s.slice(origin.length).replace(/^\//, "");
      var slash = rest.indexOf("/");
      return slash === -1 ? "" : rest.slice(slash + 1);
    }

    var marker = "/storage/v1/object/public/";
    var idx = s.indexOf(marker);
    if (idx !== -1) {
      var after = s.slice(idx + marker.length);
      var sl = after.indexOf("/");
      return sl === -1 ? "" : after.slice(sl + 1);
    }

    return "";
  }

  /**
   * Extract just the bucket name from a CDN or legacy Supabase Storage URL.
   *
   * @param {string} url
   * @returns {string}
   */
  function bucketFromStorageUrl(url) {
    var s = String(url || "").trim();
    if (!s) return "";

    var origin = matchCdnOrigin(s);
    if (origin) {
      var rest = s.slice(origin.length).replace(/^\//, "");
      var slash = rest.indexOf("/");
      return slash === -1 ? rest : rest.slice(0, slash);
    }

    var marker = "/storage/v1/object/public/";
    var idx = s.indexOf(marker);
    if (idx !== -1) {
      var after = s.slice(idx + marker.length);
      var sl = after.indexOf("/");
      return sl === -1 ? after : after.slice(0, sl);
    }

    return "";
  }

  /**
   * Convert a legacy Supabase / old Worker URL into the current CDN URL.
   *
   * Rules:
   * - already current CDN => unchanged
   * - legacy Worker CDN / Supabase public URL => current CDN
   * - non-storage URL / local path => unchanged
   *
   * @param {string} url
   * @returns {string}
   */
  function convertImageUrl(url) {
    var s = String(url || "").trim();
    if (!s) return s;

    if (IMAGE_CDN && s.indexOf(IMAGE_CDN) === 0) return s;
    if (!/^https?:\/\//i.test(s)) return s;

    var bucket = bucketFromStorageUrl(s);
    var path = pathFromStorageUrl(s);
    if (!bucket || !path) return s;
    if (!IMAGE_CDN) {
      warnMissingCdn();
      return s;
    }
    return buildStorageImageUrl(bucket, path);
  }

  global.TLKVImageCDN = {
    get IMAGE_CDN() { return IMAGE_CDN; },
    buildStorageImageUrl: buildStorageImageUrl,
    convertImageUrl: convertImageUrl,
    pathFromStorageUrl: pathFromStorageUrl,
    bucketFromStorageUrl: bucketFromStorageUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
