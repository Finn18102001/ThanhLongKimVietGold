(function (global) {
  /** Existing site-wide Zalo contact — do not change integration behavior. */
  global.TLKV_PRODUCT_ZALO_URL = "https://zalo.me/0995682568";
  global.TLKV_PRODUCTS_PER_BRAND_SECTION = 6;
  /** Homepage: max products per brand row (temporary: all products grouped by brand_id). */
  global.TLKV_HOMEPAGE_FEATURED_LIMIT = 6;

  /**
   * Homepage visual brand config (logo/name) for API brand matching by slug/name.
   */
  global.TLKV_HOMEPAGE_BRAND_SECTIONS = [
    {
      slug: "thang-long-kim-viet",
      name: "Thăng Long Kim Việt",
      logoUrl: "/assets/logo-thang-long-kim-viet.png",
    },
    {
      slug: "bao-tin-manh-hai",
      name: "Bảo Tín Mạnh Hải",
      logoUrl: "/assets/brands/bao-tin-manh-hai.png",
    },
    {
      slug: "bao-tin-minh-chau",
      name: "Bảo Tín Minh Châu",
      logoUrl: "/assets/brands/bao-tin-minh-chau.png",
    },
  ];

  global.TLKV_BRAND_LOGO_FALLBACKS = global.TLKV_BRAND_LOGO_FALLBACKS || {};
  (global.TLKV_HOMEPAGE_BRAND_SECTIONS || []).forEach(function (b) {
    if (!b || !b.slug || !b.logoUrl) return;
    if (!global.TLKV_BRAND_LOGO_FALLBACKS[b.slug]) {
      global.TLKV_BRAND_LOGO_FALLBACKS[b.slug] = b.logoUrl;
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
