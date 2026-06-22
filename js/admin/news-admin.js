/**
 * /admin/news — News CMS controller (vanilla JS).
 *
 *  Clean URL routes (History API):
 *      /admin/news                  → list (default)
 *      /admin/news/new              → create form
 *      /admin/news/edit/<id>        → edit form
 *
 *  Legacy /admin/news.html#… hashes are migrated to the paths above on boot.
 *
 *  Cleanly separated: API access lives in TLKVNewsAPI; storage in
 *  TLKVNewsStorage; editor in TLKVNewsEditor; audit in TLKVAudit (re-used
 *  from the existing admin module — see js/admin-audit.js).
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // DOM helpers + toast + confirm
  // ---------------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") n.className = String(v);
      else if (k === "html") n.innerHTML = String(v);
      else if (k.indexOf("on") === 0 && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, String(v));
    });
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  function toast(message, type) {
    var host = $("#news-admin-toast-host");
    if (!host) { alert(message); return; }
    var t = el("div", { class: "news-admin-toast" + (type ? " news-admin-toast--" + type : "") }, message);
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .28s ease";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 320);
    }, 3000);
  }

  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var bd = el("div", { class: "news-admin-modal-backdrop" });
      var modal = el("div", { class: "news-admin-modal" });
      modal.appendChild(el("div", { class: "news-admin-modal__hd" }, opts.title || "Xác nhận"));
      modal.appendChild(el("div", { class: "news-admin-modal__bd" }, opts.message || ""));
      var cancel = el("button", { class: "news-admin-btn", type: "button" }, opts.cancelText || "Huỷ");
      var ok = el("button", {
        class: "news-admin-btn " + (opts.danger ? "news-admin-btn--danger" : "news-admin-btn--primary"),
        type: "button"
      }, opts.okText || "Đồng ý");
      modal.appendChild(el("div", { class: "news-admin-modal__ft" }, [cancel, ok]));
      bd.appendChild(modal);
      bd.addEventListener("click", function (e) { if (e.target === bd) { close(false); } });
      cancel.addEventListener("click", function () { close(false); });
      ok.addEventListener("click", function () { close(true); });
      function close(v) { bd.remove(); resolve(v); }
      document.body.appendChild(bd);
    });
  }

  // ---------------------------------------------------------------------------
  // Auth gate (parity with existing /admin login)
  // ---------------------------------------------------------------------------

  function readSupabaseConfig() {
    var cfg = global.__TLKV_SUPABASE__ || { url: "", anonKey: "" };
    return { url: String(cfg.url || "").trim(), anonKey: String(cfg.anonKey || "").trim() };
  }

  var __sb = null;
  var Access = global.TLKVAdminAccess;

  function canPerformNews() {
    return Access && typeof Access.guardAction === "function" && Access.guardAction("news");
  }

  function getSupabase() {
    if (__sb) return Promise.resolve(__sb);
    if (global.TLKVSupabase && typeof global.TLKVSupabase.getSupabaseClient === "function") {
      return global.TLKVSupabase.getSupabaseClient().then(function (client) {
        if (!client) {
          return Promise.reject(new Error("Thiếu cấu hình Supabase trong .env."));
        }
        __sb = client;
        return client;
      });
    }
    var cfg = readSupabaseConfig();
    if (!cfg.url || !cfg.anonKey || !global.supabase || !global.supabase.createClient) {
      return Promise.reject(new Error("Thiếu cấu hình Supabase trong .env."));
    }
    __sb = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "tlkv-supabase-auth",
      },
    });
    return Promise.resolve(__sb);
  }

  async function getSessionEmail() {
    if (Access && typeof Access.getCurrentAccess === "function") {
      var cached = Access.getCurrentAccess();
      if (cached && cached.email) return cached.email;
    }
    if (Access && typeof Access.resolveFromSupabase === "function") {
      var sb = await getSupabase();
      var access = await Access.resolveFromSupabase(sb);
      return access.email;
    }
    var sb = await getSupabase();
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session || !session.user) return null;
    try {
      var userRes = await sb.auth.getUser();
      if (userRes.data && userRes.data.user) return userRes.data.user.email || null;
    } catch (e) { /* ignore */ }
    return session.user.email || null;
  }

  function setBodyAuthState(state) {
    if (document.body) document.body.setAttribute("data-auth-state", state);
  }

  function setCurrentUser(email) {
    var who = $("#na-current-user");
    if (who) who.textContent = email || "—";
  }

  async function signIn(email, password) {
    var sb = await getSupabase();
    var { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    var sb = await getSupabase();
    await sb.auth.signOut();
    if (global.TLKVNewsStorage && global.TLKVNewsStorage.clearAuthCache) {
      global.TLKVNewsStorage.clearAuthCache();
    }
  }

  function showLogin() {
    setBodyAuthState("anonymous");
    $("#news-admin-login").hidden = false;
    $("#news-admin-root").hidden = true;
  }

  function showApp() {
    setBodyAuthState("authenticated");
    $("#news-admin-login").hidden = true;
    $("#news-admin-root").hidden = false;
  }

  async function resolveAccess() {
    if (!Access || typeof Access.resolveFromSupabase !== "function") {
      return null;
    }
    var sb = await getSupabase();
    return Access.resolveFromSupabase(sb);
  }

  // ---------------------------------------------------------------------------
  // Routing (History API — clean paths, no #hash in normal use)
  // ---------------------------------------------------------------------------

  /** Monotonic token — async list renders check this to avoid stale DOM writes. */
  var renderGen = 0;

  function parseLegacyHash() {
    var h = (location.hash || "").replace(/^#/, "");
    h = String(h || "").trim();
    h = h.replace(/^\//, "");
    h = h.replace(/[?#].*$/, "");
    h = h.replace(/\/+$/, "");
    if (!h || h === "list") return { view: "list" };
    if (h === "new") return { view: "new" };
    var m = h.match(/^edit\/([0-9a-f-]{6,})$/i);
    if (m) return { view: "edit", id: m[1] };
    return null;
  }

  function parseRoute() {
    var path = String(location.pathname || "").replace(/\/+$/, "");
    var editMatch = path.match(/\/admin\/news\/edit\/([0-9a-f-]{6,})$/i);
    if (editMatch) return { view: "edit", id: editMatch[1] };
    if (/\/admin\/news\/new$/i.test(path)) return { view: "new" };
    if (/\/admin\/news$/i.test(path)) return { view: "list" };
    if (/\/admin\/news\.html$/i.test(path)) {
      var legacy = parseLegacyHash();
      return legacy || { view: "list" };
    }
    return { view: "list" };
  }

  function routeKey(route) {
    if (!route) return "list";
    if (route.view === "edit") return "edit/" + route.id;
    return route.view || "list";
  }

  function routeToPath(route) {
    if (route.view === "new") return "/admin/news/new";
    if (route.view === "edit" && route.id) return "/admin/news/edit/" + route.id;
    return "/admin/news";
  }

  /** On boot: move legacy #hash URLs to canonical paths (bookmark-safe). */
  function migrateLegacyUrl() {
    var legacy = parseLegacyHash();
    var hash = String(location.hash || "");
    if (hash && hash !== "#" && legacy) {
      var target = routeToPath(legacy);
      history.replaceState(null, "", target);
      return;
    }
    if (/\/admin\/news\.html$/i.test(location.pathname)) {
      history.replaceState(null, "", routeToPath({ view: "list" }));
    }
  }

  function navigate(routeKeyStr) {
    if (!canPerformNews()) return;
    var next;
    var key = String(routeKeyStr || "list").replace(/^#/, "");
    if (key === "list" || !key) next = { view: "list" };
    else if (key === "new") next = { view: "new" };
    else if (key.indexOf("edit/") === 0) next = { view: "edit", id: key.slice(5) };
    else next = { view: "list" };

    var path = routeToPath(next);
    var cur = parseRoute();
    if (routeKey(cur) === routeKey(next)) {
      render();
      return;
    }
    history.pushState(null, "", path);
    render();
  }

  /** Back to list — always re-fetch adminList and repaint the table. */
  function goToList() {
    LIST_STATE.page = 1;
    var cur = parseRoute();
    if (cur.view === "list") {
      render();
      return;
    }
    navigate("list");
  }

  function onRouteChange() {
    if (canPerformNews()) render();
  }

  async function render() {
    if (!canPerformNews()) return;
    var root = $("#news-admin-content");
    if (!root) return;
    var gen = ++renderGen;
    var route = parseRoute();
    if (route.view !== "new" && route.view !== "edit") {
      if (global.TLKVNewsFormLifecycle) global.TLKVNewsFormLifecycle.endSession();
    }
    root.innerHTML = "";
    FORM_CHROME = null;
    try {
      if (route.view === "new") await renderForm(root, null, gen);
      else if (route.view === "edit") await renderForm(root, route.id, gen);
      else await renderList(root, gen);
    } catch (e) {
      if (gen !== renderGen) return;
      console.error(e);
      root.appendChild(el("div", { class: "news-admin-card" }, [
        el("div", { class: "news-admin-card__body" }, "Lỗi: " + (e && e.message ? e.message : String(e)))
      ]));
    }
  }

  // ---------------------------------------------------------------------------
  // LIST view
  // ---------------------------------------------------------------------------

  var LIST_STATE = { page: 1, pageSize: 10, search: "", status: "", categoryId: "" };
  var LIST_SEARCH_TIMER = null;

  async function renderList(root, gen) {
    if (gen !== renderGen) return;
    if (!canPerformNews()) return;
    var card = el("div", { class: "news-admin-card" });
    var hd = el("div", { class: "news-admin-card__header" });
    hd.appendChild(el("div", null, [
      el("strong", null, "Bài viết"),
      el("p", { class: "news-admin-bcrumb", style: "margin:4px 0 0" }, "Quản lý tin tức / bài viết")
    ]));
    hd.appendChild(el("div", { class: "news-admin-actions" }, [
      el("button", {
        class: "news-admin-btn news-admin-btn--primary",
        type: "button",
        onclick: function () { navigate("new"); },
      }, "+ Bài viết mới"),
    ]));
    card.appendChild(hd);

    var bd = el("div", { class: "news-admin-card__body" });
    var filters = el("form", { class: "news-admin-filters", onsubmit: function (e) { e.preventDefault(); } });
    var searchInput = el("input", { type: "search", placeholder: "Tìm theo tiêu đề / slug…", value: LIST_STATE.search });
    var statusSel = el("select", null, [
      el("option", { value: "" }, "Tất cả trạng thái"),
      el("option", { value: "draft" }, "Bản nháp"),
      el("option", { value: "published" }, "Đã xuất bản"),
      el("option", { value: "archived" }, "Đã lưu trữ"),
    ]);
    statusSel.value = LIST_STATE.status;
    var catSel = el("select", null, [ el("option", { value: "" }, "Tất cả chuyên mục") ]);
    var reset = el("button", { class: "news-admin-btn", type: "button" }, "Xoá bộ lọc");

    filters.appendChild(searchInput);
    filters.appendChild(statusSel);
    filters.appendChild(catSel);
    filters.appendChild(reset);
    bd.appendChild(filters);

    var listMount = el("div", { class: "news-admin-table-wrap" });
    bd.appendChild(listMount);

    var pagerHost = el("div", { class: "news-admin-pager" });
    bd.appendChild(pagerHost);

    card.appendChild(bd);
    root.appendChild(card);

    function reload() { loadTable(listMount, pagerHost, gen); }
    // Fetch list immediately — do not wait for categories (avoids stale DOM / empty table).
    loadTable(listMount, pagerHost, gen);

    // load categories into dropdown (non-blocking for table)
    try {
      var cats = await TLKVNewsAPI.listCategories();
      if (gen !== renderGen) return;
      cats.forEach(function (c) {
        var o = el("option", { value: c.id }, c.name);
        catSel.appendChild(o);
      });
      catSel.value = LIST_STATE.categoryId;
    } catch (e) { console.warn("[news-admin] categories load failed", e); }

    searchInput.addEventListener("input", function () {
      clearTimeout(LIST_SEARCH_TIMER);
      LIST_SEARCH_TIMER = setTimeout(function () {
        LIST_STATE.search = searchInput.value.trim();
        LIST_STATE.page = 1;
        reload();
      }, 300);
    });
    statusSel.addEventListener("change", function () { LIST_STATE.status = statusSel.value; LIST_STATE.page = 1; reload(); });
    catSel.addEventListener("change",    function () { LIST_STATE.categoryId = catSel.value; LIST_STATE.page = 1; reload(); });
    reset.addEventListener("click",      function () {
      LIST_STATE.search = "";
      LIST_STATE.status = "";
      LIST_STATE.categoryId = "";
      LIST_STATE.page = 1;
      searchInput.value = "";
      statusSel.value = "";
      catSel.value = "";
      reload();
    });
  }

  async function loadTable(host, pagerHost, gen) {
    if (gen !== renderGen) return;
    if (!host || !host.isConnected) {
      host = $(".news-admin-table-wrap");
      pagerHost = $(".news-admin-pager");
      if (!host || !pagerHost) return;
    }
    host.innerHTML = "";
    pagerHost.innerHTML = "";
    var skel = el("div");
    for (var i = 0; i < 6; i++) skel.appendChild(el("div", { class: "news-admin-skel" }));
    host.appendChild(skel);

    try {
      var res = await TLKVNewsAPI.adminList({
        page: LIST_STATE.page,
        pageSize: LIST_STATE.pageSize,
        search: LIST_STATE.search,
        status: LIST_STATE.status,
        categoryId: LIST_STATE.categoryId || undefined,
      });
      if (gen !== renderGen) return;
      host.innerHTML = "";

      if (!res.items.length) {
        host.appendChild(el("div", { class: "news-admin-empty" }, [
          el("h3", null, "Chưa có bài viết nào"),
          el("p", null, "Bấm “Bài viết mới” để bắt đầu."),
          el("button", {
            class: "news-admin-btn news-admin-btn--primary",
            type: "button",
            onclick: function () { navigate("new"); },
          }, "+ Bài viết mới"),
        ]));
        return;
      }

      var table = el("table", { class: "news-admin-table" });
      var thead = el("thead");
      thead.appendChild(el("tr", null, [
        el("th", null, "Bài viết"),
        el("th", null, "Chuyên mục"),
        el("th", null, "Trạng thái"),
        el("th", null, "Cập nhật"),
        el("th", { style: "text-align:right" }, "Thao tác"),
      ]));
      table.appendChild(thead);

      var tbody = el("tbody");
      res.items.forEach(function (item) {
        var thumb = el("img", {
          class: "news-admin-table__thumb",
          src: item.thumbnailUrl || "/assets/favicon-48.png",
          alt: item.title,
          onerror: function () { this.onerror = null; this.src = "/assets/favicon-48.png"; },
        });
        var titleCell = el("td", null, [
          el("div", { style: "display:flex;gap:12px;align-items:center" }, [
            thumb,
            el("div", null, [
              el("span", { class: "news-admin-table__title" }, item.title || "(không có tiêu đề)"),
              el("span", { class: "news-admin-table__sub" }, "/tin-tuc/" + item.slug),
            ]),
          ]),
        ]);
        var catCell = el("td", null, item.category ? item.category.name : "—");
        var statusCell = el("td", null, [
          el("span", { class: "news-admin-status news-admin-status--" + item.status }, statusLabel(item.status)),
          item.featured ? el("span", { class: "news-admin-status news-admin-status--published", style: "margin-left:6px;background:#fef3c7;color:#92400e" }, "Nổi bật") : null,
        ]);
        var updCell = el("td", null, fmtDate(item.updatedAt, true));
        var actionsCell = el("td", null, el("div", { class: "news-admin-row-actions" }, [
          el("a", { class: "news-admin-btn", href: "/tin-tuc/" + encodeURIComponent(item.slug), target: "_blank" }, "Xem"),
          el("button", {
            class: "news-admin-btn",
            type: "button",
            onclick: function () { navigate("edit/" + item.id); },
          }, "Sửa"),
          item.status !== "published"
            ? el("button", { class: "news-admin-btn news-admin-btn--success", type: "button",
                  onclick: function () { onTogglePublish(item, true); } }, "Xuất bản")
            : el("button", { class: "news-admin-btn", type: "button",
                  onclick: function () { onTogglePublish(item, false); } }, "Gỡ xuất bản"),
          el("button", { class: "news-admin-btn news-admin-btn--danger", type: "button",
              onclick: function () { onDelete(item); } }, "Xoá"),
        ]));

        tbody.appendChild(el("tr", null, [titleCell, catCell, statusCell, updCell, actionsCell]));
      });
      table.appendChild(tbody);
      host.appendChild(table);

      renderPager(pagerHost, res.total || 0, res.page, res.pageSize, gen);
    } catch (e) {
      if (gen !== renderGen) return;
      host.innerHTML = "";
      host.appendChild(el("div", { class: "news-admin-empty" }, [
        el("h3", null, "Không tải được danh sách"),
        el("p", null, e && e.message ? e.message : String(e)),
      ]));
    }
  }

  function renderPager(host, total, page, pageSize, gen) {
    host.innerHTML = "";
    if (!total) return;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var from = (page - 1) * pageSize + 1;
    var to = Math.min(total, page * pageSize);
    host.appendChild(el("div", { class: "news-admin-pager__info" }, "Hiển thị " + from + "–" + to + " / " + total));
    function go(p) {
      return function () {
        LIST_STATE.page = p;
        loadTable($(".news-admin-table-wrap"), $(".news-admin-pager"), gen);
      };
    }
    host.appendChild(el("button", { type: "button", onclick: go(Math.max(1, page - 1)), disabled: page <= 1 }, "‹"));
    var pages = new Set([1, totalPages, page - 1, page, page + 1]);
    var sorted = Array.from(pages).filter(function (x) { return x >= 1 && x <= totalPages; }).sort(function (a, b) { return a - b; });
    sorted.forEach(function (p, i) {
      if (i > 0 && p !== sorted[i - 1] + 1) host.appendChild(el("span", { style: "padding:0 4px;color:#94a3b8" }, "…"));
      host.appendChild(el("button", { type: "button", onclick: go(p), "aria-current": p === page ? "page" : null }, String(p)));
    });
    host.appendChild(el("button", { type: "button", onclick: go(Math.min(totalPages, page + 1)), disabled: page >= totalPages }, "›"));
  }

  async function onTogglePublish(item, publish) {
    if (!canPerformNews()) return;
    var ok = await confirmModal({
      title: publish ? "Xuất bản bài viết" : "Gỡ xuất bản",
      message: publish
        ? 'Xác nhận xuất bản công khai "' + (item.title || "") + '"?'
        : 'Gỡ "' + (item.title || "") + '" về trạng thái nháp?',
      okText: publish ? "Xuất bản" : "Gỡ về nháp",
    });
    if (!ok) return;
    try {
      var nextStatus = publish ? "published" : "draft";
      var updated = await TLKVNewsAPI.adminSetStatus(item.id, nextStatus);
      await logAudit(publish ? "news_publish" : "news_unpublish", updated, item, "Đổi trạng thái → " + nextStatus);
      toast(publish ? "Đã xuất bản." : "Đã gỡ về bản nháp.", "success");
      render();
    } catch (e) { toast("Lỗi: " + (e && e.message ? e.message : String(e)), "error"); }
  }

  async function onDelete(item) {
    if (!canPerformNews()) return;
    var ok = await confirmModal({
      title: "Xoá bài viết",
      message: 'Bài viết "' + (item.title || "") + '" sẽ bị xoá vĩnh viễn. Tiếp tục?',
      okText: "Xoá",
      danger: true,
    });
    if (!ok) return;
    try {
      await TLKVNewsAPI.adminDelete(item.id);
      await logAudit("news_delete", null, item, 'Xoá "' + (item.title || "") + '"');
      toast("Đã xoá bài viết.", "success");
      render();
    } catch (e) { toast("Lỗi: " + (e && e.message ? e.message : String(e)), "error"); }
  }

  function statusLabel(s) {
    if (s === "published") return "Đã xuất bản";
    if (s === "archived")  return "Đã lưu trữ";
    return "Bản nháp";
  }

  function fmtDate(iso, withTime) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("vi-VN", withTime
        ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) { return ""; }
  }

  // ---------------------------------------------------------------------------
  // FORM view (create / edit)
  // ---------------------------------------------------------------------------

  var EDITOR_INSTANCE = null;
  /** Live DOM refs for form chrome (buttons, badges) — updated each renderForm(). */
  var FORM_CHROME = null;

  function getLC() {
    return global.TLKVNewsFormLifecycle || null;
  }

  /** Race a promise against a timeout — prevents infinite "Đang lưu…" UI hangs. */
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error((label || "Thao tác") + " quá thời gian (" + Math.round(ms / 1000) + "s)."));
        }, ms);
      }),
    ]);
  }

  /** Prefer cached access email; avoid slow getUser() on every submit. */
  function resolveActorEmail() {
    if (Access && typeof Access.getCurrentAccess === "function") {
      var cached = Access.getCurrentAccess();
      if (cached && cached.email) return Promise.resolve(cached.email);
    }
    return withTimeout(getSessionEmail(), 6000, "Lấy email phiên đăng nhập");
  }

  function finishSubmit(LC) {
    if (!LC) return;
    LC.setSubmit("idle");
    resetSubmitButtons(false);
    syncFormChrome();
  }

  function prewarmUploadAuth() {
    if (!global.TLKVNewsStorage || typeof global.TLKVNewsStorage.prewarmAuth !== "function") return;
    global.TLKVNewsStorage.prewarmAuth().catch(function (e) {
      console.warn("[UPLOAD] prewarm failed:", e);
    });
  }

  /** Always reset button labels — even when formData is temporarily null (race during re-render). */
  function resetSubmitButtons(saving) {
    if (!FORM_CHROME) return;
    if (FORM_CHROME.btnDraft) {
      FORM_CHROME.btnDraft.textContent = saving ? "⏳ Đang lưu…" : "💾 Lưu nháp";
      FORM_CHROME.btnDraft.removeAttribute("aria-busy");
    }
    if (FORM_CHROME.btnPublish) {
      var LC = getLC();
      var fd = LC && LC.getFormData();
      var label = "🚀 Xuất bản";
      if (!saving && fd && fd.status === "published") label = "💾 Cập nhật";
      FORM_CHROME.btnPublish.textContent = saving ? "⏳ Đang lưu…" : label;
      FORM_CHROME.btnPublish.removeAttribute("aria-busy");
    }
  }

  function syncFormChrome() {
    var LC = getLC();
    if (!FORM_CHROME || !LC) return;
    var lc = LC.getLifecycle();
    var check = LC.canSubmit();
    var saving = lc.submit === "validating" || lc.submit === "saving";
    var disabled = saving || !check.ok;

    if (FORM_CHROME.btnDraft) {
      FORM_CHROME.btnDraft.disabled = disabled;
      FORM_CHROME.btnDraft.setAttribute("aria-busy", saving ? "true" : "false");
    }
    if (FORM_CHROME.btnPublish) {
      FORM_CHROME.btnPublish.disabled = disabled;
      FORM_CHROME.btnPublish.setAttribute("aria-busy", saving ? "true" : "false");
    }
    resetSubmitButtons(saving);
  }

  async function renderForm(root, editId, gen) {
    if (!canPerformNews()) return;
    var LC = getLC();
    if (!LC) {
      console.error("[FORM] TLKVNewsFormLifecycle not loaded");
      return;
    }
    var sessionId = LC.beginSession();
    function aborted() { return LC.isStale(sessionId) || gen !== renderGen; }
    // Tear down previous editor (if any) before mounting new one
    if (EDITOR_INSTANCE) { try { await EDITOR_INSTANCE.destroy(); } catch (e) {} EDITOR_INSTANCE = null; }
    if (aborted()) return;

    var initial = null;
    var loadingEl = null;
    if (editId) {
      loadingEl = el("div", { class: "news-admin-card" }, [
        el("div", { class: "news-admin-card__body" }, "Đang tải bài viết…"),
      ]);
      root.appendChild(loadingEl);
      try {
        initial = await TLKVNewsAPI.adminGetById(editId);
        if (aborted()) return;
        if (!initial) {
          toast("Không tìm thấy bài viết.", "error");
          navigate("list");
          return;
        }
      } catch (e) {
        if (aborted()) return;
        toast("Lỗi tải bài viết: " + (e && e.message ? e.message : String(e)), "error");
        navigate("list");
        return;
      } finally {
        if (loadingEl && loadingEl.parentNode) loadingEl.remove();
      }
    }

    var fd = LC.initFormData({
      id: initial ? initial.id : null,
      title: initial ? initial.title : "",
      slug: initial ? initial.slug : "",
      shortDescription: initial ? initial.shortDescription : "",
      thumbnailUrl: initial ? initial.thumbnailUrl : "",
      thumbnailPath: initial ? TLKVNewsStorage.pathFromPublicUrl(initial.thumbnailUrl) : "",
      categoryId: initial && initial.category ? initial.category.id : "",
      status: initial ? initial.status : "draft",
      featured: !!(initial && initial.featured),
      seoTitle: initial ? initial.seoTitle : "",
      seoDescription: initial ? initial.seoDescription : "",
      seoKeywords: initial ? initial.seoKeywords : "",
      slugTouched: !!editId,
    });

    var card = el("div", { class: "news-admin-card" });
    card.appendChild(el("div", { class: "news-admin-card__header" }, [
      el("div", null, [
        el("strong", null, editId ? "Sửa bài viết" : "Tạo bài viết mới"),
        el("p", { class: "news-admin-bcrumb", style: "margin:4px 0 0" },
          editId ? "ID: " + editId : "Bài viết mới sẽ được lưu dưới dạng nháp")
      ]),
      el("div", { class: "news-admin-actions" }, [
        el("button", {
          class: "news-admin-btn",
          type: "button",
          onclick: function () { goToList(); },
        }, "← Danh sách"),
      ]),
    ]));

    var body = el("div", { class: "news-admin-card__body" });
    var form = el("form", { class: "news-admin-form", onsubmit: function (e) { e.preventDefault(); saveDraft(); } });

    // ---- LEFT column: main fields ----
    var left = el("div");

    // Title
    var titleField = el("div", { class: "news-admin-field" });
    titleField.appendChild(el("label", { for: "f-title" }, "Tiêu đề"));
    var titleInput = el("input", { id: "f-title", type: "text", value: fd.title,
      placeholder: "Tiêu đề bài viết...", maxlength: "500", required: "required" });
    titleField.appendChild(titleInput);
    left.appendChild(titleField);

    // Slug (with prefix)
    var slugField = el("div", { class: "news-admin-field" });
    slugField.appendChild(el("label", { for: "f-slug" }, "Đường dẫn (slug)"));
    var slugWrap = el("div", { class: "news-admin-slug" });
    slugWrap.appendChild(el("span", { class: "news-admin-slug__prefix" }, "/tin-tuc/"));
    var slugInput = el("input", {
      id: "f-slug",
      type: "text",
      value: fd.slug,
      maxlength: "200",
      placeholder: "tu-dong-tu-tieu-de",
      disabled: "disabled",
      readonly: "readonly",
    });
    slugWrap.appendChild(slugInput);
    slugField.appendChild(slugWrap);
    slugField.appendChild(el("span", { class: "news-admin-hint" },
      editId ? "Slug cố định sau khi tạo — không chỉnh sửa thủ công." : "Tự động sinh từ tiêu đề."));
    left.appendChild(slugField);

    // Short description
    var sdField = el("div", { class: "news-admin-field" });
    sdField.appendChild(el("label", { for: "f-sd" }, "Mô tả ngắn"));
    var sdInput = el("textarea", { id: "f-sd", placeholder: "Tóm tắt nội dung (hiển thị ở danh sách & meta description)", maxlength: "2000" }, fd.shortDescription);
    sdField.appendChild(sdInput);
    left.appendChild(sdField);

    // Editor + inline image uploader (stored in news.content JSON blocks)
    var edField = el("div", { class: "news-admin-field" });
    edField.appendChild(el("label", null, "Nội dung"));

    var contentImgBox = el("div", { class: "news-admin-thumb news-admin-content-img" });
    contentImgBox.appendChild(el("span", { class: "news-admin-content-img__title" }, "Ảnh trong nội dung bài viết"));
    var ciPreview = el("div", {
      class: "news-admin-thumb__preview news-admin-thumb__preview--empty news-admin-content-img__preview",
    });
    ciPreview.textContent = "Ảnh chèn vào bài sẽ hiển thị ở đây";
    contentImgBox.appendChild(ciPreview);
    var ciRow = el("div", { class: "news-admin-thumb__row" });
    var ciFile = el("input", { type: "file", id: "f-content-img-file", accept: "image/*" });
    var ciChoose = el("label", { class: "news-admin-btn", for: "f-content-img-file" }, "📁 Chọn ảnh");
    var ciInsert = el("button", {
      class: "news-admin-btn news-admin-btn--primary",
      type: "button",
      id: "f-content-img-insert",
    }, "Chèn ảnh");
    ciRow.appendChild(ciChoose);
    ciRow.appendChild(ciInsert);
    contentImgBox.appendChild(ciRow);
    contentImgBox.appendChild(el("div", { class: "news-admin-field", style: "margin-bottom:0;text-align:left" }, [
      el("label", { for: "f-content-img-url" }, "Hoặc dán URL ảnh"),
      el("input", { id: "f-content-img-url", type: "url", placeholder: "https://... hoặc /assets/..." }),
    ]));
    contentImgBox.appendChild(el("input", {
      id: "f-content-img-caption",
      type: "text",
      placeholder: "Chú thích ảnh (tuỳ chọn)",
      maxlength: "500",
      class: "news-admin-content-img__caption",
    }));
    var ciProgress = el("div", { class: "news-admin-thumb__progress", style: "display:none" }, el("span"));
    contentImgBox.appendChild(ciProgress);
    contentImgBox.appendChild(ciFile);
    edField.appendChild(contentImgBox);

    var edStatus = el("div", {
      class: "news-admin-editor-status",
      id: "na-editor-status",
    }, "Đang tải trình soạn thảo…");
    var edHolder = el("div", { class: "news-admin-editor", id: "tlkv-news-editor-holder" });
    edField.appendChild(edStatus);
    edField.appendChild(edHolder);
    edField.appendChild(el("span", { class: "news-admin-hint" },
      "Chèn ảnh bằng khối phía trên hoặc nhấn “/” → “Ảnh” trong trình soạn thảo."));
    left.appendChild(edField);

    form.appendChild(left);

    // ---- RIGHT column: sidebar ----
    var side = el("aside", { class: "news-admin-sidebar" });

    // Status / publish
    var actCard = el("div", { class: "news-admin-card" });
    actCard.appendChild(el("div", { class: "news-admin-card__header" }, el("h3", null, "Xuất bản")));
    var actBody = el("div", { class: "news-admin-card__body" });
    var statusBadge = el("span", { class: "news-admin-status news-admin-status--" + fd.status }, statusLabel(fd.status));
    actBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", null, "Trạng thái hiện tại"),
      statusBadge,
    ]));

    var btnDraft = el("button", { class: "news-admin-btn", type: "button", disabled: "disabled" }, "💾 Lưu nháp");
    var btnPublish = el("button", { class: "news-admin-btn news-admin-btn--primary", type: "button", disabled: "disabled" },
      fd.status === "published" ? "💾 Cập nhật" : "🚀 Xuất bản");
    var btnPreview = el("button", { class: "news-admin-btn", type: "button" }, "👁 Xem trước");

    FORM_CHROME = { statusBadge: statusBadge, btnPublish: btnPublish, btnDraft: btnDraft, editorStatus: edStatus };

    btnDraft.addEventListener("click", function () { saveDraft(); });
    btnPublish.addEventListener("click", function () { publishPost(); });
    btnPreview.addEventListener("click", onPreview);

    actBody.appendChild(el("div", { class: "news-admin-actions", style: "flex-direction:column;align-items:stretch" },
      [btnDraft, btnPublish, btnPreview]));
    actCard.appendChild(actBody);
    side.appendChild(actCard);

    // Category + featured
    var catCard = el("div", { class: "news-admin-card" });
    catCard.appendChild(el("div", { class: "news-admin-card__header" }, el("h3", null, "Phân loại")));
    var catBody = el("div", { class: "news-admin-card__body" });
    var catField = el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-cat" }, "Chuyên mục"),
      el("select", { id: "f-cat" }, [el("option", { value: "" }, "(Không phân loại)")]),
    ]);
    catBody.appendChild(catField);
    var featField = el("div", { class: "news-admin-field" }, [
      el("label", { class: "news-admin-toggle", for: "f-feat" }, [
        el("input", { id: "f-feat", type: "checkbox" }),
        el("span", null, "Đánh dấu nổi bật (hiển thị trong khối tin nổi bật trên /tin-tuc)"),
      ]),
    ]);
    catBody.appendChild(featField);
    catCard.appendChild(catBody);
    side.appendChild(catCard);

    // Thumbnail
    var thCard = el("div", { class: "news-admin-card" });
    thCard.appendChild(el("div", { class: "news-admin-card__header" }, el("h3", null, "Ảnh đại diện")));
    var thBody = el("div", { class: "news-admin-card__body" });
    var thumbBox = el("div", { class: "news-admin-thumb" });
    var preview = el("div", { class: "news-admin-thumb__preview" + (fd.thumbnailUrl ? "" : " news-admin-thumb__preview--empty") });
    if (fd.thumbnailUrl) preview.style.backgroundImage = "url('" + fd.thumbnailUrl + "')";
    else preview.textContent = "Chưa có ảnh";
    thumbBox.appendChild(preview);
    var thRow = el("div", { class: "news-admin-thumb__row" });
    var thFile = el("input", { type: "file", id: "f-thumb-file", accept: "image/*" });
    var thChoose = el("label", { class: "news-admin-btn", for: "f-thumb-file" }, "📁 Chọn ảnh");
    var thClear = el("button", { class: "news-admin-btn news-admin-btn--ghost", type: "button" }, "Xoá ảnh");
    thRow.appendChild(thChoose); thRow.appendChild(thClear);
    thumbBox.appendChild(thRow);
    var thUrlField = el("div", { class: "news-admin-field", style: "margin-bottom:0;text-align:left" }, [
      el("label", { for: "f-thumb" }, "Hoặc dán URL ảnh"),
      el("input", { id: "f-thumb", type: "url", value: fd.thumbnailUrl, placeholder: "https://..." }),
    ]);
    thumbBox.appendChild(thUrlField);
    var thProgress = el("div", { class: "news-admin-thumb__progress", style: "display:none" }, el("span"));
    thumbBox.appendChild(thProgress);
    thumbBox.appendChild(thFile);
    thBody.appendChild(thumbBox);
    thCard.appendChild(thBody);
    side.appendChild(thCard);

    // SEO
    var seoCard = el("div", { class: "news-admin-card" });
    seoCard.appendChild(el("div", { class: "news-admin-card__header" }, el("h3", null, "SEO")));
    var seoBody = el("div", { class: "news-admin-card__body" });
    seoBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-seo-title" }, "SEO title"),
      el("input", { id: "f-seo-title", type: "text", maxlength: "500", value: fd.seoTitle, placeholder: "Mặc định = tiêu đề bài viết" }),
    ]));
    seoBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-seo-desc" }, "SEO description"),
      el("textarea", { id: "f-seo-desc", maxlength: "1000", placeholder: "Mặc định = mô tả ngắn" }, fd.seoDescription),
    ]));
    seoBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-seo-kw" }, "Từ khoá (cách nhau bằng dấu phẩy)"),
      el("input", { id: "f-seo-kw", type: "text", maxlength: "500", value: fd.seoKeywords }),
    ]));
    seoCard.appendChild(seoBody);
    side.appendChild(seoCard);

    form.appendChild(side);
    body.appendChild(form);
    card.appendChild(body);
    if (aborted()) return;
    root.appendChild(card);

    LC.setForm("ready");
    LC.log("FORM", "DOM ready — submit unlocked (editor independent)");
    syncFormChrome();

    // Wire inputs to lifecycle formData (immutable patches)
    titleInput.addEventListener("input", function () {
      var patch = { title: titleInput.value };
      if (!editId) {
        patch.slug = TLKVNewsAPI.buildSlug(titleInput.value);
        slugInput.value = patch.slug;
      }
      LC.patchFormData(patch);
    });
    sdInput.addEventListener("input", function () {
      LC.patchFormData({ shortDescription: sdInput.value });
    });

    // ---- Upload: wire BEFORE any await so first image pick works immediately ----
    function setUploadBusy(busy) {
      ["#f-thumb-file", "#f-content-img-file"].forEach(function (sel) {
        var n = $(sel, form);
        if (n) n.disabled = busy;
      });
      var insertBtn = $("#f-content-img-insert", form);
      if (insertBtn) insertBtn.disabled = busy;
      [thChoose, ciChoose].forEach(function (btn) {
        if (btn) btn.classList.toggle("is-disabled", busy);
      });
    }
    setUploadBusy(false);
    prewarmUploadAuth();

    async function runUpload(folder, file, progressEl) {
      if (LC.isUploading()) {
        toast("Đang xử lý một ảnh khác, vui lòng đợi…", "warn");
        return null;
      }
      var bar = progressEl.firstChild;
      LC.setUpload("uploading");
      setUploadBusy(true);
      syncFormChrome();
      progressEl.style.display = "block";
      bar.style.width = "8%";
      LC.log("UPLOAD", "start", { folder: folder, size: file.size, type: file.type });
      try {
        var res = await TLKVNewsStorage.upload(folder, file, {
          onPhase: function (phase, ratio) {
            bar.style.width = Math.max(8, Math.round(ratio * 100)) + "%";
          },
        });
        bar.style.width = "100%";
        LC.setUpload("done");
        LC.log("UPLOAD", "done", { path: res.path });
        return res;
      } catch (e) {
        LC.setUpload("error");
        console.error("[UPLOAD] failed (" + folder + "):", e);
        toast("Lỗi upload: " + (e && e.message ? e.message : String(e)), "error");
        return null;
      } finally {
        setUploadBusy(false);
        LC.setUpload("idle");
        syncFormChrome();
        setTimeout(function () {
          progressEl.style.display = "none";
          bar.style.width = "0%";
        }, 600);
      }
    }

    // Thumbnail wiring
    thFile.addEventListener("change", async function () {
      var f = thFile.files && thFile.files[0];
      if (!f) return;
      try {
        var res = await runUpload("thumbnails", f, thProgress);
        if (!res || aborted()) return;
        LC.patchFormData({ thumbnailUrl: res.publicUrl, thumbnailPath: res.path });
        $("#f-thumb", form).value = res.publicUrl;
        preview.classList.remove("news-admin-thumb__preview--empty");
        preview.textContent = "";
        preview.style.backgroundImage = "url('" + res.publicUrl + "')";
        toast("Đã upload ảnh đại diện.", "success");
      } finally {
        thFile.value = "";
      }
    });
    $("#f-thumb", form).addEventListener("input", function () {
      var url = $("#f-thumb", form).value.trim();
      LC.patchFormData({ thumbnailUrl: url });
      if (url) {
        preview.classList.remove("news-admin-thumb__preview--empty");
        preview.textContent = "";
        preview.style.backgroundImage = "url('" + url + "')";
      } else {
        preview.classList.add("news-admin-thumb__preview--empty");
        preview.textContent = "Chưa có ảnh";
        preview.style.backgroundImage = "";
      }
    });
    thClear.addEventListener("click", function () {
      LC.patchFormData({ thumbnailUrl: "", thumbnailPath: "" });
      $("#f-thumb", form).value = "";
      preview.classList.add("news-admin-thumb__preview--empty");
      preview.textContent = "Chưa có ảnh";
      preview.style.backgroundImage = "";
    });

    $("#f-seo-title", form).addEventListener("input", function () { LC.patchFormData({ seoTitle: this.value }); });
    $("#f-seo-desc", form).addEventListener("input",  function () { LC.patchFormData({ seoDescription: this.value }); });
    $("#f-seo-kw", form).addEventListener("input",    function () { LC.patchFormData({ seoKeywords: this.value }); });

    function setContentImgPreview(url) {
      if (!url) {
        ciPreview.classList.add("news-admin-thumb__preview--empty");
        ciPreview.textContent = "Ảnh chèn vào bài sẽ hiển thị ở đây";
        ciPreview.style.backgroundImage = "";
        return;
      }
      ciPreview.classList.remove("news-admin-thumb__preview--empty");
      ciPreview.textContent = "";
      ciPreview.style.backgroundImage = "url('" + url + "')";
    }

    function waitEditorReady(maxMs) {
      maxMs = maxMs || 60000;
      return new Promise(function (resolve) {
        var start = Date.now();
        function tick() {
          if (aborted()) { resolve(false); return; }
          if (EDITOR_INSTANCE && LC.getLifecycle().editor === "ready") {
            resolve(true);
            return;
          }
          if (Date.now() - start >= maxMs) {
            resolve(false);
            return;
          }
          setTimeout(tick, 150);
        }
        tick();
      });
    }

    async function insertContentImage(url, caption) {
      if (!EDITOR_INSTANCE || typeof EDITOR_INSTANCE.insertImage !== "function") {
        toast("Trình soạn thảo chưa sẵn sàng.", "warn");
        return false;
      }
      try {
        await EDITOR_INSTANCE.insertImage(url, caption);
        setContentImgPreview(url);
        toast("Đã chèn ảnh vào nội dung.", "success");
        return true;
      } catch (e) {
        toast("Không chèn được ảnh: " + (e && e.message ? e.message : String(e)), "error");
        return false;
      }
    }

    ciFile.addEventListener("change", async function () {
      var f = ciFile.files && ciFile.files[0];
      if (!f) return;
      try {
        var res = await runUpload("content", f, ciProgress);
        if (!res || aborted()) return;
        $("#f-content-img-url", form).value = res.publicUrl;
        setContentImgPreview(res.publicUrl);
        var cap = $("#f-content-img-caption", form);
        var caption = cap ? cap.value.trim() : "";
        if (!(await waitEditorReady(60000))) {
          toast("Ảnh đã upload. Bấm \"Chèn ảnh\" khi editor tải xong.", "info");
          return;
        }
        await insertContentImage(res.publicUrl, caption);
      } finally {
        ciFile.value = "";
      }
    });

    ciInsert.addEventListener("click", async function () {
      var url = ($("#f-content-img-url", form) || {}).value;
      url = url ? url.trim() : "";
      if (!url) {
        toast("Nhập URL ảnh hoặc chọn file trước.", "warn");
        return;
      }
      var allowed = global.TLKVNewsEditor && TLKVNewsEditor.isAllowedImageUrl
        ? TLKVNewsEditor.isAllowedImageUrl(url)
        : /^https:\/\//i.test(url);
      if (!allowed) {
        toast("URL phải bắt đầu bằng https:// hoặc /.", "warn");
        return;
      }
      if (!(await waitEditorReady(5000))) {
        toast("Trình soạn thảo chưa sẵn sàng.", "warn");
        return;
      }
      var capEl = $("#f-content-img-caption", form);
      await insertContentImage(url, capEl ? capEl.value.trim() : "");
    });

    var catSel = $("#f-cat", form);
    try {
      var cats = await TLKVNewsAPI.listCategories();
      if (aborted()) return;
      cats.forEach(function (c) {
        var o = el("option", { value: c.id }, c.name);
        catSel.appendChild(o);
      });
      catSel.value = (LC.getFormData() || {}).categoryId || "";
    } catch (e) { /* non-fatal */ }
    catSel.addEventListener("change", function () { LC.patchFormData({ categoryId: catSel.value }); });

    var feat = $("#f-feat", form);
    feat.checked = !!(LC.getFormData() && LC.getFormData().featured);
    feat.addEventListener("change", function () { LC.patchFormData({ featured: feat.checked }); });

    // Mount Editor.js
    try {
      EDITOR_INSTANCE = await LC.mountEditorWithTimeout(
        function (opts) { return TLKVNewsEditor.mount(opts); },
        {
          holder: "tlkv-news-editor-holder",
          data: initial && initial.content && Array.isArray(initial.content.blocks)
            ? initial.content
            : { blocks: [] },
        }
      );
      if (aborted()) {
        try { await EDITOR_INSTANCE.destroy(); } catch (e) { /* ignore */ }
        EDITOR_INSTANCE = null;
        return;
      }
      if (edStatus && edStatus.parentNode) edStatus.remove();
    } catch (e) {
      if (aborted()) return;
      console.error("[EDITOR] mount failed:", e);
      if (edStatus) {
        edStatus.className = "news-admin-editor-status news-admin-editor-status--failed";
        edStatus.textContent = "⚠ Không tải được trình soạn thảo. Bạn vẫn có thể lưu nháp (nội dung trống).";
      }
      EDITOR_INSTANCE = null;
    }
    syncFormChrome();
  }

  async function saveDraft() { return submitArticle("draft"); }
  async function publishPost() { return submitArticle("published"); }

  async function submitArticle(targetStatus) {
    var LC = getLC();
    if (!LC) {
      console.error("[SUBMIT] lifecycle module missing");
      toast("Lỗi hệ thống: lifecycle chưa tải.", "error");
      return;
    }
    LC.log("SUBMIT", "clicked", { targetStatus: targetStatus });

    if (!canPerformNews()) {
      console.warn("[SUBMIT] denied — no permission");
      toast("Không có quyền thao tác.", "error");
      return;
    }

    var saveSessionId = LC.getSessionId();
    var check = LC.canSubmit();
    if (!check.ok) {
      console.warn("[SUBMIT] blocked:", check.reason);
      toast(check.reason, "warn");
      return;
    }

    var data = LC.getFormData();
    if (!data) {
      console.warn("[SUBMIT] no form data");
      toast("Không có dữ liệu form.", "error");
      return;
    }
    if (!data.title.trim()) {
      toast("Vui lòng nhập tiêu đề.", "warn");
      var t = $("#f-title");
      if (t) t.focus();
      return;
    }

    if (targetStatus === "draft" && data.id && data.status === "published") {
      var confirmUnpublish = await confirmModal({
        title: "Gỡ bài khỏi trang công khai?",
        message: 'Bài "' + (data.title || "") + '" đang được xuất bản. Lưu nháp sẽ gỡ bài khỏi /tin-tuc. Tiếp tục?',
        okText: "Lưu nháp & gỡ",
        cancelText: "Huỷ",
        danger: true,
      });
      if (!confirmUnpublish) return;
    }

    var submitActive = false;
    try {
      LC.setSubmit("saving");
      submitActive = true;
      syncFormChrome();

      var contentJson = { blocks: [] };
      var editorLc = LC.getLifecycle().editor;
      if (EDITOR_INSTANCE && editorLc === "ready") {
        try {
          contentJson = await withTimeout(EDITOR_INSTANCE.save(), 15000, "Đọc nội dung editor");
          if (global.TLKVNewsEditor && typeof TLKVNewsEditor.normalizeEditorData === "function") {
            contentJson = TLKVNewsEditor.normalizeEditorData(contentJson);
          }
          var contentBytes = JSON.stringify(contentJson).length;
          LC.log("SUBMIT", "editor content saved", {
            blocks: contentJson.blocks ? contentJson.blocks.length : 0,
            bytes: contentBytes,
          });
        } catch (e) {
          console.error("[SUBMIT] editor.save failed:", e);
          toast("Lỗi đọc nội dung: " + (e && e.message ? e.message : String(e)), "error");
          return;
        }
      } else if (editorLc === "failed") {
        console.warn("[SUBMIT] degraded save — editor failed, empty content");
        toast("Lưu không có nội dung editor (trình soạn thảo lỗi).", "info");
      } else if (editorLc === "mounting") {
        console.warn("[SUBMIT] editor still mounting, saving without waiting");
        toast("Trình soạn thảo chưa xong — lưu có thể thiếu nội dung.", "warn");
      }

      LC.log("SUBMIT", "resolving actor");
      var actorEmail = "";
      try {
        actorEmail = (await resolveActorEmail()) || "";
        LC.log("SUBMIT", "actor ok");
      } catch (e) {
        console.warn("[SUBMIT] actor email fallback:", e);
        actorEmail = "";
      }

      var payload = {
        title: data.title,
        slug: data.slug || data.title,
        shortDescription: data.shortDescription,
        thumbnailUrl: data.thumbnailUrl,
        content: contentJson,
        categoryId: data.categoryId || null,
        status: targetStatus,
        featured: data.featured,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        seoKeywords: data.seoKeywords,
      };

      LC.log("SUBMIT", "API start", { id: data.id, status: targetStatus });
      var saved;
      var wasNew = !data.id;
      if (data.id) {
        saved = await TLKVNewsAPI.adminUpdate(data.id, payload, { actorEmail: actorEmail });
      } else {
        saved = await TLKVNewsAPI.adminCreate(payload, { actorEmail: actorEmail });
      }
      LC.log("SUBMIT", "API done", { id: saved.id, status: saved.status });

      var auditAction = data.id ? "news_update" : "news_insert";
      var auditSummary = data.id ? "Cập nhật bài: " + saved.title : "Tạo mới: " + saved.title;
      logAudit(auditAction, saved, null, auditSummary).catch(function (e) {
        console.warn("[SUBMIT] audit log failed (non-blocking):", e);
      });

      if (LC.isStale(saveSessionId)) {
        LC.log("SUBMIT", "saved but session stale");
        toast("Đã lưu bài viết (bạn đã rời khỏi trang soạn thảo).", "success");
        return;
      }

      LC.patchFormData({ id: saved.id, status: saved.status, slug: saved.slug });
      submitActive = false;
      finishSubmit(LC);
      syncPublishWidgets();
      toast(targetStatus === "published" ? "Đã xuất bản." : "Đã lưu bản nháp.", "success");
      if (wasNew) {
        history.replaceState(null, "", routeToPath({ view: "edit", id: saved.id }));
      }
    } catch (e) {
      console.error("[SUBMIT] failed:", e);
      toast("Lỗi lưu: " + (e && e.message ? e.message : String(e)), "error");
    } finally {
      if (submitActive) finishSubmit(LC);
    }
  }

  /** Reflect form status onto the sidebar badge + publish button label. */
  function syncPublishWidgets() {
    var LC = getLC();
    if (!FORM_CHROME || !LC) return;
    var data = LC.getFormData();
    if (!data) return;
    var badge = FORM_CHROME.statusBadge;
    if (badge) {
      badge.className = "news-admin-status news-admin-status--" + data.status;
      badge.textContent = statusLabel(data.status);
    }
    syncFormChrome();
  }

  function onPreview() {
    var LC = getLC();
    var data = LC && LC.getFormData();
    if (!data) {
      console.warn("[FORM] onPreview: no form data");
      return;
    }
    if (data.id && data.status === "published") {
      window.open("/tin-tuc/" + encodeURIComponent(data.slug), "_blank");
      return;
    }
    toast("Xem trước hoạt động sau khi đã lưu & xuất bản. Bấm “Xuất bản” trước.", "info");
  }

  // ---------------------------------------------------------------------------
  // Audit logger (best-effort)
  // ---------------------------------------------------------------------------
  async function logAudit(action, afterRow, beforeRow, summary) {
    try {
      var sb = await getSupabase();
      await sb.from("news_change_log").insert({
        action: action,
        entity_name: (afterRow && afterRow.title) || (beforeRow && beforeRow.title) || "",
        entity_id: (afterRow && afterRow.id) || (beforeRow && beforeRow.id) || null,
        summary: summary || null,
        payload: { before: beforeRow || null, after: afterRow || null },
        actor_email: (await getSessionEmail()) || null,
      });
    } catch (e) { console.warn("[news-admin] audit log failed", e); }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  async function enterApp(email) {
    var access = await resolveAccess();
    if (!access || !access.email) {
      if (Access) Access.clearCurrentAccess();
      showLogin();
      return;
    }
    if (!Access.canAccessModule(access, "news")) {
      if (Access) Access.clearCurrentAccess();
      Access.guardNewsPageAccess(access);
      return;
    }
    if (Access) Access.setCurrentAccess(access);
    setCurrentUser(email || access.email);
    showApp();
    prewarmUploadAuth();
    await render();
  }

  function bindLogin() {
    var form = $("#news-admin-login-form");
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = $("#na-login-email").value.trim();
      var pass = $("#na-login-pass").value;
      var btn = $("#na-login-btn");
      if (btn) btn.disabled = true;
      try {
        await signIn(email, pass);
        var access = await resolveAccess();
        if (!access || !access.email) {
          await signOut();
          toast("Phiên đăng nhập không hợp lệ.", "error");
          return;
        }
        if (!Access.canAccessModule(access, "news")) {
          await signOut();
          toast("Tài khoản này không có quyền truy cập quản lý tin tức.", "error");
          return;
        }
        await enterApp(access.email);
      } catch (err) {
        toast("Đăng nhập thất bại: " + (err && err.message ? err.message : String(err)), "error");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    var logout = $("#na-logout");
    if (logout) logout.addEventListener("click", async function () {
      try { await signOut(); } catch (e) { /* ignore */ }
      if (Access) Access.clearCurrentAccess();
      showLogin();
    });
  }

  async function boot() {
    bindLogin();
    if (getLC()) getLC().onChange(function () { syncFormChrome(); });
    migrateLegacyUrl();
    window.addEventListener("popstate", onRouteChange);
    window.addEventListener("hashchange", function () {
      if (location.hash) migrateLegacyUrl();
      onRouteChange();
    });
    setBodyAuthState("pending");
    /* Do NOT call showLogin() here — CSS already hides both panels during "pending".
       Calling showLogin() would immediately set state to "anonymous" and make the
       login form visible for the entire auth-resolution window (~50-300ms). */

    try {
      var access = await resolveAccess();
      if (!access || !access.email) {
        showLogin();
      } else if (!Access.canAccessModule(access, "news")) {
        Access.guardNewsPageAccess(access);
        return;
      } else {
        await enterApp(access.email);
      }

      var sb = await getSupabase();
      sb.auth.onAuthStateChange(async function (event, session) {
        if (event === "INITIAL_SESSION") return;
        /* TOKEN_REFRESHED only rotates the JWT — skip to avoid a redundant getUser() round-trip. */
        if (event === "TOKEN_REFRESHED" && canPerformNews()) return;
        if (session && session.user) {
          var nextAccess = await resolveAccess();
          if (!nextAccess || !nextAccess.email) {
            if (Access) Access.clearCurrentAccess();
            showLogin();
            return;
          }
          if (!Access.canAccessModule(nextAccess, "news")) {
            if (Access) Access.clearCurrentAccess();
            Access.guardNewsPageAccess(nextAccess);
            return;
          }
          if (Access) Access.setCurrentAccess(nextAccess);
          var rootEl = $("#news-admin-root");
          if (!rootEl || rootEl.hidden) await enterApp(nextAccess.email);
          else setCurrentUser(nextAccess.email);
        } else {
          if (Access) Access.clearCurrentAccess();
          showLogin();
        }
      });
    } catch (e) {
      showLogin();
    }
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})(typeof window !== "undefined" ? window : globalThis);
