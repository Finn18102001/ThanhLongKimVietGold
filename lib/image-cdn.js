"use strict";

/**
 * Server-side image CDN helper.
 *
 * All public images are served through the Cloudflare Worker CDN instead of
 * directly from Supabase Storage.
 *
 * To switch CDN domains later, only change the environment variable:
 *   NEXT_PUBLIC_IMAGE_CDN=https://cdn.thanglongkimviet.vn
 *
 * Do NOT hardcode the active CDN URL anywhere else in the codebase.
 */

const IMAGE_CDN = (process.env.NEXT_PUBLIC_IMAGE_CDN || "").replace(/\/$/, "");

/** Previous Worker hostnames — rewrite to IMAGE_CDN at render time. */
const LEGACY_CDN_ORIGINS = [
  "https://tlkv-image-cdn.tuananh18101.workers.dev",
].map(function (o) {
  return o.replace(/\/$/, "");
});

function matchCdnOrigin(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (IMAGE_CDN && s.startsWith(IMAGE_CDN)) return IMAGE_CDN;
  for (let i = 0; i < LEGACY_CDN_ORIGINS.length; i++) {
    const origin = LEGACY_CDN_ORIGINS[i];
    if (origin && s.startsWith(origin)) return origin;
  }
  return null;
}

/**
 * Build a public CDN URL for a Supabase Storage object.
 *
 * @param {string} bucket  - Storage bucket name (e.g. "product-media", "news-media")
 * @param {string} path    - Object path inside the bucket (e.g. "products/123/thumbnail/abc.jpg")
 * @returns {string}       - Full CDN URL
 */
function buildStorageImageUrl(bucket, path) {
  if (!IMAGE_CDN) {
    throw new Error(
      "NEXT_PUBLIC_IMAGE_CDN is not set. " +
      "Add it to your .env / .env.local file."
    );
  }
  const cleanPath = String(path || "").replace(/^\//, "");
  return `${IMAGE_CDN}/${bucket}/${cleanPath}`;
}

/**
 * Extract the storage path (everything after the bucket name) from either a
 * CDN URL or a legacy Supabase Storage URL.
 *
 * Supports:
 *   https://cdn.thanglongkimviet.vn/<bucket>/<path>
 *   https://tlkv-image-cdn.tuananh18101.workers.dev/<bucket>/<path>  (legacy)
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * @param {string} url - Any public image URL
 * @returns {string}   - Path after the bucket segment, or "" if not matched
 */
function pathFromStorageUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";

  const origin = matchCdnOrigin(s);
  if (origin) {
    const rest = s.slice(origin.length).replace(/^\//, "");
    const slash = rest.indexOf("/");
    return slash === -1 ? "" : rest.slice(slash + 1);
  }

  const marker = "/storage/v1/object/public/";
  const idx = s.indexOf(marker);
  if (idx !== -1) {
    const rest = s.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    return slash === -1 ? "" : rest.slice(slash + 1);
  }

  return "";
}

function bucketFromStorageUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";

  const origin = matchCdnOrigin(s);
  if (origin) {
    const rest = s.slice(origin.length).replace(/^\//, "");
    const slash = rest.indexOf("/");
    return slash === -1 ? rest : rest.slice(0, slash);
  }

  const marker = "/storage/v1/object/public/";
  const idx = s.indexOf(marker);
  if (idx !== -1) {
    const rest = s.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    return slash === -1 ? rest : rest.slice(0, slash);
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
 */
function convertImageUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  if (IMAGE_CDN && s.startsWith(IMAGE_CDN)) return s;
  if (!/^https?:\/\//i.test(s)) return s;

  const bucket = bucketFromStorageUrl(s);
  const path = pathFromStorageUrl(s);
  if (!bucket || !path || !IMAGE_CDN) return s;
  return buildStorageImageUrl(bucket, path);
}

module.exports = {
  IMAGE_CDN,
  buildStorageImageUrl,
  convertImageUrl,
  pathFromStorageUrl,
  bucketFromStorageUrl,
};
