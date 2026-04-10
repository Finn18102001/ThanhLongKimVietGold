const express = require("express");
const path = require("path");

/** Admin UI: static files under /admin (login + CRUD pages). */
module.exports = function adminRouter(ROOT) {
  return express.static(path.join(ROOT, "admin"), { index: "index.html" });
};
