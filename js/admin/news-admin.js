/**
 * /admin/news.html — News CMS controller (vanilla JS).
 *
 *  Two views, switched by `location.hash`:
 *      #list                      → list (default)
 *      #new                       → create form
 *      #edit/<id>                 → edit form
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
  function getSupabase() {
    if (__sb) return Promise.resolve(__sb);
    var cfg = readSupabaseConfig();
    if (!cfg.url || !cfg.anonKey || !global.supabase || !global.supabase.createClient) {
      return Promise.reject(new Error("Thiếu cấu hình Supabase trong .env."));
    }
    __sb = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return Promise.resolve(__sb);
  }

  async function getSessionEmail() {
    var sb = await getSupabase();
    var { data, error } = await sb.auth.getUser();
    if (error || !data || !data.user) return null;
    return data.user.email || null;
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
  }

  function showLogin() {
    $("#news-admin-login").hidden = false;
    $("#news-admin-root").hidden = true;
  }

  function showApp() {
    $("#news-admin-login").hidden = true;
    $("#news-admin-root").hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Routing (hash)
  // ---------------------------------------------------------------------------
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h || h === "list") return { view: "list" };
    if (h === "new") return { view: "new" };
    var m = h.match(/^edit\/([0-9a-f-]{6,})$/i);
    if (m) return { view: "edit", id: m[1] };
    return { view: "list" };
  }

  function navigate(hash) { location.hash = hash; }

  async function render() {
    var root = $("#news-admin-content");
    root.innerHTML = "";
    var route = parseHash();
    try {
      if (route.view === "new")      await renderForm(root, null);
      else if (route.view === "edit") await renderForm(root, route.id);
      else                            await renderList(root);
    } catch (e) {
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

  async function renderList(root) {
    var card = el("div", { class: "news-admin-card" });
    var hd = el("div", { class: "news-admin-card__header" });
    hd.appendChild(el("div", null, [
      el("strong", null, "Bài viết"),
      el("p", { class: "news-admin-bcrumb", style: "margin:4px 0 0" }, "Quản lý tin tức / bài viết")
    ]));
    hd.appendChild(el("div", { class: "news-admin-actions" }, [
      el("a", { class: "news-admin-btn news-admin-btn--primary", href: "#new" }, "+ Bài viết mới")
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

    // load categories into dropdown
    try {
      var cats = await TLKVNewsAPI.listCategories();
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

    function reload() { loadTable(listMount, pagerHost); }
    loadTable(listMount, pagerHost);
  }

  async function loadTable(host, pagerHost) {
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
      host.innerHTML = "";

      if (!res.items.length) {
        host.appendChild(el("div", { class: "news-admin-empty" }, [
          el("h3", null, "Chưa có bài viết nào"),
          el("p", null, "Bấm “Bài viết mới” để bắt đầu."),
          el("a", { class: "news-admin-btn news-admin-btn--primary", href: "#new" }, "+ Bài viết mới"),
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
          el("a", { class: "news-admin-btn", href: "#edit/" + item.id }, "Sửa"),
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

      renderPager(pagerHost, res.total || 0, res.page, res.pageSize);
    } catch (e) {
      host.innerHTML = "";
      host.appendChild(el("div", { class: "news-admin-empty" }, [
        el("h3", null, "Không tải được danh sách"),
        el("p", null, e && e.message ? e.message : String(e)),
      ]));
    }
  }

  function renderPager(host, total, page, pageSize) {
    host.innerHTML = "";
    if (!total) return;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var from = (page - 1) * pageSize + 1;
    var to = Math.min(total, page * pageSize);
    host.appendChild(el("div", { class: "news-admin-pager__info" }, "Hiển thị " + from + "–" + to + " / " + total));
    function go(p) { return function () { LIST_STATE.page = p; loadTable($(".news-admin-table-wrap"), host); }; }
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

  /** @typedef {Object} FormState */
  var FORM_STATE = null;
  var EDITOR_INSTANCE = null;

  async function renderForm(root, editId) {
    // Tear down previous editor (if any) before mounting new one
    if (EDITOR_INSTANCE) { try { await EDITOR_INSTANCE.destroy(); } catch (e) {} EDITOR_INSTANCE = null; }

    var initial = null;
    if (editId) {
      try {
        initial = await TLKVNewsAPI.adminGetById(editId);
        if (!initial) {
          toast("Không tìm thấy bài viết.", "error");
          navigate("list");
          return;
        }
      } catch (e) {
        toast("Lỗi tải bài viết: " + (e && e.message ? e.message : String(e)), "error");
        navigate("list");
        return;
      }
    }

    FORM_STATE = {
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
      slugTouched: !!editId,    // don't auto-derive slug on existing rows
    };

    var card = el("div", { class: "news-admin-card" });
    card.appendChild(el("div", { class: "news-admin-card__header" }, [
      el("div", null, [
        el("strong", null, editId ? "Sửa bài viết" : "Tạo bài viết mới"),
        el("p", { class: "news-admin-bcrumb", style: "margin:4px 0 0" },
          editId ? "ID: " + editId : "Bài viết mới sẽ được lưu dưới dạng nháp")
      ]),
      el("div", { class: "news-admin-actions" }, [
        el("a", { class: "news-admin-btn", href: "#list" }, "← Danh sách"),
      ]),
    ]));

    var body = el("div", { class: "news-admin-card__body" });
    var form = el("form", { class: "news-admin-form", onsubmit: function (e) { e.preventDefault(); onSave("draft"); } });

    // ---- LEFT column: main fields ----
    var left = el("div");

    // Title
    var titleField = el("div", { class: "news-admin-field" });
    titleField.appendChild(el("label", { for: "f-title" }, "Tiêu đề"));
    var titleInput = el("input", { id: "f-title", type: "text", value: FORM_STATE.title,
      placeholder: "Tiêu đề bài viết...", maxlength: "500", required: "required" });
    titleField.appendChild(titleInput);
    left.appendChild(titleField);

    // Slug (with prefix)
    var slugField = el("div", { class: "news-admin-field" });
    slugField.appendChild(el("label", { for: "f-slug" }, "Đường dẫn (slug)"));
    var slugWrap = el("div", { class: "news-admin-slug" });
    slugWrap.appendChild(el("span", { class: "news-admin-slug__prefix" }, "/tin-tuc/"));
    var slugInput = el("input", { id: "f-slug", type: "text", value: FORM_STATE.slug, maxlength: "200", placeholder: "tu-dong-tu-tieu-de" });
    slugWrap.appendChild(slugInput);
    slugField.appendChild(slugWrap);
    slugField.appendChild(el("span", { class: "news-admin-hint" }, "Chỉ gồm chữ thường, số và dấu gạch ngang. Nếu để trống sẽ tự sinh từ tiêu đề."));
    left.appendChild(slugField);

    // Short description
    var sdField = el("div", { class: "news-admin-field" });
    sdField.appendChild(el("label", { for: "f-sd" }, "Mô tả ngắn"));
    var sdInput = el("textarea", { id: "f-sd", placeholder: "Tóm tắt nội dung (hiển thị ở danh sách & meta description)", maxlength: "2000" }, FORM_STATE.shortDescription);
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

    var edHolder = el("div", { class: "news-admin-editor", id: "tlkv-news-editor-holder" });
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
    var statusBadge = el("span", { class: "news-admin-status news-admin-status--" + FORM_STATE.status }, statusLabel(FORM_STATE.status));
    actBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", null, "Trạng thái hiện tại"),
      statusBadge,
    ]));

    var btnDraft = el("button", { class: "news-admin-btn", type: "button" }, "💾 Lưu nháp");
    var btnPublish = el("button", { class: "news-admin-btn news-admin-btn--primary", type: "button" },
      FORM_STATE.status === "published" ? "💾 Cập nhật" : "🚀 Xuất bản");
    var btnPreview = el("button", { class: "news-admin-btn", type: "button" }, "👁 Xem trước");

    btnDraft.addEventListener("click", function () { onSave("draft"); });
    btnPublish.addEventListener("click", function () { onSave("published"); });
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
    var preview = el("div", { class: "news-admin-thumb__preview" + (FORM_STATE.thumbnailUrl ? "" : " news-admin-thumb__preview--empty") });
    if (FORM_STATE.thumbnailUrl) preview.style.backgroundImage = "url('" + FORM_STATE.thumbnailUrl + "')";
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
      el("input", { id: "f-thumb", type: "url", value: FORM_STATE.thumbnailUrl, placeholder: "https://..." }),
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
      el("input", { id: "f-seo-title", type: "text", maxlength: "500", value: FORM_STATE.seoTitle, placeholder: "Mặc định = tiêu đề bài viết" }),
    ]));
    seoBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-seo-desc" }, "SEO description"),
      el("textarea", { id: "f-seo-desc", maxlength: "1000", placeholder: "Mặc định = mô tả ngắn" }, FORM_STATE.seoDescription),
    ]));
    seoBody.appendChild(el("div", { class: "news-admin-field" }, [
      el("label", { for: "f-seo-kw" }, "Từ khoá (cách nhau bằng dấu phẩy)"),
      el("input", { id: "f-seo-kw", type: "text", maxlength: "500", value: FORM_STATE.seoKeywords }),
    ]));
    seoCard.appendChild(seoBody);
    side.appendChild(seoCard);

    form.appendChild(side);
    body.appendChild(form);
    card.appendChild(body);
    root.appendChild(card);

    // Wire inputs to FORM_STATE
    titleInput.addEventListener("input", function () {
      FORM_STATE.title = titleInput.value;
      if (!FORM_STATE.slugTouched) {
        FORM_STATE.slug = TLKVNewsAPI.buildSlug(titleInput.value);
        slugInput.value = FORM_STATE.slug;
      }
    });
    slugInput.addEventListener("input", function () {
      FORM_STATE.slug = TLKVNewsAPI.buildSlug(slugInput.value);
      slugInput.value = FORM_STATE.slug;
      FORM_STATE.slugTouched = true;
    });
    sdInput.addEventListener("input", function () { FORM_STATE.shortDescription = sdInput.value; });

    var catSel = $("#f-cat", form);
    try {
      var cats = await TLKVNewsAPI.listCategories();
      cats.forEach(function (c) {
        var o = el("option", { value: c.id }, c.name);
        catSel.appendChild(o);
      });
      catSel.value = FORM_STATE.categoryId || "";
    } catch (e) { /* non-fatal */ }
    catSel.addEventListener("change", function () { FORM_STATE.categoryId = catSel.value; });

    var feat = $("#f-feat", form);
    feat.checked = FORM_STATE.featured;
    feat.addEventListener("change", function () { FORM_STATE.featured = feat.checked; });

    // Thumbnail wiring
    thFile.addEventListener("change", async function () {
      var f = thFile.files && thFile.files[0];
      if (!f) return;
      thProgress.style.display = "block";
      thProgress.firstChild.style.width = "30%";
      try {
        var res = await TLKVNewsStorage.upload("thumbnails", f);
        thProgress.firstChild.style.width = "100%";
        FORM_STATE.thumbnailUrl = res.publicUrl;
        FORM_STATE.thumbnailPath = res.path;
        $("#f-thumb", form).value = res.publicUrl;
        preview.classList.remove("news-admin-thumb__preview--empty");
        preview.textContent = "";
        preview.style.backgroundImage = "url('" + res.publicUrl + "')";
        toast("Đã upload ảnh đại diện.", "success");
      } catch (e) {
        toast("Lỗi upload: " + (e && e.message ? e.message : String(e)), "error");
      } finally {
        setTimeout(function () { thProgress.style.display = "none"; thProgress.firstChild.style.width = "0%"; }, 600);
        thFile.value = "";
      }
    });
    $("#f-thumb", form).addEventListener("input", function () {
      FORM_STATE.thumbnailUrl = $("#f-thumb", form).value.trim();
      if (FORM_STATE.thumbnailUrl) {
        preview.classList.remove("news-admin-thumb__preview--empty");
        preview.textContent = "";
        preview.style.backgroundImage = "url('" + FORM_STATE.thumbnailUrl + "')";
      } else {
        preview.classList.add("news-admin-thumb__preview--empty");
        preview.textContent = "Chưa có ảnh";
        preview.style.backgroundImage = "";
      }
    });
    thClear.addEventListener("click", function () {
      FORM_STATE.thumbnailUrl = "";
      FORM_STATE.thumbnailPath = "";
      $("#f-thumb", form).value = "";
      preview.classList.add("news-admin-thumb__preview--empty");
      preview.textContent = "Chưa có ảnh";
      preview.style.backgroundImage = "";
    });

    $("#f-seo-title", form).addEventListener("input", function () { FORM_STATE.seoTitle = this.value; });
    $("#f-seo-desc", form).addEventListener("input",  function () { FORM_STATE.seoDescription = this.value; });
    $("#f-seo-kw", form).addEventListener("input",    function () { FORM_STATE.seoKeywords = this.value; });

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

    async function insertContentImage(url, caption) {
      if (!EDITOR_INSTANCE || typeof EDITOR_INSTANCE.insertImage !== "function") {
        toast("Trình soạn thảo chưa sẵn sàng.", "warn");
        return;
      }
      try {
        await EDITOR_INSTANCE.insertImage(url, caption);
        setContentImgPreview(url);
        toast("Đã chèn ảnh vào nội dung.", "success");
      } catch (e) {
        toast("Không chèn được ảnh: " + (e && e.message ? e.message : String(e)), "error");
      }
    }

    ciFile.addEventListener("change", async function () {
      var f = ciFile.files && ciFile.files[0];
      if (!f) return;
      ciProgress.style.display = "block";
      ciProgress.firstChild.style.width = "30%";
      try {
        var res = await TLKVNewsStorage.upload("content", f);
        ciProgress.firstChild.style.width = "100%";
        $("#f-content-img-url", form).value = res.publicUrl;
        var cap = $("#f-content-img-caption", form);
        await insertContentImage(res.publicUrl, cap ? cap.value.trim() : "");
      } catch (e) {
        toast("Lỗi upload: " + (e && e.message ? e.message : String(e)), "error");
      } finally {
        setTimeout(function () {
          ciProgress.style.display = "none";
          ciProgress.firstChild.style.width = "0%";
        }, 600);
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
      var capEl = $("#f-content-img-caption", form);
      await insertContentImage(url, capEl ? capEl.value.trim() : "");
    });

    // Mount Editor.js
    try {
      EDITOR_INSTANCE = await TLKVNewsEditor.mount({
        holder: "tlkv-news-editor-holder",
        data: initial && initial.content && Array.isArray(initial.content.blocks)
                ? initial.content
                : { blocks: [] },
      });
    } catch (e) {
      edHolder.innerHTML = "";
      edHolder.appendChild(el("div", { class: "news-admin-empty" }, [
        el("h3", null, "Không khởi tạo được trình soạn thảo"),
        el("p", null, e && e.message ? e.message : String(e)),
      ]));
    }
  }

  async function onSave(targetStatus) {
    if (!FORM_STATE) return;
    if (!FORM_STATE.title.trim()) {
      toast("Vui lòng nhập tiêu đề.", "warn");
      var t = $("#f-title");
      if (t) t.focus();
      return;
    }
    var contentJson = { blocks: [] };
    try {
      if (EDITOR_INSTANCE) contentJson = await EDITOR_INSTANCE.save();
    } catch (e) {
      toast("Lỗi đọc nội dung soạn thảo: " + (e && e.message ? e.message : String(e)), "error");
      return;
    }

    var actorEmail = (await getSessionEmail()) || "";
    var payload = {
      title: FORM_STATE.title,
      slug: FORM_STATE.slug || FORM_STATE.title,
      shortDescription: FORM_STATE.shortDescription,
      thumbnailUrl: FORM_STATE.thumbnailUrl,
      content: contentJson,
      categoryId: FORM_STATE.categoryId || null,
      status: targetStatus,
      featured: FORM_STATE.featured,
      seoTitle: FORM_STATE.seoTitle,
      seoDescription: FORM_STATE.seoDescription,
      seoKeywords: FORM_STATE.seoKeywords,
    };
    try {
      var saved;
      if (FORM_STATE.id) {
        saved = await TLKVNewsAPI.adminUpdate(FORM_STATE.id, payload, { actorEmail: actorEmail });
        await logAudit("news_update", saved, null, "Cập nhật bài: " + saved.title);
      } else {
        saved = await TLKVNewsAPI.adminCreate(payload, { actorEmail: actorEmail });
        await logAudit("news_insert", saved, null, "Tạo mới: " + saved.title);
        FORM_STATE.id = saved.id;
        navigate("edit/" + saved.id);
      }
      toast(targetStatus === "published" ? "Đã xuất bản." : "Đã lưu bản nháp.", "success");
    } catch (e) {
      console.error(e);
      toast("Lỗi lưu: " + (e && e.message ? e.message : String(e)), "error");
    }
  }

  function onPreview() {
    if (!FORM_STATE) return;
    if (FORM_STATE.id && FORM_STATE.status === "published") {
      window.open("/tin-tuc/" + encodeURIComponent(FORM_STATE.slug), "_blank");
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
        showApp();
        render();
      } catch (err) {
        toast("Đăng nhập thất bại: " + (err && err.message ? err.message : String(err)), "error");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    var logout = $("#na-logout");
    if (logout) logout.addEventListener("click", async function () {
      try { await signOut(); } catch (e) { /* ignore */ }
      showLogin();
    });
  }

  async function boot() {
    bindLogin();
    var email = null;
    try { email = await getSessionEmail(); } catch (e) { /* ignore */ }
    if (!email) {
      showLogin();
      return;
    }
    var who = $("#na-current-user");
    if (who) who.textContent = email;
    showApp();
    render();
    window.addEventListener("hashchange", render);
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})(typeof window !== "undefined" ? window : globalThis);
