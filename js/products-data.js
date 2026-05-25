(function (global) {
  const STORAGE_KEY = "tlkv_products_v1";

  /** @type {Promise<import("@supabase/supabase-js").SupabaseClient | null> | null} */
  let __sbPromise = null;
  function getSupabaseClient() {
    if (!__sbPromise) {
      __sbPromise = Promise.resolve().then(function () {
        const cfg =
          typeof globalThis !== "undefined" && globalThis.__TLKV_SUPABASE__
            ? globalThis.__TLKV_SUPABASE__
            : { url: "", anonKey: "" };
        const url = String(cfg.url || "").trim();
        const anonKey = String(cfg.anonKey || "").trim();
        const sdk = typeof globalThis !== "undefined" ? globalThis.supabase : null;
        if (!url || !anonKey || !sdk || typeof sdk.createClient !== "function") return null;
        return sdk.createClient(url, anonKey);
      });
    }
    return __sbPromise;
  }

  let __productsRealtimeStarted = false;
  function startProductsRealtime(sb) {
    if (__productsRealtimeStarted || !sb) return;
    __productsRealtimeStarted = true;
    const notify = function () {
      global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
    };
    sb.channel("tlkv_public_products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "brands" }, notify)
      .subscribe();
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
      image: r.image ?? "",
      sortOrder: r.sort_order,
      isFeatured: !!r.is_featured,
      isBestSeller: !!r.is_best_seller,
      isHot: !!r.is_hot,
      isActive: r.is_active !== false,
    });
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
    const { data: existing, error: eEx } = await sb.from("products").select("id");
    if (eEx) throw eEx;
    const keep = new Set(
      fixed.items.map(function (p) {
        return p.id;
      })
    );
    for (let i = 0; i < (existing || []).length; i++) {
      const ex = existing[i];
      if (!keep.has(ex.id)) {
        const { error: eDel } = await sb.from("products").delete().eq("id", ex.id);
        if (eDel) throw eDel;
      }
    }
    const upsertsWithOrder = fixed.items.map(function (p, idx) {
      const so = coerceSortOrder(p.sortOrder);
      return productAppToDb(p, so != null ? so : idx + 1);
    });
    const { error: eUp } = await sb.from("products").upsert(upsertsWithOrder, { onConflict: "id" });
    if (eUp) throw eUp;
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
      image: String(p.image ?? "").trim(),
      sortOrder: coerceSortOrder(p.sortOrder),
      isFeatured: !!p.isFeatured,
      isBestSeller: !!p.isBestSeller,
      isHot: !!p.isHot,
      isActive: p.isActive !== false,
    };
  }

  function productAppToDb(p, sortOrderResolved) {
    const slug = String(p.slug || "").trim() || slugifySimple(p.name) || String(p.id);
    const sortOrder =
      sortOrderResolved != null ? coerceSortOrder(sortOrderResolved) : coerceSortOrder(p.sortOrder);
    return {
      id: p.id,
      name: p.name || "",
      slug: slug,
      category: p.category || "",
      price_text: p.priceText || "",
      price_numeric: p.priceNumeric != null ? p.priceNumeric : parsePriceNumeric(p.priceText),
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

  async function saveProduct(item) {
    assertProductsAdminWrite();
    const normalized = normalizeItem(item);
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const sortOrder = await resolveSortOrderForSave(sb, normalized);
    normalized.sortOrder = sortOrder;
    const row = productAppToDb(normalized, sortOrder);
    const { error } = await sb.from("products").upsert(row, { onConflict: "id" });
    if (error) throw error;
    if (global.TLKVCatalogApi && global.TLKVCatalogApi.invalidateHomeCache) {
      global.TLKVCatalogApi.invalidateHomeCache();
    }
    global.dispatchEvent(new CustomEvent("tlkv:products-changed", { detail: { item: normalized } }));
    return normalized;
  }

  async function deleteProductById(id) {
    assertProductsAdminWrite();
    const sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");
    const { error } = await sb.from("products").delete().eq("id", id);
    if (error) throw error;
    if (global.TLKVCatalogApi && global.TLKVCatalogApi.invalidateHomeCache) {
      global.TLKVCatalogApi.invalidateHomeCache();
    }
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
    global.dispatchEvent(new CustomEvent("tlkv:products-changed"));
  }

  async function fetchDefaultJson() {
    throw new Error("fetchDefaultJson đã tắt — dùng Supabase (bảng products).");
  }

  async function getProducts() {
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

      const src = resolveProductImageSrc(p.image);

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
        const result = await global.TLKVCatalogPage.mountCatalogPage(el);
        const sb = await getSupabaseClient();
        startProductsRealtime(sb);
        return result;
      } catch (e) {
        console.warn("[TLKVProducts] catalog mount failed, legacy grid:", e);
      }
    }
    try {
      const data = await getProducts();
      renderProductGrid(el, data && data.items);
      const sb = await getSupabaseClient();
      startProductsRealtime(sb);
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
    getProducts,
    fetchDefaultJson,
    loadFromStorage,
    saveToStorage,
    saveProduct,
    deleteProductById,
    clearStorage,
    normalizePayload,
    normalizeItem,
    productAppToDb,
    parsePriceNumeric,
    slugifySimple,
    coerceSortOrder,
    mountProductList,
    renderList,
    renderProductGrid,
    resolveProductImageSrc,
    assetUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
