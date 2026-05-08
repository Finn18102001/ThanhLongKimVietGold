const express = require("express");
const path = require("path");

function trimEnv(v) {
  return String(v || "").trim();
}

/**
 * URL + key công khai cho trình duyệt.
 * Hỗ trợ tên biến cổ điển (.env) và tên giống Supabase Dashboard / Next (NEXT_PUBLIC_*).
 */
function supabasePublicFromProcessEnv() {
  const url =
    trimEnv(process.env.SUPABASE_URL) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey =
    trimEnv(process.env.SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return { url, anonKey };
}

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
    res.sendFile(path.join(ROOT, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"));
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
    res.send("window.__TLKV_SUPABASE__=" + JSON.stringify(payload) + ";");
  });

  app.use("/api", require("./api")(ROOT));
  app.use("/admin", require("./admin")(ROOT));
  app.use("/", require("./web")(ROOT));
  app.use(
    express.static(ROOT, {
      index: false,
      setHeaders: function (res, filePath) {
        if (path.extname(filePath) === ".json") {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    })
  );
};
