/**
 * Shared TV-style gold table UI: render helpers, logo, column striping, datetime.
 * Data + SSE/Realtime remain in js/gold-data.js (TLKVGold).
 */
(function (global) {
  /** Chỉ ô Sản phẩm / Hàm lượng / Giá — không áp nền custom lên cột Thương hiệu */
  var TLKV_TV_CUSTOM_STRIPE_INDEXES = [0, 2, 5, 7];
  var TLKV_TV_CUSTOM_STRIPE_BACKGROUND = "rgba(17, 31, 244)";

  function tvStripeHighlightBoxShadow() {
    return "inset 0 0 0 1px rgba(255, 255, 255, 0.28)";
  }

  function tvLogoAbsUrl() {
    try {
      return new URL("/assets/logo-thang-long-kim-viet.png", global.location.href).href;
    } catch (e) {
      return global.location.origin + "/assets/logo-thang-long-kim-viet.png";
    }
  }

  /**
   * @param {object} opts
   * @param {string} [opts.tableSelector]
   * @param {string} [opts.tbodySelector]
   * @param {string} [opts.dateLineSelector]
   * @param {string} [opts.logoSelector] primary logo img
   * @param {string} [opts.extraLogoSelector] e.g. ".tv-header-logo--secondary"
   * @param {boolean} [opts.useColumnStripes]
   * @param {{ up: string, down: string }} [opts.trendColors]
   * @param {string} [opts.priceFontRem]
   * @param {string} [opts.pricePadding]
   * @param {string} [opts.datePrefix]
   * @param {boolean} [opts.applyBrandGoldTint] default true — set false on light /tv-model
   * @param {string} [opts.priceTextColor] default #fff — price span color
   * @param {string} [opts.stripeHighlightBackground] default TLKV_TV_CUSTOM_STRIPE_BACKGROUND
   * @param {(tbody: HTMLElement, err: unknown) => void} [opts.onRenderError]
   */
  function createGoldTvBoard(opts) {
    opts = opts || {};
    var tableSelector = opts.tableSelector || "#tv-gold-table";
    var tbodySelector = opts.tbodySelector || "#tv-table-body";
    var dateLineSelector = opts.dateLineSelector || "#tv-date-line";
    var logoSelector = opts.logoSelector || "#tv-header-logo";
    var extraLogoSelector = opts.extraLogoSelector || "";
    var datePrefix = opts.datePrefix != null ? String(opts.datePrefix) : "Ngày/Date: ";
    var useColumnStripes = opts.useColumnStripes !== false;
    var applyBrandGoldTint = opts.applyBrandGoldTint !== false;
    var priceTextColor = opts.priceTextColor != null ? String(opts.priceTextColor) : "#ffffff";
    var trendColors = opts.trendColors || { up: "#34d97a", down: "#ff5e5e" };
    var priceFontRem = opts.priceFontRem || "1.36rem";
    var pricePadding = opts.pricePadding || "10px 9px";
    var onRenderError = typeof opts.onRenderError === "function" ? opts.onRenderError : null;
    var stripeIndexes = Array.isArray(opts.columnStripeIndexes) ? opts.columnStripeIndexes : TLKV_TV_CUSTOM_STRIPE_INDEXES.slice();
    var stripeHighlightBackground =
      opts.stripeHighlightBackground != null ? String(opts.stripeHighlightBackground) : TLKV_TV_CUSTOM_STRIPE_BACKGROUND;

    var __tvGoldRenderGen = 0;

    function setStripeCellFill(el, active) {
      if (!el || !el.style) return;
      if (active) {
        el.style.setProperty("background", stripeHighlightBackground, "important");
        el.style.setProperty("box-shadow", tvStripeHighlightBoxShadow(), "important");
      } else {
        el.style.removeProperty("background");
        el.style.removeProperty("box-shadow");
      }
    }

    function tableEl() {
      return document.querySelector(tableSelector);
    }

    function tbodyEl() {
      return document.querySelector(tbodySelector);
    }

    /** `tr.row-silver` cuối cùng trong tbody (khối bạc). */
    function getLastSilverTbodyTr(table) {
      if (!table) return null;
      var nodes = table.querySelectorAll("tbody tr.row-silver");
      return nodes.length ? nodes[nodes.length - 1] : null;
    }

    function tbodyRowIndex(table, tr) {
      if (!table || !tr) return -1;
      var rows = table.querySelectorAll("tbody tr");
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] === tr) return i;
      }
      return -1;
    }

    /**
     * Ô đầu tiên theo selector trong các dòng 0..targetIdx có rowspan phủ tới targetIdx.
     * Dùng khi brand/product rowspan — ô không nằm trên `tr` cuối.
     */
    function cellCoveringTbodyRowIndex(table, targetIdx, cellSelector) {
      if (!table || targetIdx < 0) return null;
      var rows = table.querySelectorAll("tbody tr");
      for (var j = 0; j <= targetIdx && j < rows.length; j++) {
        var tr = rows[j];
        var cell = tr.querySelector(cellSelector);
        if (!cell) continue;
        var rs = parseInt(cell.getAttribute("rowspan") || "1", 10);
        if (isNaN(rs) || rs < 1) rs = 1;
        if (j + rs - 1 >= targetIdx) return cell;
      }
      return null;
    }

    function productCellForTbodyRow(table, row, rowIdx) {
      var pc = row.querySelector("td.col-product");
      if (pc) return pc;
      return cellCoveringTbodyRowIndex(table, rowIdx, "td.col-product");
    }

    function loadTVLogos() {
      var absUrl = tvLogoAbsUrl();
      var primary = document.querySelector(logoSelector);
      if (primary && primary.getAttribute("src") !== absUrl) {
        primary.setAttribute("src", absUrl);
      }
      if (extraLogoSelector) {
        document.querySelectorAll(extraLogoSelector).forEach(function (img) {
          if (img && img.getAttribute("src") !== absUrl) {
            img.setAttribute("src", absUrl);
          }
        });
      }
    }

    function highlightTVBrandColumn() {
      if (!applyBrandGoldTint) return;
      var table = tableEl();
      if (!table) return;
      var lastSilverTr = getLastSilverTbodyTr(table);
      var iLast = lastSilverTr ? tbodyRowIndex(table, lastSilverTr) : -1;
      table.querySelectorAll("tbody td.gold-brand-cell").forEach(function (cell) {
        cell.style.color = "rgba(242, 200, 66, 1)";
        cell.style.fontWeight = "700";
        setStripeCellFill(cell, false);
      });
      if (iLast >= 0) {
        var bc = cellCoveringTbodyRowIndex(table, iLast, "td.gold-brand-cell");
        if (bc) setStripeCellFill(bc, true);
      }
    }

    function highlightProductRows() {
      var table = tableEl();
      if (!table) return;
      var lastSilverTr = getLastSilverTbodyTr(table);
      var rows = table.querySelectorAll("tbody tr");

      if (useColumnStripes) {
        rows.forEach(function (row, idx) {
          var productCell = productCellForTbodyRow(table, row, idx);
          if (!productCell) return;
          productCell.style.color = "rgb(255, 242, 120)";
          productCell.style.fontWeight = "500";
          setStripeCellFill(productCell, row === lastSilverTr);
        });
      } else {
        rows.forEach(function (row, idx) {
          var productCell = productCellForTbodyRow(table, row, idx);
          if (!productCell) return;
          setStripeCellFill(productCell, row === lastSilverTr);
        });
      }
    }

    function highlightPurityColumn() {
      var table = tableEl();
      if (!table) return;
      var lastSilverTr = getLastSilverTbodyTr(table);
      var rows = table.querySelectorAll("tbody tr");
      rows.forEach(function (row, idx) {
        var purityCell = row.querySelector("td.col-purity");
        if (!purityCell) return;
        setStripeCellFill(purityCell, row === lastSilverTr);
      });
    }

    function highlightPriceColumns() {
      var table = tableEl();
      if (!table) return;
      var lastSilverTr = getLastSilverTbodyTr(table);
      var rows = table.querySelectorAll("tbody tr");
      rows.forEach(function (row, idx) {
        var priceCells = row.querySelectorAll("td.price");
        if (priceCells.length < 2) return;
        if (row === lastSilverTr) {
          priceCells.forEach(function (cell) {
            setStripeCellFill(cell, true);
          });
          return;
        }
        if (!useColumnStripes) {
          priceCells.forEach(function (cell) {
            cell.style.removeProperty("background");
            cell.style.removeProperty("box-shadow");
          });
          return;
        }
        var evenRow = (idx + 1) % 2 === 0;
        priceCells.forEach(function (cell) {
          if (evenRow) {
            cell.style.setProperty("background", "rgba(226, 52, 52)", "important");
            cell.style.setProperty("box-shadow", tvStripeHighlightBoxShadow(), "important");
          } else {
            cell.style.removeProperty("background");
            cell.style.removeProperty("box-shadow");
          }
        });
      });
    }

    /** Gỡ mọi stripe inline trên ô Thương hiệu (custom background không áp cột này). */
    function clearStripeFromBrandColumn() {
      var table = tableEl();
      if (!table) return;
      table.querySelectorAll("tbody td.gold-brand-cell").forEach(function (cell) {
        setStripeCellFill(cell, false);
      });
    }

    function decoratePriceCells(tbody) {
      if (!tbody) return;
      var rows = tbody.querySelectorAll("tr");
      var index = 0;
      rows.forEach(function (row) {
        var priceCells = row.querySelectorAll("td.price");
        if (priceCells.length < 2) return;
        priceCells.forEach(function (cell) {
          cell.style.fontSize = priceFontRem;
          cell.style.fontWeight = "700";
          cell.style.lineHeight = "1";
          cell.style.padding = pricePadding;

          var textNode = Array.from(cell.childNodes).find(function (n) {
            return n && n.nodeType === Node.TEXT_NODE;
          });
          var rawText = textNode ? String(textNode.nodeValue || "") : "";
          if (textNode) {
            cell.removeChild(textNode);
          }

          var priceSpan = cell.querySelector(".tv-price-text");
          if (!priceSpan) {
            priceSpan = document.createElement("span");
            priceSpan.className = "tv-price-text";
            cell.insertBefore(priceSpan, cell.firstChild);
          }
          priceSpan.textContent = rawText;
          priceSpan.style.color = priceTextColor;
          priceSpan.style.fontSize = priceFontRem;
          cell.style.color = "";
          cell.style.textShadow = "";

          cell.querySelectorAll(".gold-price-trend").forEach(function (trend) {
            if (trend.classList.contains("gold-price-trend--up")) {
              trend.style.setProperty("color", trendColors.up, "important");
            } else if (trend.classList.contains("gold-price-trend--down")) {
              trend.style.setProperty("color", trendColors.down, "important");
            }
          });
        });
        index++;
      });
    }

    function showFetchErrorRow(tbody, err) {
      if (!tbody) return;
      tbody.innerHTML = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.className = "tlkv-tv-error-cell";
      td.textContent =
        "Không tải được bảng giá. " +
        (err && err.message ? String(err.message) : "Vui lòng kiểm tra kết nối và cấu hình.") +
        " — Đang thử lại khi có tín hiệu cập nhật.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    /**
     * @param {{ rows: unknown[], meta?: object } | null} [dataOverride]
     */
    async function renderTVTable(dataOverride) {
      var tbody = tbodyEl();
      if (!tbody || !global.TLKVGold) return;

      var gen = ++__tvGoldRenderGen;
      var data = dataOverride;

      if (!data) {
        try {
          data = await global.TLKVGold.getGoldTable();
        } catch (err) {
          if (gen !== __tvGoldRenderGen) return;
          if (tbody.querySelector("tr[data-tlkv-gold-row-id]")) {
            if (onRenderError) {
              try {
                onRenderError(tbody, err);
              } catch (_) { }
            }
            return;
          }
          showFetchErrorRow(tbody, err);
          if (onRenderError) {
            try {
              onRenderError(tbody, err);
            } catch (_) { }
          }
          return;
        }
      }

      if (gen !== __tvGoldRenderGen || !data || !Array.isArray(data.rows)) {
        if (tbody.querySelector("tr[data-tlkv-gold-row-id]")) return;
        showFetchErrorRow(tbody, new Error("Dữ liệu bảng giá không hợp lệ."));
        return;
      }

      var patched = false;
      if (typeof global.TLKVGold.tryPatchGoldTbodyPricesOnly === "function") {
        patched = global.TLKVGold.tryPatchGoldTbodyPricesOnly(tbody, data.rows);
      }
      if (!patched) {
        global.TLKVGold.renderRowsIntoTbody(tbody, data.rows);
      }

      decoratePriceCells(tbody);
      clearStripeFromBrandColumn();
      highlightProductRows();
      highlightPurityColumn();
      highlightPriceColumns();
      highlightTVBrandColumn();
    }

    function updateTVDateTime() {
      var now = new Date();
      var day = String(now.getDate()).padStart(2, "0");
      var month = String(now.getMonth() + 1).padStart(2, "0");
      var year = now.getFullYear();
      var hours = now.getHours();
      var minutes = String(now.getMinutes()).padStart(2, "0");
      var seconds = String(now.getSeconds()).padStart(2, "0");
      var ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      var formatted =
        day + "/" + month + "/" + year + " " + hours + ":" + minutes + ":" + seconds + " " + ampm;
      var el = document.querySelector(dateLineSelector);
      if (el) {
        el.textContent = datePrefix + formatted;
      }
    }

    return {
      renderTVTable: renderTVTable,
      updateTVDateTime: updateTVDateTime,
      loadTVLogos: loadTVLogos,
      /** @deprecated alias */
      loadTVLogo: loadTVLogos,
    };
  }

  /**
   * Boot script for `/tv-model` standalone page (fullscreen + marquee + status pill).
   */
  function initTvModelPage() {
    var board = createGoldTvBoard({
      tableSelector: "#tv-gold-table",
      tbodySelector: "#tv-table-body",
      dateLineSelector: "#tv-date-line",
      logoSelector: "#tv-header-logo-left",
      datePrefix: "NGÀY/DATE: ",
      useColumnStripes: true,
      trendColors: { up: "rgba(44, 154, 0)", down: "rgba(230, 18, 9)" },
      priceFontRem: "clamp(1rem, 1.35vw, 2.35rem)",
      pricePadding: "clamp(2px, 0.26vh, 7px) clamp(5px, 0.55vw, 14px)",
    });

    var pill = document.getElementById("tv-conn-pill");
    var booted = false;

    function setPill(text, visible) {
      if (!pill) return;
      pill.textContent = text;
      pill.hidden = !visible;
    }

    setPill("Đang tải bảng giá…", true);

    function onPushUi(ev) {
      var d = ev && ev.detail ? ev.detail : {};
      if (d.mode === "sse" && d.state === "reconnecting") {
        setPill("Đang kết nối lại luồng dữ liệu…", true);
        return;
      }
      if (d.mode === "sse" && d.state === "live") {
        setPill("", false);
        return;
      }
      if (d.mode === "realtime") {
        if (d.state === "live") {
          setPill("", false);
          return;
        }
        if (d.state === "reconnecting") {
          setPill("Đang kết nối lại Realtime…", true);
          return;
        }
        setPill("Đồng bộ qua Realtime", booted);
        return;
      }
      if (d.mode === "poll") {
        setPill("Chế độ cập nhật định kỳ (TV)", true);
      }
    }

    function onOffline() {
      setPill("Mất mạng — chờ kết nối…", true);
    }

    function onOnline() {
      setPill("Đã có mạng — đang làm mới…", true);
      board.renderTVTable().finally(function () {
        board.updateTVDateTime();
        if (pill) {
          pill.hidden = true;
        }
      });
    }

    window.addEventListener("tlkv:gold-push-ui", onPushUi);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    board.loadTVLogos();
    if (global.TLKVGold && typeof global.TLKVGold.startGoldPush === "function") {
      global.TLKVGold.startGoldPush();
    }

    board.renderTVTable().finally(function () {
      booted = true;
      board.updateTVDateTime();
      if (pill) {
        pill.hidden = true;
      }
    });

    window.addEventListener("tlkv:gold-table-changed", function (ev) {
      console.log(
        "[TLKV gold-push] page(tv-model): tlkv:gold-table-changed → renderTVTable",
        ev && ev.detail ? ev.detail : {}
      );
      board.renderTVTable();
      board.updateTVDateTime();
    });

    window.addEventListener(
      "pagehide",
      function () {
        if (global.TLKVGold && typeof global.TLKVGold.stopGoldTableRealtime === "function") {
          global.TLKVGold.stopGoldTableRealtime();
        }
      },
      { passive: true }
    );

    setInterval(function () {
      board.updateTVDateTime();
    }, 1000);
  }

  global.TLKVTvGoldBoard = {
    createBoard: createGoldTvBoard,
    initTvModelPage: initTvModelPage,
    tvLogoAbsUrl: tvLogoAbsUrl,
    /** Custom stripe rows (product / purity / price cells) */
    TV_CUSTOM_STRIPE_INDEXES: TLKV_TV_CUSTOM_STRIPE_INDEXES,
    TV_CUSTOM_STRIPE_BACKGROUND: TLKV_TV_CUSTOM_STRIPE_BACKGROUND,
  };
})(typeof window !== "undefined" ? window : globalThis);
