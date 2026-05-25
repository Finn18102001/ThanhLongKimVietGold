(function (global) {
  "use strict";

  /**
   * @param {object[]} products
   * @param {{ resolveImage?: function, gridClass?: string, cardVariant?: string }} [opts]
   * @returns {HTMLElement}
   */
  function createProductGrid(products, opts) {
    opts = opts || {};
    var grid = document.createElement("div");
    grid.className = opts.gridClass || "tlkv-product-grid";
    grid.setAttribute("role", "list");

    var createCard =
      global.TLKVProductCard && global.TLKVProductCard.createProductCard;
    if (!createCard) return grid;

    (products || []).forEach(function (p) {
      grid.appendChild(
        createCard(p, {
          resolveImage: opts.resolveImage,
          cardVariant: opts.cardVariant,
        })
      );
    });

    return grid;
  }

  global.TLKVProductGrid = {
    createProductGrid: createProductGrid,
  };
})(typeof window !== "undefined" ? window : globalThis);
