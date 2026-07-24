(function (global) {
  const STORAGE_KEY = "tlkv_products_v1";
  /** Session-scoped products list (same tab; TTL). */
  const SESSION_CACHE_KEY = "tlkv_products_session_v1";
  /** 2 minutes — products change rarely vs gold prices. */
  const SESSION_CACHE_TTL_MS = 120000;

  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
  }

  function getSessionStorage() {
    try {
      return global.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function isDocumentHidden() {
    try {
      if (typeof document === "undefined" || !document) return false;
      if (typeof document.hidden === "boolean") return document.hidden === true;
      if (document.visibilityState) return document.visibilityState === "hidden";
    } catch (_) {}
    return false;
  }

  function readProductsSessionCache() {
    const ss = getSessionStorage();
    if (!ss) return null;
    try {
      const raw = ss.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      const wrapped = JSON.parse(raw);
      const savedAt = Number(wrapped && wrapped.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > SESSION_CACHE_TTL_MS) {
        ss.removeItem(SESSION_CACHE_KEY);
        return null;
      }
      return normalizePayload(wrapped && wrapped.payload);
    } catch (_) {
      try {
        ss.removeItem(SESSION_CACHE_KEY);
      } catch (_) {}
      return null;
    }
  }

  function writeProductsSessionCache(payload) {
    const ss = getSessionStorage();
    if (!ss || !payload) return;
    try {
      ss.setItem(SESSION_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload: payload }));
    } catch (_) {}
  }

  function clearProductsSessionCache() {
    const ss = getSessionStorage();
    if (!ss) return;
    try {
      ss.removeItem(SESSION_CACHE_KEY);
    } catch (_) {}
  }

  let __productsRealtimeDesired = false;
  let __productsRealtimeStarted = false;
  let __productsPausedForHidden = false;
  let __productsRealtimeLifecycleBound = false;
  let __productsRealtimeSb = null;
  let __productsRealtimeChannel = null;

  function stopProductsRealtime(opts) {
    const permanent = !(opts && opts.permanent === false);
    if (__productsRealtimeSb && __productsRealtimeChannel) {
      try {
        __productsRealtimeSb.removeChannel(__productsRealtimeChannel);
      } catch (_) {}
    }
    __productsRealtimeSb = null;
    __productsRealtimeChannel = null;
    __productsRealtimeStarted = false;
    if (permanent) {
      __productsRealtimeDesired = false;
      __productsPausedForHidden = false;
    }
  }

  function pauseProductsRealtimeForHiddenTab() {
    if (!__productsRealtimeDesired) return;
    if (!__productsRealtimeStarted && !__productsRealtimeChannel) {
      __productsPausedForHidden = true;
      return;
    }
    __productsPausedForHidden = true;
    stopProductsRealtime({ permanent: false });
    if (typeof console !== "undefined" && console.log) {
      console.log("[TLKVProducts] pause Realtime (tab hidden)");
    }
  }

  function resumeProductsRealtimeAfterVisible() {
    if (!__productsRealtimeDesired) return;
    if (!__productsPausedForHidden && (__productsRealtimeStarted || __productsRealtimeChannel)) {
      return;
    }
    __productsPausedForHidden = false;
    if (typeof console !== "undefined" && console.log) {
      console.log("[TLKVProducts] resume Realtime (tab visible)");
    }
    getSupabaseClient().then(function (sb) {
      startProductsRealtime(sb);
      clearProductsSessionCache();
      global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
    });
  }

  function ensureProductsRealtimeLifecycle() {
    if (__productsRealtimeLifecycleBound || typeof global.addEventListener !== "function") return;
    __productsRealtimeLifecycleBound = true;
    global.addEventListener("pagehide", function () {
      stopProductsRealtime({ permanent: true });
    });
    var doc = typeof document !== "undefined" ? document : null;
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("visibilitychange", function () {
        if (isDocumentHidden()) {
          pauseProductsRealtimeForHiddenTab();
        } else {
          resumeProductsRealtimeAfterVisible();
        }
      });
    }
    global.addEventListener("tlkv:products-changed", function () {
      clearProductsSessionCache();
    });
  }

  function startProductsRealtime(sb) {
    __productsRealtimeDesired = true;
    ensureProductsRealtimeLifecycle();

    if (!sb) return;

    if (isDocumentHidden()) {
      __productsPausedForHidden = true;
      if (typeof console !== "undefined" && console.log) {
        console.log("[TLKVProducts] defer Realtime until tab visible");
      }
      return;
    }

    if (__productsRealtimeStarted || __productsRealtimeChannel) return;
    __productsRealtimeStarted = true;
    __productsPausedForHidden = false;

    const notify = function () {
      clearProductsSessionCache();
      global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
    };
    __productsRealtimeSb = sb;
    __productsRealtimeChannel = sb
      .channel("tlkv_public_products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "brands" }, notify);
    __productsRealtimeChannel.subscribe();
  }

  function parsePriceNumeric(priceText) {
    const d = String(priceText || "").replace(/[^0-9]/g, "");
    if (!d) return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  function slugifySimple(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /** Khối lượng vàng (chỉ) — numeric(5,1); null nếu trống hoặc không hợp lệ. */
  function parseProductWeight(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 10) / 10;
  }

  function formatProductWeightDisplay(value) {
    const w = parseProductWeight(value);
    if (w == null) return "—";
    return String(w);
  }

  /** Số nguyên >= 0; null nếu không có giá trị hợp lệ (ô trống / NaN). */
  function coerceSortOrder(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || isNaN(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  async function resolveSortOrderForSave(sb, item) {
    const fromForm = coerceSortOrder(item.sortOrder);
    if (fromForm != null) return fromForm;

    const id = String(item.id || "").trim();
    if (id) {
      const { data: ex, error } = await sb.from("products").select("sort_order").eq("id", id).maybeSingle();
      if (error) throw error;
      const kept = coerceSortOrder(ex && ex.sort_order);
      if (kept != null) return kept;
    }

    const { data: rows, error: eRows } = await sb.from("products").select("sort_order");
    if (eRows) throw eRows;
    let max = 0;
    (rows || []).forEach(function (r) {
      const n = coerceSortOrder(r.sort_order);
      if (n != null && n > max) max = n;
    });
    return max + 1;
  }

  function productDbToApp(r) {
    if (!r || typeof r !== "object") return normalizeItem({});
    const priceRaw = r.price_text ?? r.priceText ?? r.pricetext ?? "";
    const brand = r.brands || null;
    const cat = r.categories || null;
    const thumbnailUrl = pickThumbnailUrlFromRow(r);
    return normalizeItem({
      id: r.id,
      name: r.name ?? "",
      slug: r.slug ?? "",
      category: r.category ?? (cat && cat.name) ?? "",
      categoryId: r.category_id ?? (cat && cat.id) ?? "",
      categorySlug: (cat && cat.slug) || "",
      brandId: r.brand_id ?? (brand && brand.id) ?? "",
      brandName: (brand && brand.name) || "",
      brandSlug: (brand && brand.slug) || "",
      priceText: priceRaw,
      priceNumeric: r.price_numeric != null ? Number(r.price_numeric) : parsePriceNumeric(priceRaw),
      weight: parseProductWeight(r.weight),
      priceSourceProduct:
        r.price_source_product != null
          ? String(r.price_source_product).trim().replace(/\s+/g, " ")
          : null,
      image: r.image ?? "",
      thumbnailUrl: thumbnailUrl,
      sortOrder: r.sort_order,
      isFeatured: !!r.is_featured,
      isBestSeller: !!r.is_best_seller,
      isHot: !!r.is_hot,
      isActive: r.is_active !== false,
    });
  }

  function isSharedStagingProductImageUrl(url) {
    return /\/products\/new\/thumbnail\//i.test(String(url || ""));
  }

  function isProductScopedStorageUrl(url, productId) {
    const id = String(productId || "").trim();
    if (!id || id === "new" || !url) return false;
    return String(url).indexOf("/products/" + id + "/") !== -1;
  }

  function resolveLegacyProductImage(row, rfn) {
    const legacy = String((row && row.image) ?? "").trim();
    if (!legacy) return "";
    const fn = rfn || resolveProductImageSrc;
    return fn ? fn(legacy) : legacy;
  }

  /** Prefer real per-product storage over legacy shared `products/new/thumbnail/` rows. */
  function pickProductDisplayImageUrl(row, rfn) {
    const images = (row && row.product_images) || [];
    let thumbUrl = "";
    let mainImgUrl = "";

    if (images.length) {
      const sorted = images.slice().sort(function (a, b) {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      const thumb = sorted.find(function (i) {
        return i.role === "thumbnail";
      });
      const mainImg = sorted.find(function (i) {
        return i.role === "main";
      });
      const first = thumb || mainImg || sorted[0];
      thumbUrl = thumb && thumb.public_url ? String(thumb.public_url).trim() : "";
      mainImgUrl = mainImg && mainImg.public_url ? String(mainImg.public_url).trim() : "";
      if (!thumbUrl && !mainImgUrl && first && first.public_url) {
        thumbUrl = String(first.public_url).trim();
      }
    }

    const legacy = resolveLegacyProductImage(row, rfn);

    if (thumbUrl && isSharedStagingProductImageUrl(thumbUrl)) {
      if (isProductScopedStorageUrl(legacy, row && row.id)) return legacy;
      if (mainImgUrl && !isSharedStagingProductImageUrl(mainImgUrl)) return mainImgUrl;
      if (legacy && !isSharedStagingProductImageUrl(legacy)) return legacy;
    }

    if (thumbUrl) return thumbUrl;
    if (mainImgUrl) return mainImgUrl;
    return legacy;
  }

  function pickThumbnailUrlFromRow(row) {
    return pickProductDisplayImageUrl(row, resolveProductImageSrc);
  }

  function pathFromProductPublicUrl(publicUrl) {
    const s = String(publicUrl || "").trim();
    const marker = "/storage/v1/object/public/";
    const idx = s.indexOf(marker);
    if (idx === -1) return "";
    const rest = s.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return "";
    return rest.slice(slash + 1);
  }

  async function syncProductThumbnailRecord(sb, productId, publicUrl, storagePath) {
    if (!sb || !productId || !publicUrl) return;
    const path = String(storagePath || pathFromProductPublicUrl(publicUrl) || "").trim();
    const { data: existing, error: eSel } = await sb
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .eq("role", "thumbnail")
      .maybeSingle();
    if (eSel) throw eSel;
    if (existing && existing.id) {
      const { error: eUp } = await sb
        .from("product_images")
        .update({ public_url: publicUrl, storage_path: path || null })
        .eq("id", existing.id);
      if (eUp) throw eUp;
      return;
    }
    const { error: eIns } = await sb.from("product_images").insert({
      product_id: productId,
      role: "thumbnail",
      public_url: publicUrl,
      storage_path: path || null,
      sort_order: 0,
    });
    if (eIns) throw eIns;
  }

  function sortProductRowsClient(rows) {
    const list = (rows || []).slice();
    list.sort(function (a, b) {
      const sa = a.sort_order != null && a.sort_order !== "" ? Number(a.sort_order) : NaN;
      const sb = b.sort_order != null && b.sort_order !== "" ? Number(b.sort_order) : NaN;
      if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
      return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true });
    });
    return list;
  }

  /** Không dùng .order(sort_order) trên query — tránh lỗi cột/không index; sắp xếp sau khi nhận dữ liệu. */
  const PRODUCT_ADMIN_SELECT =
    "*, brands(id, name, slug), categories(id, name, slug), product_images(role, public_url, sort_order)";

  async function fetchProductsFromSupabase(sb) {
    let res = await sb.from("products").select(PRODUCT_ADMIN_SELECT);
    if (res.error && String(res.error.message || "").toLowerCase().includes("product_images")) {
      res = await sb.from("products").select("*, brands(id, name, slug), categories(id, name, slug)");
    }
    if (res.error && String(res.error.message || "").toLowerCase().includes("brands")) {
      res = await sb.from("products").select("*");
    }
    const { data: rows, error } = res;
    if (error) throw error;
    const list = rows || [];
    if (list.length === 0) {
      console.warn(
        "[TLKVProducts] Bảng products trả về 0 dòng. Nếu Table Editor vẫn có dữ liệu: RLS thường chặn SELECT — chạy policy \"Public read products\" trong supabase/rls-admin-email.sql (Supabase → SQL Editor)."
      );
    }
    const sorted = sortProductRowsClient(list);
    const items = sorted.map(productDbToApp);
    if (items.length > 0) {
      console.info("[TLKVProducts] Đã tải " + items.length + " sản phẩm từ Supabase.");
    }
    return normalizePayload({ items: items });
  }

  async function persistProductsToSupabase(sb, payload) {
    const fixed = normalizePayload(payload);
    if (!fixed) return;
    const adminUser = await assertSupabaseAdminSession(sb);
    const { data: existing, error: eEx } = await sb.from("products").select("id");
    throwIfSupabaseWriteError(eEx, adminUser);
    const keep = new Set(
      fixed.items.map(function (p) {
        return p.id;
      })
    );
    for (let i = 0; i < (existing || []).length; i++) {
      const ex = existing[i];
      if (!keep.has(ex.id)) {
        const { error: eDel } = await sb.from("products").delete().eq("id", ex.id);
        throwIfSupabaseWriteError(eDel, adminUser);
      }
    }
    const upsertsWithOrder = fixed.items.map(function (p, idx) {
      const so = coerceSortOrder(p.sortOrder);
      return productAppToDb(p, so != null ? so : idx + 1);
    });
    const { error: eUp } = await sb.from("products").upsert(upsertsWithOrder, { onConflict: "id" });
    throwIfSupabaseWriteError(eUp, adminUser);
  }

  function basePath() {
    return typeof global.TLKV_BASE === "string" ? global.TLKV_BASE : "";
  }

  function assetUrl(relPath) {
    const trimmed = String(relPath || "").replace(/^\//, "");
    const b = basePath();
    if (b === "" || b === "/") return "/" + trimmed;
    return String(b).replace(/\/?$/, "/") + trimmed;
  }

  function resolveProductImageSrc(image) {
    const s = String(image || "").trim();
    if (!s) return '';

    // URL đầy đủ (http/https)
    if (/^https?:\/\//i.test(s)) return s;

    // Supabase Storage URL
    if (s.includes('supabase.co/storage/v1/object/public/')) return s;

    // Đường dẫn từ thư mục assets
    if (s.startsWith('/assets/')) return s;
    if (s.startsWith('assets/')) return '/' + s;

    // Mặc định: coi là tên file trong assets
    return '/assets/' + s;
  }

  function normalizeItem(p) {
    return {
      id: String(
        p.id ||
        (global.crypto && crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2))
      ),
      name: String(p.name ?? ""),
      slug: String(p.slug ?? ""),
      category: String(p.category ?? ""),
      categoryId: p.categoryId ? String(p.categoryId) : "",
      categorySlug: String(p.categorySlug ?? ""),
      brandId: p.brandId ? String(p.brandId) : "",
      brandName: String(p.brandName ?? ""),
      brandSlug: String(p.brandSlug ?? ""),
      priceText: String(p.priceText ?? ""),
      priceNumeric: p.priceNumeric != null ? p.priceNumeric : parsePriceNumeric(p.priceText),
      weight: parseProductWeight(p.weight),
      priceSourceProduct:
        p.priceSourceProduct != null
          ? String(p.priceSourceProduct).trim().replace(/\s+/g, " ")
          : null,
      image: String(p.image ?? "").trim(),
      thumbnailUrl: String(p.thumbnailUrl ?? p.image ?? "").trim(),
      imageStoragePath: String(p.imageStoragePath ?? "").trim(),
      sortOrder: coerceSortOrder(p.sortOrder),
      isFeatured: !!p.isFeatured,
      isBestSeller: !!p.isBestSeller,
      isHot: !!p.isHot,
      isActive: p.isActive !== false,
    };
  }

  function resolvePriceSourceProductForSave(p) {
    var explicit =
      p.priceSourceProduct != null ? String(p.priceSourceProduct).trim().replace(/\s+/g, " ") : "";
    if (explicit) return explicit;
    var weight = parseProductWeight(p.weight);
    if (weight == null) return null;
    var engine = global.TLKVProductPriceEngine;
    if (engine && typeof engine.inferPriceSourceProduct === "function") {
      return engine.inferPriceSourceProduct(p.name, weight);
    }
    return null;
  }

  function productAppToDb(p, sortOrderResolved) {
    const slug = String(p.slug || "").trim() || slugifySimple(p.name) || String(p.id);
    const sortOrder =
      sortOrderResolved != null ? coerceSortOrder(sortOrderResolved) : coerceSortOrder(p.sortOrder);
    const priceSourceProduct = resolvePriceSourceProductForSave(p);
    return {
      id: p.id,
      name: p.name || "",
      slug: slug,
      category: p.category || "",
      price_text: p.priceText || "",
      price_numeric: p.priceNumeric != null ? p.priceNumeric : parsePriceNumeric(p.priceText),
      weight: parseProductWeight(p.weight),
      price_source_product: priceSourceProduct,
      image: p.image || "",
      sort_order: sortOrder != null ? sortOrder : 0,
      brand_id: p.brandId || null,
      category_id: p.categoryId || null,
      is_featured: !!p.isFeatured,
      is_best_seller: !!p.isBestSeller,
      is_hot: !!p.isHot,
      is_active: p.isActive !== false,
    };
  }

  function validateProductForSave(item) {
    if (global.TLKVProductCrud && global.TLKVProductCrud.validateForSave) {
      return global.TLKVProductCrud.validateForSave(item);
    }
    var name = String((item && item.name) || "").trim();
    if (!name) return { ok: false, errors: ["Tên sản phẩm là bắt buộc."] };
    return { ok: true, errors: [] };
  }

  /** Create: slugify + collision suffix. Edit: keep existing slug. */
  async function resolveSlugForSave(item, mode, existingSlug) {
    if (mode === "edit" && existingSlug) return String(existingSlug).trim();
    const base = slugifySimple(item.name) || item.id || "san-pham";
    const sb = await getSupabaseClient();
    if (!sb) return base;
    let candidate = base;
    for (let n = 0; n < 30; n++) {
      const res = await sb.from("products").select("id").eq("slug", candidate).maybeSingle();
      if (res.error) return base;
      if (!res.data || res.data.id === item.id) return candidate;
      candidate = base + "-" + (n + 2);
    }
    return candidate;
  }

  async function getProductById(id) {
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const res = await sb
      .from("products")
      .select("*, brands(id, name, slug), categories(id, name, slug)")
      .eq("id", id)
      .maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    return productDbToApp(res.data);
  }

  function getConfiguredAdminEmails() {
    var raw =
      (global.TLKV_ADMIN_EMAILS && global.TLKV_ADMIN_EMAILS.length && global.TLKV_ADMIN_EMAILS) ||
      (global.__TLKV_SUPABASE__ && global.__TLKV_SUPABASE__.adminEmails) ||
      [];
    return (raw || [])
      .map(function (e) {
        return String(e || "")
          .trim()
          .toLowerCase();
      })
      .filter(Boolean);
  }

  function explainSupabaseRlsError(err, userEmail) {
    var msg = String((err && err.message) || err || "");
    if (!/row-level security|rls/i.test(msg)) return msg;
    var who = userEmail ? "Email đăng nhập: " + userEmail + ". " : "";
    var hint =
      "Supabase từ chối ghi (RLS): chỉ email admin trong SQL mới được INSERT/UPDATE. " +
      "Mở Supabase → SQL Editor → chạy file supabase/tlkv-admin-rls.sql và thêm email của bạn vào hàm tlkv_admin_emails().";
    var configured = getConfiguredAdminEmails();
    if (configured.length) {
      hint += " (Gợi ý client: " + configured.join(", ") + ")";
    }
    return who + hint;
  }

  async function assertSupabaseAdminSession(sb) {
    if (!sb || !sb.auth || typeof sb.auth.getUser !== "function") {
      throw new Error("Supabase chưa cấu hình.");
    }
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    if (!data || !data.user) {
      throw new Error(
        "Chưa đăng nhập admin hoặc phiên đã hết hạn. Vào /admin, đăng nhập lại rồi thử lưu sản phẩm."
      );
    }
    var email = String(data.user.email || "").trim().toLowerCase();
    var allowed = getConfiguredAdminEmails();
    if (allowed.length && email && allowed.indexOf(email) < 0) {
      throw new Error(
        "Email đăng nhập (" +
          data.user.email +
          ") chưa nằm trong TLKV_ADMIN_EMAILS. Cập nhật boot-supabase-env.js và policy SQL (tlkv_admin_emails)."
      );
    }
    return data.user;
  }

  function throwIfSupabaseWriteError(err, user) {
    if (!err) return;
    var email = user && user.email ? user.email : "";
    var wrapped = new Error(explainSupabaseRlsError(err, email));
    wrapped.cause = err;
    throw wrapped;
  }

  async function saveProduct(item, opts) {
    assertProductsAdminWrite();
    opts = opts || {};
    const validation = validateProductForSave(item);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }
    const normalized = normalizeItem(item);
    const mode = opts.mode === "edit" ? "edit" : "create";
    if (mode === "create" && !String(normalized.id || "").trim()) {
      normalized.id =
        global.TLKVProductCrud && global.TLKVProductCrud.resolveProductId
          ? global.TLKVProductCrud.resolveProductId(normalized, "create")
          : "p-" + Date.now();
    }
    normalized.slug = await resolveSlugForSave(normalized, mode, opts.existingSlug || normalized.slug);
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const adminUser = await assertSupabaseAdminSession(sb);
    const sortOrder = await resolveSortOrderForSave(sb, normalized);
    normalized.sortOrder = sortOrder;
    const row = productAppToDb(normalized, sortOrder);
    const { error } = await sb.from("products").upsert(row, { onConflict: "id" });
    throwIfSupabaseWriteError(error, adminUser);
    if (normalized.image) {
      await syncProductThumbnailRecord(
        sb,
        normalized.id,
        normalized.image,
        normalized.imageStoragePath || pathFromProductPublicUrl(normalized.image)
      );
    }
    global.dispatchEvent(new CustomEvent("tlkv:products-changed", { detail: { item: normalized } }));
    return normalized;
  }

  /** Soft delete (recommended): hide from site, keep row + history. */
  async function deactivateProductById(id) {
    assertProductsAdminWrite();
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const adminUser = await assertSupabaseAdminSession(sb);
    const { error } = await sb.from("products").update({ is_active: false, is_featured: false }).eq("id", id);
    throwIfSupabaseWriteError(error, adminUser);
    global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
  }

  /** Hard delete — use only when admin confirms; does not remove storage files. */
  async function deleteProductById(id) {
    assertProductsAdminWrite();
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const adminUser = await assertSupabaseAdminSession(sb);
    const { error } = await sb.from("products").delete().eq("id", id);
    throwIfSupabaseWriteError(error, adminUser);
    global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
  }

  function normalizePayload(raw) {
    if (!raw || !Array.isArray(raw.items)) return null;
    return {
      items: raw.items.map(function (p) {
        return normalizeItem(p);
      }),
    };
  }

  /* ---------- Mock localStorage + JSON — tạm comment, không xóa ----------
  function loadFromStorage() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return null;
      return normalizePayload(JSON.parse(s));
    } catch {
      return null;
    }
  }

  function saveToStorageLocal(payload) {
    const fixed = normalizePayload(payload);
    if (!fixed) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
    global.dispatchEvent(new CustomEvent("tlkv:products-changed", { detail: fixed }));
  }

  async function fetchDefaultJson() {
    const url = assetUrl("data/products.json");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load " + url);
    const raw = await res.json();
    return normalizePayload(raw);
  }

  async function getProductsFromJsonAndStorage() {
    const stored = loadFromStorage();
    if (stored && Array.isArray(stored.items) && stored.items.length > 0) {
      return stored;
    }
    try {
      const def = await fetchDefaultJson();
      if (stored && Array.isArray(stored.items) && stored.items.length === 0) {
        return def;
      }
      return stored || def;
    } catch (e) {
      if (stored) return stored;
      throw e;
    }
  }
  ---------- end mock localStorage + JSON ---------- */

  function loadFromStorage() {
    return null;
  }

  function assertProductsAdminWrite() {
    let p = "";
    try {
      p = global.location && global.location.pathname ? String(global.location.pathname) : "";
    } catch (_) {}
    if (!/\/admin(\/|$)/.test(p)) {
      throw new Error("Chỉ trang /admin mới được lưu hoặc xóa sản phẩm trên Supabase.");
    }
  }

  function saveToStorage(payload) {
    assertProductsAdminWrite();
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(
          new Error(
            "Supabase chưa cấu hình: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
          )
        );
      }
      return persistProductsToSupabase(sb, payload).then(function () {
        global.dispatchEvent(new CustomEvent("tlkv:products-changed", { detail: payload }));
      });
    });
  }

  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) { }
    clearProductsSessionCache();
    global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
  }

  async function fetchDefaultJson() {
    throw new Error("fetchDefaultJson đã tắt — dùng Supabase (bảng products).");
  }

  async function getProducts(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.forceRefresh !== true) {
      const cached = readProductsSessionCache();
      if (cached) return cached;
    } else {
      clearProductsSessionCache();
    }

    const sb = await getSupabaseClient();
    if (!sb) {
      throw new Error(
        "Thiếu cấu hình Supabase: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
      );
    }
    try { await sb.auth.getUser(); } catch (_) { }

    var result = await fetchProductsFromSupabase(sb);
    if (result && result.items && result.items.length === 0) {
      await new Promise(function (r) { setTimeout(r, 600); });
      try { await sb.auth.getUser(); } catch (_) { }
      result = await fetchProductsFromSupabase(sb);
    }
    if (result) writeProductsSessionCache(result);
    return result;
  }

  function renderList(ul, items) {
    if (!ul) return;
    ul.innerHTML = "";
    if (!items || !items.length) {
      ul.innerHTML = "<li>Chưa có sản phẩm nào.</li>";
      return;
    }
    items.forEach(function (p) {
      const li = document.createElement("li");
      li.textContent =
        (p.name || "") + (p.category ? " — " + p.category : "") + (p.priceText ? " — " + p.priceText : "");
      ul.appendChild(li);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Lưới thẻ sản phẩm (tối đa 4 cột), phong cách gần với khối "Sản phẩm bán chạy" baotinmanhhai.vn/san-pham.
   */
  function renderProductGrid(container, items) {
    if (!container) return;
    container.innerHTML = "";

    if (!items || !items.length) {
      const empty = document.createElement("p");
      empty.className = "tlkv-product-empty";
      empty.textContent = "Chưa có sản phẩm nào.";
      container.appendChild(empty);
      return;
    }

    const title = document.createElement("h2");
    title.className = "tlkv-bestseller-title";
    title.id = "tlkv-bestseller-heading";
    title.textContent = "SẢN PHẨM BÁN CHẠY";
    container.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "tlkv-product-grid";
    grid.setAttribute("role", "list");

    // Placeholder ảnh khi lỗi
    const placeholderImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f5f5f5'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='14' fill='%23999'%3E📷%3C/text%3E%3C/svg%3E";

    items.forEach(function (p) {
      const card = document.createElement("article");
      card.className = "tlkv-product-card";
      card.setAttribute("role", "listitem");

      // Image wrapper
      const imgWrap = document.createElement("div");
      imgWrap.className = "tlkv-product-card__img-wrap";

      const src = resolveProductImageSrc(p.thumbnailUrl || p.image);

      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = p.name || "Sản phẩm";
        img.className = "tlkv-product-card__img";
        img.loading = "lazy";
        img.decoding = "async";

        img.onerror = function () {
          this.onerror = null;
          this.src = placeholderImage;
        };

        imgWrap.appendChild(img);
      } else {
        const noImg = document.createElement("div");
        noImg.className = "tlkv-product-card__noimg";
        noImg.textContent = "📷";
        imgWrap.appendChild(noImg);
      }

      card.appendChild(imgWrap);

      // Body
      const body = document.createElement("div");
      body.className = "tlkv-product-card__body";

      const nameEl = document.createElement("h3");
      nameEl.className = "tlkv-product-card__name";
      nameEl.textContent = p.name || "";
      body.appendChild(nameEl);

      const priceEl = document.createElement("p");
      priceEl.className = "tlkv-product-card__price";
      priceEl.textContent = p.priceText || "Liên hệ";
      body.appendChild(priceEl);

      card.appendChild(body);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  async function mountProductList(containerSelector) {
    const el = document.querySelector(containerSelector);
    if (!el) return null;
    if (global.TLKVCatalogPage && typeof global.TLKVCatalogPage.mountCatalogPage === "function") {
      try {
        // Public catalog: fetch-only — no products Realtime (egress WS).
        return await global.TLKVCatalogPage.mountCatalogPage(el);
      } catch (e) {
        console.warn("[TLKVProducts] catalog mount failed, legacy grid:", e);
      }
    }
    try {
      const data = await getProducts();
      renderProductGrid(el, data && data.items);
      // Legacy public grid: also fetch-only (admin uses save events / refresh).
      return data;
    } catch (e) {
      console.error(e);
      el.innerHTML = "";
      const p = document.createElement("p");
      p.className = "tlkv-product-empty";
      p.textContent =
        "Không tải được danh sách sản phẩm từ Supabase. Kiểm tra .env, RLS (SELECT cho anon), bảng products và Realtime. Chi tiết: " +
        (e && e.message ? e.message : String(e));
      el.appendChild(p);
      return null;
    }
  }

  global.TLKVProducts = {
    STORAGE_KEY,
    SESSION_CACHE_KEY,
    SESSION_CACHE_TTL_MS,
    getProducts,
    fetchDefaultJson,
    loadFromStorage,
    saveToStorage,
    saveProduct,
    validateProductForSave,
    resolveSlugForSave,
    getProductById,
    deactivateProductById,
    deleteProductById,
    clearStorage,
    normalizePayload,
    normalizeItem,
    productAppToDb,
    parsePriceNumeric,
    parseProductWeight,
    formatProductWeightDisplay,
    slugifySimple,
    coerceSortOrder,
    mountProductList,
    renderList,
    renderProductGrid,
    resolveProductImageSrc,
    pickProductDisplayImageUrl,
    isSharedStagingProductImageUrl,
    assetUrl,
    startProductsRealtime,
    stopProductsRealtime,
    isProductsRealtimeDesired: function () {
      return __productsRealtimeDesired === true;
    },
    isProductsRealtimePausedForHidden: function () {
      return __productsPausedForHidden === true;
    },
    isProductsRealtimeActive: function () {
      return !!__productsRealtimeChannel;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
