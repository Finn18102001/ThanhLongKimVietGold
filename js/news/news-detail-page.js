/**
 * /tin-tuc/:articleSlug — trang chi tiết MỘT bài viết (shell: tin-tuc/chi-tiet.html).
 *
 * Phạm vi (đừng nhầm với danh mục):
 *   - Đoạn URL sau `/tin-tuc/` ở đây là **slug bài** (chuỗi khớp cột `news.slug`), dùng trong `getBySlug(slug)`.
 *     Không phải khóa số tự tăng, không phải “index trang”, không phải “lấy tất cả bài”.
 *   - Danh sách đầy đủ + “Xem tất cả” → `/tin-tuc/danh-sach` (tin-tuc/danh-sach.html + news-list-page.js).
 *     Script này **không** được bundle cho URL đó; Express cũng route `danh-sach` trước `:slug`.
 *
 * Trách nhiệm: SEO meta, JSON-LD, breadcrumb, nội dung bài, bài liên quan, view count.
 */
(function () {
  "use strict";

  var $  = function (sel) { return document.querySelector(sel); };

  /**
   * Phân đoạn ngay sau `/tin-tuc/` dành cho route ứng dụng — không phải slug trong bảng `news`.
   * Khớp với routes/web.js (khi thêm path con mới, cập nhật cả hai nơi).
   */
  var RESERVED_TIN_TUC_PATH_SEGMENTS = {
    "danh-sach": true,
    "thi-truong": true,
  };

  /**
   * Phân tích pathname cho **trang chi tiết**:
   *   - `article` + `slug` → gọi API một bài theo slug.
   *   - `reserved`      → segment là route hệ thống (vd. danh mục); chuyển hướng an toàn.
   *   - `none`          → không khớp pattern /tin-tuc/segment (vd. /tin-tuc).
   */
  function resolveNewsDetailRoute() {
    try {
      var p = (window.location.pathname || "").replace(/\/+$/, "");
      var m = p.match(/^\/tin-tuc\/([^/?#]+)$/i);
      if (!m) return { type: "none" };
      var raw = String(decodeURIComponent(m[1]) || "").trim();
      if (!raw) return { type: "none" };
      if (RESERVED_TIN_TUC_PATH_SEGMENTS[raw.toLowerCase()]) return { type: "reserved" };
      return { type: "article", slug: raw };
    } catch (e) {
      return { type: "none" };
    }
  }

  function fmtDate(iso, withTime) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      var opts = withTime
        ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", year: "numeric" };
      return d.toLocaleString("vi-VN", opts);
    } catch (e) { return ""; }
  }

  // ---------------------------------------------------------------------------
  // SEO meta + JSON-LD
  // ---------------------------------------------------------------------------
  function setMeta(selector, attr, value) {
    var el = document.querySelector(selector);
    if (el && value != null) el.setAttribute(attr, String(value));
  }

  function applySeo(article) {
    var siteOrigin = (window.location.origin || "https://thanglongkimviet.vn").replace(/\/$/, "");
    var pageUrl = siteOrigin + "/tin-tuc/" + article.slug;
    var siteName = "Thăng Long Kim Việt";
    var title = (article.seoTitle || article.title) + " - " + siteName;
    var desc =
      article.seoDescription ||
      article.shortDescription ||
      "Tin tức thị trường từ " + siteName;
    var image = article.thumbnailUrl || (siteOrigin + "/assets/og-logo-256.png");

    document.title = title;
    document.querySelector("[data-tlkv-news-title]") &&
      (document.querySelector("[data-tlkv-news-title]").textContent = title);
    setMeta("[data-tlkv-news-canonical]", "href", pageUrl);
    setMeta("[data-tlkv-news-desc]", "content", desc);
    setMeta("[data-tlkv-news-keywords]", "content", article.seoKeywords || "");
    setMeta("[data-tlkv-news-og-title]", "content", title);
    setMeta("[data-tlkv-news-og-desc]", "content", desc);
    setMeta("[data-tlkv-news-og-image]", "content", image);
    setMeta("[data-tlkv-news-og-url]", "content", pageUrl);
    setMeta("[data-tlkv-news-published]", "content", article.publishedAt || article.createdAt || "");
    setMeta("[data-tlkv-news-modified]", "content", article.updatedAt || article.publishedAt || "");
    setMeta("[data-tlkv-news-tw-title]", "content", title);
    setMeta("[data-tlkv-news-tw-desc]", "content", desc);
    setMeta("[data-tlkv-news-tw-image]", "content", image);

    var jsonld = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
      "headline": article.title,
      "description": desc,
      "image": [image],
      "datePublished": article.publishedAt || article.createdAt,
      "dateModified": article.updatedAt || article.publishedAt || article.createdAt,
      "author": { "@type": "Organization", "name": siteName },
      "publisher": {
        "@type": "Organization",
        "name": siteName,
        "logo": {
          "@type": "ImageObject",
          "url": siteOrigin + "/assets/og-logo-256.png",
          "width": 256,
          "height": 256
        }
      },
      "articleSection": article.category ? article.category.name : "Tin tức thị trường"
    };

    var crumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": siteOrigin + "/" },
        { "@type": "ListItem", "position": 2, "name": "Tin tức thị trường", "item": siteOrigin + "/tin-tuc" },
        { "@type": "ListItem", "position": 3, "name": article.title, "item": pageUrl }
      ]
    };

    var ldEl = document.getElementById("tlkv-news-jsonld");
    if (ldEl) ldEl.textContent = JSON.stringify(jsonld);

    var crumbEl = document.getElementById("tlkv-news-jsonld-crumbs");
    if (!crumbEl) {
      crumbEl = document.createElement("script");
      crumbEl.type = "application/ld+json";
      crumbEl.id = "tlkv-news-jsonld-crumbs";
      document.head.appendChild(crumbEl);
    }
    crumbEl.textContent = JSON.stringify(crumbs);
  }

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function renderBreadcrumb(article) {
    var nav = $("#tlkv-news-breadcrumb");
    if (!nav) return;
    nav.innerHTML = "";

    function link(href, text) {
      var a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      return a;
    }
    function sep() {
      var s = document.createElement("span");
      s.className = "tlkv-news-breadcrumb__sep";
      s.textContent = "›";
      return s;
    }
    nav.appendChild(link("/", "Trang chủ"));
    nav.appendChild(sep());
    nav.appendChild(link("/tin-tuc", "Tin tức thị trường"));
    if (article.category && article.category.slug) {
      nav.appendChild(sep());
      nav.appendChild(link("/tin-tuc/danh-sach?cat=" + encodeURIComponent(article.category.slug), article.category.name));
    }
    nav.appendChild(sep());
    var current = document.createElement("span");
    current.textContent = article.title || "";
    nav.appendChild(current);
  }

  // ---------------------------------------------------------------------------
  // Related
  // ---------------------------------------------------------------------------

  function renderRelatedSection(host, items) {
    var card = document.createElement("div");
    card.className = "tlkv-news-side-card";
    var h = document.createElement("h3");
    h.className = "tlkv-news-side-card__title";
    h.textContent = "Bài viết liên quan";
    card.appendChild(h);

    if (items && items.length) {
      var list = document.createElement("div");
      list.className = "tlkv-news-related";
      items.forEach(function (it) {
        var a = document.createElement("a");
        a.className = "tlkv-news-related__item";
        a.href = "/tin-tuc/" + encodeURIComponent(it.slug);

        var media = document.createElement("div");
        media.className = "tlkv-news-related__media";
        if (it.thumbnailUrl) {
          var img = document.createElement("img");
          img.src = it.thumbnailUrl;
          img.loading = "lazy";
          img.decoding = "async";
          img.alt = it.title || "";
          img.onerror = function () { this.onerror = null; this.style.display = "none"; };
          media.appendChild(img);
        }
        a.appendChild(media);

        var body = document.createElement("div");
        body.className = "tlkv-news-related__body";
        var date = document.createElement("span");
        date.className = "tlkv-news-related__date";
        date.textContent = fmtDate(it.publishedAt || it.createdAt);
        body.appendChild(date);
        var title = document.createElement("h4");
        title.className = "tlkv-news-related__title";
        title.textContent = it.title || "";
        body.appendChild(title);
        a.appendChild(body);
        list.appendChild(a);
      });
      card.appendChild(list);
    } else {
      var empty = document.createElement("p");
      empty.className = "tlkv-news-related-empty";
      empty.textContent = "Chưa có bài viết phù hợp.";
      card.appendChild(empty);
    }
    host.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // Article
  // ---------------------------------------------------------------------------

  function renderArticle(article) {
    var host = $("#tlkv-news-detail-host");
    host.innerHTML = "";

    var layout = document.createElement("div");
    layout.className = "tlkv-news-detail__layout";
    host.appendChild(layout);

    var main = document.createElement("article");
    main.className = "tlkv-news-detail__main";
    layout.appendChild(main);

    // Title block
    var title = document.createElement("h1");
    title.className = "tlkv-news-detail__title";
    title.textContent = article.title || "";
    main.appendChild(title);

    var meta = document.createElement("div");
    meta.className = "tlkv-news-detail__meta";
    if (article.category && article.category.slug) {
      var c = document.createElement("a");
      c.className = "tlkv-news-detail__cat";
      c.href = "/tin-tuc/danh-sach?cat=" + encodeURIComponent(article.category.slug);
      c.textContent = article.category.name;
      meta.appendChild(c);
    }
    var dateSpan = document.createElement("span");
    dateSpan.textContent = "Ngày đăng: " + fmtDate(article.publishedAt || article.createdAt);
    meta.appendChild(dateSpan);
    if (typeof article.viewCount === "number") {
      var v = document.createElement("span");
      v.textContent = "Lượt xem: " + article.viewCount.toLocaleString("vi-VN");
      meta.appendChild(v);
    }
    main.appendChild(meta);

    if (article.shortDescription) {
      var lead = document.createElement("p");
      lead.className = "tlkv-news-detail__excerpt";
      lead.textContent = article.shortDescription;
      main.appendChild(lead);
    }

    if (article.thumbnailUrl) {
      var heroFig = document.createElement("figure");
      heroFig.className = "tlkv-news-block tlkv-news-image";
      var img = document.createElement("img");
      img.src = article.thumbnailUrl;
      img.alt = article.title || "";
      img.loading = "eager";
      img.decoding = "async";
      heroFig.appendChild(img);
      main.appendChild(heroFig);
    }

    // Body (block renderer)
    main.appendChild(TLKVNewsRenderer.renderArticle(article.content));

    // Sidebar
    var side = document.createElement("aside");
    side.className = "tlkv-news-detail__side";
    layout.appendChild(side);

    TLKVNewsAPI.listRelated({
      categoryId: article.category ? article.category.id : null,
      excludeId: article.id,
      limit: 4,
    }).then(function (rel) {
      renderRelatedSection(side, rel || []);
    }).catch(function (e) {
      console.warn("[news] related failed", e);
      renderRelatedSection(side, []);
    });
  }

  function renderNotFound(slug) {
    var host = $("#tlkv-news-detail-host");
    host.innerHTML = "";
    var box = document.createElement("div");
    box.className = "tlkv-news-empty";
    box.innerHTML =
      '<h2 style="margin-top:0">Không tìm thấy bài viết</h2>' +
      '<p>Bài viết với đường dẫn <code>' +
      (slug ? slug.replace(/[<>&"]/g, "") : "") +
      '</code> không tồn tại hoặc chưa được xuất bản.</p>' +
      '<p><a href="/tin-tuc/danh-sach">← Quay lại danh sách tin tức thị trường</a></p>' +
      '<p><a href="/tin-tuc">Trang tin nổi bật</a></p>';
    host.appendChild(box);
    document.title = "Không tìm thấy bài viết - Thăng Long Kim Việt";
    var robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute("content", "noindex");
  }

  function renderError(msg) {
    var host = $("#tlkv-news-detail-host");
    host.innerHTML = "";
    var box = document.createElement("div");
    box.className = "tlkv-news-error";
    box.textContent = "Không tải được bài viết: " + (msg || "lỗi không xác định") + ".";
    host.appendChild(box);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  async function load() {
    var route = resolveNewsDetailRoute();
    if (route.type === "reserved") {
      window.location.replace("/tin-tuc/danh-sach");
      return;
    }
    if (route.type !== "article") {
      renderNotFound("");
      return;
    }
    var slug = route.slug;
    try {
      var article = await TLKVNewsAPI.getBySlug(slug);
      if (!article) { renderNotFound(slug); return; }
      applySeo(article);
      renderBreadcrumb(article);
      renderArticle(article);
      // Fire-and-forget view counter (after render so we don't block paint).
      setTimeout(function () { TLKVNewsAPI.incrementView(slug); }, 1500);
    } catch (e) {
      console.error("[news] detail load failed", e);
      renderError(e && e.message ? e.message : String(e));
    }
  }

  if (document.readyState !== "loading") load();
  else document.addEventListener("DOMContentLoaded", load);
})();
