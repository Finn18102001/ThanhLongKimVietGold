/**
 * Central UI asset version for logo/favicon/OG/hero cache busting.
 * Bump this token when those binaries change, then sync:
 * - js/products/constants.js (TLKV_LOGO_ASSET_VERSION)
 * - js/tv-gold-board.js (TLKV_TV_LOGO_CACHE_VER)
 * - HTML ?v= query strings for logos/favicons/hero
 * - site.webmanifest icon URLs
 * - vercel.json legacy logo 301 Location targets
 * - routes/web.js (reads this module)
 *
 * See docs/audit/WEBSITE_UI_CACHE_VERSION_AUDIT.md (Business Audit v2 §15).
 */
"use strict";

const TLKV_UI_ASSET_VERSION = "20261114e";

module.exports = {
  TLKV_UI_ASSET_VERSION,
};
