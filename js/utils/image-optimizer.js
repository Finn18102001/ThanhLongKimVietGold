/**
 * TLKVImageOptimizer — production image pipeline (main thread API).
 *
 * Architecture:
 *   validate (main) → Web Worker (resize/WebP/adaptive compress) → File + preview URL
 *
 * Presets are reusable across News, Products, Banners, Brands, Categories.
 */
(function (global) {
  "use strict";

  var MAX_INPUT_BYTES = 10 * 1024 * 1024;
  var WORKER_URL = "/js/utils/image-optimizer.worker.js";
  var WORKER_TIMEOUT_MS = 45000;

  var ALLOWED_MIME = {
    "image/png": true,
    "image/jpeg": true,
    "image/jpg": true,
    "image/webp": true,
    "image/heic": true,
    "image/heif": true,
  };

  var REJECTED_MIME = {
    "image/svg+xml": true,
    "image/gif": true,
    "image/bmp": true,
    "image/tiff": true,
    "image/x-icon": true,
  };

  var ALLOWED_EXT = {
    png: true, jpg: true, jpeg: true, webp: true, heic: true, heif: true,
  };

  var REJECTED_EXT = {
    svg: true, gif: true, bmp: true, tiff: true, tif: true, ico: true,
  };

  /** Reusable presets — extend for other CRUD modules without duplicating logic. */
  var PRESETS = {
    NEWS_THUMBNAIL: {
      id: "news-thumbnail",
      maxWidth: 1200,
      maxHeight: 1200,
      targetMaxBytes: 300 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
    NEWS_CONTENT: {
      id: "news-content",
      maxWidth: 1200,
      maxHeight: 1200,
      targetMaxBytes: 300 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
    PRODUCT: {
      id: "product",
      maxWidth: 1200,
      maxHeight: 1200,
      targetMaxBytes: 350 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
    BANNER: {
      id: "banner",
      maxWidth: 1920,
      maxHeight: 1080,
      targetMaxBytes: 450 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
    BRAND: {
      id: "brand",
      maxWidth: 800,
      maxHeight: 800,
      targetMaxBytes: 200 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
    CATEGORY: {
      id: "category",
      maxWidth: 1000,
      maxHeight: 1000,
      targetMaxBytes: 250 * 1024,
      format: "image/webp",
      qualitySteps: [0.85, 0.80, 0.75, 0.70, 0.65],
    },
  };

  var webpSupportCache = null;
  var workerInstance = null;
  var workerDisabled = false;
  var jobSeq = 0;
  var activePreviewUrls = [];

  function isDevMode() {
    try {
      var host = global.location && global.location.hostname;
      return host === "localhost" || host === "127.0.0.1";
    } catch (e) {
      return false;
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function supportsWebP() {
    if (webpSupportCache !== null) return webpSupportCache;
    try {
      var canvas = document.createElement("canvas");
      webpSupportCache = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    } catch (e) {
      webpSupportCache = false;
    }
    return webpSupportCache;
  }

  function fileExtension(name) {
    var parts = String(name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  }

  function normalizeMime(file) {
    var type = String(file.type || "").toLowerCase();
    if (type === "image/jpg") return "image/jpeg";
    if (type) return type;
    var ext = fileExtension(file.name);
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "heic") return "image/heic";
    if (ext === "heif") return "image/heif";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "bmp") return "image/bmp";
    if (ext === "tiff" || ext === "tif") return "image/tiff";
    return "";
  }

  function validateImage(file) {
    if (!file) throw new Error("Không có tệp ảnh.");

    var mime = normalizeMime(file);
    var ext = fileExtension(file.name);

    if (REJECTED_MIME[mime] || REJECTED_EXT[ext]) {
      throw new Error(
        "Định dạng không hỗ trợ (" + (mime || ext) + "). " +
        "Chỉ chấp nhận JPEG, PNG, WebP, HEIC."
      );
    }

    if (!ALLOWED_MIME[mime] && !ALLOWED_EXT[ext]) {
      throw new Error(
        "Định dạng không hỗ trợ. Chấp nhận JPEG, PNG, WebP" +
        (supportsWebP() ? " và HEIC (nếu trình duyệt hỗ trợ)." : ".")
      );
    }

    if (file.size > MAX_INPUT_BYTES) {
      throw new Error(
        "Ảnh quá lớn (" + formatBytes(file.size) + "). Tối đa 10 MB."
      );
    }
  }

  function isOptimizableRaster(file) {
    try {
      validateImage(file);
      return true;
    } catch (e) {
      return false;
    }
  }

  function mergeConfig(preset, opts) {
    var base = PRESETS[preset] || PRESETS.NEWS_THUMBNAIL;
    return Object.assign({}, base, opts || {});
  }

  function trackPreviewUrl(url) {
    if (url) activePreviewUrls.push(url);
  }

  function revokePreviewUrl(url) {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
    activePreviewUrls = activePreviewUrls.filter(function (u) { return u !== url; });
  }

  function logDevStats(stats) {
    if (!isDevMode() || !stats) return;
    console.log("[ImageOptimizer] original dimensions:", stats.originalWidth + "x" + stats.originalHeight);
    console.log("[ImageOptimizer] optimized dimensions:", stats.optimizedWidth + "x" + stats.optimizedHeight);
    console.log("[ImageOptimizer] Original:", formatBytes(stats.originalBytes));
    console.log("[ImageOptimizer] Optimized:", formatBytes(stats.optimizedBytes));
    console.log("[ImageOptimizer] Saved:", stats.savedPercent + "%");
    console.log("[ImageOptimizer] processing time:", stats.processingMs + "ms");
    if (stats.quality != null) console.log("[ImageOptimizer] quality:", stats.quality);
    if (stats.skipped) console.log("[ImageOptimizer] skipped optimization (already optimal WebP)");
  }

  function getWorker() {
    if (workerDisabled || typeof Worker === "undefined") return null;
    if (workerInstance) return workerInstance;
    try {
      workerInstance = new Worker(WORKER_URL);
      workerInstance.addEventListener("error", function () {
        workerDisabled = true;
        workerInstance = null;
      });
      return workerInstance;
    } catch (e) {
      workerDisabled = true;
      return null;
    }
  }

  function runInWorker(buffer, mime, fileName, config, onPhase) {
    var worker = getWorker();
    if (!worker) return Promise.reject(new Error("WORKER_UNAVAILABLE"));

    return new Promise(function (resolve, reject) {
      var id = "job-" + (++jobSeq);
      var settled = false;

      function cleanup() {
        worker.removeEventListener("message", onMessage);
        clearTimeout(timer);
      }

      function finish(fn, value) {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      }

      function onMessage(event) {
        var data = event.data;
        if (!data) return;

        if (data.type === "progress" && data.id === id && typeof onPhase === "function") {
          onPhase(data.phase, data.progress);
          return;
        }

        if (data.id !== id) return;

        if (data.type === "error") {
          finish(reject, new Error(data.message || "Worker xử lý ảnh thất bại."));
          return;
        }

        if (data.type === "result") {
          finish(resolve, data);
        }
      }

      var timer = setTimeout(function () {
        finish(reject, new Error("Tối ưu ảnh quá thời gian. Vui lòng thử lại với ảnh nhỏ hơn."));
      }, WORKER_TIMEOUT_MS);

      worker.addEventListener("message", onMessage);
      worker.postMessage({
        type: "optimize",
        id: id,
        buffer: buffer,
        mime: mime,
        fileName: fileName,
        config: {
          maxWidth: config.maxWidth,
          maxHeight: config.maxHeight,
          targetMaxBytes: config.targetMaxBytes,
        },
      }, [buffer]);
    });
  }

  function computeDimensions(srcW, srcH, maxW, maxH) {
    if (srcW <= maxW && srcH <= maxH) {
      return { width: srcW, height: srcH, resized: false };
    }
    var ratio = Math.min(maxW / srcW, maxH / srcH);
    return {
      width: Math.max(1, Math.round(srcW * ratio)),
      height: Math.max(1, Math.round(srcH * ratio)),
      resized: true,
    };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Không thể chuyển đổi ảnh sang WebP."));
      }, type, quality);
    });
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        var ext = fileExtension(file.name);
        if (ext === "heic" || ext === "heif") {
          reject(new Error("Không đọc được HEIC trên trình duyệt này. Dùng Safari/iOS hoặc chuyển sang JPEG."));
        } else {
          reject(new Error("Không đọc được ảnh. File có thể bị hỏng."));
        }
      };
      img.src = url;
    });
  }

  /** Main-thread fallback when Worker is unavailable (same algorithm). */
  async function runOnMainThread(file, config, onPhase, startedAt) {
    if (typeof onPhase === "function") onPhase("resize", 0.25);

    var img = await loadImageFromFile(file);
    var srcW = img.naturalWidth || img.width;
    var srcH = img.naturalHeight || img.height;
    var mime = normalizeMime(file);

    if (
      mime === "image/webp" &&
      file.size <= config.targetMaxBytes &&
      srcW <= config.maxWidth &&
      srcH <= config.maxHeight
    ) {
      return {
        skipped: true,
        file: file,
        stats: {
          originalBytes: file.size,
          optimizedBytes: file.size,
          originalWidth: srcW,
          originalHeight: srcH,
          optimizedWidth: srcW,
          optimizedHeight: srcH,
          quality: null,
          skipped: true,
          processingMs: Math.round(performance.now() - startedAt),
          savedPercent: 0,
        },
      };
    }

    var dims = computeDimensions(srcW, srcH, config.maxWidth, config.maxHeight);
    var canvas = document.createElement("canvas");
    canvas.width = dims.width;
    canvas.height = dims.height;
    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, dims.width, dims.height);

    var qualities = config.qualitySteps || PRESETS.NEWS_THUMBNAIL.qualitySteps;
    var blob = null;
    var usedQuality = qualities[0];

    for (var i = 0; i < qualities.length; i++) {
      usedQuality = qualities[i];
      if (typeof onPhase === "function") onPhase(i === 0 ? "convert" : "compress", i === 0 ? 0.5 : 0.75);
      blob = await canvasToBlob(canvas, config.format, usedQuality);
      if (blob.size <= config.targetMaxBytes) break;
      if (usedQuality === 0.65) break;
    }

    var outName = String(file.name || "image").replace(/\.[^.]+$/, "") + ".webp";
    var optimized = new File([blob], outName, { type: "image/webp", lastModified: Date.now() });
    var savedPercent = file.size > 0
      ? Number(((1 - optimized.size / file.size) * 100).toFixed(1))
      : 0;

    return {
      skipped: false,
      file: optimized,
      stats: {
        originalBytes: file.size,
        optimizedBytes: optimized.size,
        originalWidth: srcW,
        originalHeight: srcH,
        optimizedWidth: dims.width,
        optimizedHeight: dims.height,
        quality: usedQuality,
        skipped: false,
        resized: dims.resized,
        processingMs: Math.round(performance.now() - startedAt),
        savedPercent: savedPercent,
      },
    };
  }

  function buildResultFromWorker(file, workerResult) {
    var stats = workerResult.stats;
    if (workerResult.skipped) {
      return {
        file: file,
        previewUrl: URL.createObjectURL(file),
        stats: stats,
        skipped: true,
      };
    }

    var optimized = new File(
      [workerResult.buffer],
      workerResult.fileName,
      { type: workerResult.mime, lastModified: Date.now() }
    );
    return {
      file: optimized,
      previewUrl: URL.createObjectURL(optimized),
      stats: stats,
      skipped: false,
    };
  }

  /**
   * Optimize image for News CRUD (thumbnail + inline content).
   *
   * @param {File} file
   * @param {{
   *   preset?: string,
   *   onPhase?: (phase: string, progress: number) => void,
   *   maxWidth?: number,
   *   maxHeight?: number,
   *   targetMaxBytes?: number
   * }} [opts]
   * @returns {Promise<{ file: File, previewUrl: string, stats: object, skipped: boolean }>}
   */
  async function optimizeNewsImage(file, opts) {
    validateImage(file);

    if (!supportsWebP()) {
      throw new Error(
        "Trình duyệt không hỗ trợ WebP. Vui lòng cập nhật Chrome, Firefox, Safari hoặc Edge."
      );
    }

    var config = mergeConfig((opts && opts.preset) || "NEWS_THUMBNAIL", opts);
    var onPhase = opts && typeof opts.onPhase === "function" ? opts.onPhase : null;
    var startedAt = performance.now();
    var mime = normalizeMime(file);

    if (typeof onPhase === "function") onPhase("validate", 0.1);

    var buffer = await file.arrayBuffer();
    var workerResult = null;

    try {
      workerResult = await runInWorker(buffer, mime, file.name, config, onPhase);
    } catch (workerErr) {
      if (isDevMode()) {
        console.warn("[ImageOptimizer] worker failed, falling back to main thread:", workerErr);
      }
      var fallback = await runOnMainThread(file, config, onPhase, startedAt);
      var previewUrl = URL.createObjectURL(fallback.file);
      trackPreviewUrl(previewUrl);
      logDevStats(fallback.stats);
      return {
        file: fallback.file,
        previewUrl: previewUrl,
        stats: fallback.stats,
        skipped: fallback.skipped,
      };
    }

    var built = buildResultFromWorker(file, workerResult);
    trackPreviewUrl(built.previewUrl);
    logDevStats(built.stats);
    return built;
  }

  /**
   * Generic optimize entry — use preset for Products, Banners, etc.
   */
  function optimizeImage(file, preset, opts) {
    var merged = Object.assign({}, opts || {}, { preset: preset });
    return optimizeNewsImage(file, merged);
  }

  global.TLKVImageOptimizer = {
    optimizeNewsImage: optimizeNewsImage,
    optimizeImage: optimizeImage,
    validateImage: validateImage,
    isOptimizableRaster: isOptimizableRaster,
    supportsWebP: supportsWebP,
    formatBytes: formatBytes,
    revokePreviewUrl: revokePreviewUrl,
    PRESETS: PRESETS,
    NEWS_THUMBNAIL: PRESETS.NEWS_THUMBNAIL,
  };
})(typeof window !== "undefined" ? window : globalThis);
