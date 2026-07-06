window.TLKV_SUPABASE_URL = 'https://yrdqnmsvwovwhepmhigv.supabase.co';
window.TLKV_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZHFubXN2d292d2hlcG1oaWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTM1ODAsImV4cCI6MjA5MTMyOTU4MH0.PppGELLxSh0pcZklF8j2DuDeHhMq1HQIUZ-EuQkkpSA';

console.log('🔧 Supabase config hardcoded in admin-app.js');
console.log('URL:', window.TLKV_SUPABASE_URL);
console.log('KEY length:', window.TLKV_SUPABASE_ANON_KEY ? window.TLKV_SUPABASE_ANON_KEY.length : 0);
function showToast(message, type = 'success') {
  console.log('🔔 Toast:', message, type);
  const host = document.getElementById('admin-toast-host');
  if (!host) {
    alert(message);
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = message;

  if (type === 'error') toast.style.background = '#dc2626';
  else if (type === 'success') toast.style.background = '#16a34a';
  else if (type === 'info') toast.style.background = '#3b82f6';

  host.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.28s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3400);
}
(function () {
  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  var sb = null;
  var adminAuthed = false;
  var Access = window.TLKVAdminAccess;
  var currentTab = "gold";
  var applyingSession = false;

  function canPerform(module) {
    return Access && typeof Access.guardAction === "function" && Access.guardAction(module);
  }

  function currentAccess() {
    return Access && typeof Access.getCurrentAccess === "function" ? Access.getCurrentAccess() : null;
  }
  var goldHistSearchTimer = null;
  var productHistSearchTimer = null;
  var HISTORY_PAGE_SIZE = 10;
  var goldHistAllRows = [];
  var goldHistPage = 1;
  var productHistAllRows = [];
  var productHistPage = 1;
  /** Các id dòng đang sửa inline (có thể nhiều dòng cùng lúc). */
  var goldInlineEditRowIds = Object.create(null);
  function goldInlineEditHasAny() {
    return Object.keys(goldInlineEditRowIds).length > 0;
  }

  var GOLD_ACTION_LABELS = {
    meta_update: "Cập nhật meta bảng giá",
    row_insert: "Thêm dòng giá",
    row_update: "Sửa dòng giá",
    row_delete: "Xóa dòng giá",
  };

  var PRODUCT_ACTION_LABELS = {
    product_insert: "Thêm sản phẩm",
    product_update: "Sửa sản phẩm",
    product_delete: "Xóa sản phẩm",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setBodyAuthState(state) {
    if (document.body) document.body.setAttribute("data-auth-state", state);
  }

  function showLogin() {
    setBodyAuthState("anonymous");
    $("login-panel").hidden = false;
    $("admin-panel").hidden = true;
  }

  function showAdmin() {
    setBodyAuthState("authenticated");
    $("login-panel").hidden = true;
    $("admin-panel").hidden = false;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  /** Snapshot tối giản cho audit / so sánh trên web (payload.before | .after). */
  function snapshotGoldAuditRow(r) {
    if (!r || typeof r !== "object") return {};
    return {
      id: r.id,
      brand: String(r.brand || ""),
      product: String(r.product || ""),
      purity: String(r.purity || ""),
      buy: String(r.buy || ""),
      sell: String(r.sell || ""),
      metal: r.metal === "silver" ? "silver" : "gold",
      highlight: r.highlight === true,
    };
  }

  function normGoldCell(s) {
    return String(s == null ? "" : s).trim();
  }

  function dispGoldCell(s) {
    var t = normGoldCell(s);
    return t === "" ? "(trống)" : t;
  }

  function goldCellEq(a, b, key) {
    return normGoldCell(a[key]) === normGoldCell(b[key]);
  }

  /** Mô tả thay đổi nhiều dòng: Giá bán … → …, xuống dòng Giá mua … */
  function buildGoldRowChangeSummary(oldR, newR) {
    if (!oldR || !newR) return "";
    var parts = [];
    function add(label, key) {
      if (goldCellEq(oldR, newR, key)) return;
      parts.push(label + " " + dispGoldCell(oldR[key]) + " → " + dispGoldCell(newR[key]));
    }
    add("Giá bán:", "sell");
    add("Giá mua:", "buy");
    add("Hàm lượng:", "purity");
    add("Sản phẩm:", "product");
    add("Thương hiệu:", "brand");
    if (normGoldCell(oldR.metal) !== normGoldCell(newR.metal)) {
      parts.push("Loại: " + dispGoldCell(oldR.metal) + " → " + dispGoldCell(newR.metal));
    }
    var oh = !!oldR.highlight;
    var nh = !!newR.highlight;
    if (oh !== nh) {
      parts.push("Nền xanh: " + (oh ? "bật" : "tắt") + " → " + (nh ? "bật" : "tắt"));
    }
    if (!parts.length) return "Không đổi giá trị.";
    return parts.join("\n");
  }

  function buildGoldRowInsertSummary(r) {
    var s = snapshotGoldAuditRow(r);
    var lines = ["Thêm dòng"];
    if (normGoldCell(s.brand)) lines.push("Thương hiệu: " + dispGoldCell(s.brand));
    if (normGoldCell(s.product)) lines.push("Sản phẩm: " + dispGoldCell(s.product));
    if (normGoldCell(s.purity)) lines.push("Hàm lượng: " + dispGoldCell(s.purity));
    if (normGoldCell(s.buy)) lines.push("Giá mua: " + dispGoldCell(s.buy));
    if (normGoldCell(s.sell)) lines.push("Giá bán: " + dispGoldCell(s.sell));
    lines.push("Loại: " + (s.metal === "silver" ? "bạc" : "vàng"));
    return lines.join("\n");
  }

  function buildGoldRowDeleteSummary(r) {
    var s = snapshotGoldAuditRow(r);
    var lines = ["Xóa dòng"];
    lines.push("Thương hiệu: " + dispGoldCell(s.brand));
    lines.push("Sản phẩm: " + dispGoldCell(s.product));
    lines.push("Hàm lượng: " + dispGoldCell(s.purity));
    lines.push("Giá mua: " + dispGoldCell(s.buy));
    lines.push("Giá bán: " + dispGoldCell(s.sell));
    lines.push("Loại: " + (s.metal === "silver" ? "bạc" : "vàng"));
    return lines.join("\n");
  }

  function formatSummaryHtml(summary) {
    var s = summary == null || summary === "" ? "—" : String(summary);
    return escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");
  }

  /** Cột "Giá mới" (lịch sử giá): giá sau thay đổi từ mô tả audit. */
  function goldHistoryNewPriceDisplay(summary, action) {
    var s = summary == null ? "" : String(summary);
    var t = s.trim();
    if (!t) return "—";
    if (t === "Không đổi giá trị.") return "—";
    if (action === "row_delete") return "—";
    if (action === "meta_update") return "—";

    var lines = s.split(/\r\n|\r|\n/);
    var out = [];
    var reArrowSell = /^Giá bán:\s*(.+?)\s*→\s*(.+)$/;
    var reArrowBuy = /^Giá mua:\s*(.+?)\s*→\s*(.+)$/;
    var i;
    var ln;
    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      var ms = ln.match(reArrowSell);
      if (ms) {
        out.push("Bán: " + ms[2].trim());
        continue;
      }
      var mb = ln.match(reArrowBuy);
      if (mb) {
        out.push("Mua: " + mb[2].trim());
        continue;
      }
    }
    if (out.length) return out.join("\n");

    if (action === "row_insert") {
      out = [];
      for (i = 0; i < lines.length; i++) {
        ln = lines[i];
        if (/^Giá mua:\s+/.test(ln)) out.push("Mua: " + ln.replace(/^Giá mua:\s+/, "").trim());
        if (/^Giá bán:\s+/.test(ln)) out.push("Bán: " + ln.replace(/^Giá bán:\s+/, "").trim());
      }
      if (out.length) return out.join("\n");
    }

    return "—";
  }

  function showAdminToast(message) {
    var host = $("admin-toast-host");
    if (!host) return;
    var t = document.createElement("div");
    t.className = "admin-toast";
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      t.style.opacity = "0";
      t.style.transition = "opacity 0.28s ease";
      setTimeout(function () {
        t.remove();
      }, 280);
    }, 3400);
  }

  function formatHistoryTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    } catch (_) {
      return String(iso);
    }
  }

  function actionBadgeClass(action) {
    if (!action) return "";
    if (action.indexOf("insert") >= 0) return "admin-history-action-badge--insert";
    if (action.indexOf("update") >= 0) return "admin-history-action-badge--update";
    if (action.indexOf("delete") >= 0) return "admin-history-action-badge--delete";
    if (action.indexOf("meta") >= 0) return "admin-history-action-badge--meta";
    return "";
  }

  function renderHistoryTable(tbody, rows, labelMap, historyKind) {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td colspan=\"5\" class=\"admin-empty-hint\">Chưa có bản ghi (hoặc chưa chạy SQL tạo bảng / chưa có thao tác).</td>";
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var act = r.action || "";
      var actLabel = labelMap[act] || act;
      var badgeCls = actionBadgeClass(act);
      var actHtml = badgeCls
        ? '<span class="admin-history-action-badge ' + badgeCls + '">' + escapeHtml(actLabel) + "</span>"
        : escapeHtml(actLabel);
      var col4 =
        historyKind === "gold"
          ? escapeHtml(goldHistoryNewPriceDisplay(r.summary, act)).replace(/\n/g, "<br>")
          : escapeHtml(r.entity_id || "—");
      tr.innerHTML =
        "<td>" +
        escapeHtml(formatHistoryTime(r.created_at)) +
        "</td><td>" +
        actHtml +
        "</td><td>" +
        escapeHtml(r.entity_name || "") +
        "</td><td>" +
        col4 +
        '</td><td class="admin-history-cell-summary">' +
        formatSummaryHtml(r.summary) +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  function renderPagination(hostId, allRows, currentPage, onPageChange) {
    var host = $(hostId);
    if (!host) return;
    host.innerHTML = "";
    var total = allRows ? allRows.length : 0;
    var pages = Math.ceil(total / HISTORY_PAGE_SIZE);
    if (pages <= 1) {
      if (total > 0) {
        var info = document.createElement("span");
        info.className = "admin-pagination-info";
        info.textContent = total + " bản ghi";
        host.appendChild(info);
      }
      return;
    }

    var btnPrev = document.createElement("button");
    btnPrev.textContent = "‹";
    btnPrev.disabled = currentPage <= 1;
    btnPrev.addEventListener("click", function () {
      if (currentPage > 1) onPageChange(currentPage - 1);
    });
    host.appendChild(btnPrev);

    var maxShow = 7;
    var start = 1;
    var end = pages;
    if (pages > maxShow) {
      start = Math.max(1, currentPage - 3);
      end = Math.min(pages, start + maxShow - 1);
      if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
    }

    if (start > 1) {
      var b1 = document.createElement("button");
      b1.textContent = "1";
      b1.addEventListener("click", function () { onPageChange(1); });
      host.appendChild(b1);
      if (start > 2) {
        var dots = document.createElement("span");
        dots.textContent = "…";
        dots.style.padding = "0 4px";
        dots.style.color = "#71717a";
        host.appendChild(dots);
      }
    }

    for (var p = start; p <= end; p++) {
      (function (pg) {
        var btn = document.createElement("button");
        btn.textContent = String(pg);
        if (pg === currentPage) btn.className = "active";
        btn.addEventListener("click", function () { onPageChange(pg); });
        host.appendChild(btn);
      })(p);
    }

    if (end < pages) {
      if (end < pages - 1) {
        var dots2 = document.createElement("span");
        dots2.textContent = "…";
        dots2.style.padding = "0 4px";
        dots2.style.color = "#71717a";
        host.appendChild(dots2);
      }
      var bLast = document.createElement("button");
      bLast.textContent = String(pages);
      bLast.addEventListener("click", function () { onPageChange(pages); });
      host.appendChild(bLast);
    }

    var btnNext = document.createElement("button");
    btnNext.textContent = "›";
    btnNext.disabled = currentPage >= pages;
    btnNext.addEventListener("click", function () {
      if (currentPage < pages) onPageChange(currentPage + 1);
    });
    host.appendChild(btnNext);

    var info2 = document.createElement("span");
    info2.className = "admin-pagination-info";
    var from = (currentPage - 1) * HISTORY_PAGE_SIZE + 1;
    var to = Math.min(currentPage * HISTORY_PAGE_SIZE, total);
    info2.textContent = from + "–" + to + " / " + total + " bản ghi";
    host.appendChild(info2);
  }

  function pageSlice(allRows, page) {
    var start = (page - 1) * HISTORY_PAGE_SIZE;
    return (allRows || []).slice(start, start + HISTORY_PAGE_SIZE);
  }

  function switchTab(tab) {
    var requested = tab === "products" ? "products" : "gold";
    var access = currentAccess();
    if (access && Access) {
      if (!Access.canAccessModule(access, requested)) {
        requested = Access.defaultModule(access) || requested;
      }
    }
    currentTab = requested;
    var goldPanel = $("admin-tab-gold");
    var prodPanel = $("admin-tab-products");
    var btnG = $("tab-btn-gold");
    var btnP = $("tab-btn-products");
    var title = $("admin-page-title");
    var canGold = !access || !Access || Access.canAccessModule(access, "gold");
    var canProducts = !access || !Access || Access.canAccessModule(access, "products");
    var showGold = currentTab === "gold" && canGold;
    var showProducts = currentTab === "products" && canProducts;

    if (goldPanel) {
      goldPanel.hidden = !showGold;
      goldPanel.classList.toggle("admin-tab-panel--hidden", !showGold);
    }
    if (prodPanel) {
      prodPanel.hidden = !showProducts;
      prodPanel.classList.toggle("admin-tab-panel--hidden", !showProducts);
    }
    if (btnG) {
      btnG.classList.toggle("admin-tab--active", showGold);
      btnG.setAttribute("aria-selected", showGold ? "true" : "false");
    }
    if (btnP) {
      btnP.classList.toggle("admin-tab--active", showProducts);
      btnP.setAttribute("aria-selected", showProducts ? "true" : "false");
    }
    if (title) {
      title.textContent = showProducts ? "Quản lý sản phẩm" : "Quản lý giá vàng";
    }

    if (showGold) refreshGoldHistory();
    else if (showProducts) refreshProductHistory();
  }

  // Sửa lại renderGoldHistPage để render đúng trang hiện tại
  function renderGoldHistPage() {
    var tb = $("gold-history-rows");
    if (!tb) return;

    var pageData = pageSlice(goldHistAllRows, goldHistPage);

    if (!pageData || pageData.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" class="history-empty">Chưa có dữ liệu</td></tr>';
    } else {
      renderHistoryTable(tb, pageData, GOLD_ACTION_LABELS, "gold");
    }

    renderPagination("gold-hist-pagination", goldHistAllRows, goldHistPage, function (pg) {
      goldHistPage = pg;
      renderGoldHistPage();
    });

    // Cập nhật badge số lượng
    var badge = document.getElementById('gold-history-count');
    if (badge) {
      badge.textContent = (goldHistAllRows ? goldHistAllRows.length : 0) + ' bản ghi';
    }
  }

  function refreshGoldHistory() {
    if (!canPerform("gold")) return;
    var tb = $("gold-history-rows");
    if (!tb) return;
    if (!sb || !window.TLKVAudit) {
      tb.innerHTML = '<tr><td colspan="5" class="history-empty">Chưa đăng nhập hoặc thiếu module lịch sử.</td></tr>';
      return;
    }

    var nameEl = $("gold-hist-search");
    var fromEl = $("gold-hist-date-from");
    var toEl = $("gold-hist-date-to");
    var name = nameEl ? nameEl.value : "";
    var dateFrom = fromEl ? fromEl.value : "";
    var dateTo = toEl ? toEl.value : "";

    tb.innerHTML = '<tr><td colspan="5" class="history-empty">Đang tải...</td></tr>';

    window.TLKVAudit
      .fetchGoldLog(sb, { searchName: name, dateFrom: dateFrom, dateTo: dateTo, limit: 50000 })
      .then(function (rows) {
        goldHistAllRows = rows || [];
        goldHistPage = 1;
        renderGoldHistPage();
      })
      .catch(function (err) {
        console.error(err);
        tb.innerHTML = '<tr><td colspan="5" class="history-empty">Không tải được lịch sử: ' + escapeHtml(err.message) + '</td></tr>';
      });
  }

  function renderProductHistPage() {
    var tb = $("product-history-rows");
    if (!tb) return;
    renderHistoryTable(tb, pageSlice(productHistAllRows, productHistPage), PRODUCT_ACTION_LABELS);
    renderPagination("product-hist-pagination", productHistAllRows, productHistPage, function (pg) {
      productHistPage = pg;
      renderProductHistPage();
    });
  }

  function refreshProductHistory() {
    if (!canPerform("products")) return;
    var tb = $("product-history-rows");
    if (!tb) return;
    if (!sb || !window.TLKVAudit) {
      tb.innerHTML =
        "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Chưa đăng nhập hoặc thiếu module lịch sử.</td></tr>";
      return;
    }
    var nameEl = $("product-hist-search");
    var fromEl = $("product-hist-date-from");
    var toEl = $("product-hist-date-to");
    var name = nameEl ? nameEl.value : "";
    var dateFrom = fromEl ? fromEl.value : "";
    var dateTo = toEl ? toEl.value : "";
    tb.innerHTML = "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Đang tải…</td></tr>";
    window.TLKVAudit
      .fetchProductLog(sb, { searchName: name, dateFrom: dateFrom, dateTo: dateTo, limit: 50000 })
      .then(function (rows) {
        productHistAllRows = rows || [];
        productHistPage = 1;
        renderProductHistPage();
      })
      .catch(function (err) {
        console.error(err);
        tb.innerHTML =
          "<tr><td colspan=\"5\">Không tải được lịch sử: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      });
  }

  function debounceGoldHistory() {
    if (goldHistSearchTimer) clearTimeout(goldHistSearchTimer);
    goldHistSearchTimer = setTimeout(function () {
      goldHistSearchTimer = null;
      if (adminAuthed && currentTab === "gold") refreshGoldHistory();
    }, 420);
  }

  function debounceProductHistory() {
    if (productHistSearchTimer) clearTimeout(productHistSearchTimer);
    productHistSearchTimer = setTimeout(function () {
      productHistSearchTimer = null;
      if (adminAuthed && currentTab === "products") refreshProductHistory();
    }, 420);
  }

  function setGoldThayDoiVisible(show) {
    var b = $("btn-gold-thay-doi");
    if (!b) return;
    b.hidden = !show;
  }

  function clearGoldInlineEdit() {
    goldInlineEditRowIds = Object.create(null);
    setGoldThayDoiVisible(false);
  }

  function stampMetaOnPayload(d) {
    if (!window.TLKVGold || !d) return d;
    d.meta = window.TLKVGold.stampMetaWithVietnamNow(d.meta || {});
    return d;
  }

  function findGoldRowTr(tbody, rowId) {
    if (!tbody) return null;
    var trs = tbody.getElementsByTagName("tr");
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getAttribute("data-row-id") === rowId) return trs[i];
    }
    return null;
  }

  function commitGoldInlineEdit() {
    if (!canPerform("gold")) return;
    if (!window.TLKVGold) return;
    if (!goldInlineEditHasAny()) return;
    if (!confirm("Bạn có chắc chắn muốn thay đổi giá vàng hiện tại không?")) return;

    var tb = $("admin-rows");
    if (!tb) return;

    var readRowFromTr = function (tr) {
      var readInline = function (field) {
        var el = tr.querySelector('[data-inline-field="' + field + '"]');
        return el ? String(el.value || "").trim() : "";
      };
      return {
        productVal: readInline("product"),
        purityVal: readInline("purity"),
        buyVal: readInline("buy"),
        sellVal: readInline("sell"),
      };
    };

    var auditEntries = [];

    window.TLKVGold
      .getGoldTable()
      .then(function (d) {
        var ids = Object.keys(goldInlineEditRowIds).filter(function (id) {
          return goldInlineEditRowIds[id];
        });
        var byIndex = ids
          .map(function (rowId) {
            return {
              rowId: rowId,
              idx: d.rows.findIndex(function (x) {
                return x.id === rowId;
              }),
            };
          })
          .filter(function (x) {
            return x.idx >= 0;
          })
          .sort(function (a, b) {
            return a.idx - b.idx;
          });

        var oldById = Object.create(null);
        for (var o = 0; o < byIndex.length; o++) {
          var oItem = byIndex[o];
          oldById[oItem.rowId] = snapshotGoldAuditRow(d.rows[oItem.idx]);
        }

        auditEntries.length = 0;

        for (var i = 0; i < byIndex.length; i++) {
          var rowId = byIndex[i].rowId;
          var idx = byIndex[i].idx;
          var tr = findGoldRowTr(tb, rowId);
          if (!tr) continue;
          var v = readRowFromTr(tr);
          var productVal = v.productVal;
          var parentName = window.TLKVGold.variantParentProduct(d.rows, idx);
          if (parentName && productVal.toLowerCase() === parentName.toLowerCase()) {
            productVal = "";
          }
          var base = d.rows[idx];
          var row = {
            id: base.id,
            brand: base.brand,
            product: productVal,
            purity: v.purityVal,
            buy: v.buyVal,
            sell: v.sellVal,
            metal: base.metal,
            highlight: base.highlight === true,
          };
          d.rows[idx] = row;
          auditEntries.push({
            before: oldById[rowId],
            after: snapshotGoldAuditRow(row),
          });
        }

        if (auditEntries.length === 0) {
          throw new Error("Không có dòng hợp lệ để lưu.");
        }

        stampMetaOnPayload(d);
        console.log("[TLKV gold-push] admin: commitGoldInlineEdit → saveToStorage (rows=" + d.rows.length + ")");
        return window.TLKVGold.saveToStorage(d);
      })
      .then(function () {
        console.log("[TLKV gold-push] admin: commitGoldInlineEdit → saveToStorage OK", { entries: auditEntries.length });
        console.log("[commitGoldInlineEdit] saveToStorage OK. auditEntries:", auditEntries.length, "sb:", !!sb, "TLKVAudit:", !!window.TLKVAudit);
        if (!sb || !window.TLKVAudit || auditEntries.length === 0) {
          console.warn("[commitGoldInlineEdit] skipping audit:", !sb ? "no sb" : !window.TLKVAudit ? "no TLKVAudit" : "0 entries");
          return { saved: true, auditOk: true, auditErrors: [] };
        }
        var auditErrors = [];
        var chain = Promise.resolve();
        auditEntries.forEach(function (entry) {
          chain = chain.then(function () {
            var after = entry.after;
            var en =
              after.brand +
              " — " +
              (String(after.product || "").trim() || "—") +
              " — " +
              after.purity;
            return window.TLKVAudit.logGold(sb, {
              action: "row_update",
              entity_name: en,
              entity_id: after.id,
              summary: buildGoldRowChangeSummary(entry.before, entry.after),
              payload: { before: entry.before, after: entry.after },
            }).catch(function (auditErr) {
              console.error("[commitGoldInlineEdit] audit log failed for", after.id, auditErr);
              auditErrors.push({ id: after.id, error: auditErr });
            });
          });
        });
        return chain.then(function () {
          return { saved: true, auditOk: auditErrors.length === 0, auditErrors: auditErrors };
        });
      })
      .then(function (result) {
        var n = auditEntries.length;
        if (result && result.auditErrors && result.auditErrors.length > 0) {
          var failCount = result.auditErrors.length;
          showAdminToast("Đã lưu " + n + " dòng giá. ⚠ " + failCount + "/" + n + " dòng không ghi được lịch sử.");
          console.warn("Audit errors:", result.auditErrors);
          var errMsg = result.auditErrors[0].error;
          alert(
            "Giá đã lưu thành công, nhưng ghi lịch sử thay đổi thất bại (" + failCount + " dòng).\n\n" +
            "Lỗi: " + (errMsg && errMsg.message ? errMsg.message : String(errMsg)) + "\n\n" +
            "Kiểm tra:\n" +
            "1. Đã chạy SQL tạo bảng gold_price_change_log chưa?\n" +
            "2. RLS policy INSERT có đúng email admin không?\n" +
            "3. Mở Console (F12) để xem chi tiết."
          );
        } else {
          showAdminToast(n === 1 ? "Đã lưu 1 dòng giá." : "Đã lưu " + n + " dòng giá.");
        }
        clearGoldInlineEdit();
        refreshTable();
        refreshMetaForm();
        if (currentTab === "gold") refreshGoldHistory();
      })
      .catch(function (err) {
        console.error(err);
        alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
      });
  }

  /* ───── refreshMetaForm ───── */
  async function refreshMetaForm() {
    if (!canPerform("gold")) return;
    if (!window.TLKVGold) return;
    var d;
    try {
      d = await window.TLKVGold.getGoldTable();
    } catch (err) {
      console.error(err);
      return;
    }
    var m = (d && d.meta) || {};
    var el = function (id) {
      return document.getElementById(id);
    };
    el("meta-header-time").value = m.headerTime || "";
    el("meta-footer-note").value = m.footerNote || "";
    el("meta-unit-line").value = m.unitLine || "";
    el("meta-brand-italic").value = m.brandItalic || "";
  }

  /* ───── refreshTable (bảng giá — mỗi dòng một hàng, sửa inline) ───── */
  async function refreshTable() {
    if (!canPerform("gold")) return;
    var data;
    try {
      data = await window.TLKVGold.getGoldTable();
    } catch (err) {
      console.error(err);
      var tbErr = $("admin-rows");
      if (tbErr) {
        tbErr.innerHTML =
          "<tr><td colspan=\"8\">Không tải bảng giá từ Supabase: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      }
      setGoldThayDoiVisible(false);
      return;
    }
    var tb = $("admin-rows");
    tb.innerHTML = "";
    var rows = (data && data.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var isEditing = !!goldInlineEditRowIds[r.id];
      var productShown =
        String(r.product || "").trim() ||
        (i >= 0 ? window.TLKVGold.variantParentProduct(rows, i) : "");
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", r.id);
      if (r.metal === "silver") tr.classList.add("row-silver");
      if (r.highlight === true) tr.classList.add("row-highlight");

      var tdId = document.createElement("td");
      tdId.textContent = r.id;
      tr.appendChild(tdId);

      var tdBrand = document.createElement("td");
      tdBrand.textContent = r.brand;
      tr.appendChild(tdBrand);

      var tdProd = document.createElement("td");
      if (isEditing) {
        var inProd = document.createElement("input");
        inProd.type = "text";
        inProd.className = "admin-gold-inline-input";
        inProd.setAttribute("data-inline-field", "product");
        inProd.value = productShown;
        tdProd.appendChild(inProd);
      } else {
        tdProd.textContent = productShown;
      }
      tr.appendChild(tdProd);

      var tdPur = document.createElement("td");
      if (isEditing) {
        var inPur = document.createElement("input");
        inPur.type = "text";
        inPur.className = "admin-gold-inline-input";
        inPur.setAttribute("data-inline-field", "purity");
        inPur.value = r.purity;
        tdPur.appendChild(inPur);
      } else {
        tdPur.textContent = r.purity;
      }
      tr.appendChild(tdPur);

      var tdBuy = document.createElement("td");
      if (isEditing) {
        var inBuy = document.createElement("input");
        inBuy.type = "text";
        inBuy.className = "admin-gold-inline-input";
        inBuy.setAttribute("data-inline-field", "buy");
        inBuy.value = r.buy;
        tdBuy.appendChild(inBuy);
      } else {
        tdBuy.textContent = r.buy;
      }
      tr.appendChild(tdBuy);

      var tdSell = document.createElement("td");
      if (isEditing) {
        var inSell = document.createElement("input");
        inSell.type = "text";
        inSell.className = "admin-gold-inline-input";
        inSell.setAttribute("data-inline-field", "sell");
        inSell.value = r.sell;
        tdSell.appendChild(inSell);
      } else {
        tdSell.textContent = r.sell;
      }
      tr.appendChild(tdSell);

      var tdMetal = document.createElement("td");
      tdMetal.textContent = r.metal;
      tr.appendChild(tdMetal);

      var tdAct = document.createElement("td");
      tdAct.className = "admin-cell-actions";
      if (isEditing) {
        var bCancel = document.createElement("button");
        bCancel.type = "button";
        bCancel.className = "admin-btn-inline-secondary btn-gold-inline-cancel";
        bCancel.setAttribute("data-id", r.id);
        bCancel.textContent = "Hủy";
        var bDelEd = document.createElement("button");
        bDelEd.type = "button";
        bDelEd.className = "btn-del";
        bDelEd.setAttribute("data-id", r.id);
        bDelEd.textContent = "Xóa";
        tdAct.appendChild(bCancel);
        tdAct.appendChild(bDelEd);
      } else {
        var bEdit = document.createElement("button");
        bEdit.type = "button";
        bEdit.className = "btn-edit";
        bEdit.setAttribute("data-id", r.id);
        bEdit.textContent = "Sửa";
        var bDel = document.createElement("button");
        bDel.type = "button";
        bDel.className = "btn-del";
        bDel.setAttribute("data-id", r.id);
        bDel.textContent = "Xóa";
        tdAct.appendChild(bEdit);
        tdAct.appendChild(bDel);
      }
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    }

    setGoldThayDoiVisible(goldInlineEditHasAny());

    tb.querySelectorAll(".btn-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!canPerform("gold")) return;
        var id = btn.getAttribute("data-id");
        if (!confirm("Xóa dòng này?")) return;
        if (goldInlineEditRowIds[id]) {
          delete goldInlineEditRowIds[id];
          if (!goldInlineEditHasAny()) setGoldThayDoiVisible(false);
        }
        var removedRow = null;
        window.TLKVGold
          .getGoldTable()
          .then(function (d) {
            removedRow = d.rows.find(function (x) {
              return x.id === id;
            });
            d.rows = d.rows.filter(function (x) {
              return x.id !== id;
            });
            stampMetaOnPayload(d);
            console.log("[TLKV gold-push] admin: delete row → saveToStorage", id);
            return window.TLKVGold.saveToStorage(d);
          })
          .then(function () {
            console.log("[TLKV gold-push] admin: delete row → saveToStorage OK", id);
            if (sb && window.TLKVAudit && removedRow) {
              var en =
                removedRow.brand +
                " — " +
                (String(removedRow.product || "").trim() || "—") +
                " — " +
                removedRow.purity;
              return window.TLKVAudit.logGold(sb, {
                action: "row_delete",
                entity_name: en,
                entity_id: removedRow.id,
                summary: buildGoldRowDeleteSummary(removedRow),
                payload: { before: snapshotGoldAuditRow(removedRow) },
              });
            }
          })
          .then(function () {
            showAdminToast("Đã xóa dòng giá.");
            refreshTable();
            refreshMetaForm();
            if (currentTab === "gold") refreshGoldHistory();
          })
          .catch(function (err) {
            console.error(err);
            alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
          });
      });
    });

    tb.querySelectorAll(".btn-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!canPerform("gold")) return;
        var id = btn.getAttribute("data-id");
        if (!id) return;
        if (goldInlineEditRowIds[id]) {
          delete goldInlineEditRowIds[id];
        } else {
          goldInlineEditRowIds[id] = true;
        }
        refreshTable();
      });
    });

    tb.querySelectorAll(".btn-gold-inline-cancel").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (id && goldInlineEditRowIds[id]) delete goldInlineEditRowIds[id];
        if (!goldInlineEditHasAny()) setGoldThayDoiVisible(false);
        refreshTable();
      });
    });
  }

  /* ───── refreshProductsTable ───── */
  function refreshProductsTable() {
    if (!canPerform("products")) return;
    if (window.TLKVCatalogAdmin && typeof window.TLKVCatalogAdmin.refreshProductsTableAdmin === "function") {
      window.TLKVCatalogAdmin.refreshProductsTableAdmin();
      return;
    }
    if (!window.TLKVProducts) return;
    window.TLKVProducts.getProducts()
      .then(function (data) {
        var tb = $("admin-product-rows");
        if (!tb) return;
        if (!data || !Array.isArray(data.items)) {
          tb.innerHTML =
            "<tr><td colspan=\"6\" class=\"admin-empty-hint\">Phản hồi sản phẩm không hợp lệ.</td></tr>";
          return;
        }
        tb.innerHTML = "";
        if (data.items.length === 0) {
          var tr = document.createElement("tr");
          tr.innerHTML =
            "<td colspan=\"6\" class=\"admin-empty-hint\"><strong>0 sản phẩm.</strong> Kiểm tra RLS: cần policy SELECT trên bảng <code>products</code>.</td>";
          tb.appendChild(tr);
          return;
        }
        data.items.forEach(function (p) {
          var tr = document.createElement("tr");
          var imgSrc = window.TLKVProducts.resolveProductImageSrc(p.image);
          var tdThumb =
            imgSrc !== ""
              ? '<td><img class="admin-product-thumb" src="' +
              escapeAttr(imgSrc) +
              '" alt="" loading="lazy" width="48" height="48" /></td>'
              : "<td>—</td>";
          tr.innerHTML =
            "<td>" +
            escapeHtml(p.id) +
            "</td>" +
            tdThumb +
            "<td>" +
            escapeHtml(p.name) +
            "</td>" +
            "<td>" +
            escapeHtml(p.category) +
            "</td>" +
            "<td>" +
            escapeHtml(p.priceText) +
            "</td>" +
            '<td><div class="admin-cell-actions">' +
            '<button type="button" class="btn-edit btn-edit-product" data-id="' +
            escapeAttr(p.id) +
            '">Sửa</button>' +
            '<button type="button" class="btn-del btn-del-product" data-id="' +
            escapeAttr(p.id) +
            '">Xóa</button></div></td>';
          tb.appendChild(tr);
        });

        tb.querySelectorAll(".btn-del-product").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!canPerform("products")) return;
            var id = btn.getAttribute("data-id");
            if (!confirm("Xóa sản phẩm này?")) return;
            var removed = null;
            window.TLKVProducts
              .getProducts()
              .then(function (d) {
                removed = d.items.find(function (x) {
                  return x.id === id;
                });
                d.items = d.items.filter(function (x) {
                  return x.id !== id;
                });
                return window.TLKVProducts.saveToStorage(d);
              })
              .then(function () {
                if (!sb || !window.TLKVAudit || !removed || !window.TLKVAudit.logProductSafe) return;
                return sb.auth.getUser().then(function (u) {
                  var actorEmail = (u.data && u.data.user && u.data.user.email) || "";
                  return window.TLKVAudit.logProductSafe(
                    sb,
                    {
                      action: "product_delete",
                      entity_name: removed.name || removed.id,
                      entity_id: removed.id,
                      summary: "Đã xóa sản phẩm",
                      payload: removed,
                    },
                    actorEmail
                  );
                });
              })
              .then(function () {
                showAdminToast("Đã xóa sản phẩm.");
                refreshProductsTable();
                if (currentTab === "products") refreshProductHistory();
              })
              .catch(function (err) {
                console.error(err);
                alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
              });
          });
        });

        tb.querySelectorAll(".btn-edit-product").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            window.TLKVProducts.getProducts().then(function (d) {
              var row = d.items.find(function (x) {
                return x.id === id;
              });
              if (!row) return;
              if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.loadForEdit) {
                window.TLKVProductFormAdmin.loadForEdit(row);
                return;
              }
              $("pf-id").value = row.id;
              $("pf-name").value = row.name;
              $("pf-category").value = row.category;
              $("pf-priceText").value = row.priceText;
              if ($("pf-weight")) $("pf-weight").value = row.weight != null ? String(row.weight) : "";
              if ($("pf-image")) $("pf-image").value = row.image || "";
              $("product-form-title").textContent = "Sửa sản phẩm";
            });
          });
        });
      })
      .catch(function (err) {
        console.error(err);
        var tb = $("admin-product-rows");
        if (tb) {
          tb.innerHTML =
            "<tr><td colspan=\"6\">Không tải sản phẩm từ Supabase: " +
            escapeHtml(err && err.message ? err.message : String(err)) +
            "</td></tr>";
        }
      });
  }

  function resetProductForm() {
    if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.resetToCreateMode) {
      window.TLKVProductFormAdmin.resetToCreateMode();
      return;
    }
    if (typeof clearProductForm === "function") clearProductForm();
  }

  /* ───── applySession ───── */
  async function applySession(session) {
    if (applyingSession) return;
    applyingSession = true;
    try {
      await _applySession(session);
    } finally {
      applyingSession = false;
    }
  }

  async function _applySession(session) {
    var wasAuthed = adminAuthed;

    if (!session || !sb) {
      adminAuthed = false;
      if (Access) Access.clearCurrentAccess();
      showLogin();
      return;
    }

    var access =
      Access && typeof Access.resolveFromSupabase === "function"
        ? await Access.resolveFromSupabase(sb)
        : null;

    if (!access || !access.email) {
      adminAuthed = false;
      if (Access) Access.clearCurrentAccess();
      try {
        await sb.auth.signOut();
      } catch (_) {}
      showLogin();
      return;
    }

    adminAuthed = true;
    if (Access) Access.setCurrentAccess(access);

    if (Access && typeof Access.applyMainAdminNavVisibility === "function") {
      Access.applyMainAdminNavVisibility(access);
    }

    var defaultTab =
      Access && typeof Access.defaultModule === "function"
        ? Access.defaultModule(access)
        : "gold";

    if (!wasAuthed) {
      currentTab = defaultTab || "gold";
      switchTab(currentTab);
    } else if (Access && !Access.canAccessModule(access, currentTab)) {
      currentTab = defaultTab || currentTab;
      switchTab(currentTab);
    }

    showAdmin();

    if (access.canAccessGoldManagement) {
      refreshTable();
      refreshMetaForm();
      if (window.TLKVGold && typeof window.TLKVGold.startGoldPush === "function") {
        console.log("[TLKV gold-push] admin: session authed → bật pipeline SSE để quan sát push");
        window.TLKVGold.startGoldPush();
      }
    }
    if (access.canAccessContentManagement) {
      refreshProductsTable();
    }
  }

  /* ───── bootSupabaseAuth ───── */
  async function bootSupabaseAuth() {
    setBodyAuthState("pending");
    try {
      if (window.TLKVSupabase && typeof window.TLKVSupabase.getSupabaseClient === "function") {
        sb = await window.TLKVSupabase.getSupabaseClient();
      } else {
        const cfg =
          typeof globalThis !== "undefined" && globalThis.__TLKV_SUPABASE__
            ? globalThis.__TLKV_SUPABASE__
            : { url: "", anonKey: "" };
        const url = String(cfg.url || "").trim();
        const key = String(cfg.anonKey || "").trim();
        const sdk = typeof globalThis !== "undefined" ? globalThis.supabase : null;
        sb = url && key && sdk && typeof sdk.createClient === "function" ? sdk.createClient(url, key) : null;
      }
    } catch (e) {
      console.error(e);
      sb = null;
    }
    if (!sb) {
      showLogin();
      var panel = $("login-panel");
      if (panel) {
        var errEl = $("login-env-error");
        if (!errEl) {
          errEl = document.createElement("p");
          errEl.id = "login-env-error";
          errEl.className = "hint";
          errEl.style.color = "#b91c1c";
          panel.appendChild(errEl);
        }
        errEl.textContent =
          "Thiếu NEXT_PUBLIC_SUPABASE_URL / key trong .env hoặc .env.local — không đăng nhập được.";
      }
      return;
    }

    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;

    await applySession(session);

    sb.auth.onAuthStateChange(function (event, newSession) {
      if (event === "INITIAL_SESSION") return;
      /* TOKEN_REFRESHED only rotates the JWT — user identity and permissions are unchanged.
         Skip the full applySession cycle to avoid redundant DOM writes and getUser() round-trips. */
      if (event === "TOKEN_REFRESHED" && adminAuthed) return;
      applySession(newSession);
    });
  }

  /* ───── DOMContentLoaded: form bindings ───── */
  document.addEventListener("DOMContentLoaded", function () {
    bootSupabaseAuth();

    $("tab-btn-gold")?.addEventListener("click", function () {
      if (!canPerform("gold")) return;
      switchTab("gold");
    });
    $("tab-btn-products")?.addEventListener("click", function () {
      if (!canPerform("products")) return;
      switchTab("products");
    });

    $("gold-hist-refresh")?.addEventListener("click", refreshGoldHistory);
    $("product-hist-refresh")?.addEventListener("click", refreshProductHistory);
    $("gold-hist-search")?.addEventListener("input", debounceGoldHistory);
    $("gold-hist-date-from")?.addEventListener("change", refreshGoldHistory);
    $("gold-hist-date-to")?.addEventListener("change", refreshGoldHistory);
    $("product-hist-search")?.addEventListener("input", debounceProductHistory);
    $("product-hist-date-from")?.addEventListener("change", refreshProductHistory);
    $("product-hist-date-to")?.addEventListener("change", refreshProductHistory);

    $("login-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("login-user").value.trim();
      var password = $("login-pass").value;
      if (!sb) {
        alert("Chưa có client Supabase. Kiểm tra .env.local và chạy npm start.");
        return;
      }
      sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) {
          alert(res.error.message);
          return;
        }
      });
    });

    $("btn-logout")?.addEventListener("click", function () {
      clearGoldInlineEdit();
      if (sb) sb.auth.signOut();
      else showLogin();
    });

    $("btn-reset-json")?.addEventListener("click", function () {
      if (!canPerform("gold")) return;
      if (!confirm("Xóa khóa localStorage cũ của bảng giá (nếu có)? Dữ liệu trên Supabase không bị xóa."))
        return;
      window.TLKVGold.clearStorage();
      refreshTable();
      refreshMetaForm();
    });

    $("meta-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!canPerform("gold")) return;
      var meta = {
        headerTime: $("meta-header-time").value.trim(),
        footerNote: $("meta-footer-note").value.trim(),
        unitLine: $("meta-unit-line").value.trim(),
        brandItalic: $("meta-brand-italic").value.trim(),
      };
      console.log("[TLKV gold-push] admin: meta-form submit → saveGoldMetaOnly", meta);
      window.TLKVGold
        .saveGoldMetaOnly(meta)
        .then(function () {
          console.log("[TLKV gold-push] admin: saveGoldMetaOnly OK");
          if (sb && window.TLKVAudit) {
            return window.TLKVAudit.logGold(sb, {
              action: "meta_update",
              entity_name: "META — " + (meta.headerTime || "bảng giá"),
              entity_id: "gold_meta:1",
              summary: "Cập nhật thời gian & đơn vị hiển thị",
              payload: meta,
            });
          }
        })
        .then(function () {
          showAdminToast("Đã lưu meta.");
          refreshMetaForm();
          if (currentTab === "gold") refreshGoldHistory();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được meta lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    function resetForm() {
      $("f-id").value = "";
      $("f-brand").value = "";
      $("f-product").value = "";
      $("f-purity").value = "";
      $("f-buy").value = "";
      $("f-sell").value = "";
      $("f-metal").value = "gold";
      if ($("f-highlight")) $("f-highlight").checked = false;
      $("form-title").textContent = "Thêm dòng";
    }

    $("btn-new")?.addEventListener("click", function () {
      if (!canPerform("gold")) return;
      resetForm();
    });

    function syncSilverIfBacBrand() {
      var bEl = $("f-brand");
      var mEl = $("f-metal");
      if (!bEl || !mEl || !window.TLKVGold) return;
      if (window.TLKVGold.brandsMatch(bEl.value.trim(), "Bạc")) {
        mEl.value = "silver";
      }
    }
    $("f-brand")?.addEventListener("input", syncSilverIfBacBrand);
    $("f-brand")?.addEventListener("change", syncSilverIfBacBrand);

    $("row-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!canPerform("gold")) return;
      var wasEdit = false;
      var savedRow = null;
      var beforeSnapshot = null;
      window.TLKVGold
        .getGoldTable()
        .then(function (d) {
          var metal = $("f-metal").value === "silver" ? "silver" : "gold";
          var brandVal = $("f-brand").value.trim();
          if (window.TLKVGold.brandsMatch(brandVal, "Bạc")) {
            metal = "silver";
            $("f-metal").value = "silver";
          }
          var id = $("f-id").value.trim();
          var idx = d.rows.findIndex(function (x) {
            return x.id === id;
          });
          wasEdit = idx >= 0;
          if (wasEdit) beforeSnapshot = snapshotGoldAuditRow(d.rows[idx]);
          var productVal = $("f-product").value.trim();
          if (idx >= 0) {
            var parentName = window.TLKVGold.variantParentProduct(d.rows, idx);
            if (parentName && productVal.toLowerCase() === parentName.toLowerCase()) {
              productVal = "";
            }
          }
          var row = {
            id: id || "r-" + Date.now(),
            brand: $("f-brand").value.trim(),
            product: productVal,
            purity: $("f-purity").value.trim(),
            buy: $("f-buy").value.trim(),
            sell: $("f-sell").value.trim(),
            metal: metal,
            highlight: $("f-highlight") ? $("f-highlight").checked : false,
          };
          savedRow = row;
          if (idx >= 0) {
            d.rows[idx] = row;
          } else if (metal === "silver") {
            d.rows = window.TLKVGold.insertSilverRow(d.rows, row);
          } else {
            d.rows = window.TLKVGold.insertGoldRow(d.rows, row);
          }
          stampMetaOnPayload(d);
          console.log("[TLKV gold-push] admin: form save → saveToStorage");
          return window.TLKVGold.saveToStorage(d);
        })
        .then(function () {
          console.log("[TLKV gold-push] admin: form save → saveToStorage OK");
          if (sb && window.TLKVAudit && savedRow) {
            var afterSnap = snapshotGoldAuditRow(savedRow);
            var en =
              savedRow.brand +
              " — " +
              (String(savedRow.product || "").trim() || "—") +
              " — " +
              savedRow.purity;
            var summary = wasEdit && beforeSnapshot
              ? buildGoldRowChangeSummary(beforeSnapshot, afterSnap)
              : buildGoldRowInsertSummary(savedRow);
            var payload = wasEdit && beforeSnapshot
              ? { before: beforeSnapshot, after: afterSnap }
              : { after: afterSnap };
            return window.TLKVAudit.logGold(sb, {
              action: wasEdit ? "row_update" : "row_insert",
              entity_name: en,
              entity_id: savedRow.id,
              summary: summary,
              payload: payload,
            });
          }
        })
        .then(function () {
          showAdminToast("Đã lưu dòng giá.");
          refreshTable();
          refreshMetaForm();
          resetForm();
          if (currentTab === "gold") refreshGoldHistory();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được dòng lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    window.addEventListener("tlkv:gold-table-changed", function () {
      if (adminAuthed) {
        clearGoldInlineEdit();
        refreshTable();
        refreshMetaForm();
      }
    });

    $("btn-gold-thay-doi")?.addEventListener("click", function () {
      if (!canPerform("gold")) return;
      commitGoldInlineEdit();
    });

    $("btn-product-new")?.addEventListener("click", function () {
      if (!canPerform("products")) return;
      resetProductForm();
    });

    $("product-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!canPerform("products")) return;
      if (document.getElementById("pf-brand-id")) return;
      if (!window.TLKVProducts) return;

      const isEdit = !!$("pf-id").value.trim();
      let savedItem = null;

      // Disable submit button
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn?.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Đang lưu...';
      }

      window.TLKVProducts
        .getProducts()
        .then(function (d) {
          const id = $("pf-id").value.trim();
          const item = {
            id: id || "p-" + Date.now(),
            name: $("pf-name").value.trim(),
            category: $("pf-category").value.trim(),
            priceText: $("pf-priceText").value.trim(),
            image: $("pf-image") ? $("pf-image").value.trim() : "",
          };
          savedItem = item;
          const idx = d.items.findIndex(function (x) { return x.id === item.id; });
          if (idx >= 0) d.items[idx] = item;
          else d.items.push(item);
          return window.TLKVProducts.saveToStorage(d);
        })
        .then(function () {
          if (!sb || !window.TLKVAudit || !savedItem || !window.TLKVAudit.logProductSafe) return;
          return sb.auth.getUser().then(function (u) {
            var actorEmail = (u.data && u.data.user && u.data.user.email) || "";
            return window.TLKVAudit.logProductSafe(
              sb,
              {
                action: isEdit ? "product_update" : "product_insert",
                entity_name: savedItem.name || savedItem.id,
                entity_id: savedItem.id,
                summary: isEdit ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới",
                payload: savedItem,
              },
              actorEmail
            );
          });
        })
        .then(function () {
          showToast(isEdit ? "✅ Đã cập nhật sản phẩm." : "✅ Đã thêm sản phẩm mới.", "success");

          // ========== QUAN TRỌNG: CLEAR FORM SAU KHI LƯU ==========
          clearProductForm();

          refreshProductsTable();
          if (currentTab === "products") refreshProductHistory();
        })
        .catch(function (err) {
          console.error(err);
          showToast("❌ Lỗi: " + (err && err.message ? err.message : "Không lưu được sản phẩm"), "error");
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText || '💾 Lưu sản phẩm';
          }
        });
    });

    window.addEventListener("tlkv:products-changed", function () {
      if (adminAuthed) refreshProductsTable();
    });


    // ========== ĐỔI MẬT KHẨU ==========

    // Mở modal
    document.getElementById('btn-change-password')?.addEventListener('click', function () {
      const modal = document.getElementById('change-password-modal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('password-strength').innerHTML = '';
        document.getElementById('password-match').innerHTML = '';
      }
    });

    // Đóng modal
    function closePasswordModal() {
      const modal = document.getElementById('change-password-modal');
      if (modal) modal.style.display = 'none';
    }

    document.getElementById('close-password-modal')?.addEventListener('click', closePasswordModal);
    document.getElementById('cancel-password-btn')?.addEventListener('click', closePasswordModal);

    // Click outside modal to close
    document.querySelector('.admin-modal-overlay')?.addEventListener('click', closePasswordModal);

    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', function () {
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          this.textContent = input.type === 'password' ? '👁️' : '🙈';
        }
      });
    });

    // Kiểm tra độ mạnh mật khẩu
    document.getElementById('new-password')?.addEventListener('input', function () {
      const password = this.value;
      const strengthDiv = document.getElementById('password-strength');
      let strength = '';
      let strengthClass = '';

      if (password.length === 0) {
        strength = '';
      } else if (password.length < 6) {
        strength = '❌ Quá ngắn (tối thiểu 6 ký tự)';
        strengthClass = 'weak';
      } else if (password.length < 8) {
        strength = '⚠️ Yếu';
        strengthClass = 'weak';
      } else if (password.length < 10) {
        strength = '🟡 Trung bình';
        strengthClass = 'medium';
      } else {
        strength = '✅ Mạnh';
        strengthClass = 'strong';
      }

      strengthDiv.innerHTML = strength;
      strengthDiv.className = 'password-strength ' + strengthClass;

      // Kiểm tra match
      checkPasswordMatch();
    });

    // Kiểm tra mật khẩu khớp
    function checkPasswordMatch() {
      const newPass = document.getElementById('new-password').value;
      const confirmPass = document.getElementById('confirm-password').value;
      const matchDiv = document.getElementById('password-match');

      if (confirmPass.length === 0) {
        matchDiv.innerHTML = '';
        return;
      }

      if (newPass === confirmPass) {
        matchDiv.innerHTML = '✅ Mật khẩu khớp';
        matchDiv.className = 'password-match match';
      } else {
        matchDiv.innerHTML = '❌ Mật khẩu không khớp';
        matchDiv.className = 'password-match not-match';
      }
    }

    document.getElementById('confirm-password')?.addEventListener('input', checkPasswordMatch);

    // Submit đổi mật khẩu
    document.getElementById('change-password-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();

      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const submitBtn = document.getElementById('submit-password-btn');
      const originalText = submitBtn.textContent;

      // Kiểm tra mật khẩu khớp
      if (newPassword !== confirmPassword) {
        showAdminToast('❌ Mật khẩu mới không khớp');
        return;
      }

      // Kiểm tra độ dài
      if (newPassword.length < 6) {
        showAdminToast('❌ Mật khẩu mới phải có ít nhất 6 ký tự');
        return;
      }

      // Kiểm tra mật khẩu mới có giống mật khẩu cũ không
      if (newPassword === currentPassword) {
        showAdminToast('❌ Mật khẩu mới phải khác mật khẩu hiện tại');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Đang xử lý...';

      try {
        const { error } = await sb.auth.updateUser({
          password: newPassword
        });

        if (error) {
          // Xử lý các lỗi cụ thể
          if (error.message.includes('New password should be different')) {
            showAdminToast('❌ Mật khẩu mới phải khác mật khẩu hiện tại');
          } else if (error.message.includes('Password should be at least 6 characters')) {
            showAdminToast('❌ Mật khẩu phải có ít nhất 6 ký tự');
          } else {
            showAdminToast('❌ ' + error.message);
          }
          return;
        }

        // Thành công
        showAdminToast('✅ Đổi mật khẩu thành công! Vui lòng đăng nhập lại.');
        closePasswordModal();

        // Reset form
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

      } catch (error) {
        console.error('Change password error:', error);
        showAdminToast('❌ ' + (error.message || 'Đổi mật khẩu thất bại'));
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
    // ========== ĐỔI MẬT KHẨU ==========

    // Mở modal
    document.getElementById('btn-change-password')?.addEventListener('click', function () {
      const modal = document.getElementById('change-password-modal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('password-strength').innerHTML = '';
        document.getElementById('password-match').innerHTML = '';
      }
    });

    // Đóng modal
    function closePasswordModal() {
      const modal = document.getElementById('change-password-modal');
      if (modal) modal.style.display = 'none';
    }

    document.getElementById('close-password-modal')?.addEventListener('click', closePasswordModal);
    document.getElementById('cancel-password-btn')?.addEventListener('click', closePasswordModal);

    // Click outside modal to close
    document.querySelector('.admin-modal-overlay')?.addEventListener('click', closePasswordModal);

    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', function () {
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          this.textContent = input.type === 'password' ? '👁️' : '🙈';
        }
      });
    });

    // Kiểm tra độ mạnh mật khẩu
    document.getElementById('new-password')?.addEventListener('input', function () {
      const password = this.value;
      const strengthDiv = document.getElementById('password-strength');
      let strength = '';
      let strengthClass = '';

      if (password.length === 0) {
        strength = '';
      } else if (password.length < 6) {
        strength = '❌ Quá ngắn (tối thiểu 6 ký tự)';
        strengthClass = 'weak';
      } else if (password.length < 8) {
        strength = '⚠️ Yếu';
        strengthClass = 'weak';
      } else if (password.length < 10) {
        strength = '🟡 Trung bình';
        strengthClass = 'medium';
      } else {
        strength = '✅ Mạnh';
        strengthClass = 'strong';
      }

      strengthDiv.innerHTML = strength;
      strengthDiv.className = 'password-strength ' + strengthClass;

      // Kiểm tra match
      checkPasswordMatch();
    });

    // Kiểm tra mật khẩu khớp
    function checkPasswordMatch() {
      const newPass = document.getElementById('new-password').value;
      const confirmPass = document.getElementById('confirm-password').value;
      const matchDiv = document.getElementById('password-match');

      if (confirmPass.length === 0) {
        matchDiv.innerHTML = '';
        return;
      }

      if (newPass === confirmPass) {
        matchDiv.innerHTML = '✅ Mật khẩu khớp';
        matchDiv.className = 'password-match match';
      } else {
        matchDiv.innerHTML = '❌ Mật khẩu không khớp';
        matchDiv.className = 'password-match not-match';
      }
    }

    document.getElementById('confirm-password')?.addEventListener('input', checkPasswordMatch);
  });
})();
async function getCurrentGoldHistoryData() {
  // Lấy dữ liệu từ bảng đang hiển thị
  const rows = document.querySelectorAll('#gold-history-rows tr');
  const data = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      data.push({
        created_at: cells[0]?.textContent?.trim() || '',
        action_type: cells[1]?.textContent?.trim() || '',
        item_name: cells[2]?.textContent?.trim() || '',
        item_new_price: cells[3]?.textContent?.trim() || '',
        description: cells[4]?.textContent?.trim() || ''
      });
    }
  }

  return data;
}

