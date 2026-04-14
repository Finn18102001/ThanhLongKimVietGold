(function (global) {
  var GOLD_LOG = "gold_price_change_log";
  var PRODUCT_LOG = "product_change_log";

  function safeIlikeFragment(s) {
    return String(s || "")
      .trim()
      .replace(/[%_\\,]/g, "");
  }

  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} sb
   * @param {{ action: string, entity_name: string, entity_id?: string, summary?: string, payload?: object }} row
   */
  function logGold(sb, row) {
    if (!sb || !row || !row.action) return Promise.resolve();
    var insert = {
      action: String(row.action),
      entity_name: String(row.entity_name || "").slice(0, 2000),
      entity_id: row.entity_id != null ? String(row.entity_id).slice(0, 500) : null,
      summary: row.summary != null ? String(row.summary).slice(0, 4000) : null,
      payload: row.payload != null ? row.payload : null,
    };
    return sb.from(GOLD_LOG).insert(insert).then(function (res) {
      if (res.error) {
        console.error("[TLKVAudit] gold_price_change_log INSERT failed:", res.error);
        throw new Error("Ghi lịch sử giá vàng thất bại: " + (res.error.message || JSON.stringify(res.error)));
      }
      return res;
    });
  }

  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} sb
   * @param {{ action: string, entity_name: string, entity_id?: string, summary?: string, payload?: object }} row
   */
  function logProduct(sb, row) {
    if (!sb || !row || !row.action) return Promise.resolve();
    var insert = {
      action: String(row.action),
      entity_name: String(row.entity_name || "").slice(0, 2000),
      entity_id: row.entity_id != null ? String(row.entity_id).slice(0, 500) : null,
      summary: row.summary != null ? String(row.summary).slice(0, 4000) : null,
      payload: row.payload != null ? row.payload : null,
    };
    return sb.from(PRODUCT_LOG).insert(insert).then(function (res) {
      if (res.error) {
        console.error("[TLKVAudit] product_change_log INSERT failed:", res.error);
        throw new Error("Ghi lịch sử sản phẩm thất bại: " + (res.error.message || JSON.stringify(res.error)));
      }
      return res;
    });
  }

  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} sb
   * @param {{ searchName?: string, dateStr?: string, limit?: number }} opts
   */
  function fetchGoldLog(sb, opts) {
    if (!sb) return Promise.reject(new Error("Thiếu Supabase client."));
    var limit = opts && opts.limit > 0 ? Math.min(opts.limit, 500) : 200;
    var q = sb.from(GOLD_LOG).select("*").order("created_at", { ascending: false }).limit(limit);
    var frag = safeIlikeFragment(opts && opts.searchName);
    if (frag) q = q.ilike("entity_name", "%" + frag + "%");
    var d = opts && opts.dateStr ? String(opts.dateStr).trim() : "";
    if (d) {
      q = q.gte("created_at", d + "T00:00:00+07:00").lte("created_at", d + "T23:59:59.999+07:00");
    }
    return q.then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} sb
   * @param {{ searchName?: string, dateStr?: string, limit?: number }} opts
   */
  function fetchProductLog(sb, opts) {
    if (!sb) return Promise.reject(new Error("Thiếu Supabase client."));
    var limit = opts && opts.limit > 0 ? Math.min(opts.limit, 500) : 200;
    var q = sb.from(PRODUCT_LOG).select("*").order("created_at", { ascending: false }).limit(limit);
    var frag = safeIlikeFragment(opts && opts.searchName);
    if (frag) q = q.ilike("entity_name", "%" + frag + "%");
    var d = opts && opts.dateStr ? String(opts.dateStr).trim() : "";
    if (d) {
      q = q.gte("created_at", d + "T00:00:00+07:00").lte("created_at", d + "T23:59:59.999+07:00");
    }
    return q.then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  global.TLKVAudit = {
    logGold: logGold,
    logProduct: logProduct,
    fetchGoldLog: fetchGoldLog,
    fetchProductLog: fetchProductLog,
  };
})(typeof window !== "undefined" ? window : globalThis);
