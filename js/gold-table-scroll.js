/**
 * Gold table scroll chaining — prevents nested scroll traps in .tlkv-gp-table-scroll.
 * Desktop: wheel at top/bottom continues page scroll (Notion/Airtable pattern).
 * Mobile: touch at edges chains to document scroll (iOS Safari + Android Chrome).
 */
(function (global) {
  "use strict";

  var SCROLL_SEL = ".tlkv-gp-table-scroll";
  var SHELL_SEL = "[data-tlkv-gp-table-shell]";
  var EDGE_EPS = 3;

  function isScrollable(el) {
    return el.scrollHeight > el.clientHeight + EDGE_EPS;
  }

  function atTop(el) {
    return el.scrollTop <= EDGE_EPS;
  }

  function atBottom(el) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_EPS;
  }

  function scrollPageBy(deltaY) {
    var root = document.documentElement;
    var body = document.body;
    if (root) root.scrollTop += deltaY;
    if (body) body.scrollTop += deltaY;
    global.scrollBy(0, deltaY);
  }

  function handleWheel(ev) {
    var el = ev.currentTarget;
    if (!isScrollable(el)) return;

    var dy = ev.deltaY;
    if (dy === 0) return;

    var chainUp = dy < 0 && atTop(el);
    var chainDown = dy > 0 && atBottom(el);
    if (!chainUp && !chainDown) return;

    ev.preventDefault();
    scrollPageBy(dy);
  }

  function bindTouchChain(el) {
    var lastY = 0;

    el.addEventListener(
      "touchstart",
      function (ev) {
        if (!ev.touches || !ev.touches.length) return;
        lastY = ev.touches[0].clientY;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchmove",
      function (ev) {
        if (!ev.touches || !ev.touches.length) return;

        var y = ev.touches[0].clientY;
        var dy = lastY - y;
        lastY = y;

        if (dy === 0) return;

        if (!isScrollable(el)) {
          scrollPageBy(dy);
          return;
        }

        var scrollingDown = dy > 0;
        var scrollingUp = dy < 0;

        if ((scrollingUp && atTop(el)) || (scrollingDown && atBottom(el))) {
          ev.preventDefault();
          scrollPageBy(dy);
        }
      },
      { passive: false }
    );
  }

  function bindScrollChain(shell) {
    var scrollEl = shell.querySelector(SCROLL_SEL);
    if (!scrollEl || scrollEl.__tlkvScrollChainBound) return;
    scrollEl.__tlkvScrollChainBound = true;

    scrollEl.addEventListener("wheel", handleWheel, { passive: false });
    bindTouchChain(scrollEl);
  }

  function boot() {
    document.querySelectorAll(SHELL_SEL).forEach(bindScrollChain);
  }

  function observeTableShells() {
    if (!global.MutationObserver) return;
    var observer = new MutationObserver(function () {
      boot();
    });
    document.querySelectorAll(SHELL_SEL).forEach(function (shell) {
      observer.observe(shell, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
      observeTableShells();
    });
  } else {
    boot();
    observeTableShells();
  }

  global.TLKVGoldTableScroll = { bind: bindScrollChain, refresh: boot };
})(typeof window !== "undefined" ? window : globalThis);
