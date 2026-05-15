/**
 * Trang chủ — khối "Tin tức thị trường" (1 bài lớn + 4 bài phụ), cùng API với /tin-tuc.
 */
(function () {
  "use strict";

  var HERO_FEATURED = 1;
  var HERO_SIDE = 4;

  function $(sel) {
    return document.querySelector(sel);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function articleHref(item) {
    return "/tin-tuc/" + encodeURIComponent(item.slug);
  }

  function createCard(item, variant) {
    var a = document.createElement("a");
    a.className = "tlkv-news-card" + (variant === "featured" ? " tlkv-news-card--featured" : "");
    a.href = articleHref(item);

    var media = document.createElement("div");
    media.className = "tlkv-news-card__media";
    var thumb = (item && item.thumbnailUrl) || "";
    if (thumb) {
      var img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = item.title || "Tin tức thị trường";
      img.src = thumb;
      img.onerror = function () {
        this.onerror = null;
        this.style.display = "none";
      };
      media.appendChild(img);
    }
    a.appendChild(media);

    var body = document.createElement("div");
    body.className = "tlkv-news-card__body";

    var meta = document.createElement("div");
    meta.className = "tlkv-news-card__meta";
    var catLabel = item.category && item.category.name ? item.category.name : "TIN TỨC";
    meta.appendChild(document.createTextNode(catLabel));
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

  function renderHero(host, featured, secondary) {
    host.innerHTML = "";
    if (!featured.length && !secondary.length) {
      var empty = document.createElement("p");
      empty.className = "tlkv-news-empty tlkv-home-news__empty";
      empty.textContent = "Chưa có bài viết phù hợp.";
      host.appendChild(empty);
      return;
    }

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

  function skeleton(host) {
    host.innerHTML =
      '<div class="tlkv-news-grid">' +
        '<div class="tlkv-news-card tlkv-news-card--featured tlkv-news-grid__featured">' +
          '<div class="tlkv-news-skel tlkv-news-skel--media tlkv-news-skel--big" style="border-radius:0"></div>' +
          '<div class="tlkv-news-card__body">' +
            '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:35%"></div>' +
            '<div class="tlkv-news-skel tlkv-news-skel--line lg" style="width:80%"></div>' +
          "</div></div>" +
        '<div class="tlkv-news-grid__side">' +
          [0, 1, 2, 3]
            .map(function () {
              return (
                '<div class="tlkv-news-card">' +
                  '<div class="tlkv-news-skel tlkv-news-skel--media" style="border-radius:0"></div>' +
                  '<div class="tlkv-news-card__body">' +
                    '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:40%"></div>' +
                    '<div class="tlkv-news-skel tlkv-news-skel--line" style="width:90%"></div>' +
                  "</div></div>"
              );
            })
            .join("") +
        "</div></div>";
  }

  async function load() {
    var host = $("#tlkv-home-news-host");
    if (!host) return;

    if (typeof TLKVNewsAPI === "undefined") {
      host.innerHTML =
        '<p class="tlkv-news-error tlkv-home-news__err">Không tải được tin: thiếu mô-đun dữ liệu.</p>';
      return;
    }

    skeleton(host);

    try {
      var hero = await TLKVNewsAPI.listForLandingHero({
        limitFeatured: HERO_FEATURED,
        limitSecondary: HERO_SIDE,
      });
      renderHero(host, hero.featured || [], hero.secondary || []);
    } catch (e) {
      console.error("[news-home] load failed", e);
      host.innerHTML =
        '<p class="tlkv-news-error tlkv-home-news__err">Không tải được tin tức: ' +
        (e && e.message ? String(e.message).replace(/</g, "") : "lỗi") +
        ".</p>";
    }
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(load);
})();
