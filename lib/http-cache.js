/**
 * Cache-Control helpers for public JSON endpoints (Vercel CDN / Cloudflare in front of origin).
 * Browser→Supabase `/rest/v1/*` cannot use these — that traffic never hits this origin.
 */
"use strict";

/** Brands: nearly static (≈3 rows). CDN 24h, browser 1h, SWR up to 7d. */
const BRANDS_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** News list/hero: ~1 article/day; edits possible. CDN 5m, browser 60s, SWR 15m. */
const NEWS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=900";

/** Admin / authenticated / explicit bypass. */
const NO_STORE_CACHE_CONTROL = "private, no-store, no-cache, must-revalidate";

function publicCacheVersion() {
  return String(process.env.PUBLIC_CACHE_VERSION || process.env.TLKV_PUBLIC_CACHE_VERSION || "1").trim() || "1";
}

/**
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function shouldBypassPublicCache(req) {
  if (!req) return false;
  if (req.query && (req.query.nocache === "1" || req.query.bypass === "1")) return true;
  const auth = String((req.headers && req.headers.authorization) || "").trim();
  if (!auth) return false;
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ""
  ).trim();
  // Bearer anon/publishable is still a public read — keep CDN cache.
  if (key && (auth === "Bearer " + key || auth === key)) return false;
  // Any other Authorization (user JWT) → treat as admin/session → no-store.
  return true;
}

/**
 * @param {import("express").Response} res
 * @param {string} directive
 */
function setCacheControl(res, directive) {
  res.setHeader("Cache-Control", directive);
  // Cloudflare respects CDN-Cache-Control when present.
  res.setHeader("CDN-Cache-Control", directive);
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("X-TLKV-Cache-Version", publicCacheVersion());
}

module.exports = {
  BRANDS_CACHE_CONTROL,
  NEWS_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
  publicCacheVersion,
  shouldBypassPublicCache,
  setCacheControl,
};
