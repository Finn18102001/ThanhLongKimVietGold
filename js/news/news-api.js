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
  // ---------------------------------------------------------------------------
  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
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
    // Accept three flavours: null, EditorJS object, or array of blocks.
    if (!raw) return { blocks: [] };
    if (Array.isArray(raw)) return { blocks: raw };
    if (raw && Array.isArray(raw.blocks)) return { blocks: raw.blocks, time: raw.time, version: raw.version };
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
    var sb = await requireSupabase();
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
      // join filter via embedded resource
      q = q.eq("news_categories.slug", cat);
    }
    var search = sanitizeIlike(opts.search);
    if (search) {
      q = q.or(
        "title.ilike.%" + search + "%,short_description.ilike.%" + search + "%"
      );
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

  /** Featured + recent split — used by the homepage hero block. */
  async function listForLandingHero(opts) {
    var sb = await requireSupabase();
    var limitFeatured = Math.max(1, Number((opts || {}).limitFeatured) || 1);
    var limitSecondary = Math.max(1, Number((opts || {}).limitSecondary) || 4);
    var [{ data: featured, error: e1 }, { data: recent, error: e2 }] = await Promise.all([
      sb
        .from("news")
        .select(SELECT_LIST)
        .eq("status", "published")
        .eq("featured", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limitFeatured),
      sb
        .from("news")
        .select(SELECT_LIST)
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limitSecondary + limitFeatured),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    var featuredItems = (featured || []).map(rowToListItem);
    var recentItems = (recent || []).map(rowToListItem);

    if (featuredItems.length === 0 && recentItems.length > 0) {
      // Promote the latest as hero if no `featured=true` row exists.
      featuredItems = [recentItems[0]];
      recentItems = recentItems.slice(1);
    } else {
      var heroIds = new Set(featuredItems.map(function (x) { return x.id; }));
      recentItems = recentItems.filter(function (x) { return !heroIds.has(x.id); });
    }
    return {
      featured: featuredItems.slice(0, limitFeatured),
      secondary: recentItems.slice(0, limitSecondary),
    };
  }

  /** Fetch one article by slug (public — published only). */
  async function getBySlug(slug) {
    var sb = await requireSupabase();
    var safe = String(slug || "").trim();
    if (!safe) throw new Error("Thiếu slug bài viết.");
    var { data, error } = await sb
      .from("news")
      .select(SELECT_DETAIL)
      .eq("slug", safe)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDetail(data) : null;
  }

  /** Related articles — same category, excluding current id, fallback to recent. */
  async function listRelated(opts) {
    var sb = await requireSupabase();
    var limit = Math.max(1, Math.min(8, Number((opts || {}).limit) || 4));
    var excludeId = (opts || {}).excludeId || null;
    var categoryId = (opts || {}).categoryId || null;

    if (categoryId) {
      var q = sb
        .from("news")
        .select(SELECT_LIST)
        .eq("status", "published")
        .eq("category_id", categoryId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit + (excludeId ? 1 : 0));
      var res = await q;
      if (res.error) throw res.error;
      var rows = (res.data || []).filter(function (r) { return r.id !== excludeId; }).slice(0, limit);
      if (rows.length > 0) return rows.map(rowToListItem);
    }
    // Fallback: most recent (still excluding the current article).
    var fb = await sb
      .from("news")
      .select(SELECT_LIST)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit + (excludeId ? 1 : 0));
    if (fb.error) throw fb.error;
    return (fb.data || []).filter(function (r) { return r.id !== excludeId; }).slice(0, limit).map(rowToListItem);
  }

  async function listCategories() {
    var sb = await requireSupabase();
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
    var sb = await requireSupabase();
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
      { label: "Tải bài viết", timeoutMs: 15000 }
    );
    var row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return row ? rowToDetail(row) : null;
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
    listRelated: listRelated,
    listCategories: listCategories,
    incrementView: incrementView,

    // admin
    adminList: adminList,
    adminGetById: adminGetById,
    adminCreate: adminCreate,
    adminUpdate: adminUpdate,
    adminDelete: adminDelete,
    adminSetStatus: adminSetStatus,

    // helpers
    buildSlug: buildSlug,
    _getSupabase: getSupabaseClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
