const express = require("express");

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

  return router;
};
