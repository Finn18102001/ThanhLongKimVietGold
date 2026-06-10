/**
 * Gold pricing dashboard — layout layer (UI only).
 * Scoped to .tlkv-gold-dashboard; does not touch tv-model.
 *
 * Responsibilities:
 *  - Normalize cell DOM for single-line ellipsis
 *  - Apply row/column CSS variables (pre-render metrics)
 *  - Keep table + chart panels equal height (ResizeObserver + CSS Grid)
 */
(function (global) {
  "use strict";

  var ROOT_SEL = ".tlkv-gold-dashboard";
  var TBODY_SEL = "#gold-table-body";
  var DEBOUNCE_MS = 80;
  /** Đồng bộ tv-gold-board.js — chỉ số dòng 1-based (có đủ 2 ô giá, không tính dòng bạc cuối). */
  var WEBSITE_PRICE_ROW_BANDS = [1, 3, 6, 8];
  var PRICE_ROW_BAND_CLASS = "row-price-band";

  var ro = null;
  var mo = null;
  var debounceTimer = null;
  var measureCanvas = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function getDashboard() {
    return document.querySelector(ROOT_SEL);
  }

  function getTable() {
    var dash = getDashboard();
    if (!dash) return null;
    return dash.querySelector(".gold-table-content");
  }

  function debounce(fn) {
    return function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fn, DEBOUNCE_MS);
    };
  }

  /** Canvas text measure — O(n) once per render, avoids layout thrash from repeated DOM reads */
  function measureTextWidth(text, font) {
    if (!text) return 0;
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    var ctx = measureCanvas.getContext("2d");
    if (!ctx) return 0;
    ctx.font = font;
    return ctx.measureText(String(text)).width;
  }

  function getTableFont() {
    var table = getTable();
    if (!table || !global.getComputedStyle) return "600 13px Inter, sans-serif";
    var cs = global.getComputedStyle(table);
    return (cs.fontWeight || "600") + " " + (cs.fontSize || "13px") + " " + (cs.fontFamily || "Inter, sans-serif");
  }

  /**
   * Pre-calc: set --tlkv-gp-row-h and optional min product width hint before paint stabilizes.
   * Fixed row height preferred over dynamic measure — trading UIs prioritize grid stability.
   */
  function applyTableMetrics() {
    var dash = getDashboard();
    var table = getTable();
    if (!dash || !table) return;

    var stacked = table.classList.contains("gold-table--stacked");
    var rowH = stacked ? "2.75rem" : "2.5rem";
    dash.style.setProperty("--tlkv-gp-row-h", rowH);

    var tbody = $(TBODY_SEL, dash);
    if (!tbody) return;

    var font = getTableFont();
    var maxProduct = 0;
    var cells = tbody.querySelectorAll("td.col-product, td.gold-brand-cell");
    cells.forEach(function (td) {
      var t = td.textContent || "";
      maxProduct = Math.max(maxProduct, measureTextWidth(t.trim(), font));
    });

    if (maxProduct > 0) {
      table.style.setProperty("--tlkv-gp-product-min", Math.ceil(maxProduct) + "px");
    }
  }

  function wrapTextCell(td) {
    if (!td || td.querySelector(".tlkv-gp-cell__text")) return;

    if (td.classList.contains("price")) {
      if (!td.querySelector(".tlkv-gp-cell__inner")) {
        var inner = document.createElement("div");
        inner.className = "tlkv-gp-cell__inner";
        while (td.firstChild) inner.appendChild(td.firstChild);
        td.appendChild(inner);
        var label = inner.textContent.replace(/\s+/g, " ").trim();
        if (label) inner.setAttribute("title", label);
      }
      return;
    }

    var raw = (td.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) return;
    td.textContent = "";
    var span = document.createElement("span");
    span.className = "tlkv-gp-cell__text";
    span.textContent = raw;
    span.setAttribute("title", raw);
    td.appendChild(span);
  }

  function normalizeTableCells() {
    var dash = getDashboard();
    if (!dash) return;
    var tbody = $(TBODY_SEL, dash);
    if (!tbody) return;

    tbody.querySelectorAll("td").forEach(wrapTextCell);
    applyTableMetrics();
  }

  /** Gắn class `row-price-band` cho dòng 1,3,6,8 — chỉ 2 cột giá (logic giống tv-gold-board). */
  function applyWebsitePriceRowBands() {
    var dash = getDashboard();
    if (!dash) return;
    var tbody = $(TBODY_SEL, dash);
    if (!tbody) return;

    var lastSilverTr = null;
    var silverRows = tbody.querySelectorAll("tr.row-silver");
    if (silverRows.length) {
      lastSilverTr = silverRows[silverRows.length - 1];
    }

    var displayRowIndex = 0;
    tbody.querySelectorAll("tr").forEach(function (row) {
      row.classList.remove(PRICE_ROW_BAND_CLASS);
      var priceCells = row.querySelectorAll("td.price");
      if (priceCells.length < 2) return;
      if (row === lastSilverTr) return;
      displayRowIndex += 1;
      if (WEBSITE_PRICE_ROW_BANDS.indexOf(displayRowIndex) !== -1) {
        row.classList.add(PRICE_ROW_BAND_CLASS);
      }
    });
  }

  /**
   * Grid stretch handles equal height; RO ensures iframe/chart fill after TV embed loads.
   */
  function syncPanelHeights() {
    var dash = getDashboard();
    if (!dash) return;

    var grid = dash.querySelector(".tlkv-gold-dashboard__grid");
    var store = dash.querySelector(".tlkv-gold-panel--store");
    var world = dash.querySelector(".tlkv-gold-panel--world");
    if (!grid || !store || !world) return;

    if (global.matchMedia && global.matchMedia("(max-width: 991.98px)").matches) {
      dash.style.removeProperty("--tlkv-gp-panel-sync-h");
      return;
    }

    var h = Math.max(store.offsetHeight, world.offsetHeight);
    if (h > 0) {
      dash.style.setProperty("--tlkv-gp-panel-sync-h", h + "px");
    }
  }

  function scheduleLayout() {
    applyTableMetrics();
    normalizeTableCells();
    applyWebsitePriceRowBands();
    syncPanelHeights();
  }

  var onLayout = debounce(scheduleLayout);

  function bindObservers() {
    var dash = getDashboard();
    if (!dash) return;

    var tbody = $(TBODY_SEL, dash);
    if (tbody && !mo) {
      mo = new MutationObserver(onLayout);
      mo.observe(tbody, { childList: true, subtree: true });
    }

    if (!ro && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onLayout);
      var grid = dash.querySelector(".tlkv-gold-dashboard__grid");
      if (grid) ro.observe(grid);
      var tv = dash.querySelector(".tlkv-world-xau-tv-wrap");
      if (tv) ro.observe(tv);
    }

    global.addEventListener("resize", onLayout);
    global.addEventListener("tlkv:gold-table-changed", onLayout);
  }

  function boot() {
    if (!getDashboard()) return;
    scheduleLayout();
    bindObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.TLKVGoldPricingLayout = {
    refresh: scheduleLayout,
    normalizeTableCells: normalizeTableCells,
    applyTableMetrics: applyTableMetrics,
    applyWebsitePriceRowBands: applyWebsitePriceRowBands,
    WEBSITE_PRICE_ROW_BANDS: WEBSITE_PRICE_ROW_BANDS,
  };
})(typeof window !== "undefined" ? window : globalThis);
