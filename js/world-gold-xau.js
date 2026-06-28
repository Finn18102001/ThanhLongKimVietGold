/** TradingView XAU/USD embed only (no GoldAPI). */
(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
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

  function mountWorldGoldXAU(root) {
    if (!root || root.getAttribute("data-tlkv-xau-mounted") === "1") return;
    root.setAttribute("data-tlkv-xau-mounted", "1");

    var tvWrap = $(".tlkv-world-xau-tv-wrap", root);
    if (
      !tvWrap ||
      tvWrap.querySelector(".tlkv-world-xau-tv-embed") ||
      tvWrap.querySelector("iframe") ||
      tvWrap.querySelector(".tlkv-world-xau-tv-skip")
    ) {
      return;
    }

    if (shouldSkipTradingViewEmbed()) {
      var skip = document.createElement("div");
      skip.className = "tlkv-world-xau-tv-skip";
      skip.setAttribute("role", "note");
      skip.innerHTML =
        "<p><strong>Biểu đồ TradingView</strong> không tải trên TV/trình duyệt tiết kiệm dữ liệu để tránh treo máy.</p>" +
        '<p class="tlkv-world-xau-tv-skip-link"><a href="https://www.tradingview.com/chart/?symbol=FOREXCOM%3AXAUUSD" rel="noopener noreferrer" target="_blank">Mở biểu đồ XAU/USD trên thiết bị khác</a></p>';
      tvWrap.appendChild(skip);
      return;
    }

    mountTradingViewWidget(tvWrap);
  }

  function boot() {
    document.querySelectorAll("[data-tlkv-world-xau]").forEach(mountWorldGoldXAU);
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
