/**
 * TLKVSkeleton — shared loading placeholders for Home / Product / News.
 */
(function (global) {
  "use strict";

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function goldTableRows(tbody, count) {
    if (!tbody) return;
    var n = Math.max(4, Math.min(10, Number(count) || 7));
    var stacked = false;
    try {
      var table = tbody.closest("table");
      stacked = !!(table && table.classList.contains("gold-table--stacked"));
    } catch (_) {}
    var cols = stacked ? 4 : 5;
    tbody.innerHTML = "";
    tbody.setAttribute("aria-busy", "true");
    for (var i = 0; i < n; i++) {
      var tr = el("tr", "tlkv-gold-skel-row");
      tr.setAttribute("aria-hidden", "true");
      for (var c = 0; c < cols; c++) {
        var td = document.createElement("td");
        var cls = "tlkv-skel";
        if (c === 1) cls += " tlkv-skel--wide";
        if (c >= cols - 2) cls += " tlkv-skel--price";
        td.appendChild(el("span", cls));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function featuredRows(host, rowCount, cardsPerRow) {
    if (!host) return;
    var rows = Math.max(1, Math.min(4, Number(rowCount) || 3));
    var cards = Math.max(2, Math.min(6, Number(cardsPerRow) || 4));
    host.innerHTML = "";
    host.classList.add("is-loading");
    host.setAttribute("aria-busy", "true");
    for (var r = 0; r < rows; r++) {
      var row = el("div", "tlkv-featured-skel-row");
      row.setAttribute("aria-hidden", "true");
      row.appendChild(el("div", "tlkv-skel tlkv-featured-skel-brand"));
      var cardsWrap = el("div", "tlkv-featured-skel-cards");
      for (var c = 0; c < cards; c++) {
        var card = el("div", "tlkv-featured-skel-card");
        card.appendChild(el("div", "tlkv-skel tlkv-featured-skel-card__media"));
        card.appendChild(el("div", "tlkv-skel tlkv-skel--line", null));
        card.appendChild(el("div", "tlkv-skel tlkv-skel--line lg", null));
        cardsWrap.appendChild(card);
      }
      row.appendChild(cardsWrap);
      host.appendChild(row);
    }
  }

  function productGrid(host, count) {
    if (!host) return;
    var n = Math.max(4, Math.min(12, Number(count) || 8));
    host.innerHTML = "";
    host.className = "tlkv-catalog-root";
    host.setAttribute("aria-busy", "true");
    var grid = el("div", "tlkv-catalog-skel-grid");
    grid.setAttribute("aria-hidden", "true");
    for (var i = 0; i < n; i++) {
      var card = el("div", "tlkv-catalog-skel-card");
      card.appendChild(el("div", "tlkv-skel tlkv-catalog-skel-card__media"));
      card.appendChild(el("div", "tlkv-skel tlkv-catalog-skel-card__line lg"));
      card.appendChild(el("div", "tlkv-skel tlkv-catalog-skel-card__line"));
      card.appendChild(el("div", "tlkv-skel tlkv-catalog-skel-card__line", null));
      grid.appendChild(card);
    }
    host.appendChild(grid);
  }

  function vtlGrid(host, count) {
    if (!host) return;
    var n = Math.max(4, Math.min(12, Number(count) || 8));
    host.innerHTML = "";
    host.setAttribute("aria-busy", "true");
    var grid = el("div", "vtl-skel-grid");
    grid.setAttribute("aria-hidden", "true");
    for (var i = 0; i < n; i++) {
      var card = el("div", "vtl-skel-card");
      card.appendChild(el("div", "tlkv-skel vtl-skel-card__media"));
      card.appendChild(el("div", "tlkv-skel tlkv-skel--line lg"));
      card.appendChild(el("div", "tlkv-skel tlkv-skel--line"));
      grid.appendChild(card);
    }
    host.appendChild(grid);
  }

  function productDetail(root) {
    if (!root) return;
    root.innerHTML = "";
    root.setAttribute("aria-busy", "true");
    var wrap = el("div", "tlkv-product-detail-skel");
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(el("div", "tlkv-skel tlkv-product-detail-skel__media"));
    var body = el("div", "tlkv-product-detail-skel__body");
    body.appendChild(el("div", "tlkv-skel tlkv-skel--line lg"));
    body.appendChild(el("div", "tlkv-skel tlkv-skel--line"));
    body.appendChild(el("div", "tlkv-skel tlkv-skel--line"));
    body.appendChild(el("div", "tlkv-skel tlkv-skel--cta"));
    wrap.appendChild(body);
    root.appendChild(wrap);
  }

  function newsDetail(host) {
    if (!host) return;
    host.innerHTML = "";
    host.setAttribute("aria-busy", "true");
    var wrap = el("div", "tlkv-news-detail-skel");
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(el("div", "tlkv-skel tlkv-skel--line", null));
    wrap.appendChild(el("div", "tlkv-skel tlkv-skel--title"));
    wrap.appendChild(el("div", "tlkv-skel tlkv-skel--line", null));
    wrap.appendChild(el("div", "tlkv-skel tlkv-skel--hero"));
    for (var i = 0; i < 5; i++) {
      wrap.appendChild(el("div", "tlkv-skel tlkv-skel--line"));
    }
    host.appendChild(wrap);
  }

  global.TLKVSkeleton = {
    goldTableRows: goldTableRows,
    featuredRows: featuredRows,
    productGrid: productGrid,
    vtlGrid: vtlGrid,
    productDetail: productDetail,
    newsDetail: newsDetail,
  };
})(typeof window !== "undefined" ? window : globalThis);
