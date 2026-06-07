/* ==========================================================================
   Homepage Hero slider — UI only (scoped to [data-tlkv-hero-carousel])
   No dependencies. Does not affect other sliders/sections.
   ========================================================================== */

(function () {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    var root = document.querySelector("[data-tlkv-hero-carousel]");
    if (!root) return;

    var stage = root.querySelector(".tlkv-hero__carousel-stage");
    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-tlkv-hero-slide]"));
    var dotsHost = root.querySelector("[data-tlkv-hero-dots]");
    var dots = dotsHost ? Array.prototype.slice.call(dotsHost.querySelectorAll("[data-tlkv-hero-dot]")) : [];
    var thumbsHost = root.querySelector("[data-tlkv-hero-thumbs]");
    var thumbs = thumbsHost ? Array.prototype.slice.call(thumbsHost.querySelectorAll("[data-tlkv-hero-thumb]")) : [];

    if (!slides.length) return;

    function bindHeroMedia(slide) {
      var img = slide.querySelector(".tlkv-hero__slide-img");
      var fill = slide.querySelector("[data-tlkv-hero-fill]");
      if (!img) return;

      function apply() {
        var url = img.currentSrc || img.src;
        if (fill && url) {
          fill.style.setProperty("--tlkv-hero-fill", "url(\"" + url + "\")");
        }
        if (img.naturalWidth > 0) {
          slide.style.setProperty("--tlkv-hero-native-w", img.naturalWidth + "px");
        }

        var displayW = img.getBoundingClientRect().width;
        var dpr = window.devicePixelRatio || 1;
        var needPx = Math.ceil(displayW * dpr);
        if (img.naturalWidth > 0 && img.naturalWidth < needPx) {
          console.warn(
            "[Hero] Banner bị upscale → mờ. File chỉ " +
              img.naturalWidth +
              "px nhưng cần ~" +
              needPx +
              "px. Thay file 3840×1440 tại: " +
              url
          );
        }
      }

      if (img.complete) apply();
      else img.addEventListener("load", apply, { once: true });
    }

    slides.forEach(bindHeroMedia);

    var reduceMotion = false;
    try {
      reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    var active = 0;
    var timer = null;
    var delayMs = 5000;
    var hovering = false;

    function setDotsActive(next) {
      if (!dots.length) return;
      dots.forEach(function (btn, idx) {
        var isOn = idx === next;
        btn.classList.toggle("is-active", isOn);
        btn.setAttribute("aria-selected", isOn ? "true" : "false");
        btn.setAttribute("tabindex", isOn ? "0" : "-1");
      });
    }

    function setThumbActive(next) {
      if (!thumbs.length) return;
      thumbs.forEach(function (btn, idx) {
        var isOn = idx === next;
        btn.classList.toggle("is-active", isOn);
        btn.setAttribute("aria-selected", isOn ? "true" : "false");
        btn.setAttribute("tabindex", isOn ? "0" : "-1");
      });
    }

    function setSlideActive(next) {
      if (next === active) return;
      var prev = active;
      active = next;

      slides[prev].classList.remove("is-active");
      slides[prev].classList.add("is-prev");

      slides[active].classList.add("is-active");

      // Cleanup prev marker after transition ends (or quickly if reduced motion).
      var cleanup = function () {
        slides[prev].classList.remove("is-prev");
        if (stage) stage.removeEventListener("transitionend", cleanup);
      };

      if (reduceMotion) {
        cleanup();
      } else if (stage) {
        stage.addEventListener("transitionend", cleanup, { once: true });
      } else {
        cleanup();
      }

      setDotsActive(active);
      setThumbActive(active);
      bindHeroMedia(slides[active]);
    }

    function nextSlide() {
      setSlideActive((active + 1) % slides.length);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      stop();
      if (reduceMotion) return;
      timer = setInterval(function () {
        if (!hovering) nextSlide();
      }, delayMs);
    }

    // Init
    slides.forEach(function (s, idx) {
      if (s.classList.contains("is-active")) active = idx;
    });
    setDotsActive(active);
    setThumbActive(active);
    start();

    // Pause on hover
    var hoverTarget = root;
    hoverTarget.addEventListener("mouseenter", function () {
      hovering = true;
      stop();
    });
    hoverTarget.addEventListener("mouseleave", function () {
      hovering = false;
      start();
    });

    // Thumbnails click + keyboard
    thumbs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-tlkv-hero-thumb"), 10);
        if (Number.isNaN(idx)) return;
        setSlideActive(Math.max(0, Math.min(slides.length - 1, idx)));
        start();
      });

      btn.addEventListener("keydown", function (e) {
        var key = e.key || e.code;
        if (key === "ArrowRight" || key === "Right") {
          e.preventDefault();
          var n = (active + 1) % slides.length;
          setSlideActive(n);
          thumbs[n] && thumbs[n].focus();
          start();
        } else if (key === "ArrowLeft" || key === "Left") {
          e.preventDefault();
          var p = (active - 1 + slides.length) % slides.length;
          setSlideActive(p);
          thumbs[p] && thumbs[p].focus();
          start();
        } else if (key === "Home") {
          e.preventDefault();
          setSlideActive(0);
          thumbs[0] && thumbs[0].focus();
          start();
        } else if (key === "End") {
          e.preventDefault();
          var last = slides.length - 1;
          setSlideActive(last);
          thumbs[last] && thumbs[last].focus();
          start();
        }
      });
    });

    // Dots click
    dots.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-tlkv-hero-dot"), 10);
        if (Number.isNaN(idx)) return;
        setSlideActive(Math.max(0, Math.min(slides.length - 1, idx)));
        start();
      });
    });

    // Touch swipe: detect horizontal direction, then advance or retreat
    var touchStartX = 0;
    var touchStartY = 0;
    var SWIPE_MIN_PX = 40;

    hoverTarget.addEventListener("touchstart", function (e) {
      stop();
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    hoverTarget.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
          setSlideActive((active + 1) % slides.length);
        } else {
          setSlideActive((active - 1 + slides.length) % slides.length);
        }
      }
      start();
    }, { passive: true });

    // Mouse drag: allow click-drag on desktop to swipe slides
    var dragStartX = 0;
    var dragging = false;
    var DRAG_MIN_PX = 50;

    if (stage) {
      stage.addEventListener("mousedown", function (e) {
        dragStartX = e.clientX;
        dragging = true;
        stop();
        stage.style.cursor = "grabbing";
        e.preventDefault();
      });
    }

    window.addEventListener("mouseup", function (e) {
      if (!dragging) return;
      dragging = false;
      if (stage) stage.style.cursor = "";
      var dx = e.clientX - dragStartX;
      if (Math.abs(dx) >= DRAG_MIN_PX) {
        if (dx < 0) {
          setSlideActive((active + 1) % slides.length);
        } else {
          setSlideActive((active - 1 + slides.length) % slides.length);
        }
      }
      start();
    });

    window.addEventListener("mousemove", function (e) {
      if (dragging) e.preventDefault();
    });
  });
})();