// Xuất Excel (CSV)
// ========== XUẤT FILE LỊCH SỬ GIÁ VÀNG ==========

async function exportGoldHistoryToExcel() {
  // Lấy dữ liệu HIỆN TẠI đang hiển thị trên bảng (đã filter)
  const rows = document.querySelectorAll('#gold-history-rows tr');
  const data = [];

  for (const row of rows) {
    // Bỏ qua hàng empty state
    if (row.querySelector('.history-empty')) continue;

    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      // Lấy text content từ mỗi cell
      let time = cells[0]?.textContent?.trim() || '';
      let action = cells[1]?.textContent?.trim() || '';
      let name = cells[2]?.textContent?.trim() || '';
      let newPrice = cells[3]?.textContent?.trim() || '';
      let description = cells[4]?.textContent?.trim() || '';

      // Làm sạch action (bỏ icon)
      action = action.replace(/[➕✏️🗑️⚙️]/g, '').trim();

      data.push({ time, action, name, newPrice, description });
    }
  }

  if (!data.length) {
    showToast('Không có dữ liệu để xuất', 'error');
    return;
  }

  // Lấy giá trị filter hiện tại
  const searchName = document.getElementById('gold-hist-search')?.value?.trim() || '';
  const filterFrom = document.getElementById('gold-hist-date-from')?.value || '';
  const filterTo = document.getElementById('gold-hist-date-to')?.value || '';

  // Tạo tên file
  let fileName = 'Thăng-Long-Kim-Việt-Lịch-Sử-Giá-Vàng';

  const rangeTag =
    filterFrom && filterTo ? `${filterFrom}_${filterTo}` : filterFrom || filterTo || "";
  if (searchName && rangeTag) {
    fileName += `_${searchName}_${rangeTag}`;
  } else if (searchName) {
    fileName += `_${searchName}`;
  } else if (rangeTag) {
    fileName += `_${rangeTag}`;
  }

  // Thêm số bản ghi
  fileName += `_${data.length}_ban_ghi`;

  // Thay thế ký tự đặc biệt
  fileName = fileName
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 200);

  // Tạo nội dung CSV
  const headers = ['Thời gian', 'Thao tác', 'Tên / nhãn', 'Giá mới', 'Mô tả'];
  const csvRows = [headers];

  for (const item of data) {
    csvRows.push([
      `"${item.time.replace(/"/g, '""')}"`,
      `"${item.action.replace(/"/g, '""')}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.newPrice.replace(/"/g, '""')}"`,
      `"${item.description.replace(/"/g, '""')}"`
    ].join(','));
  }

  const csvContent = csvRows.join('\n');
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Đã xuất ${data.length} bản ghi`, 'success');
}

// Xuất PDF
async function exportGoldHistoryToPDF() {
  const data = await getCurrentGoldHistoryData();

  if (!data.length) {
    showToast('Không có dữ liệu để xuất', 'error');
    return;
  }

  // Tải thư viện html2pdf nếu chưa có
  if (typeof html2pdf === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => exportGoldHistoryToPDF();
    document.head.appendChild(script);
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleString('vi-VN');

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Lịch sử giá vàng</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #c9a03d; text-align: center; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        tr:nth-child(even) { background: #f9f9f9; }
        .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #999; }
      </style>
    </head>
    <body>
      <h1>THĂNG LONG KIM VIỆT</h1>
      <div class="subtitle">LỊCH SỬ THAY ĐỔI GIÁ VÀNG</div>
      <div style="margin-bottom: 10px; font-size: 12px; color: #555;">
        Ngày xuất: ${dateStr} | Tổng số bản ghi: ${data.length}
      </div>
      <table>
        <thead>
          <tr>
            <th>STT</th>
            <th>Thời gian</th>
            <th>Thao tác</th>
            <th>Tên / nhãn</th>
            <th>Giá mới</th>
            <th>Mô tả</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.forEach((item, idx) => {
    htmlContent += `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.created_at || ''}</td>
        <td>${item.action_type || ''}</td>
        <td>${item.item_name || ''}</td>
        <td>${item.item_new_price || ''}</td>
        <td>${item.description || ''}</td>
      </tr>
    `;
  });

  htmlContent += `
        </tbody>
      </table>
      <div class="footer">Thăng Long Kim Việt - Hệ thống quản lý giá vàng</div>
    </body>
    </html>
  `;

  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  document.body.appendChild(element);

  html2pdf().set({
    margin: [10, 10, 10, 10],
    filename: `lich-su-gia-vang_${now.toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  }).from(element).save().then(() => {
    document.body.removeChild(element);
    showToast('Đã xuất file PDF', 'success');
  }).catch(err => {
    document.body.removeChild(element);
    showToast('Lỗi xuất PDF: ' + err.message, 'error');
  });
}

