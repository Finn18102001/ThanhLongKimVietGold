const express = require("express");
const path = require("path");

/**
 * Public HTML routes (clean paths). Static js/data/assets are served after this router in server.js.
 */
module.exports = function webRouter(ROOT) {
  const router = express.Router();
  const send = (rel) => (req, res) => res.sendFile(path.join(ROOT, rel));

  router.get("/", send("index.html"));
  router.get("/gioithieu", send("gioi-thieu/index.html"));
  router.get("/sanpham", send("san-pham/index.html"));
  router.get("/sanpham/gia-vang", send("san-pham/gia-vang.html"));

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
