const express = require("express");
const path = require("path");
const { isServerlessHost, supabasePublicFromProcessEnv } = require("../lib/runtime-env");

/**
 * @param {import("express").Express} app
 * @param {string} ROOT - project root (folder containing index.html, data/, js/, …)
 */
module.exports = function registerRoutes(app, ROOT) {
  /**
   * Serve Supabase UMD bundle locally (avoid CDN / ESM import issues on TV browsers).
   * This keeps the website functional even when external CDNs are blocked/slow.
   */
  app.get("/js/vendor/supabase.js", function (req, res) {
    res.type("application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(ROOT, "js", "vendor", "supabase.js"));
  });

  /**
   * Inject Supabase public config từ .env / .env.local (phải load trước /js/supabaseClient.js).
   * Đăng ký trước static để không bị ghi đè bởi file tĩnh.
   */
  app.get("/js/boot-supabase-env.js", function (req, res) {
    res.type("application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const { url, anonKey } = supabasePublicFromProcessEnv();
    const payload = { url, anonKey };
    var boot =
      "window.__TLKV_SUPABASE__=" +
      JSON.stringify(payload) +
      ";" +
      "window.TLKV_SUPABASE_URL=" +
      JSON.stringify(url) +
      ";" +
      "window.TLKV_SUPABASE_ANON_KEY=" +
      JSON.stringify(anonKey) +
      ";";
    if (isServerlessHost()) {
      boot += "window.__TLKV_DISABLE_GOLD_SSE=true;";
    }
    res.send(boot);
  });

  app.use("/api", require("./api")(ROOT));
  app.use("/admin", require("./admin")(ROOT));
  app.use("/", require("./web")(ROOT));
  app.use(
    express.static(ROOT, {
      index: false,
      setHeaders: function (res, filePath) {
        var ext = path.extname(filePath).toLowerCase();
        var base = path.basename(filePath).toLowerCase();
        if (ext === ".json") {
          res.setHeader("Cache-Control", "no-store");
          return;
        }
        if (
          base === "favicon-48.png" ||
          base === "apple-touch-icon-180.png" ||
          base === "og-logo-256.png" ||
          base.indexOf("tlkv-logo") === 0
        ) {
          res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
        }
      },
    })
  );

  app.use(function (err, req, res, _next) {
    console.error("[TLKV] unhandled route error:", req.method, req.url, err && err.stack ? err.stack : err);
    if (res.headersSent) return;
    res.status(500).type("json").json({ ok: false, error: "Lỗi server nội bộ." });
  });
};
