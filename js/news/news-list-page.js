/**
 * /tin-tuc — listing page controller.
 *
 *  - Read URL query (?page, ?cat, ?q) → restore state, write state back on change.
 *  - Page 1 shows the editorial hero (1 featured + 4 side cards) + a grid below.
 *  - Pages 2+ show a single grid (no hero) + pagination.
 *  - Debounced search (300 ms) and category select.
 */
(function () {
  "use strict";

  var $  = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  var PAGE_SIZE = 12;
  var HERO_FEATURED = 1;
  var HERO_SIDE = 4;

  var STATE = readUrlState();
  var SEARCH_TIMER = null;

  function readUrlState() {
    var u = new URL(window.location.href);
    return {
      page: Math.max(1, parseInt(u.searchParams.get("page"), 10) || 1),
      cat: String(u.searchParams.get("cat") || "").trim(),
      q:   String(u.searchParams.get("q") || "").trim(),
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
    if (replace) window.history.replaceState(null, "", u.toString());
    else window.history.pushState(null, "", u.toString());
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

  // ---------------------------------------------------------------------------
  // Skeletons
  // ---------------------------------------------------------------------------

  function heroSkeleton() {
    var host = $("#tlkv-news-hero-area");
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
      img.alt = item.title || "Tin tức";
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

  function renderList(items) {
    var host = $("#tlkv-news-list");
    host.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "tlkv-news-empty";
      empty.textContent = "Chưa có bài viết phù hợp.";
      host.appendChild(empty);
      return;
    }
    items.forEach(function (it) { host.appendChild(createCard(it)); });
  }

  function renderError(msg) {
    var hero = $("#tlkv-news-hero-area");
    hero.innerHTML = "";
    var box = document.createElement("div");
    box.className = "tlkv-news-error";
    box.textContent = "Không tải được tin tức: " + (msg || "lỗi không xác định") + ".";
    hero.appendChild(box);
    $("#tlkv-news-list").innerHTML = "";
    $("#tlkv-news-pager").innerHTML = "";
  }

  function renderPager(total, page, pageSize) {
    var host = $("#tlkv-news-pager");
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
    // window: first, last, current ±2
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
    try {
      var cats = await TLKVNewsAPI.listCategories();
      var sel = $("#tlkv-news-category");
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

  async function loadPage() {
    var hasFilter = !!(STATE.q || STATE.cat);
    var showHero = STATE.page === 1 && !hasFilter;
    $("#tlkv-news-list-title").textContent = showHero ? "Bài viết khác" : "Kết quả";
    if (showHero) heroSkeleton();
    else $("#tlkv-news-hero-area").innerHTML = "";
    listSkeleton();

    try {
      if (showHero) {
        // hero (featured + side)
        var hero = await TLKVNewsAPI.listForLandingHero({
          limitFeatured: HERO_FEATURED,
          limitSecondary: HERO_SIDE,
        });
        renderHero(hero.featured, hero.secondary);

        // remaining grid skips the hero items
        var skipIds = new Set(
          hero.featured.concat(hero.secondary).map(function (x) { return x.id; })
        );
        var page1 = await TLKVNewsAPI.listPublished({
          page: 1,
          pageSize: PAGE_SIZE + skipIds.size,
          withCount: true,
        });
        var rest = page1.items.filter(function (x) { return !skipIds.has(x.id); }).slice(0, PAGE_SIZE);
        renderList(rest);
        var total = (page1.total || 0);
        renderPager(total, 1, PAGE_SIZE + skipIds.size); // pager step accounts for hero offset roughly
        return;
      }

      $("#tlkv-news-hero-area").innerHTML = "";
      var res = await TLKVNewsAPI.listPublished({
        page: STATE.page,
        pageSize: PAGE_SIZE,
        categorySlug: STATE.cat,
        search: STATE.q,
        withCount: true,
      });
      renderList(res.items);
      renderPager(res.total || 0, res.page, res.pageSize);
    } catch (e) {
      console.error("[news] page load failed", e);
      renderError(e && e.message ? e.message : String(e));
    }
  }

  // ---------------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------------

  function bind() {
    var search = $("#tlkv-news-search");
    var cat = $("#tlkv-news-category");
    var clear = $("#tlkv-news-clear");

    search.value = STATE.q;

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
    clear.addEventListener("click", function () {
      STATE.q = "";
      STATE.cat = "";
      STATE.page = 1;
      search.value = "";
      cat.value = "";
      writeUrlState(false);
      loadPage();
    });
    window.addEventListener("popstate", function () {
      STATE = readUrlState();
      search.value = STATE.q;
      cat.value = STATE.cat;
      loadPage();
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    bind();
    loadCategories();
    loadPage();
  });
})();
