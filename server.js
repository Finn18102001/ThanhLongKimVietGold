const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });

const express = require("express");

const ROOT = path.join(__dirname);
const app = express();

require("./routes")(app, ROOT);

const BASE_PORT = Number(process.env.PORT) || 5190;
const MAX_TRIES = 25;

function listenFrom(port, triesLeft) {
  const server = http.createServer(app);

  server.once("error", function (err) {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      console.warn("Cổng " + port + " đang bận (ví dụ python http.server). Thử cổng " + (port + 1) + "…");
      listenFrom(port + 1, triesLeft - 1);
      return;
    }
    console.error(err.message);
    if (err.code === "EADDRINUSE") {
      console.error("Gợi ý: dừng process trên cổng này — macOS: lsof -nP -iTCP:" + BASE_PORT + " | grep LISTEN");
      console.error("Hoặc chỉ định cổng: PORT=5200 npm start");
    }
    process.exit(1);
  });

  server.listen(port, function () {
    console.log("TLKV site: http://127.0.0.1:" + port);
    console.log("  /        → public (trang chủ)");
    console.log("  /admin   → admin UI");
    console.log("  /api     → world-xau-usd (GoldAPI nếu có GOLDAPI_KEY), health Supabase");
    console.log("  /api/health/supabase-products → debug RLS (anon, cùng key .env)");
  });
}

listenFrom(BASE_PORT, MAX_TRIES);
