var CACHE_KEY = "TLKV_XAU_CACHE";
var CACHE_TTL = 1000 * 60 * 60 * 8; // 8 tiếng

(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function setText(el, text) {
    if (el) el.textContent = text == null ? "" : String(text);
  }

  function formatWorldMetaAsOf(iso) {
    if (!iso) return "Cập nhật lúc: —";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "Cập nhật lúc: —";
    var t = d.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return "Cập nhật lúc: " + String(t).replace(/\s/g, "").replace(":", "h");
  }

  function shouldSkipTradingViewEmbed() {
    if (global.__TLKV_SKIP_TRADINGVIEW === true) return true;
    if (global.__TLKV_SKIP_TRADINGVIEW === false) return false;
    try {
      var ua = String(global.navigator && global.navigator.userAgent ? global.navigator.userAgent : "");
      if (
        /SmartTV|SMART-TV|HbbTV|Tizen|webOS|NetCast|NETTV|BRAVIA|CrKey|AFT|AppleTV|googletv|Linux; Android.*TV|TCL|MiTV|TV\s*Safari|PLAYSTATION|Xbox/i.test(
          ua
        )
      ) {
        return true;
      }
    } catch (e) {}
    try {
      var c = global.navigator && global.navigator.connection;
      if (c && c.saveData === true) return true;
    } catch (e2) {}
    if (typeof global.matchMedia === "function") {
      try {
        if (global.matchMedia("(prefers-reduced-data: reduce)").matches) return true;
      } catch (e3) {}
    }
    return false;
  }

  function tvWidgetConfig() {
    return {
      autosize: true,
      symbol: "FOREXCOM:XAUUSD",
      interval: "D",
      timezone: "Asia/Ho_Chi_Minh",
      theme: "light",
      style: "1",
      locale: "vi_VN",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: true,
      withdateranges: false,
      allow_symbol_change: false,
      enable_publishing: false,
      save_image: false,
      show_popup_button: false,
      details: false,
      calendar: false,
      hotlist: false,
      support_host: "https://www.tradingview.com",
    };
  }

  function mountTradingViewWidget(tvWrap) {
    var container = document.createElement("div");
    container.className = "tradingview-widget-container tlkv-world-xau-tv-embed";
    container.style.cssText = "height:100%;width:100%;";

    var widgetHost = document.createElement("div");
    widgetHost.className = "tradingview-widget-container__widget";
    widgetHost.style.cssText = "height:100%;width:100%;";
    container.appendChild(widgetHost);

    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify(tvWidgetConfig());
    container.appendChild(script);

    tvWrap.appendChild(container);
  }

  function cellClass(positive) {
    if (positive === true) return "tlkv-world-xau-num--up";
    if (positive === false) return "tlkv-world-xau-num--down";
    return "tlkv-world-xau-num--na";
  }

  function renderRows(tbody, rows) {
    if (!tbody) return;
    tbody.innerHTML = "";
    (rows || []).forEach(function (r) {
      var tr = document.createElement("tr");

      var td1 = document.createElement("td");
      td1.textContent = r.label || "";

      var td2 = document.createElement("td");
      td2.textContent = r.abs || "—";
      td2.className = cellClass(r.positive);

      var td3 = document.createElement("td");
      td3.textContent = r.pct || "—";
      td3.className = cellClass(r.positive);

      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }

  // ===== CACHE =====
  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.time || !parsed.data) return null;

      var isExpired = Date.now() - parsed.time > CACHE_TTL;
      if (isExpired) return null;

      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function setCache(data) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          time: Date.now(),
          data: data,
        })
      );
    } catch (e) { }
  }

  // ===== RENDER =====
  function renderData(j, els) {
    var s = j.spot || {};

    var spotEl = els.spotEl;
    var chEl = els.chEl;
    var tbody = els.tbody;
    var foot = els.foot;
    var metaEl = els.metaEl;

    setText(spotEl, s.priceDisplay || "—");
    setText(metaEl, formatWorldMetaAsOf(j.asOf));

    if (chEl) {
      var ch = s.ch;
      var chp = s.chp;
      var parts = [];

      if (typeof ch === "number" && Number.isFinite(ch)) {
        var arrow = ch > 0 ? "▲ +" : ch < 0 ? "▼ " : "";
        parts.push(
          arrow +
          ch.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }

      if (typeof chp === "number" && Number.isFinite(chp)) {
        parts.push("(" + chp.toFixed(2) + "%)");
      }

      chEl.textContent = parts.join(" ") || "—";

      chEl.className = "tlkv-world-xau-change ";
      if (ch < 0 || chp < 0) chEl.className += "tlkv-world-xau-change--down";
      else if (ch > 0 || chp > 0) chEl.className += "tlkv-world-xau-change--up";
      else chEl.className += "tlkv-world-xau-change--flat";
    }

    renderRows(tbody, j.rows);
  }

  function mountWorldGoldXAU(root) {
    if (!root || root.getAttribute("data-tlkv-xau-mounted") === "1") return;
    root.setAttribute("data-tlkv-xau-mounted", "1");

    var tvWrap = $(".tlkv-world-xau-tv-wrap", root);
    if (
      tvWrap &&
      !tvWrap.querySelector(".tlkv-world-xau-tv-embed") &&
      !tvWrap.querySelector("iframe") &&
      !tvWrap.querySelector(".tlkv-world-xau-tv-skip")
    ) {
      if (shouldSkipTradingViewEmbed()) {
        var skip = document.createElement("div");
        skip.className = "tlkv-world-xau-tv-skip";
        skip.setAttribute("role", "note");
        skip.innerHTML =
          "<p><strong>Biểu đồ TradingView</strong> không tải trên TV/trình duyệt tiết kiệm dữ liệu để tránh treo máy. Giá spot và bảng kỳ hạn bên dưới vẫn cập nhật từ máy chủ.</p>" +
          '<p class="tlkv-world-xau-tv-skip-link"><a href="https://www.tradingview.com/chart/?symbol=FOREXCOM%3AXAUUSD" rel="noopener noreferrer" target="_blank">Mở biểu đồ XAU/USD trên thiết bị khác</a></p>';
        tvWrap.appendChild(skip);
      } else {
        mountTradingViewWidget(tvWrap);
      }
    }

    var spotEl = $(".tlkv-world-xau-price", root);
    var chEl = $(".tlkv-world-xau-change", root);
    var tbody = $(".tlkv-world-xau-tbody", root);
    var foot = $(".tlkv-world-xau-foot", root);
    var metaEl = $(".tlkv-world-xau-meta", root);
    var errBox = $(".tlkv-world-xau-msg", root);

    var els = { spotEl, chEl, tbody, foot, metaEl };

    var cached = getCache();

    if (cached) {
      console.log("👉 Use cached gold data");
      renderData(cached, els);
    } else {
      console.log("👉 Fetch new gold data");

      fetch("/api/world-xau-usd")
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (_ref) {
          var j = _ref.j;
          var ok = _ref.ok;

          if (!ok || !j || j.ok === false) {
            console.error("GoldAPI error:", j?.error || "Unknown error");
            return;
          }

          setCache(j);
          renderData(j, els);

          if (errBox) errBox.hidden = true;
          root.classList.remove("tlkv-world-xau--error");
        })
        .catch(function (e) {
          console.error(e);

          var cached = getCache();

          if (cached) {
            console.warn("👉 Use stale cache due to API error");
            renderData(cached, els);
          }
        });
    }
  }

  function boot() {
    document.querySelectorAll("[data-tlkv-world-xau]").forEach(function (root) {
      mountWorldGoldXAU(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.TLKVWorldGoldXAU = {
    mount: mountWorldGoldXAU,
    boot: boot,
  };
})(typeof window !== "undefined" ? window : globalThis);