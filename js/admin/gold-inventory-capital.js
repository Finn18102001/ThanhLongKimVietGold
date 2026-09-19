/**
 * Inventory capital allocation — SRS % Vàng / vốn & % Bạc / vốn.
 *
 * Two independent engines (gold vs silver):
 *   avg portfolio price → convert stock to equivalent chi → ± metal AR/AP
 *   → money / avg → % metal = metalActual / (metalActual + moneyAsMetal)
 *
 * Unclassified metal obligations are excluded (never fall back to gold).
 * Intermediate chi/dong values are not rounded; only display helpers round.
 */
(function (global) {
  "use strict";

  var CAPITAL_GROUPS = [
    { id: "KIM_VIET", label: "Thăng Long Kim Việt", metal: "gold" },
    { id: "TRANG_SUC", label: "Trang sức", metal: "gold" },
    { id: "BTMC", label: "BTMC", metal: "gold" },
    { id: "VANG_THI_TRUONG", label: "Vàng thị trường", metal: "gold" },
    { id: "BTMH", label: "BTMH", metal: "gold" },
    { id: "BAC", label: "Bạc", metal: "silver" },
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

  function isMarketGoldBrand(brand, product, groupId) {
    if (groupId === "VANG_THI_TRUONG") return true;
    var brandKey = normKey(brand);
    var productKey = normKey(product);
    return brandKey.indexOf("THỊ TRƯỜNG") >= 0 || /VÀNG\s*THỊ\s*TRƯỜNG/.test(productKey);
  }

  /**
   * Classify metal for obligations. Returns "gold" | "silver" | null.
   * null = unclassified → exclude from both engines (no gold fallback).
   */
  function resolveMetalKind(opts) {
    opts = opts || {};
    var metal = String(opts.metal || "").toLowerCase();
    if (metal === "silver") return "silver";
    if (metal === "gold") return "gold";

    var brandKey = normKey(opts.brand);
    if (brandKey === "BẠC" || brandKey.indexOf("BẠC") === 0) return "silver";

    var name = String(opts.name || opts.product || "");
    var nameKey = normKey(name);
    if (/BẠC/.test(nameKey) && !/VÀNG/.test(nameKey)) return "silver";
    if (opts.isMarketGold === true) return "gold";
    if (/VÀNG/.test(nameKey)) return "gold";

    var group = resolveCapitalGroup(opts.brand, opts.product || opts.name, null);
    if (group === "BAC") return "silver";
    if (group) return "gold";
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

  /** Listed avg for a brand/row. Market gold → buy only. Else (buy+sell)/2. */
  function listedAvgDong(buyDong, sellDong, isMarket) {
    var buy = effectiveBuy(buyDong);
    if (!(buy > 0)) return 0;
    if (isMarket) return buy;
    var sell = effectiveSell(buyDong, sellDong);
    if (!(sell > 0)) return buy;
    return (buy + sell) / 2;
  }

  /** Convert listed board price → đồng / chỉ. */
  function pricePerChiDong(listedAvg, boardUnitChi) {
    var avg = Number(listedAvg);
    if (!Number.isFinite(avg) || !(avg > 0)) return 0;
    var board = Number(boardUnitChi);
    if (!Number.isFinite(board) || !(board > 0)) board = 1;
    return avg / board;
  }

  /**
   * Integer VND market value (legacy helper / display).
   * product_value = listedAvg × qty × (weight / board)
   */
  function skuMarketValueDong(buyDong, sellDong, quantityPieces, weightChi, boardUnitChi, isMarket) {
    var qty = Number(quantityPieces);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    var listed = listedAvgDong(buyDong, sellDong, isMarket === true);
    if (!(listed > 0)) return 0;
    var weightMilli = chiToMilli(weightChi);
    var boardMilli = chiToMilli(boardUnitChi);
    if (weightMilli <= 0) return 0;
    if (boardMilli <= 0) boardMilli = 1000;
    return Math.round((listed * qty * weightMilli) / boardMilli);
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

  function formatChi(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "0.000 chỉ";
    return n.toLocaleString("vi-VN", { maximumFractionDigits: 3, minimumFractionDigits: 0 }) + " chỉ";
  }

  /**
   * part/total×100. Denominator 0 → 0. Negative denominator → negative/over-100% allowed (no clamp).
   */
  function percentOf(part, total) {
    var p = Number(part);
    var t = Number(total);
    if (!Number.isFinite(t) || t === 0) return 0;
    if (!Number.isFinite(p)) return 0;
    return (p / t) * 100;
  }

  function firstStockQuantity(stock) {
    if (!stock) return 0;
    if (Array.isArray(stock)) {
      return stock[0] && stock[0].quantity != null ? Number(stock[0].quantity) : 0;
    }
    return stock.quantity != null ? Number(stock.quantity) : 0;
  }

  function firstEmbed(value) {
    if (!value) return null;
    return Array.isArray(value) ? value[0] || null : value;
  }

  function clampNonNeg(n) {
    var x = Number(n);
    return Number.isFinite(x) && x > 0 ? x : 0;
  }

  function purchaseSettledQty(goodsStatus, expectedQty, receivedQty) {
    if (String(goodsStatus) === "NOT_RECEIVED") return 0;
    return Math.min(clampNonNeg(receivedQty), clampNonNeg(expectedQty));
  }

  function mapSkuStockRow(row) {
    var qty = firstStockQuantity(row.pos_inventory_stock);
    var priceRow = firstEmbed(row.gold_price_rows);
    return {
      skuId: String(row.id),
      name: String(row.name || ""),
      weightChi: Number(row.weight_chi),
      boardUnitChi: Number(row.board_unit_chi),
      priceRowId:
        row.price_row_id != null && String(row.price_row_id).trim() !== ""
          ? String(row.price_row_id)
          : null,
      isMarketGold: row.is_market_gold === true,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 0,
      linkedMetal: priceRow && priceRow.metal === "silver" ? "silver" : priceRow ? "gold" : null,
    };
  }

  async function fetchSkuStocks(sb) {
    if (!sb || typeof sb.from !== "function") return [];
    var res = await sb
      .from("pos_skus")
      .select(
        "id, name, weight_chi, board_unit_chi, price_row_id, is_market_gold, pos_inventory_stock(quantity), gold_price_rows!pos_skus_price_row_id_fkey(metal)"
      );
    if (res.error) throw new Error(res.error.message);
    return (res.data || []).map(mapSkuStockRow);
  }

  function asMoneyNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function emptyMoneySnapshot() {
    return {
      cashDong: 0,
      bankDong: 0,
      receivableDong: 0,
      payableDong: 0,
      moneyActualDong: 0,
      source: "empty",
    };
  }

  function moneyActualFromParts(parts) {
    return (
      asMoneyNumber(parts.cashDong) +
      asMoneyNumber(parts.bankDong) +
      asMoneyNumber(parts.receivableDong) -
      asMoneyNumber(parts.payableDong)
    );
  }

  async function fetchMoneySnapshot(sb) {
    var empty = emptyMoneySnapshot();
    if (!sb) return empty;

    if (typeof sb.rpc === "function") {
      try {
        var rpc = await sb.rpc("pos_cashflow_overview");
        if (!rpc.error && rpc.data) {
          var raw = rpc.data;
          var cash = raw.cash || {};
          var bank = raw.bank || {};
          var parts = {
            cashDong: asMoneyNumber(cash.balanceDong),
            bankDong: asMoneyNumber(bank.balanceDong),
            receivableDong: asMoneyNumber(raw.receivableDong),
            payableDong: asMoneyNumber(raw.payableDong),
          };
          return {
            cashDong: parts.cashDong,
            bankDong: parts.bankDong,
            receivableDong: parts.receivableDong,
            payableDong: parts.payableDong,
            moneyActualDong: moneyActualFromParts(parts),
            source: "rpc",
          };
        }
      } catch (_) {
        /* fall through */
      }
    }

    try {
      var accountsRes = await sb.from("pos_cash_accounts").select("code, account_type, balance_dong");
      var recvRes = await sb
        .from("pos_receivables")
        .select("remaining_dong, status")
        .gt("remaining_dong", 0)
        .neq("status", "CLOSED");
      var payRes = await sb
        .from("pos_payables")
        .select("remaining_dong, status")
        .gt("remaining_dong", 0)
        .neq("status", "CLOSED");

      if (accountsRes.error || recvRes.error || payRes.error) return empty;

      var cashDong = 0;
      var bankDong = 0;
      (accountsRes.data || []).forEach(function (a) {
        var bal = asMoneyNumber(a.balance_dong);
        var code = String(a.code || "");
        var type = String(a.account_type || "").toUpperCase();
        if (code === "CASH-001" || type === "CASH") cashDong += bal;
        else if (code === "BANK-001" || type === "BANK") bankDong += bal;
      });

      var receivableDong = (recvRes.data || []).reduce(function (sum, r) {
        return sum + asMoneyNumber(r.remaining_dong);
      }, 0);
      var payableDong = (payRes.data || []).reduce(function (sum, r) {
        return sum + asMoneyNumber(r.remaining_dong);
      }, 0);

      var parts = { cashDong: cashDong, bankDong: bankDong, receivableDong: receivableDong, payableDong: payableDong };
      return {
        cashDong: cashDong,
        bankDong: bankDong,
        receivableDong: receivableDong,
        payableDong: payableDong,
        moneyActualDong: moneyActualFromParts(parts),
        source: "tables",
      };
    } catch (_) {
      return empty;
    }
  }

  function obligationBoardUnit(sku) {
    var board = sku && Number(sku.board_unit_chi);
    return Number.isFinite(board) && board > 0 ? board : 1;
  }

  function classifyObligationMetal(item, sku, priceRow, brandName) {
    if (priceRow && priceRow.metal) {
      return resolveMetalKind({ metal: priceRow.metal });
    }
    return resolveMetalKind({
      metal: null,
      brand: brandName || (priceRow && priceRow.brand) || "",
      name: (item && (item.product_name_snapshot || item.name)) || (sku && sku.name) || "",
      product: (priceRow && priceRow.product) || (sku && sku.name) || "",
      isMarketGold: sku && sku.is_market_gold === true,
    });
  }

  /**
   * Metal AR/AP in chỉ, classified gold/silver. Unclassified rows omitted.
   */
  async function fetchMetalObligations(sb) {
    if (!sb || typeof sb.from !== "function") {
      return { items: [], unclassifiedCount: 0 };
    }

    var purchaseRes = await sb
      .from("pos_purchase_receipts")
      .select(
        "id, receipt_no, goods_status, voided_at, pos_purchase_items(id, expected_qty, received_qty, weight_chi, pos_skus(sku, name, weight_chi, board_unit_chi, price_row_id, is_market_gold, brands(name), gold_price_rows!pos_skus_price_row_id_fkey(id, metal, buy, sell, brand, product)))"
      )
      .is("voided_at", null)
      .neq("goods_status", "CANCELLED")
      .limit(500);

    var saleRes = await sb
      .from("pos_sales")
      .select(
        "id, sale_no, transaction_type, fulfillment_status, voided_at, pos_sale_items(id, quantity, qty_delivered, weight_chi, product_name_snapshot, sku_snapshot, pos_skus(sku, name, weight_chi, board_unit_chi, price_row_id, is_market_gold, brands(name), gold_price_rows!pos_skus_price_row_id_fkey(id, metal, buy, sell, brand, product)))"
      )
      .is("voided_at", null)
      .in("transaction_type", ["PREORDER", "DEPOSIT"])
      .neq("fulfillment_status", "CANCELLED")
      .limit(500);

    if (purchaseRes.error || saleRes.error) {
      throw new Error((purchaseRes.error || saleRes.error).message);
    }

    var items = [];
    var unclassifiedCount = 0;

    function pushItem(kind, remainingQty, weightChi, sku, priceRow, brandName, productName) {
      if (!(remainingQty > 0) || !(weightChi > 0)) return;
      var metal = classifyObligationMetal(
        { product_name_snapshot: productName, name: productName },
        sku,
        priceRow,
        brandName
      );
      if (!metal) {
        unclassifiedCount += 1;
        return;
      }
      var buy = priceRow && priceRow.buy != null ? Number(priceRow.buy) : null;
      var sell = priceRow && priceRow.sell != null ? Number(priceRow.sell) : null;
      var isMarket =
        (sku && sku.is_market_gold === true) ||
        isMarketGoldBrand(brandName || (priceRow && priceRow.brand), productName, null);
      var listed = listedAvgDong(buy, sell, isMarket);
      var board = obligationBoardUnit(sku);
      var ppc = pricePerChiDong(listed, board);
      items.push({
        kind: kind,
        metal: metal,
        quantityChi: remainingQty * weightChi,
        pricePerChi: ppc > 0 ? ppc : null,
        priceRowId:
          priceRow && priceRow.id
            ? String(priceRow.id)
            : sku && sku.price_row_id
              ? String(sku.price_row_id)
              : null,
      });
    }

    (purchaseRes.data || []).forEach(function (receipt) {
      var list = Array.isArray(receipt.pos_purchase_items)
        ? receipt.pos_purchase_items
        : receipt.pos_purchase_items
          ? [receipt.pos_purchase_items]
          : [];
      list.forEach(function (item) {
        var expected = clampNonNeg(item.expected_qty);
        if (!(expected > 0)) return;
        var settled = purchaseSettledQty(receipt.goods_status, expected, item.received_qty);
        var remaining = Math.max(0, expected - settled);
        var sku = firstEmbed(item.pos_skus);
        var brand = firstEmbed(sku && sku.brands);
        var priceRow = firstEmbed(sku && sku.gold_price_rows);
        var weight =
          item.weight_chi != null
            ? Number(item.weight_chi)
            : sku && sku.weight_chi != null
              ? Number(sku.weight_chi)
              : 0;
        pushItem(
          "RECEIVABLE",
          remaining,
          weight,
          sku,
          priceRow,
          brand && brand.name,
          (sku && sku.name) || ""
        );
      });
    });

    (saleRes.data || []).forEach(function (sale) {
      var list = Array.isArray(sale.pos_sale_items)
        ? sale.pos_sale_items
        : sale.pos_sale_items
          ? [sale.pos_sale_items]
          : [];
      list.forEach(function (item) {
        var ordered = clampNonNeg(item.quantity);
        if (!(ordered > 0)) return;
        var settled = Math.min(clampNonNeg(item.qty_delivered), ordered);
        var remaining = Math.max(0, ordered - settled);
        var sku = firstEmbed(item.pos_skus);
        var brand = firstEmbed(sku && sku.brands);
        var priceRow = firstEmbed(sku && sku.gold_price_rows);
        var weight = Number(item.weight_chi || 0);
        pushItem(
          "PAYABLE",
          remaining,
          weight,
          sku,
          priceRow,
          brand && brand.name,
          item.product_name_snapshot || (sku && sku.name) || ""
        );
      });
    });

    return { items: items, unclassifiedCount: unclassifiedCount };
  }

  function isMarketGoldSkuName(name) {
    return /vàng\s*thị\s*trường/i.test(String(name || ""));
  }

  /**
   * Double-count audit (POS data sources — do not change without re-audit):
   * - Purchase receivable: expected − received on NOT_RECEIVED/partial; stock only
   *   increases on receive → adding receivable does NOT double-count inventory.
   * - Sale payable: PREORDER/DEPOSIT undelivered; pos_private.complete_sale only
   *   applies stock on transaction_type = SALE → payable gold still sits in stock,
   *   so subtracting payable is required and is NOT double-count.
   */
  var METAL_DEBT_DOUBLE_COUNT_AUDIT = {
    purchaseReceivable: "safe_add",
    salePayablePreorderDeposit: "safe_subtract",
    auditedAt: "2026-09-19",
  };

  function emptyMetalEngine() {
    return {
      avg: 0,
      avgPricePerChi: 0,
      stockQtyChi: 0,
      inventoryConvertedChi: 0,
      stockConvertedChi: 0,
      receivableConvertedChi: 0,
      payableConvertedChi: 0,
      receivableAllocatedChi: 0,
      payableAllocatedChi: 0,
      receivableUnallocatedChi: 0,
      payableUnallocatedChi: 0,
      metalActualChi: 0,
      moneyConvertedChi: 0,
      moneyAsMetalChi: 0,
      totalCapitalChi: 0,
      percent: 0,
      metalPercent: 0,
      moneyPercent: 0,
      inventoryPercent: 0,
      receivablePercent: 0,
      payablePercent: 0,
    };
  }

  /**
   * Convert obligation chi to portfolio-equivalent chi.
   * Missing unit price → treat as already at portfolio avg (factor 1).
   */
  function convertObligationChi(quantityChi, pricePerChi, portfolioAvg) {
    var qty = Number(quantityChi);
    if (!Number.isFinite(qty) || !(qty > 0)) return 0;
    if (!(portfolioAvg > 0)) return qty;
    var ppc = Number(pricePerChi);
    if (!Number.isFinite(ppc) || !(ppc > 0)) return qty;
    return (qty * ppc) / portfolioAvg;
  }

  function runMetalEngine(metal, lineItems, obligations, moneyActualDong, metaById) {
    var totalQty = 0;
    var totalValue = 0;
    for (var i = 0; i < lineItems.length; i++) {
      var line = lineItems[i];
      line.allocatedReceivableChi = 0;
      line.allocatedPayableChi = 0;
      line.shareChi = 0;
      if (!(line.quantityChi > 0) || !(line.pricePerChi > 0)) continue;
      totalQty += line.quantityChi;
      totalValue += line.quantityChi * line.pricePerChi;
    }

    if (!(totalQty > 0) || !(totalValue > 0)) {
      return emptyMetalEngine();
    }

    var avgPrice = totalValue / totalQty;
    var stockConverted = 0;
    for (var j = 0; j < lineItems.length; j++) {
      var L = lineItems[j];
      if (!(L.quantityChi > 0) || !(L.pricePerChi > 0)) {
        L.convertedChi = 0;
        L.shareChi = 0;
        continue;
      }
      L.convertedChi = (L.quantityChi * L.pricePerChi) / avgPrice;
      stockConverted += L.convertedChi;
    }

    var recv = 0;
    var pay = 0;
    var recvAlloc = 0;
    var payAlloc = 0;
    var recvUnalloc = 0;
    var payUnalloc = 0;

    for (var k = 0; k < obligations.length; k++) {
      var ob = obligations[k];
      if (ob.metal !== metal) continue;
      var conv = convertObligationChi(ob.quantityChi, ob.pricePerChi, avgPrice);
      var targetMeta = ob.priceRowId && metaById ? metaById[ob.priceRowId] : null;
      var canAllocate = !!(targetMeta && targetMeta.metal === metal && lineByIdSafe(lineItems, ob.priceRowId));

      if (ob.kind === "RECEIVABLE") {
        recv += conv;
        if (canAllocate) {
          recvAlloc += conv;
          var recvLine = lineByIdSafe(lineItems, ob.priceRowId);
          recvLine.allocatedReceivableChi += conv;
        } else {
          recvUnalloc += conv;
        }
      } else if (ob.kind === "PAYABLE") {
        pay += conv;
        if (canAllocate) {
          payAlloc += conv;
          var payLine = lineByIdSafe(lineItems, ob.priceRowId);
          payLine.allocatedPayableChi += conv;
        } else {
          payUnalloc += conv;
        }
      }
    }

    for (var s = 0; s < lineItems.length; s++) {
      var S = lineItems[s];
      S.shareChi =
        (S.convertedChi || 0) + (S.allocatedReceivableChi || 0) - (S.allocatedPayableChi || 0);
    }

    var metalActual = stockConverted + recv - pay;
    var moneyAsMetal = avgPrice > 0 ? moneyActualDong / avgPrice : 0;
    var totalCapital = metalActual + moneyAsMetal;

    return {
      avg: avgPrice,
      avgPricePerChi: avgPrice,
      stockQtyChi: totalQty,
      inventoryConvertedChi: stockConverted,
      stockConvertedChi: stockConverted,
      receivableConvertedChi: recv,
      payableConvertedChi: pay,
      receivableAllocatedChi: recvAlloc,
      payableAllocatedChi: payAlloc,
      receivableUnallocatedChi: recvUnalloc,
      payableUnallocatedChi: payUnalloc,
      metalActualChi: metalActual,
      moneyConvertedChi: moneyAsMetal,
      moneyAsMetalChi: moneyAsMetal,
      totalCapitalChi: totalCapital,
      percent: percentOf(metalActual, totalCapital),
      metalPercent: percentOf(metalActual, totalCapital),
      moneyPercent: percentOf(moneyAsMetal, totalCapital),
      inventoryPercent: percentOf(stockConverted, totalCapital),
      receivablePercent: percentOf(recv, totalCapital),
      payablePercent: percentOf(-pay, totalCapital),
    };
  }

  function lineByIdSafe(lineItems, id) {
    if (!id) return null;
    for (var i = 0; i < lineItems.length; i++) {
      if (lineItems[i].id === id) return lineItems[i];
    }
    return null;
  }

  function buildReconciliation(engine, lineItems) {
    var sumShares = 0;
    var sumInventory = 0;
    for (var i = 0; i < lineItems.length; i++) {
      sumShares += lineItems[i].shareChi || 0;
      sumInventory += lineItems[i].convertedChi || 0;
    }
    var inventoryConvertedChi = engine.inventoryConvertedChi || engine.stockConvertedChi || 0;
    var metalActualExpected =
      inventoryConvertedChi +
      (engine.receivableConvertedChi || 0) -
      (engine.payableConvertedChi || 0);
    var moneyConverted = engine.moneyConvertedChi || engine.moneyAsMetalChi || 0;
    var rebuilt =
      sumShares +
      (engine.receivableUnallocatedChi || 0) -
      (engine.payableUnallocatedChi || 0) +
      moneyConverted;
    var expected = engine.totalCapitalChi || 0;
    var delta = rebuilt - expected;
    var metalActualDelta = metalActualExpected - (engine.metalActualChi || 0);
    var ok = Math.abs(delta) < 1e-6 && Math.abs(metalActualDelta) < 1e-6;
    if (!ok && typeof console !== "undefined" && console.warn) {
      console.warn("[TLKV capital] Reconciliation mismatch", {
        rebuilt: rebuilt,
        expected: expected,
        delta: delta,
        metalActualDelta: metalActualDelta,
      });
    }
    return {
      inventoryConvertedChi: inventoryConvertedChi,
      sumInventoryConvertedChi: sumInventory,
      metalActualChi: engine.metalActualChi || 0,
      metalActualRebuiltChi: metalActualExpected,
      sumProductShareChi: sumShares,
      unallocatedReceivableChi: engine.receivableUnallocatedChi || 0,
      unallocatedPayableChi: engine.payableUnallocatedChi || 0,
      moneyConvertedChi: moneyConverted,
      rebuiltTotalCapitalChi: rebuilt,
      expectedTotalCapitalChi: expected,
      deltaChi: delta,
      ok: ok,
    };
  }

  function calculateInventoryCapital(opts) {
    opts = opts || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var skuStocks = Array.isArray(opts.skuStocks) ? opts.skuStocks : [];
    var money = opts.money || emptyMoneySnapshot();
    var obligations = Array.isArray(opts.metalObligations) ? opts.metalObligations : [];
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
      var metal = row.metal === "silver" ? "silver" : "gold";
      var group = resolveCapitalGroup(row.brand, productShown, metal);
      var isMarket = isMarketGoldBrand(row.brand, productShown, group);
      var buy = parsePrice(row.buy);
      var sell = parsePrice(row.sell);
      var listed = listedAvgDong(buy, sell, isMarket);
      return {
        id: String(row.id),
        group: group,
        metal: metal,
        buy: buy,
        sell: sell,
        listedAvg: listed,
        isMarket: isMarket,
        productShown: productShown,
        brand: row.brand,
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

    var qtyChiByRow = Object.create(null);
    var valueDongByRow = Object.create(null);
    var boardByRow = Object.create(null);

    for (var s = 0; s < skuStocks.length; s++) {
      var sku = skuStocks[s];
      var targetId = sku.priceRowId;
      if (!targetId && isMarketGoldSkuName(sku.name)) targetId = marketRowId;
      if (!targetId || !metaById[targetId]) continue;
      var gold = metaById[targetId];
      var board = Number(sku.boardUnitChi);
      if (!Number.isFinite(board) || !(board > 0)) board = 1;
      var qtyChi = Number(sku.quantity) * Number(sku.weightChi);
      if (!Number.isFinite(qtyChi) || !(qtyChi > 0)) continue;
      qtyChiByRow[targetId] = (qtyChiByRow[targetId] || 0) + qtyChi;
      boardByRow[targetId] = board;
      var ppc = pricePerChiDong(gold.listedAvg, board);
      if (ppc > 0) {
        valueDongByRow[targetId] = (valueDongByRow[targetId] || 0) + qtyChi * ppc;
      }
    }

    var goldLines = [];
    var silverLines = [];
    var lineByRowId = Object.create(null);

    for (var m = 0; m < rowMeta.length; m++) {
      var meta = rowMeta[m];
      var qChi = qtyChiByRow[meta.id] || 0;
      var boardU = boardByRow[meta.id] || 1;
      var ppcRow = pricePerChiDong(meta.listedAvg, boardU);
      var line = {
        id: meta.id,
        group: meta.group,
        metal: meta.metal,
        quantityChi: qChi,
        pricePerChi: ppcRow,
        listedAvg: meta.listedAvg,
        isMarket: meta.isMarket,
        valueDong: valueDongByRow[meta.id] || 0,
        convertedChi: 0,
        allocatedReceivableChi: 0,
        allocatedPayableChi: 0,
        shareChi: 0,
      };
      lineByRowId[meta.id] = line;
      if (meta.metal === "silver") silverLines.push(line);
      else goldLines.push(line);
    }

    var moneyActual = Number(money.moneyActualDong);
    if (!Number.isFinite(moneyActual)) {
      moneyActual = moneyActualFromParts(money);
    }

    var goldEngine = runMetalEngine("gold", goldLines, obligations, moneyActual, metaById);
    var silverEngine = runMetalEngine("silver", silverLines, obligations, moneyActual, metaById);

    var groupShare = emptyGroupValues();
    var groupValueDong = emptyGroupValues();
    var groupInventoryConverted = emptyGroupValues();

    var rowResults = rowMeta.map(function (meta) {
      var line = lineByRowId[meta.id];
      var inventoryConverted = line ? line.convertedChi : 0;
      var shareChi = line ? line.shareChi : 0;
      var valueDong = line ? line.valueDong : 0;
      var capitalBase =
        meta.metal === "silver" ? silverEngine.totalCapitalChi : goldEngine.totalCapitalChi;
      if (meta.group && Object.prototype.hasOwnProperty.call(groupShare, meta.group)) {
        groupShare[meta.group] += shareChi;
        groupValueDong[meta.group] += valueDong;
        groupInventoryConverted[meta.group] += inventoryConverted;
      }
      return {
        id: meta.id,
        group: meta.group,
        metal: meta.metal,
        buy: meta.buy,
        sell: meta.sell,
        listedAvg: meta.listedAvg,
        isMarket: meta.isMarket,
        valueDong: valueDong,
        quantityChi: line ? line.quantityChi : 0,
        convertedChi: inventoryConverted,
        allocatedReceivableChi: line ? line.allocatedReceivableChi : 0,
        allocatedPayableChi: line ? line.allocatedPayableChi : 0,
        shareChi: shareChi,
        /** SRS % vốn dòng = share / tổng vốn quy kim loại (không dùng giá trị tồn thị trường). */
        percent: percentOf(shareChi, capitalBase),
      };
    });

    var groups = CAPITAL_GROUPS.map(function (group) {
      var shareChi = groupShare[group.id] || 0;
      var valueDong = groupValueDong[group.id] || 0;
      var capitalBase =
        group.metal === "silver" ? silverEngine.totalCapitalChi : goldEngine.totalCapitalChi;
      return {
        id: group.id,
        label: group.label,
        metal: group.metal,
        valueDong: valueDong,
        convertedChi: groupInventoryConverted[group.id] || 0,
        shareChi: shareChi,
        percent: percentOf(shareChi, capitalBase),
      };
    });

    var totalDong = 0;
    for (var g = 0; g < groups.length; g++) {
      totalDong += groups[g].valueDong || 0;
    }

    var goldRecon = buildReconciliation(goldEngine, goldLines);
    var silverRecon = buildReconciliation(silverEngine, silverLines);

    return {
      rows: rowResults,
      groups: groups,
      brands: groups,
      totalDong: totalDong,
      marketInventoryValue: totalDong,
      totalPercent: totalDong > 0 ? 100 : 0,
      money: {
        cashDong: asMoneyNumber(money.cashDong),
        bankDong: asMoneyNumber(money.bankDong),
        receivableDong: asMoneyNumber(money.receivableDong),
        payableDong: asMoneyNumber(money.payableDong),
        moneyActualDong: moneyActual,
      },
      gold: goldEngine,
      silver: silverEngine,
      goldPercent: goldEngine.metalPercent,
      silverPercent: silverEngine.metalPercent,
      reconciliation: {
        gold: goldRecon,
        silver: silverRecon,
        doubleCountAudit: METAL_DEBT_DOUBLE_COUNT_AUDIT,
      },
      unclassifiedObligationCount: Number(opts.unclassifiedObligationCount) || 0,
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
      "market uses buy only",
      listedAvgDong(13560, 99999, true) === 13560,
      String(listedAvgDong(13560, 99999, true))
    );
    add(
      "brand avg mid",
      listedAvgDong(14280, 14470, false) === 14375,
      String(listedAvgDong(14280, 14470, false))
    );
    add("group BTMC", resolveCapitalGroup("BẢO TÍN MINH CHÂU", "Nhẫn Vàng Rồng Thăng Long", "gold") === "BTMC", "");
    add("group bạc", resolveCapitalGroup("Bạc", "Bạc BTMC 1L 2L 5L", "silver") === "BAC", "");
    add("metal silver by brand", resolveMetalKind({ brand: "Bạc", name: "x" }) === "silver", "");
    add("metal unclassified → null", resolveMetalKind({ brand: "", name: "SKU lạ" }) === null, "");
    add(
      "metal no gold fallback",
      resolveMetalKind({ brand: "Unknown Co", name: "Widget" }) === null,
      ""
    );

    var snap = calculateInventoryCapital({
      rows: [
        { id: "btmh", brand: "BTMH", product: "A", buy: 14280, sell: 14470, metal: "gold" },
        { id: "btmc", brand: "BẢO TÍN MINH CHÂU", product: "B", buy: 14280, sell: 14470, metal: "gold" },
        { id: "tlkv", brand: "THĂNG LONG KIM VIỆT", product: "C", buy: 13730, sell: 13880, metal: "gold" },
        { id: "mkt", brand: "Vàng thị trường", product: "Vàng thị trường", buy: 13560, sell: 0, metal: "gold" },
      ],
      skuStocks: [
        { priceRowId: "btmh", quantity: 50, weightChi: 1, boardUnitChi: 1 },
        { priceRowId: "btmc", quantity: 200, weightChi: 1, boardUnitChi: 1 },
        { priceRowId: "tlkv", quantity: 100, weightChi: 1, boardUnitChi: 1 },
        { priceRowId: "mkt", quantity: 50, weightChi: 1, boardUnitChi: 1 },
      ],
      money: { cashDong: 3200000, bankDong: 0, receivableDong: 0, payableDong: 0, moneyActualDong: 3200000 },
      metalObligations: [{ kind: "PAYABLE", metal: "gold", quantityChi: 20, pricePerChi: null }],
    });
    var pct = snap.goldPercent;
    add("SRS example ~62.7%", Math.abs(pct - 62.67) < 0.05, String(pct));
    add("gold avg ~14130", Math.abs(snap.gold.avgPricePerChi - 14130) < 1, String(snap.gold.avgPricePerChi));

    // Case: money âm → % vàng > 100, không clamp
    var over = calculateInventoryCapital({
      rows: [{ id: "g1", brand: "BTMC", product: "X", buy: 14280000, sell: 14470000, metal: "gold" }],
      skuStocks: [{ priceRowId: "g1", quantity: 100, weightChi: 1, boardUnitChi: 1 }],
      money: { moneyActualDong: -900263727 },
      metalObligations: [],
    });
    add("gold % > 100 when money negative", over.goldPercent > 100, String(over.goldPercent));
    add("format keeps >100", formatPercent(over.goldPercent).indexOf("-") < 0 && parseFloat(formatPercent(over.goldPercent)) > 100, formatPercent(over.goldPercent));

    // Case: bạc mẫu số âm → % âm (không thành 0)
    var sil = calculateInventoryCapital({
      rows: [{ id: "s1", brand: "Bạc", product: "Bac 1", buy: 2000000, sell: 2623000, metal: "silver" }],
      skuStocks: [{ priceRowId: "s1", quantity: 4, weightChi: 1, boardUnitChi: 1 }],
      money: { moneyActualDong: -900263727 },
      metalObligations: [],
    });
    add("silver negative % when capital < 0", sil.silverPercent < 0, String(sil.silverPercent));
    add("silver format shows minus", formatPercent(sil.silverPercent).charAt(0) === "-", formatPercent(sil.silverPercent));
    add(
      "silver row % uses quy bạc denominator",
      sil.rows[0] && sil.rows[0].percent < 0 && Math.abs(sil.rows[0].percent - sil.silverPercent) < 0.01,
      sil.rows[0] ? String(sil.rows[0].percent) : "no row"
    );
    add("denom 0 → 0%", percentOf(4, 0) === 0, String(percentOf(4, 0)));
    add("denom negative works", Math.abs(percentOf(4, -385472) - (4 / -385472) * 100) < 1e-9, String(percentOf(4, -385472)));

    // AC: product % uses total capital (not market value); brand sums from rows
    var mix = calculateInventoryCapital({
      rows: [
        { id: "g1", brand: "BTMC", product: "A", buy: 14000000, sell: 14200000, metal: "gold" },
        { id: "g2", brand: "BTMC", product: "B", buy: 14000000, sell: 14200000, metal: "gold" },
        { id: "s1", brand: "Bạc", product: "Bac", buy: 2000000, sell: 2200000, metal: "silver" },
      ],
      skuStocks: [
        { priceRowId: "g1", quantity: 10, weightChi: 1, boardUnitChi: 1 },
        { priceRowId: "g2", quantity: 30, weightChi: 1, boardUnitChi: 1 },
        { priceRowId: "s1", quantity: 5, weightChi: 1, boardUnitChi: 1 },
      ],
      money: { moneyActualDong: 10000000 },
      metalObligations: [
        { kind: "PAYABLE", metal: "gold", quantityChi: 5, pricePerChi: null, priceRowId: "g1" },
        { kind: "RECEIVABLE", metal: "gold", quantityChi: 2, pricePerChi: null },
      ],
    });
    var g1 = mix.rows.find(function (r) {
      return r.id === "g1";
    });
    var btmc = mix.groups.find(function (g) {
      return g.id === "BTMC";
    });
    var sumBtmcRows = mix.rows
      .filter(function (r) {
        return r.group === "BTMC";
      })
      .reduce(function (a, r) {
        return a + r.shareChi;
      }, 0);
    add("AC01 product % uses gold capital", Math.abs(g1.percent - percentOf(g1.shareChi, mix.gold.totalCapitalChi)) < 1e-9, String(g1.percent));
    add("AC03 brand = sum row shares", Math.abs(btmc.shareChi - sumBtmcRows) < 1e-9, String(btmc.shareChi) + " vs " + sumBtmcRows);
    add("gold recon ok", mix.reconciliation.gold.ok === true, JSON.stringify(mix.reconciliation.gold.deltaChi));
    add("silver recon ok", mix.reconciliation.silver.ok === true, JSON.stringify(mix.reconciliation.silver.deltaChi));
    add(
      "AC05 allocated payable on g1",
      g1.allocatedPayableChi > 0 && g1.shareChi < g1.convertedChi,
      String(g1.shareChi) + "/" + String(g1.convertedChi)
    );
    add(
      "unallocated receivable tracked",
      mix.gold.receivableUnallocatedChi > 0,
      String(mix.gold.receivableUnallocatedChi)
    );
    add(
      "AC05 money not in product share",
      Math.abs(
        mix.rows.reduce(function (a, r) {
          return a + (r.metal === "gold" ? r.shareChi : 0);
        }, 0) +
          mix.gold.receivableUnallocatedChi -
          mix.gold.payableUnallocatedChi +
          mix.gold.moneyConvertedChi -
          mix.gold.totalCapitalChi
      ) < 1e-6,
      String(mix.gold.moneyConvertedChi)
    );
    add(
      "AC06 known unallocated still in metalActual",
      mix.gold.metalActualChi ===
        mix.gold.inventoryConvertedChi +
          mix.gold.receivableConvertedChi -
          mix.gold.payableConvertedChi,
      String(mix.gold.metalActualChi)
    );

    // AC07: unclassified never enters gold/silver pools
    var withUnknown = calculateInventoryCapital({
      rows: [{ id: "g1", brand: "BTMC", product: "A", buy: 14000000, sell: 14200000, metal: "gold" }],
      skuStocks: [{ priceRowId: "g1", quantity: 10, weightChi: 1, boardUnitChi: 1 }],
      money: { moneyActualDong: 0 },
      metalObligations: [
        { kind: "PAYABLE", metal: "gold", quantityChi: 1, pricePerChi: null },
        { kind: "PAYABLE", metal: null, quantityChi: 99, pricePerChi: null },
      ],
      unclassifiedObligationCount: 1,
    });
    add(
      "AC07 unknown metal excluded from payable",
      Math.abs(withUnknown.gold.payableConvertedChi - 1) < 1e-9,
      String(withUnknown.gold.payableConvertedChi)
    );
    add(
      "AC07 unclassified count surfaced",
      withUnknown.unclassifiedObligationCount === 1,
      String(withUnknown.unclassifiedObligationCount)
    );
    add("alias moneyConvertedChi", withUnknown.gold.moneyConvertedChi === withUnknown.gold.moneyAsMetalChi, "");
    add("alias inventoryConvertedChi", mix.gold.inventoryConvertedChi === mix.gold.stockConvertedChi, "");

    var failed = cases.filter(function (c) {
      return !c.ok;
    });
    return { ok: failed.length === 0, cases: cases, failed: failed };
  }

  var api = {
    CAPITAL_GROUPS: CAPITAL_GROUPS,
    resolveCapitalGroup: resolveCapitalGroup,
    resolveMetalKind: resolveMetalKind,
    listedAvgDong: listedAvgDong,
    pricePerChiDong: pricePerChiDong,
    skuMarketValueDong: skuMarketValueDong,
    effectiveBuy: effectiveBuy,
    effectiveSell: effectiveSell,
    formatDong: formatDong,
    formatPercent: formatPercent,
    formatChi: formatChi,
    fetchSkuStocks: fetchSkuStocks,
    fetchMoneySnapshot: fetchMoneySnapshot,
    fetchMetalObligations: fetchMetalObligations,
    calculateInventoryCapital: calculateInventoryCapital,
    emptyMoneySnapshot: emptyMoneySnapshot,
    METAL_DEBT_DOUBLE_COUNT_AUDIT: METAL_DEBT_DOUBLE_COUNT_AUDIT,
    selfCheck: selfCheck,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.TLKVGoldInventoryCapital = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
