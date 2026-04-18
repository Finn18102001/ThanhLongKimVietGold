const express = require("express");

function trimEnv(v) {
  return String(v || "").trim();
}

/** YYYYMMDD (UTC, trưa để tránh lệch ngày). */
function goldApiYmdFromDate(d) {
  const x = new Date(d.getTime());
  x.setUTCHours(12, 0, 0, 0);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  const day = String(x.getUTCDate()).padStart(2, "0");
  return y + m + day;
}

function goldApiDateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return goldApiYmdFromDate(d);
}

function goldApiDateMonthsAgo(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return goldApiYmdFromDate(d);
}

function goldApiFriendlyError(status, bodyText) {
  let msg = String(bodyText || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(msg);
  } catch (_) {}
  const errStr = parsed && parsed.error ? String(parsed.error) : msg;
  const lower = errStr.toLowerCase();
  if (status === 403 && (lower.includes("quota") || lower.includes("billing") || lower.includes("upgrade"))) {
    return {
      code: "GOLDAPI_QUOTA",
      message:
        "",
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "GOLDAPI_AUTH",
      message: "GoldAPI từ chối truy cập (" + status + "). Kiểm tra GOLDAPI_KEY trong .env.",
    };
  }
  return {
    code: "GOLDAPI_HTTP_" + status,
    message: "GoldAPI lỗi " + status + (errStr ? ": " + errStr.slice(0, 180) : ""),
  };
}

async function goldApiFetch(key, ymd) {
  const url = ymd
    ? "https://www.goldapi.io/api/XAU/USD/" + ymd
    : "https://www.goldapi.io/api/XAU/USD";
  const r = await fetch(url, {
    headers: { "x-access-token": key },
  });
  if (!r.ok) {
    const t = await r.text();
    const friendly = goldApiFriendlyError(r.status, t);
    const err = new Error(friendly.message);
    err.goldApiCode = friendly.code;
    err.goldApiStatus = r.status;
    throw err;
  }
  return r.json();
}

function goldApiSpotPrice(body) {
  const n = Number(body && body.price);
  return Number.isFinite(n) ? n : null;
}

function fmtUsdSigned2(n) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign + abs;
}

function fmtPctSigned2(n) {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.00%";
  const sign = n > 0 ? "+" : "-";
  return sign + Math.abs(n).toFixed(2) + "%";
}

/** Cache để giảm số request GoldAPI (quota tháng). Có thể ghi đè: GOLDAPI_CACHE_MINUTES=15 */
let __worldXauUsdCache = { t: 0, json: null };
const WORLD_XAU_TTL_MS = (function () {
  const n = Number(process.env.GOLDAPI_CACHE_MINUTES);
  const min = Number.isFinite(n) && n > 0 ? n : 15;
  return min * 60 * 1000;
})();

function supabaseRestEnv() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ""
  ).trim();
  return { base, key };
}

/**
 * Trước đây: GET trả file JSON trong data/.
 * Tạm tắt — client đọc trực tiếp Supabase (gold_meta, gold_price_rows, products).
 */
