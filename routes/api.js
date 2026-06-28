const express = require("express");
const goldSseHub = require("./gold-sse-hub");

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

  /** Khi client POST JSON tới /gold-table/notify, body là JSON nhẹ { reason }. */
  const notifyJsonParser = express.json({ limit: "4kb" });

  /**
   * Server-Sent Events: server subscribe Supabase Realtime + nhận POST notify, fan-out tới mọi tab.
   * Trình duyệt vẫn gọi getGoldTable() khi nhận event — payload SSE chỉ báo "có thay đổi".
   */
  router.get("/gold-table/stream", function (req, res) {
    const { url, key } = goldSseHub.supabasePublicEnv();
    if (!url || !key) {
      console.warn(
        "[TLKV gold-push] GET /api/gold-table/stream → 503 (thiếu SUPABASE_URL / anon key trên server) — POST /notify vẫn dùng được cho fan-out thủ công"
      );
      res.status(503).type("text/plain; charset=utf-8").send("Thiếu cấu hình Supabase trên server (.env)");
      return;
    }

    var ip = req.ip || (req.socket && req.socket.remoteAddress) || "";
    var ua = (req.headers && req.headers["user-agent"]) || "";
    console.log(
      "[TLKV gold-push] GET /api/gold-table/stream → 200 SSE",
      { ip: ip, ua: String(ua).slice(0, 80) }
    );

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    res.write(": tlkv gold-table sse\n\n");
    res.write("retry: 8000\n\n");
    var id = goldSseHub.addSseClient(res);
    res.write(goldSseHub.sseLine("ready", { id: id, t: Date.now() }));

    req.on("close", function () {
      goldSseHub.removeSseClient(res);
    });
  });

  /**
   * Admin sau khi lưu giá xong sẽ POST tới đây để push ngay cho mọi tab đang mở.
   * Dùng thay thế / bổ sung cho postgres_changes (nếu Supabase chưa bật Realtime cho bảng).
   */
  router.post("/gold-table/notify", notifyJsonParser, function (req, res) {
    var reason =
      (req.body && typeof req.body.reason === "string" && req.body.reason) ||
      (req.query && typeof req.query.reason === "string" && req.query.reason) ||
      "manual";
    var ua = (req.headers && req.headers["user-agent"]) || "";
    console.log(
      "[TLKV gold-push] POST /api/gold-table/notify",
      { reason: String(reason).slice(0, 40), ua: String(ua).slice(0, 80) }
    );
    goldSseHub.manualBroadcast(String(reason).slice(0, 40));
    res.status(204).end();
  });

  /** Trả về trạng thái hub: số tab đang mở SSE, số broadcast đã gửi, status Realtime. */
  router.get("/gold-table/debug", function (req, res) {
    res.type("json").json(goldSseHub.getDebugStatus());
  });

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

  // News image upload — server-side transcode with sharp (Phase B).
  // Mounted at /api/news/* so the browser admin CMS can POST to /api/news/upload-image.
  router.use("/news", require("./api-news-image")());

  return router;
};
