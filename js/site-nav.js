(function () {
  "use strict";

  var SANPHAM_LINKS = [
    { href: "/sanpham/vang-tich-luy", label: "Vàng tích lũy" },
    { href: "/sanpham/vang-trang-suc", label: "Vàng trang sức" },
  ];

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function normPath() {
    var p = (window.location.pathname || "").replace(/\/+$/, "");
    return p || "/";
  }

  function isSanphamSectionActive() {
    var p = normPath();
    return p.indexOf("/sanpham") === 0 && p !== "/sanpham/gia-vang";
  }

  function openMb() {
    var m = document.getElementById("mb-menu");
    if (m) {
      m.classList.add("open");
      document.documentElement.classList.add("overflow-hidden");
      document.body.classList.add("overflow-hidden");
    }
  }

  function closeMb() {
    var m = document.getElementById("mb-menu");
    if (m) {
      m.classList.remove("open");
      document.documentElement.classList.remove("overflow-hidden");
      document.body.classList.remove("overflow-hidden");
    }
  }

  function upgradeDesktopNav() {
    document.querySelectorAll(".header-gr-item").forEach(function (item) {
      var link = item.querySelector(':scope > a.nav-link[href="/sanpham"], :scope > a.nav-link[href="/sanpham/"]');
      if (!link || item.classList.contains("has-submenu")) return;

      item.classList.add("has-submenu");
      link.setAttribute("aria-haspopup", "true");
      link.setAttribute("aria-expanded", "false");

      if (isSanphamSectionActive()) link.classList.add("active");
      link.href = "/sanpham/vang-tich-luy";

      var sub = document.createElement("div");
      sub.className = "sanpham-subheader";
      sub.setAttribute("role", "menu");

      var box = document.createElement("div");
      box.className = "sanpham-category";

      SANPHAM_LINKS.forEach(function (entry) {
        var a = document.createElement("a");
        a.className = "category-link";
        a.href = entry.href;
        a.textContent = entry.label;
        a.setAttribute("role", "menuitem");
        if (normPath() === entry.href) a.setAttribute("aria-current", "page");
        box.appendChild(a);
      });

      sub.appendChild(box);
      item.appendChild(sub);

      item.addEventListener("mouseenter", function () {
        link.setAttribute("aria-expanded", "true");
      });
      item.addEventListener("mouseleave", function () {
        link.setAttribute("aria-expanded", "false");
      });
    });
  }

  function upgradeMobileNav() {
    document.querySelectorAll(".menu-mb-section > li").forEach(function (li) {
      var link = li.querySelector(':scope > a[href="/sanpham"], :scope > a[href="/sanpham/"]');
      if (!link || li.classList.contains("has-sub")) return;

      li.classList.add("has-sub");
      link.href = "/sanpham/vang-tich-luy";

      var subs = document.createElement("div");
      subs.className = "menu-subs menu-mega";

      var back = document.createElement("a");
      back.href = "javascript:void(0)";
      back.className = "mega-subs-title";
      back.textContent = "← Sản phẩm";

      var list = document.createElement("div");
      list.className = "list-item";

      var ul = document.createElement("ul");
      SANPHAM_LINKS.forEach(function (entry) {
        var subLi = document.createElement("li");
        var subA = document.createElement("a");
        subA.href = entry.href;
        subA.textContent = entry.label;
        subLi.appendChild(subA);
        ul.appendChild(subLi);
      });

      list.appendChild(ul);
      subs.appendChild(back);
      subs.appendChild(list);
      li.appendChild(subs);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    upgradeDesktopNav();
    upgradeMobileNav();

    qs(".mb-ham")?.addEventListener("click", function (e) {
      e.preventDefault();
      openMb();
    });
    qs(".menu-mb-overlay")?.addEventListener("click", closeMb);
    qs(".close-menu")?.addEventListener("click", function (e) {
      e.preventDefault();
      closeMb();
    });
    document.querySelectorAll(".mega-subs-title").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var subs = a.closest(".menu-subs");
        subs?.classList.remove("open");
      });
    });
    document.querySelectorAll(".menu-mb-section .has-sub > a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var li = a.closest("li.has-sub");
        var subs = li?.querySelector(".menu-subs");
        if (subs && !e.target.closest(".icon-right")) {
          e.preventDefault();
          subs.classList.add("open");
        }
      });
    });
  });
})();
