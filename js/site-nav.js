(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function openMb() {
    const m = document.getElementById("mb-menu");
    if (m) {
      m.classList.add("open");
      document.documentElement.classList.add("overflow-hidden");
      document.body.classList.add("overflow-hidden");
    }
  }

  function closeMb() {
    const m = document.getElementById("mb-menu");
    if (m) {
      m.classList.remove("open");
      document.documentElement.classList.remove("overflow-hidden");
      document.body.classList.remove("overflow-hidden");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
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
        const subs = a.closest(".menu-subs");
        subs?.classList.remove("open");
      });
    });
    document.querySelectorAll(".menu-mb-section .has-sub > a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        const li = a.closest("li.has-sub");
        const subs = li?.querySelector(".menu-subs");
        if (subs && !e.target.closest(".icon-right")) {
          e.preventDefault();
          subs.classList.add("open");
        }
      });
    });
  });
})();
