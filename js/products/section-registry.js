(function (global) {
  "use strict";

  /** Homepage sections: config brands + API brand/product matching, max 6 products per brand. */
  global.TLKV_HOMEPAGE_SECTIONS = [
    {
      id: "featured_by_brand",
      type: "featured_by_brand",
      productLimitPerBrand: 6,
    },
  ];
})(typeof window !== "undefined" ? window : globalThis);
