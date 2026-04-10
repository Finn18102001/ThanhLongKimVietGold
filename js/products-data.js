(function (global) {
  const STORAGE_KEY = "tlkv_products_v1";

  /** @type {Promise<import("@supabase/supabase-js").SupabaseClient | null> | null} */
  let __sbPromise = null;
  function getSupabaseClient() {
    if (!__sbPromise) {
      __sbPromise = import("/js/supabaseClient.js").then(function (m) {
        return m.supabase;
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
      .subscribe();
  }

  function productDbToApp(r) {
    if (!r || typeof r !== "object") return normalizeItem({});
    const priceRaw = r.price_text ?? r.priceText ?? r.pricetext ?? "";
    return normalizeItem({
      id: r.id,
      name: r.name ?? "",
      category: r.category ?? "",
      priceText: priceRaw,
      image: r.image ?? "",
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
  async function fetchProductsFromSupabase(sb) {
    const { data: rows, error } = await sb.from("products").select("*");
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
      return {
        id: p.id,
        sort_order: idx + 1,
        name: p.name,
        category: p.category || "",
        price_text: p.priceText || "",
        image: p.image || "",
      };
    });
    let eUp = (await sb.from("products").upsert(upsertsWithOrder, { onConflict: "id" })).error;
    if (
      eUp &&
      String(eUp.message || eUp.details || "")
        .toLowerCase()
        .includes("sort_order")
    ) {
      const upsertsPlain = fixed.items.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          category: p.category || "",
          price_text: p.priceText || "",
          image: p.image || "",
        };
      });
      eUp = (await sb.from("products").upsert(upsertsPlain, { onConflict: "id" })).error;
    }
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

  /** Ảnh: URL tuyệt đối giữ nguyên; còn lại là đường dẫn site (thường /assets/...). */
  function resolveProductImageSrc(image) {
    const s = String(image || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return assetUrl(s.replace(/^\//, ""));
    return assetUrl(s);
  }

  function normalizeItem(p) {
    return {
      id: String(
        p.id ||
          (global.crypto && crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2))
      ),
      name: String(p.name ?? ""),
      category: String(p.category ?? ""),
      priceText: String(p.priceText ?? ""),
      image: String(p.image ?? "").trim(),
    };
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

  function saveToStorage(payload) {
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
    } catch (_) {}
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
    try { await sb.auth.getUser(); } catch (_) {}

    var result = await fetchProductsFromSupabase(sb);
    if (result && result.items && result.items.length === 0) {
      await new Promise(function (r) { setTimeout(r, 600); });
      try { await sb.auth.getUser(); } catch (_) {}
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

    const logoSrc = assetUrl("assets/logo-thang-long-kim-viet.png");

    items.forEach(function (p) {
      const card = document.createElement("article");
      card.className = "tlkv-product-card";
      card.setAttribute("role", "listitem");

      const media = document.createElement("div");
      media.className = "tlkv-product-card__media";
      const wm = document.createElement("div");
      wm.className = "tlkv-product-card__watermark";
      const wmImg = document.createElement("img");
      wmImg.src = logoSrc;
      wmImg.alt = "";
      wmImg.className = "tlkv-product-card__watermark-img";
      wm.appendChild(wmImg);
      media.appendChild(wm);

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
        img.addEventListener("error", function () {
          img.remove();
          const ph = document.createElement("span");
          ph.className = "tlkv-product-card__noimg";
          ph.textContent = "Không tải được ảnh";
          imgWrap.appendChild(ph);
        });
        imgWrap.appendChild(img);
      } else {
        const ph = document.createElement("span");
        ph.className = "tlkv-product-card__noimg";
        ph.textContent = "Chưa có ảnh";
        imgWrap.appendChild(ph);
      }
      media.appendChild(imgWrap);
      card.appendChild(media);

      const body = document.createElement("div");
      body.className = "tlkv-product-card__body";
      const nameEl = document.createElement("h3");
      nameEl.className = "tlkv-product-card__name";
      nameEl.textContent = p.name || "";
      body.appendChild(nameEl);
      const priceEl = document.createElement("p");
      priceEl.className = "tlkv-product-card__price";
      priceEl.textContent = p.priceText || "";
      body.appendChild(priceEl);
      card.appendChild(body);

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  async function mountProductList(containerSelector) {
    const el = document.querySelector(containerSelector);
    if (!el) return null;
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
    clearStorage,
    normalizePayload,
    mountProductList,
    renderList,
    renderProductGrid,
    resolveProductImageSrc,
    assetUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
