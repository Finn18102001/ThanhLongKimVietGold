(function (global) {
  "use strict";

  /** Homepage: brand-first showcase only (featured items surface inside brand rows). */
  global.TLKV_HOMEPAGE_SECTIONS = [
    {
      id: "brands",
      type: "brand_group",
      productLimitPerBrand: 6,
    },
  ];
})(typeof window !== "undefined" ? window : globalThis);
