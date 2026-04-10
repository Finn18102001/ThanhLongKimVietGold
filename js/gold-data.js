(function (global) {
  const STORAGE_KEY = "tlkv_gold_table_v1";

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

  let __goldRealtimeStarted = false;
  function startGoldTableRealtime(sb) {
    if (__goldRealtimeStarted || !sb) return;
    __goldRealtimeStarted = true;
    const notify = function () {
      global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
    };
    sb.channel("tlkv_public_gold")
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_meta" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_price_rows" }, notify)
      .subscribe();
  }

  /** Hiển thị: số trong DB → chuỗi kiểu 15.600.000 */
  function formatPriceDisplay(value, metal) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (metal === "silver" && n === 0) return "";
    const abs = Math.abs(Math.round(n));
    return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /** Lưu DB: chuỗi hiển thị → số; rỗng → null */
  function parsePriceToNumber(s) {
    const t = String(s ?? "").trim();
    if (!t) return null;
    const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function metaRowToApp(row) {
    if (!row || typeof row !== "object") return {};
    return {
      headerTime: String(row.header_time ?? ""),
      footerNote: String(row.footer_note ?? ""),
      unitLine: String(row.unit_line ?? ""),
      brandItalic: String(row.brand_italic ?? ""),
    };
  }

  function priceRowDbToApp(r) {
    return normalizeRow({
      id: r.id,
      brand: r.brand,
      product: r.product ?? "",
      purity: r.purity ?? "",
      buy: formatPriceDisplay(r.buy, r.metal),
      sell: formatPriceDisplay(r.sell, r.metal),
      metal: r.metal,
      highlight: r.highlight === true,
    });
  }

  async function fetchGoldFromSupabase(sb) {
    const { data: metaRow, error: e1 } = await sb.from("gold_meta").select("*").eq("id", 1).maybeSingle();
    if (e1) throw e1;
    const { data: rowList, error: e2 } = await sb.from("gold_price_rows").select("*").order("sort_order", { ascending: true });
    if (e2) throw e2;
    const meta = normalizeMeta(metaRowToApp(metaRow));
    const rows = (rowList || []).map(priceRowDbToApp);
    return normalizePayload({ meta: meta, rows: rows });
  }

  /** Chỉ cập nhật gold_meta (một request) — dùng khi admin bấm "Lưu meta". */
  async function persistGoldMetaToSupabase(sb, meta) {
    const m = normalizeMeta(meta || {});
    const { error: eMeta } = await sb.from("gold_meta").upsert(
      {
        id: 1,
        header_time: m.headerTime,
        footer_note: m.footerNote,
        unit_line: m.unitLine,
        brand_italic: m.brandItalic,
      },
      { onConflict: "id" }
    );
    if (eMeta) throw eMeta;
  }

  /** Chỉ đồng bộ gold_price_rows (không đụng gold_meta). */
  async function persistGoldRowsToSupabase(sb, rowsNormalized) {
    const rows = rowsNormalized || [];
    const { data: existing, error: eEx } = await sb.from("gold_price_rows").select("id");
    if (eEx) throw eEx;
    const keep = new Set(
      rows.map(function (r) {
        return r.id;
      })
    );
    for (let i = 0; i < (existing || []).length; i++) {
      const ex = existing[i];
      if (!keep.has(ex.id)) {
        const { error: eDel } = await sb.from("gold_price_rows").delete().eq("id", ex.id);
        if (eDel) throw eDel;
      }
    }

    const upserts = rows.map(function (r, idx) {
      return {
        id: r.id,
        sort_order: idx + 1,
        brand: r.brand,
        product: r.product || "",
        purity: r.purity || "",
        buy: parsePriceToNumber(r.buy) ?? 0,
        sell: parsePriceToNumber(r.sell) ?? 0,
        metal: r.metal,
        highlight: r.highlight === true,
      };
    });
    if (upserts.length === 0) return;
    const { error: eUp } = await sb.from("gold_price_rows").upsert(upserts, { onConflict: "id" });
    if (eUp) throw eUp;
  }

  async function persistGoldToSupabase(sb, payload) {
    const fixed = normalizePayload({ meta: payload.meta || {}, rows: payload.rows || [] });
    if (!fixed) return;
    await persistGoldMetaToSupabase(sb, fixed.meta);
    await persistGoldRowsToSupabase(sb, fixed.rows);
  }

  function brandsMatch(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  /**
   * Chèn dòng vàng: nếu thương hiệu đã có (so khớp không phân biệt hoa thường) → chèn ngay sau khối liên tiếp đầu tiên cùng thương hiệu;
   * nếu thương hiệu mới → chèn ngay trước dòng bạc đầu tiên (hoặc cuối nếu không có bạc).
   */
  /** Dòng product rỗng: tên hiển thị lấy từ dòng cùng thương hiệu phía trên gần nhất có product. */
  function variantParentProduct(rows, index) {
    const r = rows[index];
    if (!r || String(r.product || "").trim()) return "";
    let i = index - 1;
    if (r.metal === "silver") {
      while (i >= 0 && rows[i].metal === "silver" && brandsMatch(rows[i].brand, r.brand)) {
        const p = String(rows[i].product || "").trim();
        if (p) return p;
        i--;
      }
      return "";
    }
    while (i >= 0 && rows[i].metal !== "silver" && brandsMatch(rows[i].brand, r.brand)) {
      const p = String(rows[i].product || "").trim();
      if (p) return p;
      i--;
    }
    return "";
  }

  /**
   * Vị trí chèn trong khối cùng thương hiệu [blockFirst..blockEnd]: sau nhóm SP trùng tên (cuối cùng),
   * hoặc sau hàng cuối khối nếu tên SP mới.
   */
  function findInsertIndexInBrandBlock(rows, blockFirst, blockEnd, productName) {
    const target = String(productName || "").trim().toLowerCase();
    if (!target) return blockEnd + 1;
    let lastMatchAfter = -1;
    let k = blockFirst;
    while (k <= blockEnd) {
      const label = String(rows[k].product || "").trim();
      let m = k + 1;
      if (label) {
        while (m <= blockEnd && !String(rows[m].product || "").trim()) m++;
        if (label.toLowerCase() === target) {
          lastMatchAfter = m;
        }
        k = m;
      } else {
        k = k + 1;
      }
    }
    return lastMatchAfter >= 0 ? lastMatchAfter : blockEnd + 1;
  }

  /** Thêm dòng vàng: đã có cùng tên SP trong khối TH phía trên điểm chèn → lưu product "". */
  function coalesceProductForNewGoldRow(rows, insertIndex, row) {
    if (row.metal === "silver" || !String(row.product || "").trim()) return row;
    const target = String(row.product).trim().toLowerCase();
    const b = row.brand;
    for (let i = 0; i < insertIndex; i++) {
      const cur = rows[i];
      if (cur.metal === "silver" || !brandsMatch(cur.brand, b)) continue;
      const p = String(cur.product || "").trim();
      if (p && p.toLowerCase() === target) {
        return Object.assign({}, row, { product: "" });
      }
    }
    return row;
  }

  /** Thêm dòng bạc: cùng quy tắc gộp tên SP như vàng. */
  function coalesceProductForNewSilverRow(rows, insertIndex, row) {
    if (row.metal !== "silver" || !String(row.product || "").trim()) return row;
    const target = String(row.product).trim().toLowerCase();
    const b = row.brand;
    for (let i = 0; i < insertIndex; i++) {
      const cur = rows[i];
      if (cur.metal !== "silver" || !brandsMatch(cur.brand, b)) continue;
      const p = String(cur.product || "").trim();
      if (p && p.toLowerCase() === target) {
        return Object.assign({}, row, { product: "" });
      }
    }
    return row;
  }

  function insertGoldRow(rows, row) {
    const out = rows.slice();
    const b = row.brand;
    let blockFirst = -1;
    let blockEnd = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i].metal === "silver") break;
      if (brandsMatch(out[i].brand, b)) {
        if (blockFirst < 0) blockFirst = i;
        blockEnd = i;
      } else if (blockFirst >= 0) {
        break;
      }
    }
    if (blockFirst >= 0) {
      const pname = String(row.product || "").trim();
      const insertIdx = findInsertIndexInBrandBlock(out, blockFirst, blockEnd, pname);
      row = coalesceProductForNewGoldRow(out, insertIdx, row);
      out.splice(insertIdx, 0, row);
      return out;
    }
    const firstSilver = out.findIndex(function (r) {
      return r.metal === "silver";
    });
    if (firstSilver === -1) {
      row = coalesceProductForNewGoldRow(out, out.length, row);
      out.push(row);
    } else {
      row = coalesceProductForNewGoldRow(out, firstSilver, row);
      out.splice(firstSilver, 0, row);
    }
    return out;
  }

  /**
   * Chèn dòng bạc: cùng thương hiệu → sau khối TH đó (hoặc sau nhóm SP trùng tên); thương hiệu mới → cuối bạc.
   */
  function insertSilverRow(rows, row) {
    const out = rows.slice();
    const b = row.brand;
    const firstSilver = out.findIndex(function (r) {
      return r.metal === "silver";
    });
    if (firstSilver === -1) {
      row = coalesceProductForNewSilverRow(out, out.length, row);
      out.push(row);
      return out;
    }
    let blockFirst = -1;
    let blockEnd = -1;
    for (let i = firstSilver; i < out.length; i++) {
      if (out[i].metal !== "silver") break;
      if (brandsMatch(out[i].brand, b)) {
        if (blockFirst < 0) blockFirst = i;
        blockEnd = i;
      } else if (blockFirst >= 0) {
        break;
      }
    }
    if (blockFirst < 0) {
      let lastSi = out.length - 1;
      while (lastSi >= 0 && out[lastSi].metal !== "silver") lastSi--;
      const insertIdx = lastSi + 1;
      row = coalesceProductForNewSilverRow(out, insertIdx, row);
      out.splice(insertIdx, 0, row);
      return out;
    }
    const pname = String(row.product || "").trim();
    const insertIdx = findInsertIndexInBrandBlock(out, blockFirst, blockEnd, pname);
    row = coalesceProductForNewSilverRow(out, insertIdx, row);
    out.splice(insertIdx, 0, row);
    return out;
  }

  /**
   * Duyệt từng dòng dữ liệu với cùng quy tắc gộp ô TH / Sản phẩm như bảng public.
   * fn({ row, showBrand, brandRowspan, showProduct, productRowspan, productLabel })
   */
  function walkMergedGoldRows(rows, fn) {
    if (!rows || !rows.length) return;
    let i = 0;
    while (i < rows.length) {
      const brand = rows[i].brand;
      let j = i;
      while (j < rows.length && brandsMatch(rows[j].brand, brand)) j++;
      const brandSpan = j - i;
      let k = i;
      while (k < j) {
        const label = String(rows[k].product || "").trim();
        let m = k + 1;
        if (label) {
          while (m < j && !String(rows[m].product || "").trim()) m++;
        } else {
          m = k + 1;
        }
        const productSpan = m - k;
        for (let t = k; t < m; t++) {
          fn({
            row: rows[t],
            showBrand: t === i,
            brandRowspan: brandSpan,
            showProduct: t === k,
            productRowspan: productSpan,
            productLabel: label,
          });
        }
        k = m;
      }
      i = j;
    }
  }

  /** Bạc luôn xuống cuối bảng; thứ tự vàng giữ nguyên tương đối. */
  function orderRowsForTable(rows) {
    const gold = [];
    const silver = [];
    rows.forEach(function (r) {
      if (r.metal === "silver") silver.push(r);
      else gold.push(r);
    });
    return gold.concat(silver);
  }

  const META_DEFAULTS = {
    headerTime: "10h00",
    footerNote: "Cập nhật lúc 10:00 09/04/2026",
    unitLine: "ĐVT = Đồng/chỉ",
    brandItalic: "THĂNG LONG KIM VIỆT",
  };

  function escapeMetaHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeMeta(m) {
    const x = m && typeof m === "object" ? m : {};
    return {
      headerTime: String(x.headerTime ?? META_DEFAULTS.headerTime),
      footerNote: String(x.footerNote ?? META_DEFAULTS.footerNote),
      unitLine: String(x.unitLine ?? META_DEFAULTS.unitLine),
      brandItalic: String(x.brandItalic ?? META_DEFAULTS.brandItalic),
    };
  }

  function normalizeRow(r) {
    const brand = String(r.brand ?? "").trim();
    let metal = r.metal === "silver" ? "silver" : "gold";
    if (brandsMatch(brand, "Bạc")) {
      metal = "silver";
    }
    let purity = String(r.purity ?? "");
    if (metal === "silver") {
      purity = purity.replace(/,/g, ".");
    }
    return {
      id: String(
        r.id || (global.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2))
      ),
      brand: brand,
      product: String(r.product ?? ""),
      purity: purity,
      buy: String(r.buy ?? "").trim(),
      sell: String(r.sell ?? "").trim(),
      metal: metal,
      highlight: r.highlight === true,
    };
  }

  function normalizePayload(raw) {
    if (!raw || !Array.isArray(raw.rows)) return null;
    return {
      meta: normalizeMeta(raw.meta),
      rows: orderRowsForTable(raw.rows.map((r) => normalizeRow(r))),
    };
  }

  /* ---------- Mock localStorage (JSON) — tạm comment, không xóa ----------
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
    const fixed = normalizePayload({ meta: payload.meta || {}, rows: payload.rows || [] });
    if (!fixed) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: fixed }));
  }

  function clearStorageLocal() {
    localStorage.removeItem(STORAGE_KEY);
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
  }
  ---------- end mock localStorage ---------- */

  /** Ghi bảng giá lên Supabase (admin): meta + toàn bộ dòng. Trả về Promise. */
  function saveToStorage(payload) {
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(
          new Error(
            "Supabase chưa cấu hình: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
          )
        );
      }
      return persistGoldToSupabase(sb, payload).then(function () {
        global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: payload }));
      });
    });
  }

  /**
   * Chỉ lưu khối "Thời gian & đơn vị" (gold_meta) — không gọi upsert gold_price_rows.
   */
  function saveGoldMetaOnly(meta) {
    return getSupabaseClient().then(function (sb) {
      if (!sb) {
        return Promise.reject(
          new Error(
            "Supabase chưa cấu hình: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
          )
        );
      }
      return persistGoldMetaToSupabase(sb, meta).then(function () {
        global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed", { detail: { metaOnly: true } }));
      });
    });
  }

  /** Xóa key localStorage cũ (nếu có) và báo làm mới UI — không xóa dữ liệu Supabase. */
  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
  }

  /** Stub: mock localStorage đã tắt; luôn null. */
  function loadFromStorage() {
    return null;
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

  /* ---------- Mock JSON file — tạm comment ----------
  async function fetchDefaultJson() {
    const url = assetUrl("data/gold-table.json");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load " + url);
    const raw = await res.json();
    return normalizePayload(raw);
  }

  async function getGoldTableFromJsonAndStorage() {
    const stored = loadFromStorage();
    if (stored && Array.isArray(stored.rows) && stored.rows.length > 0) {
      return stored;
    }
    try {
      const def = await fetchDefaultJson();
      if (stored && Array.isArray(stored.rows) && stored.rows.length === 0) {
        return def;
      }
      return stored || def;
    } catch (e) {
      if (stored) return stored;
      throw e;
    }
  }
  ---------- end mock JSON ---------- */

  async function fetchDefaultJson() {
    throw new Error("fetchDefaultJson đã tắt — dùng Supabase (gold_meta + gold_price_rows).");
  }

  async function getGoldTable() {
    const sb = await getSupabaseClient();
    if (!sb) {
      throw new Error(
        "Thiếu cấu hình Supabase: đặt NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_URL + SUPABASE_ANON_KEY) trong .env / .env.local, rồi chạy npm start."
      );
    }
    return fetchGoldFromSupabase(sb);
  }

  function applyMetaToDom(meta) {
    if (!meta) return;
    const m = normalizeMeta(meta);
    const ht = m.headerTime || META_DEFAULTS.headerTime;
    const ul = m.unitLine || META_DEFAULTS.unitLine;
    const bi = m.brandItalic || META_DEFAULTS.brandItalic;
    const fn = m.footerNote || META_DEFAULTS.footerNote;

    const unitEl = document.querySelector("[data-gold-meta-line]");
    if (unitEl) {
      unitEl.innerHTML =
        "Cập nhật lúc: " +
        escapeMetaHtml(ht) +
        ' · <span class="gold-table-brand-italic">' +
        escapeMetaHtml(bi) +
        "</span> · " +
        escapeMetaHtml(ul);
    }
    const noteEl = document.querySelector("[data-gold-footer-note]");
    if (noteEl) {
      noteEl.textContent = "(" + fn + ") (" + ul + ")";
    }
  }

  /** Bo góc dưới bảng: cột 1 thường là ô rowspan (Bạc), không nằm trên <tr> cuối. */
  function markGoldTableBottomCorners(tbody) {
    const trs = tbody.querySelectorAll("tr");
    if (!trs.length) return;
    const lastIdx = trs.length - 1;
    const lastCells = trs[lastIdx].cells;
    if (lastCells.length) {
      lastCells[lastCells.length - 1].classList.add("gold-table-corner-br");
    }
    let blSet = false;
    for (let ri = 0; ri <= lastIdx; ri++) {
      const row = trs[ri];
      for (let c = 0; c < row.cells.length; c++) {
        const td = row.cells[c];
        if (!td.classList.contains("gold-brand-cell")) continue;
        const rs = parseInt(td.getAttribute("rowspan") || "1", 10);
        if (ri + rs - 1 === lastIdx) {
          td.classList.add("gold-table-corner-bl");
          blSet = true;
          break;
        }
      }
      if (blSet) break;
    }
    if (!blSet && lastCells.length) {
      lastCells[0].classList.add("gold-table-corner-bl");
    }
  }

  /**
   * Cùng thương hiệu: rowspan cột THƯƠNG HIỆU.
   * Cùng sản phẩm + nhiều hàm lượng/giá: dòng tiếp theo để product = "" → rowspan cột SẢN PHẨM.
   */
  function renderRowsIntoTbody(tbody, rows) {
    if (!tbody || !rows) return;
    tbody.innerHTML = "";
    walkMergedGoldRows(rows, function (ctx) {
      const rt = ctx.row;
      const tr = document.createElement("tr");
      if (rt.metal === "silver") tr.classList.add("row-silver");
      if (rt.highlight === true) tr.classList.add("row-highlight");
      if (ctx.showBrand) {
        const tdB = document.createElement("td");
        tdB.className = "gold-brand-cell";
        if (rt.metal === "silver") tdB.classList.add("gold-brand-cell--silver");
        tdB.rowSpan = ctx.brandRowspan;
        tdB.textContent = rt.brand;
        tr.appendChild(tdB);
      }
      if (ctx.showProduct) {
        const tdP = document.createElement("td");
        tdP.className = "col-product";
        tdP.rowSpan = ctx.productRowspan;
        tdP.textContent = ctx.productLabel;
        tr.appendChild(tdP);
      }
      const tdPur = document.createElement("td");
      tdPur.className = "col-purity";
      tdPur.textContent = rt.purity;
      tr.appendChild(tdPur);
      const tdBuy = document.createElement("td");
      tdBuy.className = "price";
      tdBuy.textContent = rt.buy;
      tr.appendChild(tdBuy);
      const tdSell = document.createElement("td");
      tdSell.className = "price";
      tdSell.textContent = rt.sell;
      tr.appendChild(tdSell);
      tbody.appendChild(tr);
    });
    markGoldTableBottomCorners(tbody);
  }

  async function mountGoldTable(tbodySelector) {
    const tbody = document.querySelector(tbodySelector);
    if (!tbody) return;
    try {
      const data = await getGoldTable();
      applyMetaToDom(data && data.meta);
      renderRowsIntoTbody(tbody, (data && data.rows) || []);
      const sb = await getSupabaseClient();
      startGoldTableRealtime(sb);
      return data;
    } catch (err) {
      console.error(err);
      tbody.innerHTML = "";
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.style.padding = "16px";
      td.style.color = "#666";
      td.textContent =
        "Không tải được bảng giá từ Supabase. Kiểm tra .env, RLS (SELECT cho anon), bảng gold_meta / gold_price_rows và Realtime (nếu dùng). Chi tiết: " +
        (err && err.message ? err.message : String(err));
      tr.appendChild(td);
      tbody.appendChild(tr);
      return null;
    }
  }

  global.TLKVGold = {
    STORAGE_KEY,
    getGoldTable,
    fetchDefaultJson,
    loadFromStorage,
    saveToStorage,
    saveGoldMetaOnly,
    clearStorage,
    normalizePayload,
    normalizeRow,
    orderRowsForTable,
    applyMetaToDom,
    renderRowsIntoTbody,
    mountGoldTable,
    assetUrl,
    brandsMatch,
    insertGoldRow,
    insertSilverRow,
    walkMergedGoldRows,
    variantParentProduct,
    coalesceProductForNewGoldRow,
    coalesceProductForNewSilverRow,
    normalizeMeta,
  };
})(typeof window !== "undefined" ? window : globalThis);