// Gắn sự kiện cho nút xuất file
document.getElementById('btn-export-excel')?.addEventListener('click', exportGoldHistoryToExcel);
document.getElementById('btn-export-pdf')?.addEventListener('click', exportGoldHistoryToPDF);


// ========== UPLOAD ẢNH LÊN SUPABASE STORAGE ==========

let currentUploadFile = null;
let supabaseClient = null;


async function initSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (window.TLKVSupabase && typeof window.TLKVSupabase.getSupabaseClient === "function") {
    try {
      supabaseClient = await window.TLKVSupabase.getSupabaseClient();
      if (supabaseClient) return supabaseClient;
    } catch (e) {
      console.error("TLKVSupabase.getSupabaseClient failed:", e);
    }
  }
  var url = window.TLKV_SUPABASE_URL;
  var key = window.TLKV_SUPABASE_ANON_KEY;
  if (!url || !key || !window.supabase || typeof window.supabase.createClient !== "function") {
    return null;
  }
  supabaseClient = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "tlkv-supabase-auth",
    },
  });
  return supabaseClient;
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Hiển thị thông tin file đã chọn
function showSelectedFileInfo(file) {
  const fileInfo = document.getElementById('selected-file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const uploadBtn = document.getElementById('btn-upload-supabase');

  if (fileInfo && fileName && fileSize) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'flex';
    if (uploadBtn) uploadBtn.disabled = false;
  }
}

