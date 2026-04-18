(function (global) {
  // ========== CẤU HÌNH ==========
  const CACHE_KEY = "tlkv_world_gold_cache";
  const CACHE_TTL = 60 * 60 * 1000; // 1 giờ
  
  // ========== HÀM TIỆN ÍCH ==========
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function setText(el, text) {
    if (el) el.textContent = text == null ? "" : String(text);
  }
  
  function formatNumber(num, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    if (num === undefined || num === null || !Number.isFinite(num)) return "—";
    var sign = num > 0 ? "+" : "";
    return sign + num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  
  function formatPercent(num) {
    if (num === undefined || num === null || !Number.isFinite(num)) return "—";
    var sign = num > 0 ? "+" : "";
    return sign + num.toFixed(2) + "%";
  }
  
  function cellClass(positive) {
    if (positive === true) return "tlkv-world-xau-num--up";
    if (positive === false) return "tlkv-world-xau-num--down";
    return "tlkv-world-xau-num--na";
  }
  
  /**
   * Tính toán dữ liệu diễn biến từ current price và historical data
   */
  function calculatePerformanceRows(currentPrice, historical) {
    if (!currentPrice || !Number.isFinite(currentPrice)) return [];
    
    var periods = [
      { label: "Hôm nay", key: "day1" },
      { label: "1 tuần", key: "week1" },
      { label: "1 tháng", key: "month1" },
      { label: "3 tháng", key: "month3" },
      { label: "6 tháng", key: "month6" },
      { label: "1 năm", key: "year1" }
    ];
    
    var rows = [];
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      var oldPrice = historical && historical[p.key];
      
      if (oldPrice && Number.isFinite(oldPrice) && oldPrice > 0) {
        var change = currentPrice - oldPrice;
        var pct = (change / oldPrice) * 100;
        rows.push({
          label: p.label,
          abs: formatNumber(change, 2),
          pct: formatPercent(pct),
          positive: change > 0 ? true : (change < 0 ? false : null)
        });
      } else {
        rows.push({
          label: p.label,
          abs: "—",
          pct: "—",
          positive: null
        });
      }
    }
    return rows;
  }
  
  /**
   * Lưu dữ liệu vào cache
   */
  function saveToCache(data) {
    try {
      var cacheData = {
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log("✅ Đã lưu world gold vào cache");
      return true;
    } catch (e) {
      console.warn("Không thể lưu cache:", e);
      return false;
    }
  }
  
  /**
   * Đọc dữ liệu từ cache
   * @returns {object|null} Dữ liệu cache hoặc null nếu không có
   */
  function loadFromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      
      var cache = JSON.parse(raw);
      if (!cache.timestamp || !cache.data) return null;
      
      var age = Date.now() - cache.timestamp;
      console.log("📦 Cache age: " + Math.round(age / 60000) + " phút");
      
      return cache.data;
    } catch (e) {
      console.warn("Không thể đọc cache:", e);
      return null;
    }
  }
  
  /**
   * Kiểm tra cache có còn hiệu lực không
   */
  function isCacheValid() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      var cache = JSON.parse(raw);
      if (!cache.timestamp) return false;
      var age = Date.now() - cache.timestamp;
      return age < CACHE_TTL;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Render dữ liệu lên UI
   */
  function renderWorldGold(root, data, isFallback) {
    var spotEl = $(".tlkv-world-xau-price", root);
    var chEl = $(".tlkv-world-xau-change", root);
    var tbody = $(".tlkv-world-xau-tbody", root);
    var foot = $(".tlkv-world-xau-foot", root);
    var errBox = $(".tlkv-world-xau-msg", root);
    
    if (errBox) errBox.hidden = true;
    
    var s = data.spot || {};
    var currentPrice = s.price;
    
    // Cập nhật giá spot
    setText(spotEl, s.priceDisplay || formatNumber(currentPrice, 2) || "—");
    
    // Cập nhật thay đổi
    if (chEl) {
      var ch = s.ch;
      var chp = s.chp;
      var parts = [];
      if (typeof ch === "number" && Number.isFinite(ch)) {
        var arrow = ch > 0 ? "▲ +" : ch < 0 ? "▼ " : "";
        parts.push(arrow + formatNumber(ch, 2));
      }
      if (typeof chp === "number" && Number.isFinite(chp)) {
        parts.push("(" + (chp > 0 ? "+" : "") + chp.toFixed(2) + "%)");
      }
      chEl.textContent = parts.join(" ") || "—";
      chEl.className = "tlkv-world-xau-change ";
      if (ch < 0 || chp < 0) chEl.className += "tlkv-world-xau-change--down";
      else if (ch > 0 || chp > 0) chEl.className += "tlkv-world-xau-change--up";
      else chEl.className += "tlkv-world-xau-change--flat";
    }
    
    // Cập nhật symbol
    setText($(".tlkv-world-xau-symbol", root), s.symbol || "XAUUSD");
    
    // Cập nhật bảng diễn biến
    var historical = data.historical || {};
    var rows = calculatePerformanceRows(currentPrice, historical);
    renderRows(tbody, rows);
    
    // Cập nhật footer
    if (foot) {
      var asOf = data.asOf;
      if (asOf) {
        try {
          var d = new Date(asOf);
          foot.textContent = "Cập nhật: " + d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
        } catch (_) {
          foot.textContent = "Cập nhật: " + asOf;
        }
      } else {
        foot.textContent = "Cập nhật: " + new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      }
      if (isFallback) {
        foot.textContent += " (đang cập nhật...)";
      }
    }
    
    root.classList.remove("tlkv-world-xau--error");
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
  
  /**
   * Gọi API mới và cập nhật cache
   */
  function fetchFreshData(root) {
    console.log("📡 Gọi API world-xau-usd...");
    
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
          throw new Error(j?.error || "API returned error");
        }
        
        console.log("✅ API thành công");
        
        // Chuẩn bị dữ liệu từ API
        var apiData = {
          spot: j.spot || {},
          historical: j.historical || {},
          asOf: j.asOf || new Date().toISOString()
        };
        
        // Lưu vào cache
        saveToCache(apiData);
        
        // Render lên UI (không phải fallback)
        renderWorldGold(root, apiData, false);
      })
      .catch(function (e) {
        console.error("❌ API error:", e);
        
        // TH1: Có cache hợp lệ -> vẫn hiển thị cache (không cần fallback)
        var cachedData = loadFromCache();
        if (cachedData) {
          console.log("📦 Dùng cache do API lỗi");
          renderWorldGold(root, cachedData, false);
          return;
        }
        
        // TH2: Không có cache -> hiển thị thông báo lỗi nhẹ, không có dữ liệu
        console.warn("⚠️ Không có cache và API lỗi, không thể hiển thị dữ liệu");
        var spotEl = $(".tlkv-world-xau-price", root);
        var chEl = $(".tlkv-world-xau-change", root);
        var tbody = $(".tlkv-world-xau-tbody", root);
        var foot = $(".tlkv-world-xau-foot", root);
        
        if (spotEl) spotEl.textContent = "—";
        if (chEl) {
          chEl.textContent = "—";
          chEl.className = "tlkv-world-xau-change tlkv-world-xau-change--flat";
        }
        if (tbody) renderRows(tbody, []);
        if (foot) foot.textContent = "Đang cập nhật dữ liệu...";
        
        root.classList.add("tlkv-world-xau--error");
      });
  }
  
  function mountWorldGoldXAU(root) {
    if (!root || root.getAttribute("data-tlkv-xau-mounted") === "1") return;
    root.setAttribute("data-tlkv-xau-mounted", "1");
    
    // Thêm TradingView iframe
    var tvWrap = $(".tlkv-world-xau-tv-wrap", root);
    if (tvWrap && !tvWrap.querySelector("iframe")) {
      var ifr = document.createElement("iframe");
      ifr.setAttribute("title", "Biểu đồ XAU/USD — TradingView");
      ifr.setAttribute("loading", "lazy");
      ifr.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      ifr.src = tvIframeSrc();
      tvWrap.appendChild(ifr);
    }
    
    // Bước 1: Hiển thị cache ngay lập tức (nếu có)
    var cachedData = loadFromCache();
    if (cachedData) {
      console.log("📦 Hiển thị dữ liệu từ cache");
      renderWorldGold(root, cachedData, false);
    } else {
      // Không có cache, hiển thị trạng thái loading
      console.log("⏳ Chưa có cache, đang tải...");
      var spotEl = $(".tlkv-world-xau-price", root);
      var chEl = $(".tlkv-world-xau-change", root);
      if (spotEl) spotEl.textContent = "Đang tải...";
      if (chEl) chEl.textContent = "";
    }
    
    // Bước 2: Gọi API để cập nhật dữ liệu mới (nếu cache hết hạn hoặc lần đầu)
    if (!isCacheValid()) {
      console.log("🔄 Cache hết hạn hoặc chưa có, gọi API...");
      fetchFreshData(root);
    } else {
      console.log("🟢 Cache còn hiệu lực, không gọi API");
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
    clearCache: function() {
      localStorage.removeItem(CACHE_KEY);
      console.log("🗑️ Đã xóa cache world gold");
    }
  };
})(typeof window !== "undefined" ? window : globalThis);