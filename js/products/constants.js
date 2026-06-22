(function (global) {
  /** Existing site-wide Zalo contact — do not change integration behavior. */
  global.TLKV_PRODUCT_ZALO_URL = "https://zalo.me/0995682568";
  global.TLKV_PRODUCTS_PER_BRAND_SECTION = 7;
  global.TLKV_SITE_LOGO_URL = "/assets/new-logo/tlkv-new-logo-1.png";

  global.TLKV_BRAND_LOGO_FALLBACKS = {
    "thang-long-kim-viet": "/assets/new-logo/tlkv-new-logo-1.png",
    "bao-tin-manh-hai": "/assets/brands/bao-tin-manh-hai.png",
    "bao-tin-minh-chau": "/assets/brands/bao-tin-minh-chau.png",
  };

  global.TLKV_BRAND_LOGO_PLATE_SLUG = "thang-long-kim-viet";

  global.TLKV_BRAND_NEEDS_LOGO_PLATE = function (slug) {
    return String(slug || "") === global.TLKV_BRAND_LOGO_PLATE_SLUG;
  };
})(typeof window !== "undefined" ? window : globalThis);
