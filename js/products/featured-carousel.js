/**
 * Premium horizontal carousel for homepage featured products.
 * Transform-based, pointer drag, momentum snap, optional autoplay — no native scrollbar.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    gap: 14,
    autoplayMs: 5500,
    autoplay: true,
    snapEase: 0.14,
    momentumFactor: 140,
  };

  function prefersReducedMotion() {
    return (
      global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function Carousel(root, options) {
    this.root = root;
    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.viewport = root.querySelector("[data-carousel-viewport]");
    this.track = root.querySelector("[data-carousel-track]");
    if (!this.viewport || !this.track) return;

    this.x = 0;
    this.targetX = 0;
    this.dragging = false;
    this.pointerId = null;
    this.startX = 0;
    this.startPointerX = 0;
    this.lastX = 0;
    this.lastT = 0;
    this.velocity = 0;
    this.raf = null;
    this.autoplayTimer = null;
    this.interacting = false;
    this.slideStride = 0;
    this.minX = 0;
    this.maxX = 0;
    this.currentIndex = 0;

    this._onResize = this.measure.bind(this);
    this._onPointerDown = this.pointerDown.bind(this);
    this._onPointerMove = this.pointerMove.bind(this);
    this._onPointerUp = this.pointerUp.bind(this);
    this._onMouseEnter = this.stopAutoplay.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);

    this.measure();
    this.bind();
    this.goTo(0, true);
    if (this.opts.autoplay && !prefersReducedMotion()) this.startAutoplay();
  }

  Carousel.prototype.getSlides = function () {
    return Array.prototype.slice.call(
      this.track.querySelectorAll("[data-carousel-slide]")
    );
  };

  Carousel.prototype.measure = function () {
    var slides = this.getSlides();
    if (!slides.length) {
      this.slideStride = 0;
      this.minX = 0;
      this.maxX = 0;
      return;
    }
    var gap = this.opts.gap;
    var slideW = slides[0].getBoundingClientRect().width;
    if (!slideW) slideW = slides[0].offsetWidth;
    this.slideStride = slideW + gap;
    var viewW = this.viewport.clientWidth;
    var totalW = this.slideStride * slides.length - gap;
    this.minX = Math.min(0, viewW - totalW);
    this.maxX = 0;
    this.x = Math.max(this.minX, Math.min(this.maxX, this.x));
    this.targetX = this.x;
    this.applyTransform(true);
  };

  Carousel.prototype.applyTransform = function (noTransition) {
    if (noTransition || this.dragging) {
      this.track.style.transition = "none";
    } else {
      this.track.style.transition =
        "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)";
    }
    this.track.style.transform = "translate3d(" + this.x + "px, 0, 0)";
  };

  Carousel.prototype.tick = function () {
    if (this.dragging) {
      this.raf = global.requestAnimationFrame(this.tick.bind(this));
      return;
    }
    var dx = this.targetX - this.x;
    if (Math.abs(dx) < 0.35) {
      this.x = this.targetX;
      this.applyTransform();
      this.raf = null;
      return;
    }
    this.x += dx * this.opts.snapEase;
    this.applyTransform(true);
    this.raf = global.requestAnimationFrame(this.tick.bind(this));
  };

  Carousel.prototype.goTo = function (index, immediate) {
    var slides = this.getSlides();
    if (!slides.length || !this.slideStride) return;
    var idx = Math.max(0, Math.min(slides.length - 1, index));
    this.currentIndex = idx;
    this.targetX = Math.max(this.minX, Math.min(this.maxX, -idx * this.slideStride));
    if (immediate) {
      this.x = this.targetX;
      this.applyTransform(true);
    } else if (!this.raf) {
      this.raf = global.requestAnimationFrame(this.tick.bind(this));
    }
  };

  Carousel.prototype.pointerDown = function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.dragging = true;
    this.interacting = true;
    this.pointerId = e.pointerId;
    this.startX = this.x;
    this.startPointerX = e.clientX;
    this.lastX = e.clientX;
    this.lastT = performance.now();
    this.velocity = 0;
    this.stopAutoplay();
    this.track.style.transition = "none";
    this.viewport.setPointerCapture(e.pointerId);
    this.root.classList.add("is-dragging");
  };

  Carousel.prototype.pointerMove = function (e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    if (e.cancelable) e.preventDefault();
    var now = performance.now();
    var dx = e.clientX - this.startPointerX;
    this.x = Math.max(this.minX, Math.min(this.maxX, this.startX + dx));
    var dt = now - this.lastT;
    if (dt > 0) this.velocity = (e.clientX - this.lastX) / dt;
    this.lastX = e.clientX;
    this.lastT = now;
    this.applyTransform(true);
  };

  Carousel.prototype.pointerUp = function (e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.root.classList.remove("is-dragging");
    try {
      this.viewport.releasePointerCapture(e.pointerId);
    } catch (_) {}

    var projected = this.x + this.velocity * this.opts.momentumFactor;
    if (this.slideStride) {
      var idx = Math.round(-projected / this.slideStride);
      var slides = this.getSlides();
      idx = Math.max(0, Math.min(slides.length - 1, idx));
      this.goTo(idx, false);
    } else {
      this.targetX = this.x;
      if (!this.raf) this.raf = global.requestAnimationFrame(this.tick.bind(this));
    }

    var self = this;
    global.setTimeout(function () {
      self.interacting = false;
      if (self.opts.autoplay && !prefersReducedMotion()) self.startAutoplay();
    }, 500);
  };

  Carousel.prototype.startAutoplay = function () {
    this.stopAutoplay();
    if (prefersReducedMotion()) return;
    var self = this;
    this.autoplayTimer = global.setInterval(function () {
      if (self.interacting || self.dragging) return;
      var slides = self.getSlides();
      if (slides.length < 2) return;
      var next = self.currentIndex + 1;
      if (-next * self.slideStride < self.minX) next = 0;
      self.goTo(next, false);
    }, this.opts.autoplayMs);
  };

  Carousel.prototype.stopAutoplay = function () {
    if (this.autoplayTimer) global.clearInterval(this.autoplayTimer);
    this.autoplayTimer = null;
  };

  Carousel.prototype._handleMouseLeave = function () {
    if (!this.interacting && this.opts.autoplay && !prefersReducedMotion()) {
      this.startAutoplay();
    }
  };

  Carousel.prototype.bind = function () {
    this.viewport.addEventListener("pointerdown", this._onPointerDown);
    this.viewport.addEventListener("pointermove", this._onPointerMove);
    this.viewport.addEventListener("pointerup", this._onPointerUp);
    this.viewport.addEventListener("pointercancel", this._onPointerUp);
    this.root.addEventListener("mouseenter", this._onMouseEnter);
    this.root.addEventListener("mouseleave", this._onMouseLeave);
    this.viewport.addEventListener(
      "wheel",
      function (e) {
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        if (Math.abs(e.deltaY) < 2) return;
        e.preventDefault();
        this.targetX = Math.max(this.minX, Math.min(this.maxX, this.x - e.deltaY * 0.6));
        this.x = this.targetX;
        this.applyTransform();
        this.snapAfterWheel();
      }.bind(this),
      { passive: false }
    );

    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.viewport);
    } else {
      global.addEventListener("resize", this._onResize);
    }
  };

  Carousel.prototype.snapAfterWheel = function () {
    var self = this;
    if (this._wheelSnapTimer) clearTimeout(this._wheelSnapTimer);
    this._wheelSnapTimer = setTimeout(function () {
      if (!self.slideStride) return;
      var idx = Math.round(-self.x / self.slideStride);
      self.goTo(idx, false);
    }, 120);
  };

  Carousel.prototype.destroy = function () {
    this.stopAutoplay();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._ro) this._ro.disconnect();
  };

  function mount(el, options) {
    if (!el || el.dataset.carouselMounted === "1") return null;
    el.dataset.carouselMounted = "1";
    el.setAttribute("role", "region");
    el.setAttribute("aria-roledescription", "carousel");
    return new Carousel(el, options);
  }

  function mountAll(container, options) {
    var root = container || document;
    var nodes = root.querySelectorAll("[data-tlkv-featured-carousel]");
    var list = [];
    nodes.forEach(function (n) {
      var inst = mount(n, options);
      if (inst) list.push(inst);
    });
    return list;
  }

  global.TLKVFeaturedCarousel = {
    mount: mount,
    mountAll: mountAll,
    prefersReducedMotion: prefersReducedMotion,
  };
})(typeof window !== "undefined" ? window : globalThis);
