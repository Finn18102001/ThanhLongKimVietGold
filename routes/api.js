const express = require("express");

/**
 * Trước đây: GET trả file JSON trong data/.
 * Tạm tắt — client đọc trực tiếp Supabase (gold_meta, gold_price_rows, products).
 */
module.exports = function apiRouter(_ROOT) {
  const router = express.Router();

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
