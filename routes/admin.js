const express = require("express");
const path = require("path");

const ADMIN_HTML_CACHE =
  "no-store, no-cache, must-revalidate, max-age=0";

function sendAdminHtml(res, filePath) {
  res.setHeader("Cache-Control", ADMIN_HTML_CACHE);
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.sendFile(filePath);
}

/**
 * Admin UI: static files under /admin (login + CRUD pages).
 * News CMS uses clean paths (/admin/news, /admin/news/new, /admin/news/edit/:id)
 * that all serve the same SPA shell (admin/news.html).
 */
module.exports = function adminRouter(ROOT) {
  const router = express.Router();
  const adminDir = path.join(ROOT, "admin");
  const newsShell = path.join(adminDir, "news.html");
  const adminIndex = path.join(adminDir, "index.html");

  router.get("/news", function (req, res) {
    sendAdminHtml(res, newsShell);
  });
  router.get("/news/", function (req, res) {
    res.redirect(301, "/admin/news");
  });
  router.get("/news/new", function (req, res) {
    sendAdminHtml(res, newsShell);
  });
  router.get("/news/edit/:id", function (req, res) {
    sendAdminHtml(res, newsShell);
  });
  /** Legacy entry — same SPA shell; client migrates #hash → clean path on boot. */
  router.get("/news.html", function (req, res) {
    sendAdminHtml(res, newsShell);
  });

  /** Always revalidate admin shell so ?v= script tags match the latest deploy. */
  router.get(["/", "/index.html"], function (req, res) {
    sendAdminHtml(res, adminIndex);
  });

  router.use(
    express.static(adminDir, {
      index: false,
      setHeaders: function (res, filePath) {
        var ext = path.extname(filePath).toLowerCase();
        if (ext === ".html") {
          res.setHeader("Cache-Control", ADMIN_HTML_CACHE);
          res.setHeader("CDN-Cache-Control", "no-store");
          res.setHeader("Surrogate-Control", "no-store");
          return;
        }
        if (ext === ".css" || ext === ".js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.setHeader("CDN-Cache-Control", "no-store");
        }
      },
    })
  );
  return router;
};
