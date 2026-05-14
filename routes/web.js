const express = require("express");
const path = require("path");

/**
 * Public HTML routes (clean paths). Static js/data/assets are served after this router in server.js.
 */
module.exports = function webRouter(ROOT) {
  const router = express.Router();
  const send = (rel) => (req, res) => res.sendFile(path.join(ROOT, rel));

  /** Google / trình duyệt thường gọi /favicon.ico — trỏ PNG 48px (logo gốc ~12k px không dùng làm favicon). */
  router.get("/favicon.ico", function (req, res) {
    res.type("image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(path.join(ROOT, "assets", "favicon-48.png"));
  });

  router.get("/", send("index.html"));
  router.get("/gioithieu", send("gioi-thieu/index.html"));
  router.get("/sanpham", send("san-pham/index.html"));
  router.get("/sanpham/gia-vang", send("san-pham/gia-vang.html"));
  router.get("/tv-model", send("tv-model.html"));

  /**
   * News (Tin tức).
   *  - /tin-tuc          → listing page
   *  - /tin-tuc/:slug    → detail page (slug parsed client-side from URL)
   *
   *  Slug validation: only [a-z0-9-]+, length 2..200. Anything else 404.
   *  This keeps Express from forwarding noisy bot URLs into the SPA shell.
   */
  router.get("/tin-tuc", send("tin-tuc/index.html"));
  router.get("/tin-tuc/", function (req, res) { res.redirect(301, "/tin-tuc"); });
  router.get("/tin-tuc/:slug", function (req, res, next) {
    var slug = String(req.params.slug || "");
    if (!/^[a-z0-9][a-z0-9-]{1,198}[a-z0-9]$/.test(slug)) return next();
    res.sendFile(path.join(ROOT, "tin-tuc", "chi-tiet.html"));
  });

  router.get("/gioi-thieu", function (req, res) {
    res.redirect(301, "/gioithieu");
  });
  router.get("/gioi-thieu/", function (req, res) {
    res.redirect(301, "/gioithieu");
  });
  router.get("/san-pham", function (req, res) {
    res.redirect(301, "/sanpham");
  });
  router.get("/san-pham/", function (req, res) {
    res.redirect(301, "/sanpham");
  });
  router.get("/san-pham/gia-vang.html", function (req, res) {
    res.redirect(301, "/sanpham/gia-vang");
  });
  router.get("/san-pham/index.html", function (req, res) {
    res.redirect(301, "/sanpham");
  });
  router.get("/gioi-thieu/index.html", function (req, res) {
    res.redirect(301, "/gioithieu");
  });

  return router;
};
