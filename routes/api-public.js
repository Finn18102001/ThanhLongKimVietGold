/**
 * Same-origin public JSON reads for CDN/Cloudflare caching.
 * Mounted at /api/public/* — not a replacement for all catalog queries,
 * but covers the hottest brand list + news list/hero paths.
 */
"use strict";

const express = require("express");
const {
  BRANDS_CACHE_CONTROL,
  NEWS_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
  publicCacheVersion,
  shouldBypassPublicCache,
  setCacheControl,
} = require("../lib/http-cache");

function supabaseRestEnv() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ""
  ).trim();
  return { base, key };
}

async function supabaseGet(pathAndQuery) {
  const { base, key } = supabaseRestEnv();
  if (!base || !key) {
    const err = new Error("Missing SUPABASE_URL / anon key");
    err.status = 503;
    throw err;
  }
  const url = base + "/rest/v1/" + String(pathAndQuery || "").replace(/^\//, "");
  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      Accept: "application/json",
    },
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = { raw: text.slice(0, 500) };
  }
  if (!r.ok) {
    const err = new Error((body && body.message) || "Supabase error " + r.status);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

function applyPublicCache(req, res, directive) {
  if (shouldBypassPublicCache(req)) {
    setCacheControl(res, NO_STORE_CACHE_CONTROL);
    return;
  }
  setCacheControl(res, directive);
}

async function fetchNewsVersionPayload() {
  const latestRows = await supabaseGet(
    "news?select=id,updated_at&order=updated_at.desc.nullslast&limit=1"
  );
  const latest = Array.isArray(latestRows) && latestRows.length ? latestRows[0] : null;
  const countRows = await supabaseGet("news?select=id");
  const total = Array.isArray(countRows) ? countRows.length : 0;
  const latestUpdatedAt =
    latest && latest.updated_at ? String(latest.updated_at) : "none";
  const latestId = latest && latest.id ? String(latest.id) : "none";
  return {
    version: latestUpdatedAt + ":" + total + ":" + latestId,
    latestUpdatedAt: latestUpdatedAt,
    total: total,
  };
}

module.exports = function apiPublicRouter() {
  const router = express.Router();

  /**
   * GET /api/public/brands
   * Active brands list — long CDN TTL (brands almost never change).
   */
  router.get("/brands", async function (req, res) {
    try {
      const select = "id,name,slug,logo_url,sort_order,is_active";
      const rows = await supabaseGet(
        "brands?select=" +
          encodeURIComponent(select) +
          "&is_active=eq.true&order=sort_order.asc"
      );
      applyPublicCache(req, res, BRANDS_CACHE_CONTROL);
      res.type("json").json({
        items: Array.isArray(rows) ? rows : [],
        cacheVersion: publicCacheVersion(),
      });
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      res.status(status).type("json").json({
        error: e && e.message ? e.message : String(e),
        body: e && e.body ? e.body : undefined,
      });
    }
  });

  /**
   * GET /api/public/news/version
   * No-store version stamp used to bust cached news list/hero URLs after admin CRUD.
   * Includes latest updated_at + total row count so create/update/delete all change it.
   */
  router.get("/news/version", async function (_req, res) {
    try {
      const payload = await fetchNewsVersionPayload();
      setCacheControl(res, NO_STORE_CACHE_CONTROL);
      res.type("json").json(payload);
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      res.status(status).type("json").json({
        error: e && e.message ? e.message : String(e),
        body: e && e.body ? e.body : undefined,
      });
    }
  });

  /**
   * GET /api/public/news/version
   * No-store version stamp used to bust cached news list/hero URLs after admin CRUD.
   * Includes latest updated_at + total row count so create/update/delete all change it.
   */
  router.get("/news/version", async function (_req, res) {
    try {
      const latestRows = await supabaseGet(
        "news?select=id,updated_at&order=updated_at.desc.nullslast&limit=1"
      );
      const latest = Array.isArray(latestRows) && latestRows.length ? latestRows[0] : null;
      const countRows = await supabaseGet("news?select=id");
      const total = Array.isArray(countRows) ? countRows.length : 0;
      const latestUpdatedAt =
        latest && latest.updated_at ? String(latest.updated_at) : "none";
      const latestId = latest && latest.id ? String(latest.id) : "none";
      setCacheControl(res, NO_STORE_CACHE_CONTROL);
      res.type("json").json({
        version: latestUpdatedAt + ":" + total + ":" + latestId,
        latestUpdatedAt: latestUpdatedAt,
        total: total,
      });
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      res.status(status).type("json").json({
        error: e && e.message ? e.message : String(e),
        body: e && e.body ? e.body : undefined,
      });
    }
  });

  /**
   * GET /api/public/news
   * Published news list (paginated) — short CDN TTL + SWR.
   * Query: page, pageSize, categorySlug
   */
  router.get("/news", async function (req, res) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const categorySlug = String(req.query.categorySlug || "")
        .trim()
        .toLowerCase();

      const listSelect =
        "id,title,slug,short_description,thumbnail_url,status,featured,view_count," +
        "published_at,created_at,updated_at,category_id,news_categories(id,name,slug)";

      let path;
      if (categorySlug && /^[a-z0-9-]{2,120}$/.test(categorySlug)) {
        path =
          "news?select=" +
          encodeURIComponent(
            "id,title,slug,short_description,thumbnail_url,status,featured,view_count," +
              "published_at,created_at,updated_at,category_id,news_categories!inner(id,name,slug)"
          ) +
          "&status=eq.published" +
          "&news_categories.slug=eq." +
          encodeURIComponent(categorySlug) +
          "&order=published_at.desc.nullslast" +
          "&offset=" +
          from +
          "&limit=" +
          pageSize;
      } else {
        path =
          "news?select=" +
          encodeURIComponent(listSelect) +
          "&status=eq.published" +
          "&order=published_at.desc.nullslast" +
          "&offset=" +
          from +
          "&limit=" +
          pageSize;
      }

      const rows = await supabaseGet(path);
      applyPublicCache(req, res, NEWS_CACHE_CONTROL);
      res.type("json").json({
        items: Array.isArray(rows) ? rows : [],
        page: page,
        pageSize: pageSize,
        cacheVersion: publicCacheVersion(),
      });
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      res.status(status).type("json").json({
        error: e && e.message ? e.message : String(e),
        body: e && e.body ? e.body : undefined,
      });
    }
  });

  /**
   * GET /api/public/news/hero
   * Landing split: featured + secondary.
   */
  router.get("/news/hero", async function (req, res) {
    try {
      const limitFeatured = Math.max(1, Number(req.query.limitFeatured) || 1);
      const limitSecondary = Math.max(1, Number(req.query.limitSecondary) || 4);
      const total = limitFeatured + limitSecondary;
      const listSelect =
        "id,title,slug,short_description,thumbnail_url,status,featured,view_count," +
        "published_at,created_at,updated_at,category_id,news_categories(id,name,slug)";
      const rows = await supabaseGet(
        "news?select=" +
          encodeURIComponent(listSelect) +
          "&status=eq.published" +
          "&order=published_at.desc.nullslast" +
          "&order=updated_at.desc.nullslast" +
          "&limit=" +
          total
      );
      const items = Array.isArray(rows) ? rows : [];
      applyPublicCache(req, res, NEWS_CACHE_CONTROL);
      res.type("json").json({
        featured: items.slice(0, limitFeatured),
        secondary: items.slice(limitFeatured, limitFeatured + limitSecondary),
        cacheVersion: publicCacheVersion(),
      });
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      res.status(status).type("json").json({
        error: e && e.message ? e.message : String(e),
        body: e && e.body ? e.body : undefined,
      });
    }
  });

  return router;
};
