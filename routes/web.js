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
  router.get("/sanpham", function (req, res) {
    res.redirect(301, "/sanpham/vang-tich-luy");
  });
  router.get("/sanpham/vang-trang-suc", send("san-pham/index.html"));
  router.get("/sanpham/vang-tich-luy", send("san-pham/vang-tich-luy.html"));
  router.get("/sanpham/gia-vang", send("san-pham/gia-vang.html"));
  router.get("/sanpham/danh-muc/:categorySlug", send("san-pham/index.html"));
  router.get("/thuong-hieu/:brandSlug", send("thuong-hieu/index.html"));
  /** Product detail: /sanpham/:categorySlug/:productSlug (reserved segments excluded) */
  router.get("/sanpham/:categorySlug/:productSlug", function (req, res, next) {
    var cat = String(req.params.categorySlug || "").toLowerCase();
    if (
      cat === "danh-muc" ||
      cat === "gia-vang" ||
      cat === "vang-trang-suc" ||
      cat === "vang-tich-luy"
    ) {
      return next();
    }
    res.sendFile(path.join(ROOT, "san-pham", "chi-tiet.html"));
  });
  router.get("/tv-model", send("tv-model.html"));

  /**
   * News (Tin tức thị trường).
   *  - /tin-tuc              → landing (featured / latest preview)
   *  - /tin-tuc/danh-sach    → full archive (search, category, pagination)
   *  - /tin-tuc/thi-truong   → alias → /tin-tuc/danh-sach
   *  - /tin-tuc/:slug        → detail (slug parsed client-side from URL)
   *
   *  Slug validation: only [a-z0-9-]+, length 2..200. Anything else 404.
   *  This keeps Express from forwarding noisy bot URLs into the SPA shell.
   */
  router.get("/tin-tuc/danh-sach", send("tin-tuc/danh-sach.html"));
  router.get("/tin-tuc/danh-sach/", function (req, res) {
    res.redirect(301, "/tin-tuc/danh-sach");
  });
  router.get("/tin-tuc/thi-truong", function (req, res) {
    res.redirect(301, "/tin-tuc/danh-sach");
  });
  router.get("/tin-tuc/thi-truong/", function (req, res) {
    res.redirect(301, "/tin-tuc/danh-sach");
  });
  router.get("/tin-tuc", send("tin-tuc/index.html"));
  router.get("/tin-tuc/", function (req, res) { res.redirect(301, "/tin-tuc"); });
  /** Bắt buộc khai báo TRƯỚC :slug — nếu không, `danh-sach` sẽ bị coi là slug bài và vào chi-tiet.html. */
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
    res.redirect(301, "/sanpham/vang-tich-luy");
  });
  router.get("/san-pham/", function (req, res) {
    res.redirect(301, "/sanpham/vang-tich-luy");
  });
  router.get("/san-pham/gia-vang.html", function (req, res) {
    res.redirect(301, "/sanpham/gia-vang");
  });
  router.get("/san-pham/index.html", function (req, res) {
    res.redirect(301, "/sanpham/vang-tich-luy");
  });
  router.get("/gioi-thieu/index.html", function (req, res) {
    res.redirect(301, "/gioithieu");
  });

  return router;
};
