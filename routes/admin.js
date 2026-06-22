const express = require("express");
const path = require("path");

/**
 * Admin UI: static files under /admin (login + CRUD pages).
 * News CMS uses clean paths (/admin/news, /admin/news/new, /admin/news/edit/:id)
 * that all serve the same SPA shell (admin/news.html).
 */
module.exports = function adminRouter(ROOT) {
  const router = express.Router();
  const adminDir = path.join(ROOT, "admin");
  const newsShell = path.join(adminDir, "news.html");

  router.get("/news", function (req, res) {
    res.sendFile(newsShell);
  });
  router.get("/news/", function (req, res) {
    res.redirect(301, "/admin/news");
  });
  router.get("/news/new", function (req, res) {
    res.sendFile(newsShell);
  });
  router.get("/news/edit/:id", function (req, res) {
    res.sendFile(newsShell);
  });
  /** Legacy entry — same SPA shell; client migrates #hash → clean path on boot. */
  router.get("/news.html", function (req, res) {
    res.sendFile(newsShell);
  });

  router.use(express.static(adminDir, { index: "index.html" }));
  return router;
};