// Ẩn thông tin file đã chọn
function hideSelectedFileInfo() {
  const fileInfo = document.getElementById('selected-file-info');
  const uploadBtn = document.getElementById('btn-upload-supabase');
  const fileInput = document.getElementById('pf-image-file');

  if (fileInfo) fileInfo.style.display = 'none';
  if (uploadBtn) uploadBtn.disabled = true;
  if (fileInput) fileInput.value = '';
}

// Xem trước ảnh khi chọn file
document.getElementById('pf-image-file')?.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('Vui lòng chọn file ảnh (JPG, PNG, GIF)', 'error');
    this.value = '';
    return;
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ảnh quá lớn, vui lòng chọn ảnh dưới 5MB', 'error');
    this.value = '';
    return;
  }

  currentUploadFile = file;

  // Hiển thị thông tin file đã chọn
  showSelectedFileInfo(file);

  // Xem trước ảnh
  const reader = new FileReader();
  reader.onload = function (e) {
    const preview = document.getElementById('pf-image-preview');
    const container = document.getElementById('image-preview-container');
    if (preview) {
      preview.src = e.target.result;
      if (container) container.style.display = 'flex';
    }
  };
  reader.readAsDataURL(file);

  // Clear status
  const statusDiv = document.getElementById('upload-status');
  if (statusDiv) {
    statusDiv.style.display = 'none';
    statusDiv.innerHTML = '';
    statusDiv.className = 'upload-status';
  }

  console.log('✅ File selected:', file.name, formatFileSize(file.size));
});

