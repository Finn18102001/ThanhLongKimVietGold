/**
 * TLKVNewsAPI — Supabase data layer for the public News feature.
 *
 *  Exposed on `window.TLKVNewsAPI` so both the public site and the admin can use it.
 *  Pure data access: NO DOM, NO rendering. All UI lives in *-page.js / news-admin.js.
 *
 *  Why a thin layer instead of letting pages call Supabase directly?
 *    - One place to swap transport (e.g. add Edge Functions / proxy later).
 *    - One place to enforce normalization (slugs, status enums, JSONB shape).
 *    - One place to add caching, retries, telemetry.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Supabase client (lazy, singleton).
  // Public reads use a lean anon client (no auth session / refresh) — faster first paint.
  // Admin writes keep the shared authenticated client.
  // ---------------------------------------------------------------------------
  var __publicClient = null;
  var __publicClientPromise = null;

  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
  }

  function getPublicSupabaseClient() {
    if (__publicClient) return Promise.resolve(__publicClient);
    if (__publicClientPromise) return __publicClientPromise;
    __publicClientPromise = Promise.resolve().then(function () {
      var cfg =
        global.TLKVSupabase && typeof global.TLKVSupabase.readSupabaseConfig === "function"
          ? global.TLKVSupabase.readSupabaseConfig()
          : { url: "", anonKey: "" };
      var sdk = global.supabase;
      if (!cfg.url || !cfg.anonKey || !sdk || typeof sdk.createClient !== "function") {
        return getSupabaseClient();
      }
      __publicClient = sdk.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: "tlkv-news-public-anon",
        },
        global: {
          headers: { "X-Client-Info": "tlkv-news-public" },
        },
      });
      return __publicClient;
    });
    return __publicClientPromise;
  }

  function requireSupabase() {
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        throw new Error(
          "Thiếu cấu hình Supabase: đặt NEXT_PUBLIC_SUPABASE_URL + " +
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env."
        );
      }
      return sb;
    });
  }

  function requirePublicSupabase() {
    return getPublicSupabaseClient().then(function (sb) {
      if (!sb) {
        throw new Error(
          "Thiếu cấu hình Supabase: đặt NEXT_PUBLIC_SUPABASE_URL + key trong .env."
        );
      }
      return sb;
    });
  }

  // ---------------------------------------------------------------------------
  // Detail cache (sessionStorage) — click từ list/home không chờ round-trip lần 2.
  // ---------------------------------------------------------------------------
  var DETAIL_CACHE_KEY = "tlkv_news_detail_v1:";
  var DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
  var __detailMemory = Object.create(null);
  var __detailInFlight = Object.create(null);

  function readDetailCache(slug) {
    var safe = String(slug || "").trim();
    if (!safe) return null;
    var mem = __detailMemory[safe];
    if (mem && Date.now() - mem.savedAt < DETAIL_CACHE_TTL_MS) return mem.article;
    try {
      var ss = global.sessionStorage;
      if (!ss) return null;
      var raw = ss.getItem(DETAIL_CACHE_KEY + safe);
      if (!raw) return null;
      var wrapped = JSON.parse(raw);
      if (!wrapped || Date.now() - Number(wrapped.savedAt) > DETAIL_CACHE_TTL_MS) {
        ss.removeItem(DETAIL_CACHE_KEY + safe);
        return null;
      }
      __detailMemory[safe] = { savedAt: wrapped.savedAt, article: wrapped.article };
      return wrapped.article || null;
    } catch (_) {
      return null;
    }
  }

  function writeDetailCache(slug, article) {
    var safe = String(slug || "").trim();
    if (!safe || !article) return;
    var payload = { savedAt: Date.now(), article: article };
    __detailMemory[safe] = payload;
    try {
      var ss = global.sessionStorage;
      if (ss) ss.setItem(DETAIL_CACHE_KEY + safe, JSON.stringify(payload));
    } catch (_) {}
  }

  function clearDetailCache(slug) {
    var safe = String(slug || "").trim();
    if (safe) delete __detailMemory[safe];
    try {
      var ss = global.sessionStorage;
      if (ss && safe) ss.removeItem(DETAIL_CACHE_KEY + safe);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function apiLog() {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, ["[NEWS-API]"].concat(args));
  }

  var API_WRITE_TIMEOUT_MS = 20000;

  function withApiTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error(
            (label || "Thao tác") + " quá thời gian (" + Math.round(ms / 1000) + "s). " +
              "Kiểm tra mạng hoặc tải lại trang."
          ));
        }, ms);
      }),
    ]);
  }

  function newRowId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function formatDbError(error) {
    if (!error) return new Error("Không lưu được bài viết.");
    if (error instanceof Error && !error.code) return error;
    var msg = String(error.message || error.details || error.hint || "");
    var code = String(error.code || "");
    if (code === "42501" || msg.toLowerCase().indexOf("policy") !== -1 || msg.toLowerCase().indexOf("row-level security") !== -1) {
      return new Error("Không có quyền ghi bài viết — kiểm tra tài khoản đăng nhập.");
    }
    if (code === "23503") {
      return new Error("Chuyên mục không hợp lệ — chọn lại hoặc để trống.");
    }
    if (error instanceof Error) return error;
    return new Error(msg || "Không lưu được bài viết.");
  }

  function getRestConfig() {
    if (global.TLKVSupabase && global.TLKVSupabase.readSupabaseConfig) {
      return global.TLKVSupabase.readSupabaseConfig();
    }
    return { url: "", anonKey: "" };
  }

  /** JWT from localStorage (fast) — same path as image upload; avoids hung getSession(). */
  async function getAuthJwt() {
    if (global.TLKVNewsStorage && typeof global.TLKVNewsStorage.getAccessToken === "function") {
      var token = await global.TLKVNewsStorage.getAccessToken();
      if (token) return token;
    }
    throw new Error("Chưa đăng nhập hoặc phiên đã hết hạn — tải lại trang.");
  }

  /**
   * Direct PostgREST write — bypasses supabase-js client auth lock that hangs getSession().
   */
  async function restRequest(method, resourcePath, body, opts) {
    var cfg = getRestConfig();
    if (!cfg.url || !cfg.anonKey) {
      throw new Error("Thiếu cấu hình Supabase.");
    }
    var jwt = await getAuthJwt();
    var headers = {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    };
    if (opts && opts.prefer) headers.Prefer = opts.prefer;

    var init = { method: method, headers: headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    var baseUrl = String(cfg.url).replace(/\/$/, "");
    var res = await withApiTimeout(
      fetch(baseUrl + "/rest/v1/" + resourcePath, init),
      API_WRITE_TIMEOUT_MS,
      (opts && opts.label) || "Lưu bài viết"
    );

    if (res.ok) return { ok: true };

    var errBody = null;
    try {
      errBody = await res.json();
    } catch (e) {
      errBody = { message: "HTTP " + res.status };
    }
    return { ok: false, error: errBody };
  }

  /** GET via PostgREST — same JWT path as writes (no getSession hang). */
  async function restFetch(resourcePath, opts) {
    var cfg = getRestConfig();
    if (!cfg.url || !cfg.anonKey) {
      throw new Error("Thiếu cấu hình Supabase.");
    }
    var jwt = await getAuthJwt();
    var headers = {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + jwt,
      Accept: "application/json",
    };
    if (opts && opts.prefer) headers.Prefer = opts.prefer;
    var baseUrl = String(cfg.url).replace(/\/$/, "");
    var res = await withApiTimeout(
      fetch(baseUrl + "/rest/v1/" + resourcePath, { method: "GET", headers: headers }),
      (opts && opts.timeoutMs) || 15000,
      (opts && opts.label) || "Tải dữ liệu"
    );
    if (!res.ok) {
      var errBody = null;
      try {
        errBody = await res.json();
      } catch (e) {
        errBody = { message: "HTTP " + res.status };
      }
      throw formatDbError(errBody);
    }
    return res.json();
  }

  /** GET with exact row count (Content-Range) — for admin pagination. */
  async function restFetchWithCount(resourcePath, opts) {
    var cfg = getRestConfig();
    if (!cfg.url || !cfg.anonKey) {
      throw new Error("Thiếu cấu hình Supabase.");
    }
    var jwt = await getAuthJwt();
    var headers = {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + jwt,
      Accept: "application/json",
      Prefer: "count=exact",
    };
    var baseUrl = String(cfg.url).replace(/\/$/, "");
    var res = await withApiTimeout(
      fetch(baseUrl + "/rest/v1/" + resourcePath, { method: "GET", headers: headers }),
      (opts && opts.timeoutMs) || 15000,
      (opts && opts.label) || "Tải dữ liệu"
    );
    if (!res.ok) {
      var errBody = null;
      try {
        errBody = await res.json();
      } catch (e) {
        errBody = { message: "HTTP " + res.status };
      }
      throw formatDbError(errBody);
    }
    var total = null;
    var range = res.headers.get("Content-Range") || res.headers.get("content-range");
    if (range) {
      var m = String(range).match(/\/(\d+)\s*$/);
      if (m) total = parseInt(m[1], 10);
    }
    var data = await res.json();
    return { data: data, total: total };
  }

  /** Build admin response from the row we just wrote — avoids SELECT round-trip of full content. */
  function detailFromWritable(id, row, slug) {
    return {
      id: String(id),
      title: row.title,
      slug: slug,
      shortDescription: row.short_description,
      thumbnailUrl: row.thumbnail_url,
      content: normalizeContent(row.content),
      status: row.status,
      featured: row.featured === true,
      viewCount: 0,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      seoKeywords: row.seo_keywords,
      authorEmail: row.author_email,
      publishedAt: null,
      createdAt: null,
      updatedAt: new Date().toISOString(),
      category: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization — DB row → app-friendly shape.
  // Keeping the public shape stable insulates UI from schema renames.
  // ---------------------------------------------------------------------------

  /**
   * @typedef {Object} NewsArticleListItem
   * @property {string} id
   * @property {string} title
   * @property {string} slug
   * @property {string} shortDescription
   * @property {string} thumbnailUrl
   * @property {string} status
   * @property {boolean} featured
   * @property {number} viewCount
   * @property {string|null} publishedAt    ISO
   * @property {string} createdAt           ISO
   * @property {string} updatedAt           ISO
   * @property {{id:string,name:string,slug:string}|null} category
   */

  /**
   * @typedef {NewsArticleListItem & {
   *   content: { blocks: Array<{type:string,data:object}> },
   *   seoTitle: string,
   *   seoDescription: string,
   *   seoKeywords: string,
   *   authorEmail: string
   * }} NewsArticleDetail
   */

  function normalizeContent(raw) {
    // Accept: null, JSON string, EditorJS object, or bare array of blocks.
    if (!raw) return { blocks: [] };
    if (typeof raw === "string") {
      var trimmed = raw.trim();
      if (!trimmed) return { blocks: [] };
      try {
        raw = JSON.parse(trimmed);
      } catch (e) {
        return { blocks: [] };
      }
    }
    if (Array.isArray(raw)) return { blocks: raw };
    if (raw && Array.isArray(raw.blocks)) {
      return { blocks: raw.blocks, time: raw.time, version: raw.version };
    }
    return { blocks: [] };
  }

  /** Strip invalid/huge Editor.js blocks before DB write — prevents hang on large paste. */
  function sanitizeContentForDb(raw) {
    var base = normalizeContent(raw);
    if (global.TLKVNewsEditor && typeof global.TLKVNewsEditor.normalizeEditorData === "function") {
      base = global.TLKVNewsEditor.normalizeEditorData(base);
    }
    var blocks = (base.blocks || []).slice(0, 400).map(function (b) {
      if (!b || !b.type || typeof b.data !== "object") return null;
      var data = Object.assign({}, b.data);
      ["text", "caption", "content"].forEach(function (k) {
        if (typeof data[k] === "string" && data[k].length > 60000) {
          data[k] = data[k].slice(0, 60000);
        }
      });
      return { type: String(b.type).slice(0, 32), data: data };
    }).filter(Boolean);
    return {
      time: base.time || Date.now(),
      blocks: blocks,
      version: base.version || "2.30.7",
    };
  }

  function cloneRow(row) {
    return {
      title: row.title,
      slug: row.slug,
      short_description: row.short_description,
      thumbnail_url: row.thumbnail_url,
      content: sanitizeContentForDb(row.content),
      category_id: row.category_id,
      status: row.status,
      featured: row.featured,
      seo_title: row.seo_title,
      seo_description: row.seo_description,
      seo_keywords: row.seo_keywords,
      author_email: row.author_email,
    };
  }

  /** Site logo when a list card has no cover image (thumbnail_url empty in DB). */
  function resolveThumbnailFallback() {
    if (global.TLKV_SITE_LOGO_MARK_URL) return global.TLKV_SITE_LOGO_MARK_URL;
    return "/assets/tlkv-logo-mark.png?v=20260623";
  }

  /**
   * Pick cover image for list/home cards.
   * DB column: thumbnail_url → app field thumbnailUrl (upload + manual URL share this field).
   * @returns {{ src: string, isFallback: boolean }}
   */
  function resolveThumbnailUrl(item) {
    var url = String((item && item.thumbnailUrl) || "").trim();
    if (url) return { src: url, isFallback: false };
    return { src: resolveThumbnailFallback(), isFallback: true };
  }

  function rowToListItem(r) {
    if (!r) return null;
    var cat = r.news_categories || r.category || null; // PostgREST joined relation
    return {
      id: String(r.id),
      title: String(r.title || ""),
      slug: String(r.slug || ""),
      shortDescription: String(r.short_description || ""),
      thumbnailUrl: String(r.thumbnail_url || ""),
      status: String(r.status || "draft"),
      featured: r.featured === true,
      viewCount: Number(r.view_count || 0),
      publishedAt: r.published_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      category: cat
        ? { id: String(cat.id), name: String(cat.name || ""), slug: String(cat.slug || "") }
        : null,
    };
  }

  function rowToDetail(r) {
    if (!r) return null;
    var base = rowToListItem(r);
    base.content = normalizeContent(r.content);
    base.seoTitle = String(r.seo_title || "");
    base.seoDescription = String(r.seo_description || "");
    base.seoKeywords = String(r.seo_keywords || "");
    base.authorEmail = String(r.author_email || "");
    return base;
  }

  /** Newest-first using published_at, then updated_at, then created_at. */
  function compareNewsByRecency(a, b) {
    function ts(item) {
      var raw = item && (item.publishedAt || item.updatedAt || item.createdAt);
      var n = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(n) ? n : 0;
    }
    return ts(b) - ts(a);
  }

  function sortNewsByRecency(items) {
    return (items || []).slice().sort(compareNewsByRecency);
  }

  // ---------------------------------------------------------------------------
  // Sanitizers — defense in depth against bad input (UI also sanitizes).
  // ---------------------------------------------------------------------------

  function sanitizeIlike(s) {
    return String(s || "")
      .trim()
      .replace(/[%_\\,]/g, "");
  }

  function sanitizeSlug(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
  }

  // ---------------------------------------------------------------------------
  // List columns. We pick narrow SELECTs for listings (fast) and full for detail.
  // ---------------------------------------------------------------------------

  var SELECT_LIST =
    "id,title,slug,short_description,thumbnail_url,status,featured,view_count," +
    "published_at,created_at,updated_at,category_id," +
    "news_categories(id,name,slug)";

  var SELECT_DETAIL =
    "id,title,slug,short_description,thumbnail_url,content,status,featured,view_count," +
    "seo_title,seo_description,seo_keywords,author_email," +
    "published_at,created_at,updated_at,category_id," +
    "news_categories(id,name,slug)";

  // ---------------------------------------------------------------------------
  // Public API.
  // ---------------------------------------------------------------------------

  /** List published articles with pagination + optional category/search filter. */
  async function listPublished(opts) {
    var sb = await requirePublicSupabase();
    opts = opts || {};
    var page = Math.max(1, Number(opts.page) || 1);
    var pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 12));
    var from = (page - 1) * pageSize;
    var to = from + pageSize - 1;

    var q = sb
      .from("news")
      .select(SELECT_LIST, { count: opts.withCount ? "exact" : undefined })
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    var cat = sanitizeSlug(opts.categorySlug);
    if (cat) {
      // Inner join so category slug filter is applied in SQL (uses idx on categories.slug).
      q = sb
        .from("news")
        .select(
          "id,title,slug,short_description,thumbnail_url,status,featured,view_count," +
            "published_at,created_at,updated_at,category_id," +
            "news_categories!inner(id,name,slug)",
          { count: opts.withCount ? "exact" : undefined }
        )
        .eq("status", "published")
        .eq("news_categories.slug", cat)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(from, to);
    }
    var search = sanitizeIlike(opts.search);
    if (search) {
      q = q.or(
        "title.ilike.%" + search + "%,short_description.ilike.%" + search + "%"
      );
    }
    if (opts.signal && typeof q.abortSignal === "function") {
      q = q.abortSignal(opts.signal);
    }

    var res = await q;
    if (res.error) throw res.error;
    return {
      items: (res.data || []).map(rowToListItem),
      total: typeof res.count === "number" ? res.count : null,
      page: page,
      pageSize: pageSize,
    };
  }

  /** Landing hero split — newest article is always the large featured card. */
  async function listForLandingHero(opts) {
    var sb = await requirePublicSupabase();
    opts = opts || {};
    var limitFeatured = Math.max(1, Number(opts.limitFeatured) || 1);
    var limitSecondary = Math.max(1, Number(opts.limitSecondary) || 4);
    var total = limitFeatured + limitSecondary;

    var q = sb
      .from("news")
      .select(SELECT_LIST)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(total);
    if (opts.signal && typeof q.abortSignal === "function") {
      q = q.abortSignal(opts.signal);
    }
    var { data, error } = await q;
    if (error) throw error;

    var items = sortNewsByRecency((data || []).map(rowToListItem));
    return {
      featured: items.slice(0, limitFeatured),
      secondary: items.slice(limitFeatured, limitFeatured + limitSecondary),
    };
  }

  async function fetchDetailFromNetwork(slug) {
    var sb = await requirePublicSupabase();
    var safe = String(slug || "").trim();
    var { data, error } = await sb
      .from("news")
      .select(SELECT_DETAIL)
      .eq("slug", safe)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDetail(data) : null;
  }

  /**
   * Fetch one article by slug (public — published only).
   * Uses memory/session cache; concurrent callers share one in-flight request.
   */
  async function getBySlug(slug, opts) {
    var safe = String(slug || "").trim();
    if (!safe) throw new Error("Thiếu slug bài viết.");
    opts = opts || {};
    if (opts.forceRefresh !== true) {
      var cached = readDetailCache(safe);
      if (cached) return cached;
      if (__detailInFlight[safe]) return __detailInFlight[safe];
    } else {
      clearDetailCache(safe);
    }

    __detailInFlight[safe] = fetchDetailFromNetwork(safe)
      .then(function (article) {
        if (article) writeDetailCache(safe, article);
        return article;
      })
      .finally(function () {
        delete __detailInFlight[safe];
      });
    return __detailInFlight[safe];
  }

  /** Warm cache before navigation (hover / pointerdown on news cards). */
  function prefetchBySlug(slug) {
    var safe = String(slug || "").trim();
    if (!safe) return Promise.resolve(null);
    if (readDetailCache(safe)) return Promise.resolve(readDetailCache(safe));
    return getBySlug(safe).catch(function (e) {
      if (typeof console !== "undefined") console.warn("[TLKVNewsAPI] prefetch failed:", e);
      return null;
    });
  }

  /** Related articles — same category, excluding current id, fallback to recent. */
  async function listRelated(opts) {
    var sb = await requirePublicSupabase();
    var limit = Math.max(1, Math.min(8, Number((opts || {}).limit) || 4));
    var excludeId = (opts || {}).excludeId || null;
    var categoryId = (opts || {}).categoryId || null;

    async function runQuery(withCategory) {
      var q = sb
        .from("news")
        .select(SELECT_LIST)
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (withCategory && categoryId) q = q.eq("category_id", categoryId);
      if (excludeId) q = q.neq("id", excludeId);
      var res = await q;
      if (res.error) throw res.error;
      return (res.data || []).map(rowToListItem);
    }

    if (categoryId) {
      var rows = await runQuery(true);
      if (rows.length > 0) return rows;
    }
    return runQuery(false);
  }

  async function listCategories() {
    var sb = await requirePublicSupabase();
    var { data, error } = await sb
      .from("news_categories")
      .select("id,name,slug,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data || []).map(function (r) {
      return { id: String(r.id), name: String(r.name || ""), slug: String(r.slug || "") };
    });
  }

  /** Anon-safe view counter — calls SECURITY DEFINER RPC defined in news-schema.sql. */
  async function incrementView(slug) {
    var sb = await requirePublicSupabase();
    var safe = String(slug || "").trim();
    if (!safe) return;
    try {
      await sb.rpc("tlkv_news_increment_view", { p_slug: safe });
    } catch (e) {
      // Soft-fail — view counter is non-critical.
      if (typeof console !== "undefined") console.warn("[TLKVNewsAPI] view++ failed:", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Admin-only writes (called from /admin). RLS still gates these server-side.
  // ---------------------------------------------------------------------------

  function buildSlug(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function isUniqueViolation(error) {
    if (!error) return false;
    if (error.code === "23505") return true;
    var msg = String(error.message || error.details || "").toLowerCase();
    return msg.indexOf("duplicate") !== -1 || msg.indexOf("unique") !== -1;
  }

  function resolveSlug(input) {
    var base = buildSlug(input && (input.slug || input.title) ? (input.slug || input.title) : "");
    return base || "tin-tuc";
  }

  /** Insert via PostgREST REST (no supabase-js — avoids getSession hang). */
  async function insertWithSlugRetry(row, slug) {
    var candidate = slug;
    var attempt = 0;
    while (attempt < 3) {
      var payload = cloneRow(row);
      payload.slug = candidate;
      payload.id = newRowId();
      var bytes = JSON.stringify(payload).length;
      apiLog("insert attempt", { slug: candidate, attempt: attempt + 1, bytes: bytes, id: payload.id, via: "rest" });
      if (bytes > 2 * 1024 * 1024) {
        throw new Error(
          "Nội dung bài viết quá lớn (" + Math.round(bytes / 1024) + " KB). Hãy rút gọn nội dung editor."
        );
      }
      var result = await restRequest("POST", "news", payload, {
        prefer: "return=minimal",
        label: "Lưu bài viết",
      });
      if (result.ok) return { id: payload.id, slug: candidate };
      if (isUniqueViolation(result.error) && attempt < 2) {
        candidate = slug + "-" + Date.now();
        attempt += 1;
        continue;
      }
      throw formatDbError(result.error);
    }
    throw new Error("Không tạo được bài viết.");
  }

  /** Admin: list with all statuses + filters + pagination. */
  async function adminList(opts) {
    opts = opts || {};
    var page = Math.max(1, Number(opts.page) || 1);
    var pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 10));
    var offset = (page - 1) * pageSize;

    var parts = [
      "select=" + encodeURIComponent(SELECT_LIST),
      "order=updated_at.desc",
      "offset=" + offset,
      "limit=" + pageSize,
    ];
    if (opts.status && ["draft", "published", "archived"].indexOf(opts.status) !== -1) {
      parts.push("status=eq." + encodeURIComponent(opts.status));
    }
    if (opts.categoryId) {
      parts.push("category_id=eq." + encodeURIComponent(String(opts.categoryId)));
    }
    var search = sanitizeIlike(opts.search);
    if (search) {
      parts.push("or=" + encodeURIComponent("(title.ilike.%" + search + "%,slug.ilike.%" + search + "%)"));
    }

    apiLog("adminList", { page: page, pageSize: pageSize, via: "rest" });
    var result = await restFetchWithCount("news?" + parts.join("&"), {
      label: "Tải danh sách bài viết",
      timeoutMs: 20000,
    });
    return {
      items: (result.data || []).map(rowToListItem),
      total: typeof result.total === "number" ? result.total : null,
      page: page,
      pageSize: pageSize,
    };
  }

  async function adminGetById(id) {
    var safeId = String(id || "").trim();
    if (!safeId) return null;
    apiLog("adminGetById", { id: safeId, via: "rest" });
    var rows = await restFetch(
      "news?id=eq." + encodeURIComponent(safeId) + "&select=" + encodeURIComponent(SELECT_DETAIL),
      { label: "Tải bài viết", timeoutMs: 45000 }
    );
    var row = Array.isArray(rows) && rows.length ? rows[0] : null;
    var detail = row ? rowToDetail(row) : null;
    if (detail) {
      apiLog("adminGetById:done", {
        id: detail.id,
        blocks: detail.content && detail.content.blocks ? detail.content.blocks.length : 0,
      });
    }
    return detail;
  }

  function pickWritable(input, opts) {
    // Temporary: admin SEO inputs are kept in the form only — not persisted to DB.
    var allowed = {
      title: String(input.title || "").slice(0, 500),
      slug: String(input.slug || "").slice(0, 500),
      short_description: String(input.shortDescription || "").slice(0, 2000),
      thumbnail_url: String(input.thumbnailUrl || "").slice(0, 2000),
      content: sanitizeContentForDb(input.content),
      category_id: input.categoryId && String(input.categoryId).trim() ? input.categoryId : null,
      status: ["draft", "published", "archived"].indexOf(input.status) !== -1 ? input.status : "draft",
      featured: input.featured === true,
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
      author_email: String((opts && opts.actorEmail) || "").slice(0, 320),
    };
    return allowed;
  }

  async function adminCreate(input, ctx) {
    apiLog("adminCreate:start");
    var actor = (ctx && ctx.actorEmail) || "";
    var slug = resolveSlug(input);
    var row = pickWritable(Object.assign({}, input, { slug: slug }), { actorEmail: actor });
    apiLog("adminCreate:insert", { title: row.title, status: row.status });
    var inserted = await insertWithSlugRetry(row, slug);
    apiLog("adminCreate:done", { id: inserted.id });
    return detailFromWritable(inserted.id, row, inserted.slug);
  }

  async function adminUpdate(id, input, ctx) {
    apiLog("adminUpdate:start", { id: id });
    var actor = (ctx && ctx.actorEmail) || "";
    var slug = resolveSlug(input);
    apiLog("adminUpdate:slug", slug);
    var row = pickWritable(Object.assign({}, input, { slug: slug }), { actorEmail: actor });
    apiLog("adminUpdate:patch", { id: id, status: row.status, bytes: JSON.stringify(row).length, via: "rest" });
    var result = await restRequest(
      "PATCH",
      "news?id=eq." + encodeURIComponent(String(id)),
      cloneRow(row),
      { prefer: "return=minimal", label: "Cập nhật bài viết" }
    );
    if (!result.ok) {
      if (isUniqueViolation(result.error)) {
        throw new Error('Đường dẫn (slug) "' + slug + '" đã được dùng. Vui lòng chọn slug khác.');
      }
      apiLog("adminUpdate:error", result.error && result.error.message ? result.error.message : result.error);
      throw formatDbError(result.error);
    }
    apiLog("adminUpdate:done", { id: id });
    return detailFromWritable(id, row, slug);
  }

  async function adminDelete(id) {
    var sb = await requireSupabase();
    var { error } = await sb.from("news").delete().eq("id", id);
    if (error) throw error;
  }

  async function adminSetStatus(id, status) {
    var sb = await requireSupabase();
    var safe = ["draft", "published", "archived"].indexOf(status) !== -1 ? status : "draft";
    var patch = { status: safe };
    if (safe === "published") patch.published_at = patch.published_at || null; // trigger handles default
    var { data, error } = await sb.from("news").update(patch).eq("id", id).select(SELECT_DETAIL).single();
    if (error) throw error;
    return rowToDetail(data);
  }

  global.TLKVNewsAPI = {
    // public
    listPublished: listPublished,
    listForLandingHero: listForLandingHero,
    getBySlug: getBySlug,
    prefetchBySlug: prefetchBySlug,
    listRelated: listRelated,
    listCategories: listCategories,
    incrementView: incrementView,
    peekDetailCache: readDetailCache,

    // admin
    adminList: adminList,
    adminGetById: adminGetById,
    adminCreate: adminCreate,
    adminUpdate: adminUpdate,
    adminDelete: adminDelete,
    adminSetStatus: adminSetStatus,

    // helpers
    buildSlug: buildSlug,
    resolveThumbnailFallback: resolveThumbnailFallback,
    resolveThumbnailUrl: resolveThumbnailUrl,
    _getSupabase: getSupabaseClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
