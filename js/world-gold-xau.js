var CACHE_KEY = "TLKV_XAU_CACHE";
var CACHE_TTL = 1000 * 60 * 60 * 8; // 8 tiếng

(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function setText(el, text) {
    if (el) el.textContent = text == null ? "" : String(text);
  }

  function tvIframeSrc() {
    var q = new URLSearchParams({
      autosize: "true",
      symbol: "FOREXCOM:XAUUSD",
      interval: "D",
      timezone: "Asia/Ho_Chi_Minh",
      theme: "light",
      style: "1",
      locale: "vi_VN",
      hide_top_toolbar: "false",
      hide_legend: "false",
      save_image: "false",
      calendar: "false",
      hotlist: "false",
    });
    return "https://www.tradingview.com/embed-widget/advanced-chart/?" + q.toString();
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

    setText(spotEl, s.priceDisplay || "—");

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
    if (tvWrap && !tvWrap.querySelector("iframe")) {
      var ifr = document.createElement("iframe");
      ifr.setAttribute("title", "Biểu đồ XAU/USD — TradingView");
      ifr.setAttribute("loading", "lazy");
      ifr.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      ifr.src = tvIframeSrc();
      tvWrap.appendChild(ifr);
    }

    var spotEl = $(".tlkv-world-xau-price", root);
    var chEl = $(".tlkv-world-xau-change", root);
    var tbody = $(".tlkv-world-xau-tbody", root);
    var foot = $(".tlkv-world-xau-foot", root);
    var errBox = $(".tlkv-world-xau-msg", root);

    var els = { spotEl, chEl, tbody, foot };

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