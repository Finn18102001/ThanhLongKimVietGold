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

  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  let __goldRealtimeSb = null;
  /** @type {ReturnType<import("@supabase/supabase-js").SupabaseClient["channel"]> | null} */
  let __goldRealtimeChannel = null;
  let __goldRealtimePagehideBound = false;

  function stopGoldTableRealtime() {
    if (__goldRealtimeSb && __goldRealtimeChannel) {
      try {
        __goldRealtimeSb.removeChannel(__goldRealtimeChannel);
      } catch (_) {}
    }
    __goldRealtimeSb = null;
    __goldRealtimeChannel = null;
  }

  function ensureGoldRealtimePagehideCleanup() {
    if (__goldRealtimePagehideBound || typeof global.addEventListener !== "function") return;
    __goldRealtimePagehideBound = true;
    global.addEventListener("pagehide", function () {
      stopGoldTableRealtime();
    });
  }

  /**
   * Một subscription Realtime cho bảng giá; gọi stopGoldTableRealtime khi không cần (SPA unmount / pagehide đã gắn sẵn).
   */
  function startGoldTableRealtime(sb) {
    if (!sb || __goldRealtimeChannel) return;
    const notify = function () {
      global.dispatchEvent(new CustomEvent("tlkv:gold-table-changed"));
    };
    __goldRealtimeSb = sb;
    __goldRealtimeChannel = sb
      .channel("tlkv_public_gold")
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_meta" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "gold_price_rows" }, notify);
    __goldRealtimeChannel.subscribe();
    ensureGoldRealtimePagehideCleanup();
  }

  /** Hiển thị: số trong DB → chuỗi kiểu 15.600.000. kind "sell": 0 → rỗng (vàng & bạc). */
  function formatPriceDisplay(value, metal, kind) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (kind === "sell" && n === 0) return "";
    if (metal === "silver" && n === 0) return "";
    const abs = Math.abs(Math.round(n));
    return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /**
   * Chuỗi / number / bigint giá (VN: 15.900.000; DB: 15900000 hoặc 15900000.00) → số nguyên; lỗi → null.
   * Dùng thống nhất cho icon trend, previous_*, và parse trước khi upsert.
   */
  function parseGoldMoneyToInt(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") {
      const bn = Number(value);
      return Number.isFinite(bn) ? Math.round(bn) : null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.round(value) : null;
    }
    let t = String(value)
      .trim()
      .replace(/\u00a0|\u202f/g, "")
      .replace(/\s+/g, "");
    if (!t) return null;
    t = t.replace(/đồng|đ|vnd/gi, "").trim();
    if (!t) return null;
    if (/^-?\d+$/.test(t)) {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    }
    const dotCount = (t.match(/\./g) || []).length;
    const commaCount = (t.match(/,/g) || []).length;
    // Một dấu chấm/phẩy kiểu số thập phân (Postgres numeric → "15570000.00")
    if (dotCount === 1 && commaCount === 0 && /^-?\d+\.\d+$/.test(t)) {
      const n = parseFloat(t);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    if (commaCount === 1 && dotCount === 0 && /^-?\d+,\d+$/.test(t)) {
      const n = parseFloat(t.replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    // VN: dấu chấm phân tách nghìn (và có thể có phẩy thập phân cuối)
    const vn = t.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(vn);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  /** Lưu DB: chuỗi hiển thị → số; rỗng → null; không parse được → 0 */
  function parsePriceToNumber(s) {
    const t = String(s ?? "").trim();
    if (!t) return null;
    const parsed = parseGoldMoneyToInt(t);
    return parsed == null ? 0 : parsed;
  }

  const GOLD_THEAD_ROW_WIDE_INNER =
    "<th>THƯƠNG HIỆU</th><th>SẢN PHẨM</th><th>HÀM LƯỢNG</th><th>MUA VÀO</th><th>BÁN RA</th>";
  const GOLD_THEAD_ROW_STACKED_INNER =
    "<th>THƯƠNG HIỆU</th><th>SẢN PHẨM</th><th>MUA VÀO</th><th>BÁN RA</th>";

  let __goldLayoutMediaListenerBound = false;

  /** Chuỗi giá hiển thị → int; rỗng / không hợp lệ → null */
  function parseDisplayPriceNumber(s) {
    return parseGoldMoneyToInt(s);
  }

  function isGoldTableStackedLayout() {
    if (typeof global.matchMedia !== "function") return false;
    return global.matchMedia("(max-width: 639px)").matches;
  }

  /** previous_* từ DB (number / string / bigint) → int; null nếu chưa có / không hợp lệ. */
  function dbPriceToTrendNum(v) {
    if (v === null || v === undefined || v === "") return null;
    return parseGoldMoneyToInt(v);
  }

  /**
   * Mũi tên theo data: (buy|sell hiện tại từ DB) − (previous_buy | previous_sell), cả hai ép int (bigint OK).
   * diff > 0 → xanh ▲, diff < 0 → đỏ ▼, diff === 0 hoặc thiếu previous → không hiện.
   */
  function appendPriceCellContent(td, displayText, field, rt) {
    td.textContent = "";
    const text = displayText == null ? "" : String(displayText);
    td.appendChild(document.createTextNode(text));
    const cur =
      field === "buy"
        ? rt.buyNum != null
          ? rt.buyNum
          : parseGoldMoneyToInt(text)
        : rt.sellNum != null
          ? rt.sellNum
          : parseGoldMoneyToInt(text);
    const prevVal = field === "buy" ? rt.prevBuyNum : rt.prevSellNum;
    if (cur == null || prevVal == null) return;
    const diff = cur - prevVal;
    if (diff === 0) return;
    const span = document.createElement("span");
    span.className =
      diff > 0 ? "gold-price-trend gold-price-trend--up" : "gold-price-trend gold-price-trend--down";
    span.setAttribute(
      "aria-label",
      diff > 0 ? "Giá cao hơn mức trước khi cập nhật" : "Giá thấp hơn mức trước khi cập nhật"
    );
    span.textContent = diff > 0 ? "▲" : "▼";
    td.appendChild(span);
  }

  function syncGoldTableThead(table, stacked) {
    if (!table) return;
    const trh = table.querySelector("thead tr");
    if (!trh) return;
    trh.innerHTML = stacked ? GOLD_THEAD_ROW_STACKED_INNER : GOLD_THEAD_ROW_WIDE_INNER;
    table.classList.toggle("gold-table--stacked", stacked);
    if (table.classList.contains("tv-gold-table")) {
      table.classList.toggle("tv-gold-table--stacked", stacked);
    } else {
      table.classList.remove("tv-gold-table--stacked");
    }
  }

  function formatStackedProductLine(ordered, idx, r) {
    const own = String(r.product || "").trim();
    const parent = variantParentProduct(ordered, idx);
    const base = own || parent || "";
    const pur = String(r.purity || "").trim();
    if (pur) return base ? base + " (" + pur + ")" : pur;
    return base || "—";
  }

  /**
   * Mobile nhỏ: 4 cột (ẩn hàm lượng), nhưng vẫn gộp rowspan theo THƯƠNG HIỆU như bảng cũ.
   * Hàm lượng hiển thị cuối tên sản phẩm: "Tên SP (999,9)" cho từng dòng.
   */
  function renderRowsStackedMobile(tbody, rows) {
    const ordered = orderRowsForTable(rows.slice());
    if (!ordered.length) return;
    let i = 0;
    while (i < ordered.length) {
      const brand = ordered[i].brand;
      let j = i;
      while (j < ordered.length && brandsMatch(ordered[j].brand, brand)) j++;
      const brandSpan = j - i;
      for (let idx = i; idx < j; idx++) {
        const rt = ordered[idx];
        const tr = document.createElement("tr");
        if (rt.metal === "silver") tr.classList.add("row-silver");
        if (rt.highlight === true) tr.classList.add("row-highlight");

        if (idx === i) {
          const tdB = document.createElement("td");
          tdB.className = "gold-brand-cell";
          if (rt.metal === "silver") tdB.classList.add("gold-brand-cell--silver");
          tdB.rowSpan = brandSpan;
          tdB.textContent = rt.brand;
          tr.appendChild(tdB);
        }

        const tdP = document.createElement("td");
        tdP.className = "col-product";
        tdP.textContent = formatStackedProductLine(ordered, idx, rt);
        tr.appendChild(tdP);

        const tdBuy = document.createElement("td");
        tdBuy.className = "price";
        appendPriceCellContent(tdBuy, rt.buy, "buy", rt);
        tr.appendChild(tdBuy);

        const tdSell = document.createElement("td");
        tdSell.className = "price";
        appendPriceCellContent(tdSell, rt.sell, "sell", rt);
        tr.appendChild(tdSell);

        tbody.appendChild(tr);
      }
      i = j;
    }
  }

  function initGoldTableLayoutListenerOnce() {
    if (__goldLayoutMediaListenerBound) return;
    if (typeof global.matchMedia !== "function" || typeof document === "undefined") return;
    __goldLayoutMediaListenerBound = true;
    const mq = global.matchMedia("(max-width: 639px)");
    const handler = function () {
      const rows = global.__TLKV_LAST_GOLD_ROWS;
      if (!rows || !Array.isArray(rows)) return;
      document.querySelectorAll("#gold-table-body, #tv-table-body").forEach(function (el) {
        renderRowsIntoTbody(el, rows);
      });
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
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
    const row = normalizeRow({
      id: r.id,
      brand: r.brand,
      product: r.product ?? "",
      purity: r.purity ?? "",
      buy: formatPriceDisplay(r.buy, r.metal, "buy"),
      sell: formatPriceDisplay(r.sell, r.metal, "sell"),
      metal: r.metal,
      highlight: r.highlight === true,
    });
    row.buyNum = parseGoldMoneyToInt(r.buy);
    row.sellNum = parseGoldMoneyToInt(r.sell);
    row.prevBuyNum = dbPriceToTrendNum(r.previous_buy);
    row.prevSellNum = dbPriceToTrendNum(r.previous_sell);
    return row;
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
    const { data: existingList, error: eEx } = await sb.from("gold_price_rows").select("*");
    if (eEx) throw eEx;
    const existingById = new Map();
    (existingList || []).forEach(function (row) {
      existingById.set(String(row.id), row);
    });
    const keep = new Set(
      rows.map(function (r) {
        return String(r.id);
      })
    );
    for (let i = 0; i < (existingList || []).length; i++) {
      const ex = existingList[i];
      if (!keep.has(String(ex.id))) {
        const { error: eDel } = await sb.from("gold_price_rows").delete().eq("id", ex.id);
        if (eDel) throw eDel;
      }
    }

    const upserts = rows.map(function (r, idx) {
      const newBuy = parsePriceToNumber(r.buy) ?? 0;
      const newSell = parsePriceToNumber(r.sell) ?? 0;
      const ex = existingById.get(String(r.id));
      let previous_buy = null;
      let previous_sell = null;
      let previous_updated_at = null;
      if (ex) {
        previous_buy = ex.previous_buy != null ? ex.previous_buy : null;
        previous_sell = ex.previous_sell != null ? ex.previous_sell : null;
        previous_updated_at = ex.previous_updated_at != null ? ex.previous_updated_at : null;
        const oldBuy = parseGoldMoneyToInt(ex.buy) ?? 0;
        const oldSell = parseGoldMoneyToInt(ex.sell) ?? 0;
        if (oldBuy !== newBuy || oldSell !== newSell) {
          if (oldBuy !== newBuy) previous_buy = oldBuy;
          if (oldSell !== newSell) previous_sell = oldSell;
          previous_updated_at = new Date().toISOString();
        }
      }
      return {
        id: r.id,
        sort_order: idx + 1,
        brand: r.brand,
        product: r.product || "",
        purity: r.purity || "",
        buy: newBuy,
        sell: newSell,
        metal: r.metal,
        highlight: r.highlight === true,
        previous_buy: previous_buy,
        previous_sell: previous_sell,
        previous_updated_at: previous_updated_at,
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

  /**
   * Giữ đơn vị + thương hiệu; đặt **cùng một mốc giờ VN** cho header_time (vd. 10h30) và footer_note
   * (vd. "Cập nhật lúc 10:30 09/04/2026") — khớp với cách `applyMetaToDom` render hai vị trí.
   * Gọi khi admin lưu giá / thêm / sửa / xóa dòng (stampMetaOnPayload).
   */
  function stampMetaWithVietnamNow(meta) {
    const m = normalizeMeta(meta || {});
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(now);
    const pick = function (t) {
      const x = parts.find(function (p) {
        return p.type === t;
      });
      return x ? x.value : "";
    };
    const pad2 = function (v) {
      const n = parseInt(String(v), 10);
      if (!Number.isFinite(n)) return String(v || "").padStart(2, "0");
      return n < 10 ? "0" + n : String(n);
    };
    const hour = pad2(pick("hour"));
    const minute = pad2(pick("minute"));
    const day = pad2(pick("day"));
    const month = pad2(pick("month"));
    const year = pick("year");
    const headerTime = hour + "h" + minute;
    const footerNote = "Cập nhật lúc " + hour + ":" + minute + " " + day + "/" + month + "/" + year;
    return normalizeMeta({
      headerTime: headerTime,
      footerNote: footerNote,
      unitLine: m.unitLine,
      brandItalic: m.brandItalic,
    });
  }

  /** Chỉ cho phép ghi Supabase (persist / xóa dòng) khi đang ở trang admin. */
  function isGoldAdminWritePath() {
    try {
      const p = global.location && global.location.pathname ? String(global.location.pathname) : "";
      return /\/admin(\/|$)/.test(p);
    } catch (_) {
      return false;
    }
  }

  function assertGoldAdminWrite() {
    if (!isGoldAdminWritePath()) {
      throw new Error("Chỉ trang /admin mới được lưu hoặc xóa dòng giá trên Supabase.");
    }
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
    const out = {
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
    const bn = Number(r.buyNum);
    if (Number.isFinite(bn)) out.buyNum = Math.round(bn);
    const sn = Number(r.sellNum);
    if (Number.isFinite(sn)) out.sellNum = Math.round(sn);
    if (Object.prototype.hasOwnProperty.call(r, "prevBuyNum")) {
      out.prevBuyNum = dbPriceToTrendNum(r.prevBuyNum);
    } else {
      out.prevBuyNum = dbPriceToTrendNum(r.previous_buy);
    }
    if (Object.prototype.hasOwnProperty.call(r, "prevSellNum")) {
      out.prevSellNum = dbPriceToTrendNum(r.prevSellNum);
    } else {
      out.prevSellNum = dbPriceToTrendNum(r.previous_sell);
    }
    return out;
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
    assertGoldAdminWrite();
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
    assertGoldAdminWrite();
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
    try { await sb.auth.getUser(); } catch (_) {}
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
    global.__TLKV_LAST_GOLD_ROWS = rows;
    const table = tbody.closest("table");
    const stacked = isGoldTableStackedLayout();
    syncGoldTableThead(table, stacked);
    tbody.innerHTML = "";
    if (stacked) {
      renderRowsStackedMobile(tbody, rows);
    } else {
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
        appendPriceCellContent(tdBuy, rt.buy, "buy", rt);
        tr.appendChild(tdBuy);
        const tdSell = document.createElement("td");
        tdSell.className = "price";
        appendPriceCellContent(tdSell, rt.sell, "sell", rt);
        tr.appendChild(tdSell);
        tbody.appendChild(tr);
      });
    }
    markGoldTableBottomCorners(tbody);
    initGoldTableLayoutListenerOnce();
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
      td.colSpan = isGoldTableStackedLayout() ? 4 : 5;
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
    stopGoldTableRealtime,
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
    stampMetaWithVietnamNow,
  };
})(typeof window !== "undefined" ? window : globalThis);