// Hủy chọn file
document.getElementById('btn-cancel-file')?.addEventListener('click', function () {
  currentUploadFile = null;
  hideSelectedFileInfo();

  const preview = document.getElementById('pf-image-preview');
  const container = document.getElementById('image-preview-container');
  if (preview) preview.src = '';
  if (container) container.style.display = 'none';

  const statusDiv = document.getElementById('upload-status');
  if (statusDiv) {
    statusDiv.style.display = 'none';
    statusDiv.innerHTML = '';
  }

  console.log('❌ File selection cancelled');
});

// Upload ảnh lên Supabase Storage
document.getElementById('btn-upload-supabase')?.addEventListener('click', async function () {
  if (!currentUploadFile) {
    showToast('Vui lòng chọn ảnh trước', 'error');
    return;
  }

  supabaseClient = await initSupabaseClient();
  if (!supabaseClient) {
    showToast('Chưa kết nối Supabase', 'error');
    return;
  }
  var uploadUser = await supabaseClient.auth.getUser();
  if (!uploadUser.data || !uploadUser.data.user) {
    showToast('Chưa đăng nhập Supabase — đăng nhập /admin trước khi upload ảnh', 'error');
    return;
  }

  const statusDiv = document.getElementById('upload-status');
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '⏳ Đang upload lên Supabase...';
  statusDiv.className = 'upload-status loading';

  const uploadBtn = document.getElementById('btn-upload-supabase');
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '⏳ Đang upload...';

  try {
    // Immutable CDN-friendly URL: unique path per upload + long cache (parity with news-media).
    const fileExt = (currentUploadFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileUuid = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const fileName = `${fileUuid}.${fileExt}`;
    const productId = (document.getElementById('pf-id') && document.getElementById('pf-id').value.trim()) || 'new';
    const filePath = `products/${productId}/thumbnail/${fileName}`;

    console.log('📤 Uploading to:', filePath);

    // Upload lên Supabase Storage (bucket product-media)
    const { data, error } = await supabaseClient.storage
      .from('product-media')
      .upload(filePath, currentUploadFile, {
        cacheControl: '31536000',
        upsert: false,
        contentType: currentUploadFile.type
      });

    if (error) throw error;

    console.log('✅ Upload success:', data);

    // Lấy public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('product-media')
      .getPublicUrl(filePath);

    console.log('🔗 Public URL:', publicUrl);

    // Cập nhật đường dẫn ảnh vào input (+ storage path cho sync product_images khi lưu)
    document.getElementById('pf-image').value = publicUrl;
    var pathField = document.getElementById('pf-image-path');
    if (!pathField) {
      pathField = document.createElement('input');
      pathField.type = 'hidden';
      pathField.id = 'pf-image-path';
      var form = document.getElementById('pf-image') && document.getElementById('pf-image').form;
      if (form) form.appendChild(pathField);
    }
    pathField.value = filePath;

    // Cập nhật preview với URL thật
    const preview = document.getElementById('pf-image-preview');
    if (preview) {
      preview.src = publicUrl;
    }

    statusDiv.innerHTML = '✅ Upload thành công! URL đã được điền tự động.';
    statusDiv.className = 'upload-status success';
    showToast('Upload ảnh thành công', 'success');

    // Clear file selection
    currentUploadFile = null;
    hideSelectedFileInfo();
    document.getElementById('pf-image-file').value = '';

  } catch (error) {
    console.error('❌ Upload error:', error);
    statusDiv.innerHTML = '❌ ' + (error.message || 'Upload thất bại');
    statusDiv.className = 'upload-status error';
    showToast(error.message || 'Upload thất bại', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '☁️ Upload lên Supabase';
  }
});

// Xóa ảnh (clear all)
document.getElementById('btn-clear-image')?.addEventListener('click', function () {
  currentUploadFile = null;
  document.getElementById('pf-image-file').value = '';
  document.getElementById('pf-image').value = '';
  document.getElementById('pf-image-preview').src = '';
  document.getElementById('image-preview-container').style.display = 'none';
  document.getElementById('upload-status').style.display = 'none';
  hideSelectedFileInfo();
  showToast('Đã xóa ảnh', 'info');
});

// Remove preview
document.getElementById('btn-remove-preview')?.addEventListener('click', function () {
  document.getElementById('pf-image').value = '';
  document.getElementById('pf-image-preview').src = '';
  document.getElementById('image-preview-container').style.display = 'none';
});

function clearProductForm() {
  if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.resetToCreateMode) {
    window.TLKVProductFormAdmin.resetToCreateMode();
    return;
  }
  __tlkvResetProductImageUpload();
}

global.__tlkvResetProductImageUpload = function __tlkvResetProductImageUpload() {
  currentUploadFile = null;
  var fileInput = document.getElementById("pf-image-file");
  if (fileInput) fileInput.value = "";
  var fileInfo = document.getElementById("selected-file-info");
  if (fileInfo) fileInfo.style.display = "none";
  var preview = document.getElementById("pf-image-preview");
  if (preview) preview.removeAttribute("src");
  var previewContainer = document.getElementById("image-preview-container");
  if (previewContainer) previewContainer.style.display = "none";
  var statusDiv = document.getElementById("upload-status");
  if (statusDiv) {
    statusDiv.style.display = "none";
    statusDiv.innerHTML = "";
    statusDiv.className = "upload-status";
  }
  var uploadBtn = document.getElementById("btn-upload-supabase");
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "☁️ Upload lên Supabase trước khi tạo mới";
  }
  var fileNameSpan = document.getElementById("file-name");
  var fileSizeSpan = document.getElementById("file-size");
  if (fileNameSpan) fileNameSpan.textContent = "";
  if (fileSizeSpan) fileSizeSpan.textContent = "";
};
// Khởi tạo
initSupabaseClient();