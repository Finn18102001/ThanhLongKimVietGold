(function (global) {
  /** Existing site-wide Zalo contact — do not change integration behavior. */
  global.TLKV_PRODUCT_ZALO_URL = "https://zalo.me/0995682568";
  global.TLKV_PRODUCTS_PER_BRAND_SECTION = 8;

  /**
   * Bump when logo binaries change — busts CDN/browser/Google cache after deploy.
   * Keep in sync with lib/ui-asset-version.js, vercel.json redirects, site.webmanifest.
   */
  global.TLKV_LOGO_ASSET_VERSION = "20261114e";
  var logoV = "?v=" + global.TLKV_LOGO_ASSET_VERSION;

  /** Mark trong suốt — navbar, tab, Sản phẩm nổi bật, Vàng tích lũy (nền do CSS/container). */
  global.TLKV_SITE_LOGO_MARK_URL = "/assets/tlkv-logo-mark.png" + logoV;
  /** Lockup vàng trên đỏ #8a1c1d — favicon / OG / apple-touch only. */
  global.TLKV_SITE_LOGO_LOCKUP_URL = "/assets/tlkv-logo-lockup.png" + logoV;
  global.TLKV_SITE_LOGO_URL = global.TLKV_SITE_LOGO_MARK_URL;
  global.TLKV_SITE_LOGO_OG_URL =
    "https://thanglongkimviet.vn/assets/og-logo-tlkv-red-v2.png" + logoV;

  /** Alias: UI vuông dùng mark trong suốt + plate CSS #8a1c1d (không chồng lockup). */
  global.TLKV_SITE_LOGO_PLATE_URL = global.TLKV_SITE_LOGO_MARK_URL;

  global.TLKV_BRAND_LOGO_FALLBACKS = {
    "thang-long-kim-viet": "/assets/tlkv-logo-mark.png" + logoV,
    "bao-tin-manh-hai": "/assets/brands/bao-tin-manh-hai.png?v=20260727b",
    "bao-tin-minh-chau": "/assets/brands/bao-tin-minh-chau.png?v=20260727b",
  };

  global.TLKV_BRAND_LOGO_PLATE_SLUG = "thang-long-kim-viet";

  global.TLKV_BRAND_NEEDS_LOGO_PLATE = function (slug) {
    return String(slug || "") === global.TLKV_BRAND_LOGO_PLATE_SLUG;
  };
})(typeof window !== "undefined" ? window : globalThis);
