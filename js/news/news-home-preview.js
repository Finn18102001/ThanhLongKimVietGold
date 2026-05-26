/**
 * Homepage — premium editorial preview.
 * Reuses the SAME TLKVNewsAPI data source as /tin-tuc pages.
 */
(function () {
  "use strict";

  var MAX_ITEMS = 4;

  function $(sel) {
    return document.querySelector(sel);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (_err) {
      return "";
    }
  }

  function articleHref(item) {
    return "/tin-tuc/" + encodeURIComponent(item.slug || "");
  }

  function createCard(item) {
    var a = document.createElement("a");
    a.className = "tlkv-home-editorial-card";
    a.href = articleHref(item);

    var media = document.createElement("div");
    media.className = "tlkv-home-editorial-card__media";
    var thumb = (item && item.thumbnailUrl) || "";
    if (thumb) {
      var img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = item.title || "Tin tức và kiến thức";
      img.src = thumb;
      img.onerror = function () {
        this.onerror = null;
        this.style.display = "none";
      };
      media.appendChild(img);
    }
    a.appendChild(media);

    var body = document.createElement("div");
    body.className = "tlkv-home-editorial-card__body";

    var meta = document.createElement("p");
    meta.className = "tlkv-home-editorial-card__meta";
    meta.textContent = fmtDate(item.publishedAt || item.createdAt);
    body.appendChild(meta);

    var title = document.createElement("h3");
    title.className = "tlkv-home-editorial-card__title";
    title.textContent = item.title || "";
    body.appendChild(title);

    if (item.shortDescription) {
      var desc = document.createElement("p");
      desc.className = "tlkv-home-editorial-card__desc";
      desc.textContent = item.shortDescription;
      body.appendChild(desc);
    }

    a.appendChild(body);
    return a;
  }

  function renderSkeleton(host) {
    host.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "tlkv-home-editorial-news__grid";
    for (var i = 0; i < MAX_ITEMS; i += 1) {
      var card = document.createElement("article");
      card.className = "tlkv-home-editorial-card tlkv-home-editorial-card--skeleton";
      card.innerHTML =
        '<div class="tlkv-news-skel tlkv-news-skel--media"></div>' +
        '<div class="tlkv-home-editorial-card__body">' +
        '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:40%;margin-left:0;margin-right:0"></div>' +
        '<div class="tlkv-news-skel tlkv-news-skel--line lg" style="width:88%;margin-left:0;margin-right:0"></div>' +
        '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:72%;margin-left:0;margin-right:0"></div>' +
        "</div>";
      grid.appendChild(card);
    }
    host.appendChild(grid);
  }

  function renderList(host, items) {
    host.innerHTML = "";

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "tlkv-news-empty tlkv-home-editorial-news__empty";
      empty.textContent = "Chưa có bài viết để hiển thị.";
      host.appendChild(empty);
      return;
    }

    var grid = document.createElement("div");
    grid.className = "tlkv-home-editorial-news__grid";
    items.slice(0, MAX_ITEMS).forEach(function (item) {
      grid.appendChild(createCard(item));
    });
    host.appendChild(grid);
  }

  async function load() {
    var host = $("#tlkv-home-news-host");
    if (!host) return;

    if (typeof TLKVNewsAPI === "undefined" || typeof TLKVNewsAPI.listPublished !== "function") {
      host.innerHTML =
        '<p class="tlkv-news-error tlkv-home-editorial-news__err">Không tải được tin: thiếu mô-đun dữ liệu.</p>';
      return;
    }

    renderSkeleton(host);

    try {
      var res = await TLKVNewsAPI.listPublished({
        page: 1,
        pageSize: MAX_ITEMS,
      });
      renderList(host, (res && res.items) || []);
    } catch (e) {
      console.error("[news-home-preview] load failed", e);
      host.innerHTML =
        '<p class="tlkv-news-error tlkv-home-editorial-news__err">Không tải được tin tức: ' +
        (e && e.message ? String(e.message).replace(/</g, "") : "lỗi") +
        ".</p>";
    }
  }

  if (document.readyState !== "loading") {
    load();
  } else {
    document.addEventListener("DOMContentLoaded", load);
  }
})();
