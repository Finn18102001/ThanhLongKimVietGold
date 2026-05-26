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

  /** Make sure the slug is unique by appending `-2`, `-3`, … if needed. */
  async function ensureUniqueSlug(slug, excludeId) {
    var sb = await requireSupabase();
    var base = buildSlug(slug);
    if (!base) base = "tin-tuc";
    var candidate = base;
    var i = 2;
    while (true) {
      var q = sb.from("news").select("id,slug").eq("slug", candidate).limit(1);
      var { data, error } = await q;
      if (error) throw error;
      var taken = (data || []).find(function (r) { return r.id !== excludeId; });
      if (!taken) return candidate;
      candidate = base + "-" + i;
      i += 1;
      if (i > 200) return base + "-" + Date.now();
    }
  }

  /** Admin: list with all statuses + filters + pagination. */
  async function adminList(opts) {
    var sb = await requireSupabase();
    opts = opts || {};
    var page = Math.max(1, Number(opts.page) || 1);
    var pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 10));
    var from = (page - 1) * pageSize;
    var to = from + pageSize - 1;

    var q = sb
      .from("news")
      .select(SELECT_LIST, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (opts.status && ["draft", "published", "archived"].indexOf(opts.status) !== -1) {
      q = q.eq("status", opts.status);
    }
    if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
    var search = sanitizeIlike(opts.search);
    if (search) {
      q = q.or("title.ilike.%" + search + "%,slug.ilike.%" + search + "%");
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

  async function adminGetById(id) {
    var sb = await requireSupabase();
    var { data, error } = await sb
      .from("news")
      .select(SELECT_DETAIL)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDetail(data) : null;
  }

  function pickWritable(input, opts) {
    var allowed = {
      title: String(input.title || "").slice(0, 500),
      slug: String(input.slug || "").slice(0, 500),
      short_description: String(input.shortDescription || "").slice(0, 2000),
      thumbnail_url: String(input.thumbnailUrl || "").slice(0, 2000),
      content: input.content && typeof input.content === "object" ? input.content : { blocks: [] },
      category_id: input.categoryId || null,
      status: ["draft", "published", "archived"].indexOf(input.status) !== -1 ? input.status : "draft",
      featured: input.featured === true,
      seo_title: String(input.seoTitle || "").slice(0, 500),
      seo_description: String(input.seoDescription || "").slice(0, 1000),
      seo_keywords: String(input.seoKeywords || "").slice(0, 500),
      author_email: String((opts && opts.actorEmail) || "").slice(0, 320),
    };
    return allowed;
  }

  async function adminCreate(input, ctx) {
    var sb = await requireSupabase();
    var actor = (ctx && ctx.actorEmail) || "";
    var slug = await ensureUniqueSlug(input.slug || input.title || "", null);
    var row = pickWritable(Object.assign({}, input, { slug: slug }), { actorEmail: actor });
    var { data, error } = await sb.from("news").insert(row).select(SELECT_DETAIL).single();
    if (error) throw error;
    return rowToDetail(data);
  }

  async function adminUpdate(id, input, ctx) {
    var sb = await requireSupabase();
    var actor = (ctx && ctx.actorEmail) || "";
    var slug = await ensureUniqueSlug(input.slug || input.title || "", id);
    var row = pickWritable(Object.assign({}, input, { slug: slug }), { actorEmail: actor });
    var { data, error } = await sb.from("news").update(row).eq("id", id).select(SELECT_DETAIL).single();
    if (error) throw error;
    return rowToDetail(data);
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
    ensureUniqueSlug: ensureUniqueSlug,

    // helpers
    buildSlug: buildSlug,
    _getSupabase: getSupabaseClient,
  };
})(typeof window !== "undefined" ? window : globalThis);