module.exports = function apiRouter(_ROOT) {
  const router = express.Router();

  /**
   * Debug: gọi PostgREST giống trình duyệt (anon key). Nếu count = 0 nhưng Table Editor có dòng → RLS hoặc sai project trong .env.
   */
  router.get("/health/supabase-products", async function (req, res) {
    const { base, key } = supabaseRestEnv();
    if (!base || !key) {
      res.status(503).type("json").json({
        ok: false,
        error: "Thiếu SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL hoặc anon|publishable key trong .env",
      });
      return;
    }
    try {
      const url = base + "/rest/v1/products?select=id,name&limit=50";
      const r = await fetch(url, {
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          Accept: "application/json",
        },
      });
      const text = await r.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch (_) {
        body = { raw: text.slice(0, 500) };
      }
      const rows = Array.isArray(body) ? body : null;
      res.type("json").json({
        ok: r.ok,
        httpStatus: r.status,
        rowCount: rows ? rows.length : null,
        rows: rows,
        postgrestError: rows ? null : body,
      });
    } catch (e) {
      res.status(500).type("json").json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  });

  /*
  router.get("/gold-table", function (req, res) {
    res.type("json");
    res.sendFile(path.join(ROOT, "data", "gold-table.json"));
  });

  router.get("/products", function (req, res) {
    res.type("json");
    res.sendFile(path.join(ROOT, "data", "products.json"));
  });
  */

  router.get("/gold-table", function (req, res) {
    res.status(503).type("json").json({
      message: "Endpoint mock JSON đã tắt. Trang web dùng Supabase (gold_meta + gold_price_rows).",
    });
  });

  router.get("/products", function (req, res) {
    res.status(503).type("json").json({
      message: "Endpoint mock JSON đã tắt. Trang web dùng Supabase (bảng products).",
    });
  });

  /**
   * Giá XAU/USD (GoldAPI) — key chỉ đặt trên server (.env GOLDAPI_KEY).
   * Trả spot + bảng diễn biến (Hôm nay / 30 ngày / …) để trang chủ & /sanpham/gia-vang.
   */
  router.get("/world-xau-usd", async function (req, res) {
    const key = trimEnv(process.env.GOLDAPI_KEY) || trimEnv(process.env.GOLDAPI_IO_KEY);
    if (!key) {
      res.status(503).type("json").json({
        ok: false,
        error:
          "",
      });
      return;
    }

    const now = Date.now();
    const bust = String(req.query.refresh || "") === "1";
    if (!bust && __worldXauUsdCache.json && now - __worldXauUsdCache.t < WORLD_XAU_TTL_MS) {
      res.type("json").json(__worldXauUsdCache.json);
      return;
    }

    try {
      const spot = await goldApiFetch(key);
      const spotPrice = goldApiSpotPrice(spot);
      const y30 = goldApiDateDaysAgo(30);
      const y6m = goldApiDateMonthsAgo(6);
      const y1y = goldApiDateMonthsAgo(12);
      const y5y = goldApiDateMonthsAgo(60);
      const y20y = goldApiDateMonthsAgo(240);

      const [h30, h6m, h1y, h5y, h20y] = await Promise.all([
        goldApiFetch(key, y30).catch(function () {
          return null;
        }),
        goldApiFetch(key, y6m).catch(function () {
          return null;
        }),
        goldApiFetch(key, y1y).catch(function () {
          return null;
        }),
        goldApiFetch(key, y5y).catch(function () {
          return null;
        }),
        goldApiFetch(key, y20y).catch(function () {
          return null;
        }),
      ]);

      const p30 = h30 ? goldApiSpotPrice(h30) : null;
      const p6m = h6m ? goldApiSpotPrice(h6m) : null;
      const p1y = h1y ? goldApiSpotPrice(h1y) : null;
      const p5y = h5y ? goldApiSpotPrice(h5y) : null;
      const p20y = h20y ? goldApiSpotPrice(h20y) : null;

      function histRow(label, pOld) {
        if (spotPrice == null || pOld == null || pOld === 0) {
          return { label: label, abs: "—", pct: "—", positive: null };
        }
        const diff = spotPrice - pOld;
        const pct = (diff / pOld) * 100;
        return {
          label: label,
          abs: fmtUsdSigned2(diff),
          pct: fmtPctSigned2(pct),
          positive: diff > 0 ? true : diff < 0 ? false : null,
        };
      }

      const ch = Number(spot.ch);
      const chp = Number(spot.chp);
      const todayRow = {
        label: "Hôm nay",
        abs: fmtUsdSigned2(ch),
        pct: fmtPctSigned2(chp),
        positive: Number.isFinite(ch) ? ch > 0 : Number.isFinite(chp) ? chp > 0 : null,
      };

      const out = {
        ok: true,
        asOf: new Date().toISOString(),
        spot: {
          symbol: String(spot.symbol || "FOREXCOM:XAUUSD"),
          metal: spot.metal,
          currency: spot.currency,
          price: spotPrice,
          priceDisplay: spotPrice == null ? "—" : spotPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ch: Number.isFinite(ch) ? ch : null,
          chp: Number.isFinite(chp) ? chp : null,
        },
        rows: [
          todayRow,
          histRow("30 ngày", p30),
          histRow("6 tháng", p6m),
          histRow("1 năm", p1y),
          histRow("5 năm", p5y),
          histRow("20 năm", p20y),
        ],
      };

      __worldXauUsdCache = { t: now, json: out };
      res.type("json").json(out);
    } catch (e) {
      const code = e && e.goldApiCode ? e.goldApiCode : null;
      const http = e && e.goldApiStatus === 403 ? 503 : 502;
      res.status(http).type("json").json({
        ok: false,
        code: code,
        error: e && e.message ? e.message : String(e),
      });
    }
  });

  return router;
};
