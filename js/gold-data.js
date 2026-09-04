(function (global) {
  const STORAGE_KEY = "tlkv_gold_table_v1";
  /** Session-scoped gold payload (survives soft reload in same tab). */
  const SESSION_CACHE_KEY = "tlkv_gold_table_session_v1";
  /**
   * Hard TTL — cắt PostgREST lặp trong tab. Freshness không dựa vào TTL:
   * Realtime → invalidate → force fetch; F5/tab-visible → so sánh gold_meta.price_version.
   */
  const SESSION_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
  /** Soft age — fallback khi chưa so được price_version (tab không push). */
  const SESSION_CACHE_SOFT_MS = 5 * 60 * 1000;
  const GOLD_PUSH_LOG = "[TLKV gold-push]";

  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
  }

  function getSessionStorage() {
    try {
      return global.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function parsePriceVersion(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function rememberGoldPriceVersion(version, verified) {
    __goldPriceVersion = parsePriceVersion(version);
    if (verified) __goldVersionVerifiedThisLoad = true;
  }

  function readGoldSessionWrapper() {
    const ss = getSessionStorage();
    if (!ss) return null;
    try {
      const raw = ss.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      const wrapped = JSON.parse(raw);
      const savedAt = Number(wrapped && wrapped.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > SESSION_CACHE_TTL_MS) {
        ss.removeItem(SESSION_CACHE_KEY);
        return null;
      }
      const payload = normalizePayload(wrapped && wrapped.payload);
      if (!payload) return null;
      return {
        savedAt: savedAt,
        priceVersion: parsePriceVersion(wrapped && wrapped.priceVersion),
        payload: payload,
      };
    } catch (_) {
      try {
        ss.removeItem(SESSION_CACHE_KEY);
      } catch (_) {}
      return null;
    }
  }

  function readGoldSessionCache() {
    const wrapped = readGoldSessionWrapper();
    return wrapped ? wrapped.payload : null;
  }

  function writeGoldSessionCache(payload) {
    const ss = getSessionStorage();
    if (!ss || !payload) return;
    try {
      ss.setItem(
        SESSION_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          priceVersion: __goldPriceVersion,
          payload: payload,
        })
      );
    } catch (_) {}
  }

  function clearGoldSessionCache() {
    const ss = getSessionStorage();
    if (!ss) return;
    try {
      ss.removeItem(SESSION_CACHE_KEY);
    } catch (_) {}
  }

  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  let __goldRealtimeSb = null;
  /** @type {ReturnType<import("@supabase/supabase-js").SupabaseClient["channel"]> | null} */
  let __goldRealtimeChannel = null;
  let __goldRealtimeLifecycleBound = false;

  /** @type {ReturnType<typeof setInterval> | null} */
  let __goldPollTimer = null;
  /** One-shot lean-mode bootstrap fetch; cleared on stop. */
  let __goldPollBootstrapTimer = null;
  let __goldPushStarted = false;
  /** Page wants live push; survives temporary pause while document.hidden. */
  let __goldPushDesired = false;
  let __goldPausedForHidden = false;
  /** @type {IntersectionObserver | null} */
  let __goldPushVisibilityObserver = null;
  let __goldTableCache = null;
  /** wall-clock ms when __goldTableCache / session entry was last written */
  let __goldTableCacheSavedAt = 0;
  /** gold_meta.price_version last written to cache (0 = unknown). */
  let __goldPriceVersion = 0;
  /** This document load already compared cache vs remote price_version (or did a full fetch). */
  let __goldVersionVerifiedThisLoad = false;
  let __goldTableFetchInFlight = null;
  let __goldChangeRefreshInFlight = null;
  let __goldRefreshDebounceTimer = null;
  /** Skip Realtime echo refetch on the same tab that just write-through cached. */
  let __goldLocalWriteSuppressUntil = 0;

  function setGoldTableCache(payload) {
    const fixed = normalizePayload(payload);
    if (!fixed) return null;
    __goldTableCache = fixed;
    __goldTableCacheSavedAt = Date.now();
    global.__TLKV_LAST_GOLD_ROWS = fixed.rows;
    writeGoldSessionCache(fixed);
    return fixed;
  }

  function peekGoldTableCache() {
    if (__goldTableCache) return __goldTableCache;
    const fromSession = readGoldSessionWrapper();
    if (fromSession) {
      __goldTableCache = fromSession.payload;
      __goldTableCacheSavedAt = fromSession.savedAt;
      __goldPriceVersion = fromSession.priceVersion;
      global.__TLKV_LAST_GOLD_ROWS = fromSession.payload.rows;
      return fromSession.payload;
    }
    return null;
  }

  function getGoldTableCacheAgeMs() {
    if (!__goldTableCache || !__goldTableCacheSavedAt) return null;
    const age = Date.now() - __goldTableCacheSavedAt;
    return Number.isFinite(age) && age >= 0 ? age : null;
  }

  function invalidateGoldTableCache() {
    __goldTableCache = null;
    __goldTableCacheSavedAt = 0;
    __goldPriceVersion = 0;
    __goldVersionVerifiedThisLoad = false;
    clearGoldSessionCache();
  }

  /** After admin write-through: ignore own Realtime echo briefly (other tabs unaffected). */
  function markGoldLocalWriteThrough() {
    __goldLocalWriteSuppressUntil = Date.now() + getGoldRefreshDebounceMs() + 1500;
  }

  function isGoldLocalWriteSuppressed() {
    return Date.now() < __goldLocalWriteSuppressUntil;
  }

  /** Dispatch `tlkv:gold-table-changed` for UI remounts / derived pricing. */
  function emitGoldTableChanged(detail) {
    if (detail === undefined) {
      global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
    } else {
      global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: detail }));
    }
  }

  /** Realtime/poll: invalidate → force fetch → ghi cache + price_version → update UI. */
  function refreshGoldTableAfterChange(reason) {
    if (__goldChangeRefreshInFlight) return __goldChangeRefreshInFlight;
    if (typeof console !== "undefined" && console.log) {
      console.log(
        GOLD_PUSH_LOG + " client: invalidate → fetch → cache/UI →",
        reason || "unknown"
      );
    }
    __goldChangeRefreshInFlight = getGoldTable({ forceRefresh: true })
      .then(function (data) {
        const rows = (data && data.rows) || [];
        dispatchGoldRowsUpdated(rows);
        emitGoldTableChanged(data || undefined);
        return data;
      })
      .catch(function (err) {
        invalidateGoldTableCache();
        emitGoldTableChanged(undefined);
        if (typeof console !== "undefined" && console.warn) {
          console.warn(GOLD_PUSH_LOG + " client: refresh after change failed", err);
        }
        return null;
      })
      .finally(function () {
        __goldChangeRefreshInFlight = null;
      });
    return __goldChangeRefreshInFlight;
  }

  /** Realtime burst: invalidate + debounce one fetch. Skip if this tab just write-through saved. */
  function scheduleRefreshGoldTableAfterChange(reason) {
    if (isGoldLocalWriteSuppressed()) {
      if (__goldRefreshDebounceTimer != null) {
        clearTimeout(__goldRefreshDebounceTimer);
        __goldRefreshDebounceTimer = null;
      }
      return;
    }
    invalidateGoldTableCache();
    if (__goldRefreshDebounceTimer != null) {
      clearTimeout(__goldRefreshDebounceTimer);
      __goldRefreshDebounceTimer = null;
    }
    __goldRefreshDebounceTimer = setTimeout(function () {
      __goldRefreshDebounceTimer = null;
      if (isGoldLocalWriteSuppressed()) return;
      refreshGoldTableAfterChange(reason || "debounced-change");
    }, getGoldRefreshDebounceMs());
  }

  function softRevalidateGoldCacheIfStale(reason) {
    const cached = peekGoldTableCache();
    if (!cached) return null;
    const age = getGoldTableCacheAgeMs();
    if (age == null || age < SESSION_CACHE_SOFT_MS) return null;
    return refreshGoldTableAfterChange(reason || "soft-revalidate");
  }

  function isDocumentHidden() {
    try {
      if (typeof document === "undefined" || !document) return false;
      if (typeof document.hidden === "boolean") return document.hidden === true;
      if (document.visibilityState) return document.visibilityState === "hidden";
    } catch (_) {}
    return false;
  }

  /** Debounce window for Realtime burst refresh (`window.__TLKV_GOLD_CHANGED_DEBOUNCE_MS`). */
  function getGoldRefreshDebounceMs() {
    const n = Number(global.__TLKV_GOLD_CHANGED_DEBOUNCE_MS);
    if (Number.isFinite(n) && n >= 200 && n <= 60000) return n;
    return 500;
  }

  /** Trang /tv-model — luôn Realtime, không poll (kể cả TV cache HTML/JS cũ có lean=true). */
  function isTvModelGoldPage() {
    try {
      return !!(
        typeof document !== "undefined" &&
        document.documentElement &&
        document.documentElement.classList.contains("tlkv-tv-model-page")
      );
    } catch (_) {
      return false;
    }
  }

  /** TV / trình duyệt yếu: không mở Realtime WebSocket trên tab (chỉ poll nhẹ). */
  function isLeanGoldPushClient() {
    if (isTvModelGoldPage()) return false;
    if (global.__TLKV_LEAN_GOLD_PUSH === true) return true;
    if (global.__TLKV_LEAN_GOLD_PUSH === false) return false;
    try {
      var ua = String(global.navigator && global.navigator.userAgent ? global.navigator.userAgent : "");
      if (
        /SmartTV|SMART-TV|HbbTV|Tizen|webOS|NetCast|NETTV|BRAVIA|CrKey|AFT|AppleTV|googletv|Linux; Android.*TV|TCL|MiTV|TV\s*Safari|PLAYSTATION|Xbox/i.test(
          ua
        )
      ) {
        return true;
      }
    } catch (_) {}
    try {
      var c = global.navigator && global.navigator.connection;
      if (c && c.saveData === true) return true;
    } catch (_) {}
    if (typeof global.matchMedia === "function") {
      try {
        if (global.matchMedia("(prefers-reduced-data: reduce)").matches) return true;
      } catch (_) {}
    }
    return false;
  }

  function disconnectGoldPushVisibilityObserver() {
    if (!__goldPushVisibilityObserver) return;
    try {
      __goldPushVisibilityObserver.disconnect();
    } catch (_) {}
    __goldPushVisibilityObserver = null;
  }

  /**
   * Tear down WS / poll / pending timers. When opts.permanent, clear desired flag (pagehide / explicit stop).
   * When pausing for a hidden tab, keep __goldPushDesired so we can resume.
   */
  function stopGoldTableRealtime(opts) {
    const permanent = !(opts && opts.permanent === false);
    if (__goldRefreshDebounceTimer != null) {
      clearTimeout(__goldRefreshDebounceTimer);
      __goldRefreshDebounceTimer = null;
    }
    if (__goldPollBootstrapTimer != null) {
      clearTimeout(__goldPollBootstrapTimer);
      __goldPollBootstrapTimer = null;
    }
    if (__goldPollTimer != null) {
      clearInterval(__goldPollTimer);
      __goldPollTimer = null;
    }
    if (__goldRealtimeSb && __goldRealtimeChannel) {
      try {
        __goldRealtimeSb.removeChannel(__goldRealtimeChannel);
      } catch (_) {}
    }
    __goldRealtimeSb = null;
    __goldRealtimeChannel = null;
    __goldPushStarted = false;
    if (permanent) {
      __goldPushDesired = false;
      __goldPausedForHidden = false;
      disconnectGoldPushVisibilityObserver();
    }
  }

  function pauseGoldPushForHiddenTab() {
    if (!__goldPushDesired) return;
    if (!__goldPushStarted && !__goldRealtimeChannel && !__goldPollTimer) {
      __goldPausedForHidden = true;
      return;
    }
    __goldPausedForHidden = true;
    stopGoldTableRealtime({ permanent: false });
    dispatchGoldPushUi({ mode: "realtime", state: "paused", reason: "tab-hidden" });
    if (typeof console !== "undefined" && console.log) {
      console.log(GOLD_PUSH_LOG + " client: pause Realtime/poll (tab hidden)");
    }
  }

  function resumeGoldPushAfterVisible() {
    if (!__goldPushDesired) return;
    if (!__goldPausedForHidden && (__goldPushStarted || __goldRealtimeChannel || __goldPollTimer)) {
      return;
    }
    __goldPausedForHidden = false;
    if (typeof console !== "undefined" && console.log) {
      console.log(GOLD_PUSH_LOG + " client: resume Realtime/poll (tab visible)");
    }
    getSupabaseClient().then(function (sb) {
      startGoldTablePush(sb);
      refreshGoldTableAfterChange("tab-visible");
    });
  }

  /** One visibility/pagehide binding: Realtime pause/resume OR price_version revalidate. */
  function ensureGoldLifecycle() {
    if (__goldRealtimeLifecycleBound || typeof global.addEventListener !== "function") return;
    __goldRealtimeLifecycleBound = true;
    global.addEventListener("pagehide", function () {
      stopGoldTableRealtime({ permanent: true });
    });
    global.addEventListener("pageshow", function (ev) {
      if (!(ev && ev.persisted)) return;
      __goldVersionVerifiedThisLoad = false;
      revalidateGoldCacheAgainstVersion("pageshow-bfcache", { silent: false });
    });
    var doc = typeof document !== "undefined" ? document : null;
    if (!doc || typeof doc.addEventListener !== "function") return;
    doc.addEventListener("visibilitychange", function () {
      if (isDocumentHidden()) {
        pauseGoldPushForHiddenTab();
        return;
      }
      if (__goldPushDesired) {
        resumeGoldPushAfterVisible();
        return;
      }
      revalidateGoldCacheAgainstVersion("tab-visible-no-push", { silent: false });
    });
  }

  let __goldBrowserRealtimeNotifyCount = 0;

  function dispatchGoldPushUi(detail) {
    try {
      global.dispatchEvent(new CustomEvent("tlkv:gold-push-ui", { detail: detail || {} }));
    } catch (_) {}
  }

  /** Sau khi __TLKV_LAST_GOLD_ROWS đã cập nhật — derived product pricing lắng nghe event này. */
  function dispatchGoldRowsUpdated(rows) {
    try {
      global.dispatchEvent(
        new CustomEvent("tlkv:gold-rows-updated", { detail: { rows: Array.isArray(rows) ? rows : [] } })
      );
    } catch (_) {}
  }

  /**
   * Một subscription Realtime cho bảng giá; pause khi tab ẩn, stop khi pagehide.
   */
  function startGoldTableRealtime(sb) {
    if (!sb || __goldRealtimeChannel) return;
    const notify = function (payload) {
      __goldBrowserRealtimeNotifyCount += 1;
      if (typeof console !== "undefined" && console.log) {
        console.log(
          GOLD_PUSH_LOG + " client: browser Realtime → refresh #" + __goldBrowserRealtimeNotifyCount,
          payload && payload.table
            ? { table: payload.table, eventType: payload.eventType }
            : {}
        );
      }
      scheduleRefreshGoldTableAfterChange(
        "realtime:" + (payload && payload.table ? String(payload.table) : "gold")
      );
    };
    __goldRealtimeSb = sb;
    __goldRealtimeChannel = sb
      .channel("tlkv_public_gold")
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_meta" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_price_rows" }, notify);
    __goldRealtimeChannel.subscribe(function (status, err) {
      if (status === "SUBSCRIBED") {
        dispatchGoldPushUi({ mode: "realtime", state: "live" });
        if (typeof console !== "undefined" && console.log) {
          console.log(GOLD_PUSH_LOG + " client: browser Realtime SUBSCRIBED (tlkv_public_gold)");
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(GOLD_PUSH_LOG + " client: browser Realtime", status, err || "");
        }
        dispatchGoldPushUi({ mode: "realtime", state: "reconnecting" });
        return;
      }
      if (typeof console !== "undefined" && console.log) {
        console.log(GOLD_PUSH_LOG + " client: browser Realtime status", status);
      }
    });
    console.log(GOLD_PUSH_LOG + " client: using Supabase Realtime trong trình duyệt");
    ensureGoldLifecycle();
  }

  /** Legacy stub — cross-tab updates via Supabase Realtime; kept for call-site compatibility. */
  function notifyGoldTableChanged(_reason) {
    return Promise.resolve(true);
  }

  /**
   * Bật pipeline push: Supabase Realtime postgres_changes (gold_meta + gold_price_rows).
   * TV / trình duyệt yếu: chỉ poll nhẹ (không mở WebSocket tab).
   * Tab ẩn: đánh dấu desired nhưng không mở WS/poll đến khi visible lại.
   */
  function startGoldTablePush(sb) {
    __goldPushDesired = true;
    ensureGoldLifecycle();

    if (isDocumentHidden()) {
      __goldPausedForHidden = true;
      dispatchGoldPushUi({ mode: "realtime", state: "paused", reason: "tab-hidden" });
      if (typeof console !== "undefined" && console.log) {
        console.log(GOLD_PUSH_LOG + " client: defer Realtime/poll until tab visible");
      }
      return;
    }

    if (__goldPushStarted) return;
    __goldPushStarted = true;
    __goldPausedForHidden = false;
    disconnectGoldPushVisibilityObserver();

    if (isLeanGoldPushClient()) {
      var pollMs = Number(global.__TLKV_GOLD_POLL_MS);
      if (!Number.isFinite(pollMs) || pollMs < 15000) pollMs = 90000;
      if (typeof console !== "undefined" && console.log) {
        console.log(
          GOLD_PUSH_LOG + " client: chế độ lean (TV / save-data) → poll mỗi " + pollMs + "ms, không Realtime tab",
          {
            leanFlag: global.__TLKV_LEAN_GOLD_PUSH,
            pollMsFlag: global.__TLKV_GOLD_POLL_MS,
            tvModelPage: isTvModelGoldPage(),
          }
        );
      }
      dispatchGoldPushUi({ mode: "poll", intervalMs: pollMs });
      __goldPollTimer = setInterval(function () {
        refreshGoldTableAfterChange("poll");
      }, pollMs);
      if (__goldPollBootstrapTimer != null) {
        clearTimeout(__goldPollBootstrapTimer);
        __goldPollBootstrapTimer = null;
      }
      __goldPollBootstrapTimer = setTimeout(function () {
        __goldPollBootstrapTimer = null;
        refreshGoldTableAfterChange("poll-bootstrap");
      }, 2500);
      return;
    }

    if (!sb) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(GOLD_PUSH_LOG + " client: thiếu Supabase client — không bật Realtime push");
      }
      dispatchGoldPushUi({ mode: "realtime", state: "reconnecting", reason: "no-supabase-client" });
      __goldPushStarted = false;
      return;
    }

    if (typeof console !== "undefined" && console.log) {
      console.log(GOLD_PUSH_LOG + " client: chế độ Realtime (không poll)", {
        leanFlag: global.__TLKV_LEAN_GOLD_PUSH,
        tvModelPage: isTvModelGoldPage(),
      });
    }
    dispatchGoldPushUi({ mode: "realtime", state: "connecting" });
    startGoldTableRealtime(sb);
  }

  /** Hiển thị: số trong DB → chuỗi kiểu 15.600.000. kind "sell": 0 → rỗng (vàng & bạc). */
  function formatPriceDisplay(value, metal, kind) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (kind === "sell" && n === 0) return "";
    if (metal === "silver" && n === 0) return "";
    const abs = Math.abs(Math.round(n));
    return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /**
   * Chuỗi / number / bigint giá (VN: 15.900.000 hoặc 169.000; DB: 15900000 hoặc 15900000.00) → số nguyên; lỗi → null.
   * Dùng thống nhất cho icon trend, previous_*, và parse trước khi upsert.
   */
  function parseGoldMoneyToInt(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") {
      const bn = Number(value);
      return Number.isFinite(bn) ? Math.round(bn) : null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.round(value) : null;
    }
    let t = String(value)
      .trim()
      .replace(/\u00a0|\u202f/g, "")
      .replace(/\s+/g, "");
    if (!t) return null;
    t = t.replace(/đồng|đ|vnd/gi, "").trim();
    if (!t) return null;
    if (/^-?\d+$/.test(t)) {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    }
    const dotCount = (t.match(/\./g) || []).length;
    const commaCount = (t.match(/,/g) || []).length;
    // Một dấu chấm + đúng 3 chữ số sau: nghìn VN ("169.000", "12.345") — tránh parseFloat("169.000") === 169
    if (dotCount === 1 && commaCount === 0 && /^-?\d+\.\d{3}$/.test(t)) {
      const parts = t.split(".");
      const n = parseInt(parts[0] + parts[1], 10);
      return Number.isFinite(n) ? n : null;
    }
    // Một dấu chấm/phẩy kiểu số thập phân (Postgres numeric → "15570000.00")
    if (dotCount === 1 && commaCount === 0 && /^-?\d+\.\d+$/.test(t)) {
      const n = parseFloat(t);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    if (commaCount === 1 && dotCount === 0 && /^-?\d+,\d+$/.test(t)) {
      const n = parseFloat(t.replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    // VN: dấu chấm phân tách nghìn (và có thể có phẩy thập phân cuối)
    const vn = t.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(vn);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  /** Lưu DB: chuỗi hiển thị → số; rỗng → null; không parse được → 0 */
  function parsePriceToNumber(s) {
    const t = String(s ?? "").trim();
    if (!t) return null;
    const parsed = parseGoldMoneyToInt(t);
    return parsed == null ? 0 : parsed;
  }

  const GOLD_THEAD_ROW_WIDE_INNER =
    "<th>THƯƠNG HIỆU</th><th>SẢN PHẨM</th><th>HÀM LƯỢNG</th><th>MUA VÀO</th><th>BÁN RA</th>";
  const GOLD_THEAD_ROW_STACKED_INNER =
    "<th>THƯƠNG HIỆU</th><th>SẢN PHẨM</th><th>MUA VÀO</th><th>BÁN RA</th>";

  let __goldLayoutMediaListenerBound = false;

  /** Chuỗi giá hiển thị → int; rỗng / không hợp lệ → null */
  function parseDisplayPriceNumber(s) {
    return parseGoldMoneyToInt(s);
  }

  function isGoldTableStackedLayout() {
    if (typeof global.matchMedia !== "function") return false;
    return global.matchMedia("(max-width: 639px)").matches;
  }

  /** previous_* từ DB (number / string / bigint) → int; null nếu chưa có / không hợp lệ. */
  function dbPriceToTrendNum(v) {
    if (v === null || v === undefined || v === "") return null;
    return parseGoldMoneyToInt(v);
  }

  /**
   * Chỉ /tv-model: `html.tlkv-tv-model-page` + `#tv-gold-table` → SVG; bảng thường → ▲ / ▼.
   * `tableHint`: bắt buộc khi `td` chưa gắn vào DOM (renderRowsIntoTbody gọi appendPriceCellContent trước appendChild hàng).
   */
  function shouldUseTvModelTrendSvg(td, tableHint) {
    if (typeof document === "undefined" || !document.documentElement) return false;
    if (!document.documentElement.classList.contains("tlkv-tv-model-page")) return false;
    const table =
      tableHint && tableHint.nodeType === 1 && String(tableHint.tagName || "").toUpperCase() === "TABLE"
        ? tableHint
        : td && typeof td.closest === "function"
          ? td.closest("#tv-gold-table")
          : null;
    return !!(table && table.id === "tv-gold-table");
  }

  const __GOLD_TREND_SVG_NS = "http://www.w3.org/2000/svg";

  function createGoldPriceTrendSvg(isUp) {
    const svg = document.createElementNS(__GOLD_TREND_SVG_NS, "svg");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("xmlns", __GOLD_TREND_SVG_NS);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const d = isUp
      ? "M10 2L10 18M10 2L16 9M10 2L4 9"
      : "M10 18L10 2M10 18L16 11M10 18L4 11";
    /* Viền trắng siêu mỏng phía sau (chỉ TV SVG) */
    const outline = document.createElementNS(__GOLD_TREND_SVG_NS, "path");
    outline.setAttribute("d", d);
    outline.setAttribute("stroke", "#ffffff");
    outline.setAttribute("stroke-width", "6.15");
    outline.setAttribute("stroke-linecap", "round");
    outline.setAttribute("stroke-linejoin", "round");
    outline.setAttribute("opacity", "0.92");
    const path = document.createElementNS(__GOLD_TREND_SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", isUp ? "#00E676" : "#FF1744");
    path.setAttribute("stroke-width", "5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(outline);
    svg.appendChild(path);
    return svg;
  }


  /** @param {HTMLTableElement | null} [tableHint] — ancestor table khi `td` chưa nối vào DOM */
  function appendPriceCellContent(td, displayText, field, rt, tableHint) {
    td.textContent = "";
    const text = displayText == null ? "" : String(displayText);
    td.appendChild(document.createTextNode(text));
    const cur =
      field === "buy"
        ? rt.buyNum != null
          ? rt.buyNum
          : parseGoldMoneyToInt(text)
        : rt.sellNum != null
          ? rt.sellNum
          : parseGoldMoneyToInt(text);
    const prevVal = field === "buy" ? rt.prevBuyNum : rt.prevSellNum;
    if (cur == null || prevVal == null) return;
    const diff = cur - prevVal;
    if (diff === 0) return;
    const span = document.createElement("span");
    span.className =
      diff > 0 ? "gold-price-trend gold-price-trend--up" : "gold-price-trend gold-price-trend--down";
    span.setAttribute(
      "aria-label",
      diff > 0 ? "Giá cao hơn mức trước khi cập nhật" : "Giá thấp hơn mức trước khi cập nhật"
    );
    if (shouldUseTvModelTrendSvg(td, tableHint)) {
      span.appendChild(createGoldPriceTrendSvg(diff > 0));
    } else {
      span.textContent = diff > 0 ? "▲" : "▼";
    }
    td.appendChild(span);
  }

  function syncGoldTableThead(table, stacked) {
    if (!table) return;
    const trh = table.querySelector("thead tr");
    if (!trh) return;
    trh.innerHTML = stacked ? GOLD_THEAD_ROW_STACKED_INNER : GOLD_THEAD_ROW_WIDE_INNER;
    table.classList.toggle("gold-table--stacked", stacked);
    if (table.classList.contains("tv-gold-table")) {
      table.classList.toggle("tv-gold-table--stacked", stacked);
    } else {
      table.classList.remove("tv-gold-table--stacked");
    }
  }

  function formatStackedProductLine(ordered, idx, r) {
    const own = String(r.product || "").trim();
    const parent = variantParentProduct(ordered, idx);
    const base = own || parent || "";
    const pur = String(r.purity || "").trim();
    if (pur) return base ? base + " (" + pur + ")" : pur;
    return base || "—";
  }

  
  function renderRowsStackedMobile(tbody, rows) {
    const ordered = orderRowsForTable(rows.slice());
    if (!ordered.length) return;
    const stackTable = tbody && tbody.closest ? tbody.closest("table") : null;
    let i = 0;
    while (i < ordered.length) {
      const brand = ordered[i].brand;
      let j = i;
      while (j < ordered.length && brandsMatch(ordered[j].brand, brand)) j++;
      const brandSpan = j - i;
      for (let idx = i; idx < j; idx++) {
        const rt = ordered[idx];
        const tr = document.createElement("tr");
        tr.setAttribute("data-tlkv-gold-row-id", String(rt.id));
        if (rt.metal === "silver") tr.classList.add("row-silver");
        if (rt.highlight === true) tr.classList.add("row-highlight");

        if (idx === i) {
          const tdB = document.createElement("td");
          tdB.className = "gold-brand-cell";
          if (rt.metal === "silver") tdB.classList.add("gold-brand-cell--silver");
          tdB.rowSpan = brandSpan;
          tdB.textContent = rt.brand;
          tr.appendChild(tdB);
        }

        const tdP = document.createElement("td");
        tdP.className = "col-product";
        tdP.textContent = formatStackedProductLine(ordered, idx, rt);
        tr.appendChild(tdP);

        const tdBuy = document.createElement("td");
        tdBuy.className = "price";
        appendPriceCellContent(tdBuy, rt.buy, "buy", rt, stackTable);
        tr.appendChild(tdBuy);

        const tdSell = document.createElement("td");
        tdSell.className = "price";
        appendPriceCellContent(tdSell, rt.sell, "sell", rt, stackTable);
        tr.appendChild(tdSell);

        tbody.appendChild(tr);
      }
      i = j;
    }
  }

  function initGoldTableLayoutListenerOnce() {
    if (__goldLayoutMediaListenerBound) return;
    if (typeof global.matchMedia !== "function" || typeof document === "undefined") return;
    __goldLayoutMediaListenerBound = true;
    const mq = global.matchMedia("(max-width: 639px)");
    const handler = function () {
      const rows = global.__TLKV_LAST_GOLD_ROWS;
      if (!rows || !Array.isArray(rows)) return;
      document.querySelectorAll("#gold-table-body, #tv-table-body").forEach(function (el) {
        renderRowsIntoTbody(el, rows);
      });
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
  }

  function metaRowToApp(row) {
    if (!row || typeof row !== "object") return {};
    return {
      headerTime: String(row.header_time ?? ""),
      footerNote: String(row.footer_note ?? ""),
      unitLine: String(row.unit_line ?? ""),
      brandItalic: String(row.brand_italic ?? ""),
    };
  }

  function priceRowDbToApp(r) {
    const row = normalizeRow({
      id: r.id,
      brand: r.brand,
      product: r.product ?? "",
      purity: r.purity ?? "",
      buy: formatPriceDisplay(r.buy, r.metal, "buy"),
      sell: formatPriceDisplay(r.sell, r.metal, "sell"),
      metal: r.metal,
      highlight: r.highlight === true,
    });
    row.buyNum = parseGoldMoneyToInt(r.buy);
    row.sellNum = parseGoldMoneyToInt(r.sell);
    row.prevBuyNum = dbPriceToTrendNum(r.previous_buy);
    row.prevSellNum = dbPriceToTrendNum(r.previous_sell);
    return row;
  }

  const GOLD_META_SELECT = "id, header_time, footer_note, unit_line, brand_italic, price_version";
  const GOLD_META_VERSION_SELECT = "id, price_version";
  const GOLD_ROWS_SELECT =
    "id, brand, product, purity, buy, sell, metal, highlight, previous_buy, previous_sell, sort_order";

  async function fetchGoldPriceVersion(sb) {
    const { data, error } = await sb
      .from("gold_meta")
      .select(GOLD_META_VERSION_SELECT)
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return parsePriceVersion(data && data.price_version);
  }

  async function fetchGoldFromSupabase(sb) {
    const { data: metaRow, error: e1 } = await sb
      .from("gold_meta")
      .select(GOLD_META_SELECT)
      .eq("id", 1)
      .maybeSingle();
    if (e1) throw e1;
    const { data: rowList, error: e2 } = await sb
      .from("gold_price_rows")
      .select(GOLD_ROWS_SELECT)
      .order("sort_order", { ascending: true });
    if (e2) throw e2;
    rememberGoldPriceVersion(metaRow && metaRow.price_version, true);
    const meta = normalizeMeta(metaRowToApp(metaRow));
    const rows = (rowList || []).map(priceRowDbToApp);
    return normalizePayload({ meta: meta, rows: rows });
  }

  /** Chỉ cập nhật gold_meta (một request) — dùng khi admin bấm "Lưu meta". */
  async function persistGoldMetaToSupabase(sb, meta) {
    const m = normalizeMeta(meta || {});
    const { error: eMeta } = await sb.from("gold_meta").upsert(
      {
        id: 1,
        header_time: m.headerTime,
        footer_note: m.footerNote,
        unit_line: m.unitLine,
        brand_italic: m.brandItalic,
      },
      { onConflict: "id" }
    );
    if (eMeta) throw eMeta;
  }

  /**
   * SRS: nhóm giá liên kết Bông Lúa 0.1 / Hạt Gạo 0.1 / Nhẫn Tròn 1 chỉ (×10).
   * Mua vào và Bán ra độc lập. Chỉ đụng 3 dòng này — không ảnh hưởng SP khác.
   * Giá cơ sở = giá dòng 0.1 chỉ; Nhẫn Tròn = cơ sở × 10 (integer VND, không float).
   */
  var LINKED_PRICE_GROUP_DEFS = [
    {
      key: "bongLua",
      ratio: 1,
      match: function (name) {
        return /^bông\s*lúa\s*vàng\s*0[.,]?1\s*chỉ$/i.test(String(name || "").trim());
      },
    },
    {
      key: "hatGao",
      ratio: 1,
      match: function (name) {
        return /^hạt\s*gạo\s*vàng\s*0[.,]?1\s*chỉ$/i.test(String(name || "").trim());
      },
    },
    {
      key: "nhanTron",
      ratio: 10,
      match: function (name) {
        return /^nhẫn\s*tròn\s*kim\s*việt$/i.test(String(name || "").trim());
      },
    },
  ];

  function findLinkedPriceGroup(rows) {
    var found = { bongLua: null, hatGao: null, nhanTron: null };
    (rows || []).forEach(function (row) {
      if (!row || row.metal === "silver") return;
      var name = String(row.product || "").trim();
      for (var i = 0; i < LINKED_PRICE_GROUP_DEFS.length; i++) {
        var def = LINKED_PRICE_GROUP_DEFS[i];
        if (def.match(name) && !found[def.key]) {
          found[def.key] = { row: row, ratio: def.ratio, key: def.key };
        }
      }
    });
    if (!found.bongLua || !found.hatGao || !found.nhanTron) return null;
    return found;
  }

  function linkedGroupOldPrice(member, field, opts) {
    opts = opts || {};
    var id = String(member.row.id);
    if (opts.beforeById && opts.beforeById[id]) {
      return parseGoldMoneyToInt(opts.beforeById[id][field]);
    }
    if (opts.existingById && opts.existingById.get) {
      var ex = opts.existingById.get(id);
      if (ex) return parseGoldMoneyToInt(ex[field]);
    }
    return null;
  }

  /**
   * Mutates `rows` in place. Returns { changedIds, buyBase, sellBase }.
   * @param {Array} rows
   * @param {{ existingById?: Map, beforeById?: Record<string, {buy?:string, sell?:string}> }} [opts]
   */
  function applyLinkedPriceGroupSync(rows, opts) {
    opts = opts || {};
    var group = findLinkedPriceGroup(rows);
    var empty = { changedIds: [], buyBase: null, sellBase: null };
    if (!group) return empty;

    var members = [group.bongLua, group.hatGao, group.nhanTron];

    function resolveBase(field) {
      var changes = [];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var newVal = parsePriceToNumber(m.row[field]);
        if (newVal == null || !Number.isFinite(newVal)) continue;
        newVal = Math.trunc(newVal);
        var oldVal = linkedGroupOldPrice(m, field, opts);
        if (oldVal == null || newVal === oldVal) continue;
        changes.push({ member: m, newVal: newVal });
      }
      if (changes.length === 0) return null;
      // Ưu tiên nguồn Nhẫn Tròn (÷10) nếu cùng lúc sửa nhiều dòng; ngược lại lấy dòng 0.1 chỉ.
      var fromRing = null;
      var fromBase = null;
      for (var c = 0; c < changes.length; c++) {
        if (changes[c].member.key === "nhanTron") fromRing = changes[c];
        else if (!fromBase) fromBase = changes[c];
      }
      if (fromRing) return Math.trunc(fromRing.newVal / 10);
      return Math.trunc(fromBase.newVal / fromBase.member.ratio);
    }

    function applyBase(field, base) {
      if (base == null || !Number.isFinite(base) || base < 0) return [];
      base = Math.trunc(base);
      var ids = [];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var next = Math.trunc(base * m.ratio);
        var cur = parsePriceToNumber(m.row[field]);
        // Giữ format hiển thị VN (1.404.000) giống loadFromStorage — tránh mất dấu chấm trên admin.
        var formatted = formatPriceDisplay(next, m.row.metal, field);
        if (cur !== next) {
          m.row[field] = formatted;
          ids.push(String(m.row.id));
        } else {
          m.row[field] = formatted;
        }
      }
      return ids;
    }

    var buyBase = resolveBase("buy");
    var sellBase = resolveBase("sell");
    var changed = Object.create(null);
    if (buyBase != null) {
      applyBase("buy", buyBase).forEach(function (id) {
        changed[id] = true;
      });
    }
    if (sellBase != null) {
      applyBase("sell", sellBase).forEach(function (id) {
        changed[id] = true;
      });
    }

    return {
      changedIds: Object.keys(changed),
      buyBase: buyBase,
      sellBase: sellBase,
    };
  }

  /** Chỉ đồng bộ gold_price_rows (không đụng gold_meta). */
  async function persistGoldRowsToSupabase(sb, rowsNormalized) {
    const rows = rowsNormalized || [];
    const { data: existingList, error: eEx } = await sb
      .from("gold_price_rows")
      .select(GOLD_ROWS_SELECT);
    if (eEx) throw eEx;
    const existingById = new Map();
    (existingList || []).forEach(function (row) {
      existingById.set(String(row.id), row);
    });

    // SRS: đồng bộ Bông Lúa / Hạt Gạo / Nhẫn Tròn trước khi upsert (atomic batch).
    applyLinkedPriceGroupSync(rows, { existingById: existingById });

    const keep = new Set(
      rows.map(function (r) {
        return String(r.id);
      })
    );
    for (let i = 0; i < (existingList || []).length; i++) {
      const ex = existingList[i];
      if (!keep.has(String(ex.id))) {
        const { error: eDel } = await sb.from("gold_price_rows").delete().eq("id", ex.id);
        if (eDel) throw eDel;
      }
    }

    const upserts = rows.map(function (r, idx) {
      const newBuy = parsePriceToNumber(r.buy) ?? 0;
      const newSell = parsePriceToNumber(r.sell) ?? 0;
      const ex = existingById.get(String(r.id));
      let previous_buy = null;
      let previous_sell = null;
      let previous_updated_at = null;
      if (ex) {
        previous_buy = ex.previous_buy != null ? ex.previous_buy : null;
        previous_sell = ex.previous_sell != null ? ex.previous_sell : null;
        previous_updated_at = ex.previous_updated_at != null ? ex.previous_updated_at : null;
        const oldBuy = parseGoldMoneyToInt(ex.buy) ?? 0;
        const oldSell = parseGoldMoneyToInt(ex.sell) ?? 0;
        if (oldBuy !== newBuy || oldSell !== newSell) {
          if (oldBuy !== newBuy) previous_buy = oldBuy;
          if (oldSell !== newSell) previous_sell = oldSell;
          previous_updated_at = new Date().toISOString();
        }
      }
      return {
        id: r.id,
        sort_order: idx + 1,
        brand: r.brand,
        product: r.product || "",
        purity: r.purity || "",
        buy: newBuy,
        sell: newSell,
        metal: r.metal,
        highlight: r.highlight === true,
        previous_buy: previous_buy,
        previous_sell: previous_sell,
        previous_updated_at: previous_updated_at,
      };
    });
    if (upserts.length === 0) return;
    const { error: eUp } = await sb.from("gold_price_rows").upsert(upserts, { onConflict: "id" });
    if (eUp) throw eUp;
  }

  async function persistGoldToSupabase(sb, payload) {
    const fixed = normalizePayload({ meta: payload.meta || {}, rows: payload.rows || [] });
    if (!fixed) return;
    await persistGoldMetaToSupabase(sb, fixed.meta);
    await persistGoldRowsToSupabase(sb, fixed.rows);
  }

  function brandsMatch(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  /**
   * Chèn dòng vàng: nếu thương hiệu đã có (so khớp không phân biệt hoa thường) → chèn ngay sau khối liên tiếp đầu tiên cùng thương hiệu;
   * nếu thương hiệu mới → chèn ngay trước dòng bạc đầu tiên (hoặc cuối nếu không có bạc).
   */
  /** Dòng product rỗng: tên hiển thị lấy từ dòng cùng thương hiệu phía trên gần nhất có product. */
  function variantParentProduct(rows, index) {
    const r = rows[index];
    if (!r || String(r.product || "").trim()) return "";
    let i = index - 1;
    if (r.metal === "silver") {
      while (i >= 0 && rows[i].metal === "silver" && brandsMatch(rows[i].brand, r.brand)) {
        const p = String(rows[i].product || "").trim();
        if (p) return p;
        i--;
      }
      return "";
    }
    while (i >= 0 && rows[i].metal !== "silver" && brandsMatch(rows[i].brand, r.brand)) {
      const p = String(rows[i].product || "").trim();
      if (p) return p;
      i--;
    }
    return "";
  }

  /**
   * Vị trí chèn trong khối cùng thương hiệu [blockFirst..blockEnd]: sau nhóm SP trùng tên (cuối cùng),
   * hoặc sau hàng cuối khối nếu tên SP mới.
   */
  function findInsertIndexInBrandBlock(rows, blockFirst, blockEnd, productName) {
    const target = String(productName || "").trim().toLowerCase();
    if (!target) return blockEnd + 1;
    let lastMatchAfter = -1;
    let k = blockFirst;
    while (k <= blockEnd) {
      const label = String(rows[k].product || "").trim();
      let m = k + 1;
      if (label) {
        while (m <= blockEnd && !String(rows[m].product || "").trim()) m++;
        if (label.toLowerCase() === target) {
          lastMatchAfter = m;
        }
        k = m;
      } else {
        k = k + 1;
      }
    }
    return lastMatchAfter >= 0 ? lastMatchAfter : blockEnd + 1;
  }

  /** Thêm dòng vàng: đã có cùng tên SP trong khối TH phía trên điểm chèn → lưu product "". */
  function coalesceProductForNewGoldRow(rows, insertIndex, row) {
    if (row.metal === "silver" || !String(row.product || "").trim()) return row;
    const target = String(row.product).trim().toLowerCase();
    const b = row.brand;
    for (let i = 0; i < insertIndex; i++) {
      const cur = rows[i];
      if (cur.metal === "silver" || !brandsMatch(cur.brand, b)) continue;
      const p = String(cur.product || "").trim();
      if (p && p.toLowerCase() === target) {
        return Object.assign({}, row, { product: "" });
      }
    }
    return row;
  }

  /** Thêm dòng bạc: cùng quy tắc gộp tên SP như vàng. */
  function coalesceProductForNewSilverRow(rows, insertIndex, row) {
    if (row.metal !== "silver" || !String(row.product || "").trim()) return row;
    const target = String(row.product).trim().toLowerCase();
    const b = row.brand;
    for (let i = 0; i < insertIndex; i++) {
      const cur = rows[i];
      if (cur.metal !== "silver" || !brandsMatch(cur.brand, b)) continue;
      const p = String(cur.product || "").trim();
      if (p && p.toLowerCase() === target) {
        return Object.assign({}, row, { product: "" });
      }
    }
    return row;
  }

  function insertGoldRow(rows, row) {
    const out = rows.slice();
    const b = row.brand;
    let blockFirst = -1;
    let blockEnd = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i].metal === "silver") break;
      if (brandsMatch(out[i].brand, b)) {
        if (blockFirst < 0) blockFirst = i;
        blockEnd = i;
      } else if (blockFirst >= 0) {
        break;
      }
    }
    if (blockFirst >= 0) {
      const pname = String(row.product || "").trim();
      const insertIdx = findInsertIndexInBrandBlock(out, blockFirst, blockEnd, pname);
      row = coalesceProductForNewGoldRow(out, insertIdx, row);
      out.splice(insertIdx, 0, row);
      return out;
    }
    const firstSilver = out.findIndex(function (r) {
      return r.metal === "silver";
    });
    if (firstSilver === -1) {
      row = coalesceProductForNewGoldRow(out, out.length, row);
      out.push(row);
    } else {
      row = coalesceProductForNewGoldRow(out, firstSilver, row);
      out.splice(firstSilver, 0, row);
    }
    return out;
  }

  /**
   * Chèn dòng bạc: cùng thương hiệu → sau khối TH đó (hoặc sau nhóm SP trùng tên); thương hiệu mới → cuối bạc.
   */
  function insertSilverRow(rows, row) {
    const out = rows.slice();
    const b = row.brand;
    const firstSilver = out.findIndex(function (r) {
      return r.metal === "silver";
    });
    if (firstSilver === -1) {
      row = coalesceProductForNewSilverRow(out, out.length, row);
      out.push(row);
      return out;
    }
    let blockFirst = -1;
    let blockEnd = -1;
    for (let i = firstSilver; i < out.length; i++) {
      if (out[i].metal !== "silver") break;
      if (brandsMatch(out[i].brand, b)) {
        if (blockFirst < 0) blockFirst = i;
        blockEnd = i;
      } else if (blockFirst >= 0) {
        break;
      }
    }
    if (blockFirst < 0) {
      let lastSi = out.length - 1;
      while (lastSi >= 0 && out[lastSi].metal !== "silver") lastSi--;
      const insertIdx = lastSi + 1;
      row = coalesceProductForNewSilverRow(out, insertIdx, row);
      out.splice(insertIdx, 0, row);
      return out;
    }
    const pname = String(row.product || "").trim();
    const insertIdx = findInsertIndexInBrandBlock(out, blockFirst, blockEnd, pname);
    row = coalesceProductForNewSilverRow(out, insertIdx, row);
    out.splice(insertIdx, 0, row);
    return out;
  }

  /** Chuẩn hoá hàm lượng để gộp ô theo chuỗi hiển thị (trim). */
  function purityKeyForMerge(p) {
    return String(p ?? "").trim();
  }

  /**
   * Trong khối cùng thương hiệu [i, j), tính rowspan HÀM LƯỢNG cho từng chỉ số dòng:
   * các dòng liên tiếp cùng `purityKeyForMerge` → một ô gộp dọc.
   */
  function buildPurityMergeMeta(rows, i, j) {
    const meta = {};
    let ps = i;
    while (ps < j) {
      const key = purityKeyForMerge(rows[ps].purity);
      let pe = ps + 1;
      while (pe < j && purityKeyForMerge(rows[pe].purity) === key) pe++;
      const span = pe - ps;
      for (let r = ps; r < pe; r++) {
        meta[r] = { showPurity: r === ps, purityRowspan: span };
      }
      ps = pe;
    }
    return meta;
  }

  /**
   * Duyệt từng dòng dữ liệu với cùng quy tắc gộp ô TH / Sản phẩm / Hàm lượng như bảng public.
   * fn({ row, showBrand, brandRowspan, showProduct, productRowspan, productLabel, showPurity, purityRowspan })
   */
  function walkMergedGoldRows(rows, fn) {
    if (!rows || !rows.length) return;
    let i = 0;
    while (i < rows.length) {
      const brand = rows[i].brand;
      let j = i;
      while (j < rows.length && brandsMatch(rows[j].brand, brand)) j++;
      const brandSpan = j - i;
      const purityMerge = buildPurityMergeMeta(rows, i, j);
      let k = i;
      while (k < j) {
        const label = String(rows[k].product || "").trim();
        let m = k + 1;
        if (label) {
          while (m < j && !String(rows[m].product || "").trim()) m++;
        } else {
          m = k + 1;
        }
        const productSpan = m - k;
        for (let t = k; t < m; t++) {
          const pm = purityMerge[t] || { showPurity: true, purityRowspan: 1 };
          fn({
            row: rows[t],
            showBrand: t === i,
            brandRowspan: brandSpan,
            showProduct: t === k,
            productRowspan: productSpan,
            productLabel: label,
            showPurity: pm.showPurity,
            purityRowspan: pm.purityRowspan,
          });
        }
        k = m;
      }
      i = j;
    }
  }

  /** Bạc luôn xuống cuối bảng; thứ tự vàng giữ nguyên tương đối. */
  function orderRowsForTable(rows) {
    const gold = [];
    const silver = [];
    rows.forEach(function (r) {
      if (r.metal === "silver") silver.push(r);
      else gold.push(r);
    });
    return gold.concat(silver);
  }

  const META_DEFAULTS = {
    headerTime: "10h00",
    footerNote: "Cập nhật lúc 10:00 09/04/2026",
    unitLine: "ĐVT = Nghìn đồng/chỉ",
    brandItalic: "THĂNG LONG KIM VIỆT",
  };

  function escapeMetaHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeMeta(m) {
    const x = m && typeof m === "object" ? m : {};
    return {
      headerTime: String(x.headerTime ?? META_DEFAULTS.headerTime),
      footerNote: String(x.footerNote ?? META_DEFAULTS.footerNote),
      unitLine: String(x.unitLine ?? META_DEFAULTS.unitLine),
      brandItalic: String(x.brandItalic ?? META_DEFAULTS.brandItalic),
    };
  }

  /**
   * Giữ đơn vị + thương hiệu; đặt **cùng một mốc giờ VN** cho header_time (vd. 10h30) và footer_note
   * (vd. "Cập nhật lúc 10:30 09/04/2026"). `applyMetaToDom` hiển thị footer_note trên dòng meta bảng giá.
   * Gọi khi admin lưu giá / thêm / sửa / xóa dòng (stampMetaOnPayload).
   */
  function stampMetaWithVietnamNow(meta) {
    const m = normalizeMeta(meta || {});
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(now);
    const pick = function (t) {
      const x = parts.find(function (p) {
        return p.type === t;
      });
      return x ? x.value : "";
    };
    const pad2 = function (v) {
      const n = parseInt(String(v), 10);
      if (!Number.isFinite(n)) return String(v || "").padStart(2, "0");
      return n < 10 ? "0" + n : String(n);
    };
    const hour = pad2(pick("hour"));
    const minute = pad2(pick("minute"));
    const day = pad2(pick("day"));
    const month = pad2(pick("month"));
    const year = pick("year");
    const headerTime = hour + "h" + minute;
    const footerNote = "Cập nhật lúc " + hour + ":" + minute + " " + day + "/" + month + "/" + year;
    return normalizeMeta({
      headerTime: headerTime,
      footerNote: footerNote,
      unitLine: m.unitLine,
      brandItalic: m.brandItalic,
    });
  }

  /** Chỉ cho phép ghi Supabase (persist / xóa dòng) khi đang ở trang admin. */
  function isGoldAdminWritePath() {
    try {
      const p = global.location && global.location.pathname ? String(global.location.pathname) : "";
      return /\/admin(\/|$)/.test(p);
    } catch (_) {
      return false;
    }
  }

  function assertGoldAdminWrite() {
    if (!isGoldAdminWritePath()) {
      throw new Error("Chỉ trang /admin mới được lưu hoặc xóa dòng giá trên Supabase.");
    }
  }

  function normalizeRow(r) {
    const brand = String(r.brand ?? "").trim();
    let metal = r.metal === "silver" ? "silver" : "gold";
    if (brandsMatch(brand, "Bạc")) {
      metal = "silver";
    }
    let purity = String(r.purity ?? "");
    if (metal === "silver") {
      purity = purity.replace(/,/g, ".");
    }
    const out = {
      id: String(
        r.id || (global.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2))
      ),
      brand: brand,
      product: String(r.product ?? ""),
      purity: purity,
      buy: String(r.buy ?? "").trim(),
      sell: String(r.sell ?? "").trim(),
      metal: metal,
      highlight: r.highlight === true,
    };
    const bn = Number(r.buyNum);
    if (Number.isFinite(bn)) out.buyNum = Math.round(bn);
    const sn = Number(r.sellNum);
    if (Number.isFinite(sn)) out.sellNum = Math.round(sn);
    if (Object.prototype.hasOwnProperty.call(r, "prevBuyNum")) {
      out.prevBuyNum = dbPriceToTrendNum(r.prevBuyNum);
    } else {
      out.prevBuyNum = dbPriceToTrendNum(r.previous_buy);
    }
    if (Object.prototype.hasOwnProperty.call(r, "prevSellNum")) {
      out.prevSellNum = dbPriceToTrendNum(r.prevSellNum);
    } else {
      out.prevSellNum = dbPriceToTrendNum(r.previous_sell);
    }
    return out;
  }

  function normalizePayload(raw) {
    if (!raw || !Array.isArray(raw.rows)) return null;
    return {
      meta: normalizeMeta(raw.meta),
      rows: orderRowsForTable(raw.rows.map((r) => normalizeRow(r))),
    };
  }

  /**
   * Giới hạn số dòng logic trước khi render (TV / kiosk RAM thấp).
   * @param {unknown[]} rows
   * @param {number} maxRows
   */
  function clampGoldRowsForDisplay(rows, maxRows) {
    if (!rows || !Array.isArray(rows)) return rows;
    const cap = Number(maxRows);
    if (!Number.isFinite(cap) || cap < 1) return rows;
    if (rows.length <= cap) return rows;
    return rows.slice(0, cap);
  }

  /* ---------- Mock localStorage (JSON) — tạm comment, không xóa ----------
  function loadFromStorage() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return null;
      return normalizePayload(JSON.parse(s));
    } catch {
      return null;
    }
  }

  function saveToStorageLocal(payload) {
    const fixed = normalizePayload({ meta: payload.meta || {}, rows: payload.rows || [] });
    if (!fixed) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: fixed }));
  }

  function clearStorageLocal() {
    localStorage.removeItem(STORAGE_KEY);
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
  }
  ---------- end mock localStorage ---------- */

  /** Ghi bảng giá lên Supabase (admin): meta + toàn bộ dòng. Trả về Promise. */
  function saveToStorage(payload) {
    assertGoldAdminWrite();
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(
          new Error(
            "Supabase chưa cấu hình: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
          )
        );
      }
      return persistGoldToSupabase(sb, payload).then(function () {
        return fetchGoldPriceVersion(sb)
          .catch(function () {
            return __goldPriceVersion + 1;
          })
          .then(function (ver) {
            rememberGoldPriceVersion(ver, true);
            setGoldTableCache(payload);
            markGoldLocalWriteThrough();
            dispatchGoldRowsUpdated((payload && payload.rows) || []);
            console.log(GOLD_PUSH_LOG + " client: saveToStorage() persisted → dispatch local (cross-tab qua Realtime)");
            global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: payload }));
            notifyGoldTableChanged("admin-save");
          });
      });
    });
  }

  /**
   * Chỉ lưu khối "Thời gian & đơn vị" (gold_meta) — không gọi upsert gold_price_rows.
   */
  function saveGoldMetaOnly(meta) {
    assertGoldAdminWrite();
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(
          new Error(
            "Supabase chưa cấu hình: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
          )
        );
      }
      return persistGoldMetaToSupabase(sb, meta).then(function () {
        const cached = peekGoldTableCache();
        if (cached) {
          setGoldTableCache({
            meta: Object.assign({}, cached.meta || {}, meta || {}),
            rows: cached.rows || [],
          });
          markGoldLocalWriteThrough();
        } else {
          invalidateGoldTableCache();
        }
        console.log(GOLD_PUSH_LOG + " client: saveGoldMetaOnly() persisted → dispatch local (cross-tab qua Realtime)");
        global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: { metaOnly: true } }));
        notifyGoldTableChanged("admin-save-meta");
      });
    });
  }

  /** Xóa key localStorage cũ (nếu có) và báo làm mới UI — không xóa dữ liệu Supabase. */
  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    invalidateGoldTableCache();
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
  }

  /** Stub: mock localStorage đã tắt; luôn null. */
  function loadFromStorage() {
    return null;
  }

  function basePath() {
    return typeof global.TLKV_BASE === "string" ? global.TLKV_BASE : "";
  }

  function assetUrl(relPath) {
    const trimmed = String(relPath || "").replace(/^\//, "");
    const b = basePath();
    if (b === "" || b === "/") return "/" + trimmed;
    return String(b).replace(/\/?$/, "/") + trimmed;
  }

  /* ---------- Mock JSON file — tạm comment ----------
  async function fetchDefaultJson() {
    const url = assetUrl("data/gold-table.json");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load " + url);
    const raw = await res.json();
    return normalizePayload(raw);
  }

  async function getGoldTableFromJsonAndStorage() {
    const stored = loadFromStorage();
    if (stored && Array.isArray(stored.rows) && stored.rows.length > 0) {
      return stored;
    }
    try {
      const def = await fetchDefaultJson();
      if (stored && Array.isArray(stored.rows) && stored.rows.length === 0) {
        return def;
      }
      return stored || def;
    } catch (e) {
      if (stored) return stored;
      throw e;
    }
  }
  ---------- end mock JSON ---------- */

  async function fetchDefaultJson() {
    throw new Error("fetchDefaultJson đã tắt — dùng Supabase (gold_meta + gold_price_rows).");
  }

  async function fetchAndCacheGoldTable() {
    const sb = await getSupabaseClient();
    if (!sb) {
      throw new Error(
        "Thiếu cấu hình Supabase: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
      );
    }
    const data = await fetchGoldFromSupabase(sb);
    return setGoldTableCache(data) || data;
  }

  /**
   * Compare session cache vs gold_meta.price_version.
   * Match → keep cache. Mismatch / unknown → invalidate + full fetch.
   */
  async function revalidateGoldCacheAgainstVersion(reason, opts) {
    const silent = !!(opts && opts.silent);
    const cached = peekGoldTableCache();
    const cachedVersion = __goldPriceVersion;
    if (typeof console !== "undefined" && console.log) {
      console.log(GOLD_PUSH_LOG + " client: check price_version →", reason || "unknown", {
        cachedVersion: cachedVersion,
      });
    }
    const sb = await getSupabaseClient();
    if (!sb) {
      __goldVersionVerifiedThisLoad = true;
      return cached;
    }
    let remoteVersion = 0;
    try {
      remoteVersion = await fetchGoldPriceVersion(sb);
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(GOLD_PUSH_LOG + " client: price_version check failed → force fetch", err);
      }
      invalidateGoldTableCache();
      const data = await fetchAndCacheGoldTable();
      if (!silent) {
        dispatchGoldRowsUpdated((data && data.rows) || []);
        emitGoldTableChanged(data || undefined);
      }
      return data;
    }
    const cachedNow = peekGoldTableCache();
    const cachedVersionNow = __goldPriceVersion;
    if (cachedNow && cachedVersionNow > 0 && remoteVersion === cachedVersionNow) {
      rememberGoldPriceVersion(remoteVersion, true);
      if (typeof console !== "undefined" && console.log) {
        console.log(GOLD_PUSH_LOG + " client: price_version match", remoteVersion);
      }
      return cachedNow;
    }
    if (typeof console !== "undefined" && console.log) {
      console.log(GOLD_PUSH_LOG + " client: price_version mismatch → invalidate + fetch", {
        cachedVersion: cachedVersionNow,
        remoteVersion: remoteVersion,
      });
    }
    invalidateGoldTableCache();
    const data = await fetchAndCacheGoldTable();
    if (!silent) {
      dispatchGoldRowsUpdated((data && data.rows) || []);
      emitGoldTableChanged(data || undefined);
    }
    return data;
  }

  async function getGoldTable(options) {
    ensureGoldLifecycle();
    const opts = options && typeof options === "object" ? options : {};
    const forceRefresh = opts.forceRefresh === true;

    if (!forceRefresh) {
      const cached = peekGoldTableCache();
      if (cached && __goldVersionVerifiedThisLoad) return cached;
      if (__goldTableFetchInFlight) return __goldTableFetchInFlight;
      if (cached) {
        __goldTableFetchInFlight = revalidateGoldCacheAgainstVersion("session-hydrate", {
          silent: true,
        });
        try {
          return await __goldTableFetchInFlight;
        } finally {
          __goldTableFetchInFlight = null;
        }
      }
    } else {
      invalidateGoldTableCache();
    }

    if (__goldTableFetchInFlight) return __goldTableFetchInFlight;
    __goldTableFetchInFlight = fetchAndCacheGoldTable();
    try {
      return await __goldTableFetchInFlight;
    } finally {
      __goldTableFetchInFlight = null;
    }
  }

