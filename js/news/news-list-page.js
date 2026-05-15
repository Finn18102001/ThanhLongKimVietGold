/**
 * News listing controllers:
 *   /tin-tuc              — landing (hero preview + optional "Bài viết khác", no toolbar)
 *   /tin-tuc/danh-sach    — archive (search, category, pagination)
 *
 *  Legacy query params on /tin-tuc (?page, ?cat, ?q) redirect to /tin-tuc/danh-sach.
 */
(function () {
  "use strict";

  var $  = function (sel) { return document.querySelector(sel); };

  /** Số bài mỗi trang trên /tin-tuc/danh-sach — query Supabase `news` toàn bộ published, không danh sách slug cố định. */
  var ARCHIVE_PAGE_SIZE = 24;
  var LANDING_REST_PAGE_SIZE = 12;
  var HERO_FEATURED = 1;
  var HERO_SIDE = 4;

  function normPath() {
    var p = (window.location.pathname || "").replace(/\/+$/, "");
    return p || "/";
  }

  function detectArchive() {
    var mode = (document.body && document.body.getAttribute("data-tlkv-news-list-mode")) || "";
    if (mode === "archive") return true;
    return /^\/tin-tuc\/danh-sach$/i.test(normPath());
  }

  /** Gán sau DOMContentLoaded để body + data-* luôn có trước khi đọc. */
  var IS_ARCHIVE = false;
  var STATE = { page: 1, cat: "", q: "", year: "", sort: "desc" };
  var SEARCH_TIMER = null;

  function sanitizeYearParam(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var n = parseInt(s, 10);
    if (n >= 1990 && n <= 2100) return String(n);
    return "";
  }

  function readUrlState() {
    var u = new URL(window.location.href);
    var sortRaw = String(u.searchParams.get("sort") || "").trim().toLowerCase();
    var sort = sortRaw === "asc" || sortRaw === "old" ? "asc" : "desc";
    return {
      page: Math.max(1, parseInt(u.searchParams.get("page"), 10) || 1),
      cat: String(u.searchParams.get("cat") || "").trim(),
      q:   String(u.searchParams.get("q") || "").trim(),
      year: sanitizeYearParam(u.searchParams.get("year")),
      sort: sort,
    };
  }

  function writeUrlState(replace) {
    var u = new URL(window.location.href);
    if (STATE.page > 1) u.searchParams.set("page", String(STATE.page));
    else u.searchParams.delete("page");
    if (STATE.cat) u.searchParams.set("cat", STATE.cat);
    else u.searchParams.delete("cat");
    if (STATE.q) u.searchParams.set("q", STATE.q);
    else u.searchParams.delete("q");
    if (STATE.year) u.searchParams.set("year", STATE.year);
    else u.searchParams.delete("year");
    if (STATE.sort === "asc") u.searchParams.set("sort", "asc");
    else u.searchParams.delete("sort");
    if (replace) window.history.replaceState(null, "", u.toString());
    else window.history.pushState(null, "", u.toString());
  }

  function fillYearSelect(sel) {
    if (!sel) return;
    var yNow = new Date().getFullYear();
    var yMin = Math.max(1990, yNow - 20);
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "Tất cả năm";
    sel.appendChild(o0);
    for (var y = yNow; y >= yMin; y--) {
      var o = document.createElement("option");
      o.value = String(y);
      o.textContent = String(y);
      sel.appendChild(o);
    }
    if (STATE.year) sel.value = STATE.year;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) { return ""; }
  }

  function pickThumb(item) {
    var u = (item && item.thumbnailUrl) || "";
    if (!u) return "";
    return u;
  }

  function articleHref(item) {
    return "/tin-tuc/" + encodeURIComponent(item.slug);
  }

  function setListSectionVisible(show) {
    var sec = $("#tlkv-news-list-section");
    if (!sec) return;
    sec.classList.toggle("tlkv-news-list-section--hidden", !show);
  }

  // ---------------------------------------------------------------------------
  // Skeletons
  // ---------------------------------------------------------------------------

  function heroSkeleton() {
    var host = $("#tlkv-news-hero-area");
    if (!host) return;
    host.removeAttribute("hidden");
    host.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "tlkv-news-grid";

    var fe = document.createElement("div");
    fe.className = "tlkv-news-card tlkv-news-card--featured tlkv-news-grid__featured";
    fe.innerHTML =
      '<div class="tlkv-news-skel tlkv-news-skel--media tlkv-news-skel--big" style="border-radius:0"></div>' +
      '<div class="tlkv-news-card__body">' +
        '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:35%"></div>' +
        '<div class="tlkv-news-skel tlkv-news-skel--line lg" style="width:80%"></div>' +
        '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:60%"></div>' +
      '</div>';
    grid.appendChild(fe);

    var side = document.createElement("div");
    side.className = "tlkv-news-grid__side";
    for (var i = 0; i < 4; i++) {
      var c = document.createElement("div");
      c.className = "tlkv-news-card";
      c.innerHTML =
        '<div class="tlkv-news-skel tlkv-news-skel--media" style="border-radius:0"></div>' +
        '<div class="tlkv-news-card__body">' +
          '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:40%"></div>' +
          '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:90%"></div>' +
        '</div>';
      side.appendChild(c);
    }
    grid.appendChild(side);
    host.appendChild(grid);
  }

  function listSkeleton() {
    var host = $("#tlkv-news-list");
    if (!host) return;
    host.innerHTML = "";
    for (var i = 0; i < 6; i++) {
      var c = document.createElement("div");
      c.className = "tlkv-news-card";
      c.innerHTML =
        '<div class="tlkv-news-skel tlkv-news-skel--media" style="border-radius:0"></div>' +
        '<div class="tlkv-news-card__body">' +
          '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:40%"></div>' +
          '<div class="tlkv-news-skel tlkv-news-skel--line lg" style="width:85%"></div>' +
          '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:65%"></div>' +
        '</div>';
      host.appendChild(c);
    }
  }

  // ---------------------------------------------------------------------------
  // Card factory
  // ---------------------------------------------------------------------------

  function createCard(item, variant) {
    var a = document.createElement("a");
    a.className = "tlkv-news-card" + (variant === "featured" ? " tlkv-news-card--featured" : "");
    a.href = articleHref(item);

    var media = document.createElement("div");
    media.className = "tlkv-news-card__media";
    var thumb = pickThumb(item);
    if (thumb) {
      var img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = item.title || "Tin tức thị trường";
      img.src = thumb;
      img.onerror = function () { this.onerror = null; this.style.display = "none"; };
      media.appendChild(img);
    }
    a.appendChild(media);

    var body = document.createElement("div");
    body.className = "tlkv-news-card__body";

    var meta = document.createElement("div");
    meta.className = "tlkv-news-card__meta";
    var catLabel = item.category && item.category.name ? item.category.name : "TIN TỨC";
    var spanCat = document.createElement("span");
    spanCat.textContent = catLabel;
    meta.appendChild(spanCat);
    if (item.publishedAt || item.createdAt) {
      var dot = document.createElement("span");
      dot.className = "tlkv-news-card__meta-sep";
      meta.appendChild(dot);
      var date = document.createElement("span");
      date.textContent = fmtDate(item.publishedAt || item.createdAt);
      meta.appendChild(date);
    }
    body.appendChild(meta);

    var h = document.createElement("h3");
    h.className = "tlkv-news-card__title";
    h.textContent = item.title || "";
    body.appendChild(h);

    if (variant === "featured" && item.shortDescription) {
      var p = document.createElement("p");
      p.className = "tlkv-news-card__excerpt";
      p.textContent = item.shortDescription;
      body.appendChild(p);
    }

    a.appendChild(body);
    return a;
  }

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  function renderHero(featured, secondary) {
    var host = $("#tlkv-news-hero-area");
    if (!host) return;
    host.removeAttribute("hidden");
    host.innerHTML = "";
    if (!featured.length && !secondary.length) return;

    var grid = document.createElement("div");
    grid.className = "tlkv-news-grid";

    if (featured.length) {
      var feCard = createCard(featured[0], "featured");
      feCard.classList.add("tlkv-news-grid__featured");
      grid.appendChild(feCard);
    }

    var side = document.createElement("div");
    side.className = "tlkv-news-grid__side";
    secondary.slice(0, HERO_SIDE).forEach(function (item) {
      side.appendChild(createCard(item));
    });
    grid.appendChild(side);

    host.appendChild(grid);
  }

  /**
   * @param {boolean} showEmptyMessage — when true and items empty, show "Chưa có bài viết phù hợp."
   */
  function renderList(items, showEmptyMessage) {
    var host = $("#tlkv-news-list");
    if (!host) return;
    host.innerHTML = "";
    if (!items.length) {
      if (showEmptyMessage) {
        var empty = document.createElement("div");
        empty.className = "tlkv-news-empty";
        empty.textContent = "Chưa có bài viết phù hợp.";
        host.appendChild(empty);
      }
      return;
    }
    items.forEach(function (it) { host.appendChild(createCard(it)); });
  }

  function renderError(msg) {
    var box = document.createElement("div");
    box.className = "tlkv-news-error";
    box.textContent = "Không tải được tin tức: " + (msg || "lỗi không xác định") + ".";

    if (IS_ARCHIVE) {
      var hero = $("#tlkv-news-hero-area");
      if (hero) hero.innerHTML = "";
      var listHost = $("#tlkv-news-list");
      if (listHost) {
        listHost.innerHTML = "";
        listHost.appendChild(box);
      }
      setListSectionVisible(true);
    } else {
      var heroL = $("#tlkv-news-hero-area");
      if (heroL) {
        heroL.removeAttribute("hidden");
        heroL.innerHTML = "";
        heroL.appendChild(box);
      }
      var listHostL = $("#tlkv-news-list");
      if (listHostL) listHostL.innerHTML = "";
      setListSectionVisible(false);
    }
    var pg = $("#tlkv-news-pager");
    if (pg) pg.innerHTML = "";
  }

  function renderPager(total, page, pageSize) {
    var host = $("#tlkv-news-pager");
    if (!host) return;
    host.innerHTML = "";
    if (!total || total <= pageSize) return;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    function btn(label, targetPage, opts) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (opts && opts.current) b.setAttribute("aria-current", "page");
      if (opts && opts.disabled) b.disabled = true;
      b.addEventListener("click", function () {
        STATE.page = targetPage;
        writeUrlState(false);
        loadPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return b;
    }
    function dots() {
      var s = document.createElement("span");
      s.className = "tlkv-news-pager__ellipsis";
      s.textContent = "…";
      return s;
    }

    host.appendChild(btn("‹", Math.max(1, page - 1), { disabled: page <= 1 }));
    var pages = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2]);
    var list = Array.from(pages).filter(function (x) { return x >= 1 && x <= totalPages; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < list.length; i++) {
      if (i > 0 && list[i] !== list[i - 1] + 1) host.appendChild(dots());
      host.appendChild(btn(String(list[i]), list[i], { current: list[i] === page }));
    }
    host.appendChild(btn("›", Math.min(totalPages, page + 1), { disabled: page >= totalPages }));
  }

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  async function loadCategories() {
    var sel = $("#tlkv-news-category");
    if (!sel) return;
    try {
      var cats = await TLKVNewsAPI.listCategories();
      cats.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.slug;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
      if (STATE.cat) sel.value = STATE.cat;
    } catch (e) {
      console.warn("[news] categories load failed", e);
    }
  }

  async function loadPageArchive() {
    var hero = $("#tlkv-news-hero-area");
    if (hero) {
      hero.innerHTML = "";
      hero.setAttribute("hidden", "hidden");
    }

    var hasFilter = !!(STATE.q || STATE.cat || STATE.year || STATE.sort === "asc");
    var titleEl = $("#tlkv-news-list-title");
    if (titleEl) titleEl.textContent = hasFilter ? "Kết quả" : "Danh sách bài viết";

    setListSectionVisible(true);
    listSkeleton();

    try {
      // Toàn bộ bài published trong DB (lọc ?cat / ?q / ?year / ?sort), phân trang.
      var res = await TLKVNewsAPI.listPublished({
        page: STATE.page,
        pageSize: ARCHIVE_PAGE_SIZE,
        categorySlug: STATE.cat,
        search: STATE.q,
        publishedYear: STATE.year ? parseInt(STATE.year, 10) : undefined,
        sortPublished: STATE.sort === "asc" ? "asc" : "desc",
        withCount: true,
      });
      renderList(res.items, true);
      renderPager(res.total || 0, res.page, res.pageSize);
    } catch (e) {
      console.error("[news] archive load failed", e);
      renderError(e && e.message ? e.message : String(e));
    }
  }

  async function loadPageLanding() {
    var titleEl = $("#tlkv-news-list-title");
    if (titleEl) titleEl.textContent = "Bài viết khác";

    heroSkeleton();
    listSkeleton();

    try {
      var hero = await TLKVNewsAPI.listForLandingHero({
        limitFeatured: HERO_FEATURED,
        limitSecondary: HERO_SIDE,
      });

      if (!hero.featured.length && !hero.secondary.length) {
        var heroHost = $("#tlkv-news-hero-area");
        if (heroHost) {
          heroHost.innerHTML = "";
          heroHost.removeAttribute("hidden");
          var empty = document.createElement("div");
          empty.className = "tlkv-news-empty";
          empty.textContent = "Chưa có bài viết phù hợp.";
          heroHost.appendChild(empty);
        }
        var listH = $("#tlkv-news-list");
        if (listH) listH.innerHTML = "";
        setListSectionVisible(false);
        var pg = $("#tlkv-news-pager");
        if (pg) pg.innerHTML = "";
        return;
      }

      renderHero(hero.featured, hero.secondary);

      var skipIds = new Set(
        hero.featured.concat(hero.secondary).map(function (x) { return x.id; })
      );
      var page1 = await TLKVNewsAPI.listPublished({
        page: 1,
        pageSize: LANDING_REST_PAGE_SIZE + skipIds.size,
        withCount: true,
      });
      var rest = page1.items.filter(function (x) { return !skipIds.has(x.id); }).slice(0, LANDING_REST_PAGE_SIZE);

      if (rest.length > 0) {
        setListSectionVisible(true);
        renderList(rest, false);
      } else {
        var listHost = $("#tlkv-news-list");
        if (listHost) listHost.innerHTML = "";
        setListSectionVisible(false);
      }

      var pg2 = $("#tlkv-news-pager");
      if (pg2) pg2.innerHTML = "";
    } catch (e) {
      console.error("[news] landing load failed", e);
      renderError(e && e.message ? e.message : String(e));
    }
  }

  async function loadPage() {
    if (IS_ARCHIVE) await loadPageArchive();
    else await loadPageLanding();
  }

  // ---------------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------------

  function bind() {
    var search = $("#tlkv-news-search");
    var cat = $("#tlkv-news-category");
    var year = $("#tlkv-news-year");
    var sort = $("#tlkv-news-sort");
    var clear = $("#tlkv-news-clear");
    if (!search || !cat || !clear) return;

    search.value = STATE.q;
    if (year) {
      fillYearSelect(year);
    }
    if (sort) sort.value = STATE.sort === "asc" ? "asc" : "desc";

    search.addEventListener("input", function () {
      clearTimeout(SEARCH_TIMER);
      SEARCH_TIMER = setTimeout(function () {
        STATE.q = search.value.trim();
        STATE.page = 1;
        writeUrlState(true);
        loadPage();
      }, 300);
    });
    cat.addEventListener("change", function () {
      STATE.cat = cat.value;
      STATE.page = 1;
      writeUrlState(false);
      loadPage();
    });
    if (year) {
      year.addEventListener("change", function () {
        STATE.year = sanitizeYearParam(year.value);
        STATE.page = 1;
        writeUrlState(false);
        loadPage();
      });
    }
    if (sort) {
      sort.addEventListener("change", function () {
        STATE.sort = sort.value === "asc" ? "asc" : "desc";
        STATE.page = 1;
        writeUrlState(false);
        loadPage();
      });
    }
    clear.addEventListener("click", function () {
      STATE.q = "";
      STATE.cat = "";
      STATE.year = "";
      STATE.sort = "desc";
      STATE.page = 1;
      search.value = "";
      cat.value = "";
      if (year) {
        fillYearSelect(year);
        year.value = "";
      }
      if (sort) sort.value = "desc";
      writeUrlState(false);
      loadPage();
    });
    window.addEventListener("popstate", function () {
      STATE = readUrlState();
      search.value = STATE.q;
      cat.value = STATE.cat;
      if (year) {
        fillYearSelect(year);
        year.value = STATE.year || "";
      }
      if (sort) sort.value = STATE.sort === "asc" ? "asc" : "desc";
      loadPage();
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    IS_ARCHIVE = detectArchive();
    STATE = readUrlState();

    if (!IS_ARCHIVE) {
      var path = normPath();
      if (/^\/tin-tuc$/i.test(path)) {
        var u = new URL(window.location.href);
        var p = parseInt(u.searchParams.get("page"), 10) || 1;
        if (u.searchParams.get("q") || u.searchParams.get("cat") || p > 1) {
          window.location.replace("/tin-tuc/danh-sach" + (u.search || ""));
          return;
        }
      }
    }

    if (typeof TLKVNewsAPI === "undefined") {
      var listOnly = $("#tlkv-news-list");
      if (listOnly) {
        listOnly.innerHTML =
          '<div class="tlkv-news-error">Không tải được tin: thiếu TLKVNewsAPI (kiểm tra thứ tự script hoặc đường dẫn /js/news/news-api.js).</div>';
      }
      setListSectionVisible(true);
      return;
    }

    bind();
    if (IS_ARCHIVE) {
      loadCategories().then(function () { return loadPage(); }).catch(function () { return loadPage(); });
    } else {
      loadPage();
    }
  });
})();
