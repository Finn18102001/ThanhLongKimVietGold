(function (global) {
  /** Existing site-wide Zalo contact — do not change integration behavior. */
  global.TLKV_PRODUCT_ZALO_URL = "https://zalo.me/0995682568";
  global.TLKV_PRODUCTS_PER_BRAND_SECTION = 7;

  /** Bump when logo binaries change — busts CDN/browser cache after deploy. */
  global.TLKV_LOGO_ASSET_VERSION = "20260623";
  var logoV = "?v=" + global.TLKV_LOGO_ASSET_VERSION;

  global.TLKV_SITE_LOGO_MARK_URL = "/assets/tlkv-logo-mark.png" + logoV;
  global.TLKV_SITE_LOGO_LOCKUP_URL = "/assets/tlkv-logo-lockup.png" + logoV;
  global.TLKV_SITE_LOGO_URL = global.TLKV_SITE_LOGO_MARK_URL;
  global.TLKV_SITE_LOGO_OG_URL =
    "https://thanglongkimviet.vn/assets/og-logo-256.png" + logoV;

  global.TLKV_BRAND_LOGO_FALLBACKS = {
    "thang-long-kim-viet": "/assets/tlkv-logo-mark.png" + logoV,
    "bao-tin-manh-hai": "/assets/brands/bao-tin-manh-hai.png",
    "bao-tin-minh-chau": "/assets/brands/bao-tin-minh-chau.png",
  };

  global.TLKV_BRAND_LOGO_PLATE_SLUG = "thang-long-kim-viet";

  global.TLKV_BRAND_NEEDS_LOGO_PLATE = function (slug) {
    return String(slug || "") === global.TLKV_BRAND_LOGO_PLATE_SLUG;
  };
})(typeof window !== "undefined" ? window : globalThis);