function applyMetaToDom(meta) {
  if (!meta) return;

  const m = normalizeMeta(meta);
  const ul = m.unitLine || META_DEFAULTS.unitLine;
  const fn = m.footerNote || META_DEFAULTS.footerNote;

  const unitEl = document.querySelector("[data-gold-meta-line]");
  if (unitEl) {
    unitEl.innerHTML =
      escapeMetaHtml(fn) +
      " · " +
      escapeMetaHtml(ul);
  }

  const noteEl = document.querySelector("[data-gold-footer-note]");
  if (noteEl) {
    noteEl.textContent = "(" + fn + ") (" + ul + ")";
  }
}

  /** Bo góc dưới bảng: cột 1 thường là ô rowspan (Bạc), không nằm trên <tr> cuối. */
  function markGoldTableBottomCorners(tbody) {
    const trs = tbody.querySelectorAll("tr");
    if (!trs.length) return;
    const lastIdx = trs.length - 1;
    const lastCells = trs[lastIdx].cells;
    if (lastCells.length) {
      lastCells[lastCells.length - 1].classList.add("gold-table-corner-br");
    }
    let blSet = false;
    for (let ri = 0; ri <= lastIdx; ri++) {
      const row = trs[ri];
      for (let c = 0; c < row.cells.length; c++) {
        const td = row.cells[c];
        if (!td.classList.contains("gold-brand-cell")) continue;
        const rs = parseInt(td.getAttribute("rowspan") || "1", 10);
        if (ri + rs - 1 === lastIdx) {
          td.classList.add("gold-table-corner-bl");
          blSet = true;
          break;
        }
      }
      if (blSet) break;
    }
    if (!blSet && lastCells.length) {
      lastCells[0].classList.add("gold-table-corner-bl");
    }
  }

  function tryPatchGoldTbodyPricesOnly(tbody, rows) {
    if (!tbody || !rows || !Array.isArray(rows) || rows.length === 0) return false;
    if (isGoldTableStackedLayout()) return false;
    const ordered = orderRowsForTable(rows.slice());
    const expectedIds = [];
    walkMergedGoldRows(ordered, function (ctx) {
      expectedIds.push(String(ctx.row.id));
    });
    const trs = tbody.querySelectorAll("tr");
    if (trs.length !== expectedIds.length) return false;
    for (let i = 0; i < expectedIds.length; i++) {
      if (trs[i].getAttribute("data-tlkv-gold-row-id") !== expectedIds[i]) return false;
    }
    const patchTable = tbody.closest("table");
    let idx = 0;
    walkMergedGoldRows(ordered, function (ctx) {
      const rt = ctx.row;
      const tr = trs[idx++];
      const prices = tr.querySelectorAll("td.price");
      if (prices.length < 2) return;
      appendPriceCellContent(prices[0], rt.buy, "buy", rt, patchTable);
      appendPriceCellContent(prices[1], rt.sell, "sell", rt, patchTable);
    });
    global.__TLKV_LAST_GOLD_ROWS = ordered;
    markGoldTableBottomCorners(tbody);
    dispatchGoldRowsUpdated(ordered);
    return true;
  }

  function renderRowsIntoTbody(tbody, rows) {
    if (!tbody || !rows) return;
    global.__TLKV_LAST_GOLD_ROWS = rows;
    const table = tbody.closest("table");
    const stacked = isGoldTableStackedLayout();
    syncGoldTableThead(table, stacked);
    tbody.innerHTML = "";
    if (stacked) {
      renderRowsStackedMobile(tbody, rows);
    } else {
      walkMergedGoldRows(rows, function (ctx) {
        const rt = ctx.row;
        const tr = document.createElement("tr");
        tr.setAttribute("data-tlkv-gold-row-id", String(rt.id));
        if (rt.metal === "silver") tr.classList.add("row-silver");
        if (rt.highlight === true) tr.classList.add("row-highlight");
        if (ctx.showBrand) {
          const tdB = document.createElement("td");
          tdB.className = "gold-brand-cell";
          if (rt.metal === "silver") tdB.classList.add("gold-brand-cell--silver");
          tdB.rowSpan = ctx.brandRowspan;
          tdB.textContent = rt.brand;
          tr.appendChild(tdB);
        }
        if (ctx.showProduct) {
          const tdP = document.createElement("td");
          tdP.className = "col-product";
          tdP.rowSpan = ctx.productRowspan;
          tdP.textContent = ctx.productLabel;
          tr.appendChild(tdP);
        }
        if (ctx.showPurity) {
          const tdPur = document.createElement("td");
          tdPur.className = "col-purity";
          const prs = parseInt(String(ctx.purityRowspan != null ? ctx.purityRowspan : "1"), 10);
          if (!isNaN(prs) && prs > 1) tdPur.rowSpan = prs;
          tdPur.textContent = rt.purity;
          tr.appendChild(tdPur);
        }
        const tdBuy = document.createElement("td");
        tdBuy.className = "price";
        appendPriceCellContent(tdBuy, rt.buy, "buy", rt, table);
        tr.appendChild(tdBuy);
        const tdSell = document.createElement("td");
        tdSell.className = "price";
        appendPriceCellContent(tdSell, rt.sell, "sell", rt, table);
        tr.appendChild(tdSell);
        tbody.appendChild(tr);
      });
    }
    markGoldTableBottomCorners(tbody);
    initGoldTableLayoutListenerOnce();
  }

  let __goldMountLoadCount = 0;
  let __goldMountInFlight = null;
  let __goldMountPending = false;
  let __goldMountLastSelector = null;

  async function mountGoldTable(tbodySelector) {
    __goldMountLastSelector = tbodySelector;
    if (__goldMountInFlight) {
      // Tránh bơm nhiều request/render chồng nhau khi Realtime bắn dày.
      __goldMountPending = true;
      return __goldMountInFlight;
    }
    const tbody = document.querySelector(tbodySelector);
    if (!tbody) return;
    __goldMountLoadCount += 1;
    const seq = __goldMountLoadCount;
    const t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    console.log(GOLD_PUSH_LOG + " client: mountGoldTable() fetch #" + seq + " →", tbodySelector);
    if (global.TLKVSkeleton && typeof global.TLKVSkeleton.goldTableRows === "function") {
      global.TLKVSkeleton.goldTableRows(tbody, 7);
    }
    __goldMountInFlight = (async function () {
      try {
      const data = await getGoldTable();
      const rows = (data && data.rows) || [];
      applyMetaToDom(data && data.meta);
      renderRowsIntoTbody(tbody, rows);
      tbody.removeAttribute("aria-busy");
      dispatchGoldRowsUpdated(rows);
      if (global.TLKVGoldTableScroll && typeof global.TLKVGoldTableScroll.refresh === "function") {
        global.TLKVGoldTableScroll.refresh();
      }
      const t1 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      const ms = Math.max(0, Math.round(t1 - t0));
      console.log(
        GOLD_PUSH_LOG + " client: mountGoldTable() render OK #" + seq,
        { rows: ((data && data.rows) || []).length, ms: ms }
      );
      // Mặc định: chỉ mở Realtime khi bảng giá vào viewport (ít WS hơn).
      // TV/admin: `window.__TLKV_GOLD_PUSH_EAGER = true` hoặc gọi startGoldPush().
      // Tắt hẳn auto: `window.__TLKV_GOLD_PUSH_MANUAL = true`.
      if (global.__TLKV_GOLD_PUSH_MANUAL !== true) {
        if (global.__TLKV_GOLD_PUSH_EAGER === true) {
          startGoldPush();
        } else {
          startGoldPushWhenVisible(tbody);
        }
      }
      return data;
      } catch (err) {
      console.error(err);
      tbody.innerHTML = "";
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = isGoldTableStackedLayout() ? 4 : 5;
      td.style.padding = "16px";
      td.style.color = "#666";
      td.textContent =
        "Không tải được bảng giá từ Supabase. Kiểm tra .env, RLS (SELECT cho anon), bảng gold_meta / gold_price_rows và Realtime (nếu dùng). Chi tiết: " +
        (err && err.message ? err.message : String(err));
      tr.appendChild(td);
      tbody.appendChild(tr);
      return null;
      } finally {
        __goldMountInFlight = null;
        if (__goldMountPending) {
          __goldMountPending = false;
          const sel = __goldMountLastSelector || tbodySelector;
          // queue 1 lần duy nhất cho batch event đến dồn
          setTimeout(function () {
            mountGoldTable(sel);
          }, 0);
        }
      }
    })();
    return __goldMountInFlight;
  }

  /**
   * Cho phép trang (ví dụ /admin) bật pipeline push (Supabase Realtime) mà không cần render bảng.
   * Idempotent — gọi bao nhiêu lần cũng chỉ mở một subscription.
   */
  async function startGoldPush() {
    const sb = await getSupabaseClient();
    startGoldTablePush(sb);
  }

  /**
   * Start Realtime/poll once the gold table enters (near) the viewport.
   * Singleton observer — remounts do not stack observers. TV/admin may call startGoldPush() directly.
   */
  function startGoldPushWhenVisible(el) {
    if (__goldPushDesired || __goldPushStarted || __goldRealtimeChannel || __goldPollTimer) {
      return;
    }
    if (!el) {
      startGoldPush();
      return;
    }
    if (typeof IntersectionObserver !== "function") {
      startGoldPush();
      return;
    }
    if (__goldPushVisibilityObserver) {
      return;
    }
    __goldPushVisibilityObserver = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          disconnectGoldPushVisibilityObserver();
          startGoldPush();
          return;
        }
      },
      { root: null, rootMargin: "120px 0px", threshold: 0.01 }
    );
    __goldPushVisibilityObserver.observe(el);
  }

  function getLastGoldRows() {
    if (!__goldVersionVerifiedThisLoad) return null;
    const cached = __goldTableCache;
    const rows = cached && Array.isArray(cached.rows) ? cached.rows : global.__TLKV_LAST_GOLD_ROWS;
    return Array.isArray(rows) ? rows : null;
  }

  /** Bật Realtime giá trên mọi trang hiển thị giá (catalog / chi tiết / featured). */
  function ensureGoldPriceLiveUpdates() {
    if (global.__TLKV_GOLD_PUSH_MANUAL === true) return;
    startGoldPush();
  }

  global.TLKVGold = {
    STORAGE_KEY,
    SESSION_CACHE_KEY,
    SESSION_CACHE_TTL_MS,
    SESSION_CACHE_SOFT_MS,
    isLeanGoldPushClient,
    getGoldTable,
    invalidateGoldTableCache,
    refreshGoldTableAfterChange,
    scheduleRefreshGoldTableAfterChange,
    softRevalidateGoldCacheIfStale,
    revalidateGoldCacheAgainstVersion,
    markGoldLocalWriteThrough,
    getLastGoldRows,
    parseGoldMoneyToInt,
    formatPriceDisplay,
    fetchDefaultJson,
    loadFromStorage,
    saveToStorage,
    saveGoldMetaOnly,
    stopGoldTableRealtime,
    startGoldPush,
    startGoldPushWhenVisible,
    ensureGoldPriceLiveUpdates,
    notifyGoldTableChanged,
    clearStorage,
    normalizePayload,
    clampGoldRowsForDisplay,
    normalizeRow,
    orderRowsForTable,
    applyMetaToDom,
    renderRowsIntoTbody,
    tryPatchGoldTbodyPricesOnly,
    mountGoldTable,
    assetUrl,
    brandsMatch,
    insertGoldRow,
    insertSilverRow,
    walkMergedGoldRows,
    variantParentProduct,
    coalesceProductForNewGoldRow,
    coalesceProductForNewSilverRow,
    normalizeMeta,
    stampMetaWithVietnamNow,
    applyLinkedPriceGroupSync,
    findLinkedPriceGroup,
    /** Test/debug: whether push is desired while possibly paused for hidden tab. */
    isGoldPushDesired: function () {
      return __goldPushDesired === true;
    },
    isGoldPushPausedForHidden: function () {
      return __goldPausedForHidden === true;
    },
    isGoldRealtimeActive: function () {
      return !!(__goldRealtimeChannel || __goldPollTimer);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
