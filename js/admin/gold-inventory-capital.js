/**
 * Gold-table inventory market value + capital allocation.
 * Estimated market value, not accounting cost.
 *
 * product_value = ((buy + sell) / 2) × (quantity × weight_chi / board_unit_chi)
 * board_unit_chi converts listed gold-row prices (0.1 chỉ vs 1 chỉ) back to chỉ.
 * Missing sell → use buy. Missing buy → value 0.
 */
(function (global) {
  "use strict";

  var CAPITAL_GROUPS = [
    { id: "KIM_VIET", label: "Thăng Long Kim Việt" },
    { id: "TRANG_SUC", label: "Trang sức" },
    { id: "BTMC", label: "BTMC" },
    { id: "VANG_THI_TRUONG", label: "Vàng thị trường" },
    { id: "BTMH", label: "BTMH" },
    { id: "BAC", label: "Bạc" },
  ];

  function emptyGroupValues() {
    return {
      KIM_VIET: 0,
      TRANG_SUC: 0,
      BTMC: 0,
      VANG_THI_TRUONG: 0,
      BTMH: 0,
      BAC: 0,
    };
  }

  function normKey(value) {
    return String(value || "")
      .normalize("NFC")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveCapitalGroup(brand, product, metal) {
    var brandKey = normKey(brand);
    var productKey = normKey(product);
    if (String(metal || "").toLowerCase() === "silver" || brandKey === "BẠC" || brandKey.indexOf("BẠC") === 0) {
      return "BAC";
    }
    if (!brandKey && !productKey) return null;
    if (brandKey.indexOf("BẢO TÍN MINH CHÂU") >= 0 || brandKey.indexOf("BTMC") >= 0) {
      return "BTMC";
    }
    if (brandKey.indexOf("BẢO TÍN MẠNH HẢI") >= 0 || /(^|\s)BTMH(\s|$)/.test(brandKey)) {
      return "BTMH";
    }
    if (brandKey.indexOf("THỊ TRƯỜNG") >= 0) return "VANG_THI_TRUONG";
    if (brandKey.indexOf("THƯƠNG HIỆU") >= 0 && brandKey.indexOf("KIM VIỆT") < 0) {
      return "BTMH";
    }
    if (brandKey.indexOf("KIM VIỆT") >= 0 || brandKey.indexOf("THĂNG LONG") >= 0) {
      if (productKey.indexOf("TRANG SỨC") >= 0) return "TRANG_SUC";
      return "KIM_VIET";
    }
    return null;
  }

  function chiToMilli(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 1000);
  }

  function effectiveBuy(buyDong) {
    return buyDong != null && buyDong > 0 ? buyDong : 0;
  }

  function effectiveSell(buyDong, sellDong) {
    if (sellDong != null && sellDong > 0) return sellDong;
    if (buyDong != null && buyDong > 0) return buyDong;
    return 0;
  }

  /**
   * Integer VND. avg listed price × pieces × (weight / board unit).
   */
  function skuMarketValueDong(buyDong, sellDong, quantityPieces, weightChi, boardUnitChi) {
    var qty = Number(quantityPieces);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    var buy = effectiveBuy(buyDong);
    var sell = effectiveSell(buyDong, sellDong);
    if (!(buy > 0) || !(sell > 0)) return 0;
    var weightMilli = chiToMilli(weightChi);
    var boardMilli = chiToMilli(boardUnitChi);
    if (weightMilli <= 0) return 0;
    if (boardMilli <= 0) boardMilli = 1000;
    return Math.round(((buy + sell) * qty * weightMilli) / (2 * boardMilli));
  }

  function formatDong(value) {
    var n = Math.round(Number(value) || 0);
    var abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-" : "") + abs + "đ";
  }

  function formatPercent(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "0.0%";
    return n.toFixed(1) + "%";
  }

  function percentOf(part, total) {
    if (!(total > 0)) return 0;
    return (part / total) * 100;
  }

  function firstStockQuantity(stock) {
    if (!stock) return 0;
    if (Array.isArray(stock)) {
      return stock[0] && stock[0].quantity != null ? Number(stock[0].quantity) : 0;
    }
    return stock.quantity != null ? Number(stock.quantity) : 0;
  }

  function mapSkuStockRow(row) {
    var qty = firstStockQuantity(row.pos_inventory_stock);
    return {
      skuId: String(row.id),
      name: String(row.name || ""),
      weightChi: Number(row.weight_chi),
      boardUnitChi: Number(row.board_unit_chi),
      priceRowId: row.price_row_id != null && String(row.price_row_id).trim() !== "" ? String(row.price_row_id) : null,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 0,
    };
  }

  async function fetchSkuStocks(sb) {
    if (!sb || typeof sb.from !== "function") return [];
    var res = await sb
      .from("pos_skus")
      .select("id, name, weight_chi, board_unit_chi, price_row_id, pos_inventory_stock(quantity)");
    if (res.error) throw new Error(res.error.message);
    return (res.data || []).map(mapSkuStockRow);
  }

  function isMarketGoldSkuName(name) {
    return /vàng\s*thị\s*trường/i.test(String(name || ""));
  }

  function calculateInventoryCapital(opts) {
    opts = opts || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var skuStocks = Array.isArray(opts.skuStocks) ? opts.skuStocks : [];
    var parsePrice =
      typeof opts.parsePrice === "function"
        ? opts.parsePrice
        : function (value) {
            var n = Number(value);
            return Number.isFinite(n) ? Math.round(n) : null;
          };
    var parentProductAt = typeof opts.parentProductAt === "function" ? opts.parentProductAt : null;

    var rowMeta = rows.map(function (row, index) {
      var productShown =
        String(row.product || "").trim() ||
        (parentProductAt ? String(parentProductAt(rows, index) || "").trim() : "");
      return {
        id: String(row.id),
        group: resolveCapitalGroup(row.brand, productShown, row.metal),
        buy: parsePrice(row.buy),
        sell: parsePrice(row.sell),
        productShown: productShown,
      };
    });
    var metaById = Object.create(null);
    var marketRowId = null;
    for (var i = 0; i < rowMeta.length; i++) {
      metaById[rowMeta[i].id] = rowMeta[i];
      if (!marketRowId && rowMeta[i].group === "VANG_THI_TRUONG") {
        marketRowId = rowMeta[i].id;
      }
    }

    var valueByRow = Object.create(null);
    var qtyChiByRow = Object.create(null);

    for (var s = 0; s < skuStocks.length; s++) {
      var sku = skuStocks[s];
      var targetId = sku.priceRowId;
      if (!targetId && isMarketGoldSkuName(sku.name)) targetId = marketRowId;
      if (!targetId || !metaById[targetId]) continue;
      var gold = metaById[targetId];
      var value = skuMarketValueDong(gold.buy, gold.sell, sku.quantity, sku.weightChi, sku.boardUnitChi);
      valueByRow[targetId] = (valueByRow[targetId] || 0) + value;
      var qtyChi = Number(sku.quantity) * Number(sku.weightChi);
      if (Number.isFinite(qtyChi) && qtyChi > 0) {
        qtyChiByRow[targetId] = (qtyChiByRow[targetId] || 0) + qtyChi;
      }
    }

    var groupValues = emptyGroupValues();
    var rowResults = rowMeta.map(function (meta) {
      var valueDong = valueByRow[meta.id] || 0;
      if (meta.group && Object.prototype.hasOwnProperty.call(groupValues, meta.group)) {
        groupValues[meta.group] += valueDong;
      }
      return {
        id: meta.id,
        group: meta.group,
        valueDong: valueDong,
        quantityChi: qtyChiByRow[meta.id] || 0,
        percent: 0,
      };
    });

    var totalDong = 0;
    for (var g = 0; g < CAPITAL_GROUPS.length; g++) {
      totalDong += groupValues[CAPITAL_GROUPS[g].id] || 0;
    }

    for (var r = 0; r < rowResults.length; r++) {
      rowResults[r].percent = percentOf(rowResults[r].valueDong, totalDong);
    }

    var groups = CAPITAL_GROUPS.map(function (group) {
      var valueDong = groupValues[group.id] || 0;
      return {
        id: group.id,
        label: group.label,
        valueDong: valueDong,
        percent: percentOf(valueDong, totalDong),
      };
    });

    return {
      rows: rowResults,
      groups: groups,
      totalDong: totalDong,
      totalPercent: totalDong > 0 ? 100 : 0,
    };
  }

  function selfCheck() {
    var cases = [];
    function add(name, ok, detail) {
      cases.push({ name: name, ok: !!ok, detail: detail || "" });
    }
    add(
      "E Bông Lúa 10 chỉ board 1",
      skuMarketValueDong(1397000, 1412000, 10, 1, 1) === 14045000,
      String(skuMarketValueDong(1397000, 1412000, 10, 1, 1))
    );
    add(
      "D buy = sell",
      skuMarketValueDong(1400000, 1400000, 10, 1, 1) === 14000000,
      String(skuMarketValueDong(1400000, 1400000, 10, 1, 1))
    );
    add(
      "C qty 0",
      skuMarketValueDong(1397000, 1412000, 0, 1, 1) === 0,
      String(skuMarketValueDong(1397000, 1412000, 0, 1, 1))
    );
    add(
      "missing sell uses buy",
      skuMarketValueDong(1397000, 0, 10, 1, 1) === 13970000,
      String(skuMarketValueDong(1397000, 0, 10, 1, 1))
    );
    add(
      "0.1 chỉ board unit",
      skuMarketValueDong(1397000, 1412000, 10, 0.1, 0.1) === 14045000,
      String(skuMarketValueDong(1397000, 1412000, 10, 0.1, 0.1))
    );
    add("group BTMC", resolveCapitalGroup("BẢO TÍN MINH CHÂU", "Nhẫn Vàng Rồng Thăng Long", "gold") === "BTMC", "");
    add("group BTMH", resolveCapitalGroup("BẢO TÍN MẠNH HẢI", "Kim Gia Bảo", "gold") === "BTMH", "");
    add("group trang sức", resolveCapitalGroup("THĂNG LONG KIM VIỆT", "Trang Sức Vàng Ta", "gold") === "TRANG_SUC", "");
    add("group kim việt", resolveCapitalGroup("THĂNG LONG KIM VIỆT", "Bông Lúa Vàng 0.1 chỉ", "gold") === "KIM_VIET", "");
    add("group bạc", resolveCapitalGroup("Bạc", "Bạc BTMC 1L 2L 5L", "silver") === "BAC", "");
    add(
      "label Thăng Long Kim Việt",
      CAPITAL_GROUPS[0].label === "Thăng Long Kim Việt",
      CAPITAL_GROUPS[0].label
    );
    var failed = cases.filter(function (c) {
      return !c.ok;
    });
    return { ok: failed.length === 0, cases: cases, failed: failed };
  }

  var api = {
    CAPITAL_GROUPS: CAPITAL_GROUPS,
    resolveCapitalGroup: resolveCapitalGroup,
    skuMarketValueDong: skuMarketValueDong,
    effectiveBuy: effectiveBuy,
    effectiveSell: effectiveSell,
    formatDong: formatDong,
    formatPercent: formatPercent,
    fetchSkuStocks: fetchSkuStocks,
    calculateInventoryCapital: calculateInventoryCapital,
    selfCheck: selfCheck,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.TLKVGoldInventoryCapital = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
