/**
 * TLKVNewsStorage — Supabase Storage abstraction for the News CMS.
 *
 * ─── Phase B Architecture ────────────────────────────────────────────────
 *
 *  BEFORE (browser canvas pipeline — caused prod freezes):
 *    File → createImageBitmap (full 4K decode, ~33 MB RAM)
 *         → canvas.drawImage (main-thread resize, blocks UI)
 *         → canvas.toBlob × 5 quality passes (main-thread encode)
 *         → Supabase fetch
 *
 *  AFTER (server transcode pipeline):
 *    File → XHR multipart POST /api/news/upload-image
 *            ↳ server: multer → sharp (libvips) → Supabase Storage
 *         ← { url, path }
 *
 *  Benefits:
 *    ✓ Zero browser canvas → no OOM, no tab freeze, no mobile crash
 *    ✓ Real upload progress from XHR.upload.onprogress (actual bytes sent)
 *    ✓ libvips encodes 10-50× faster than canvas.toBlob at equal quality
 *    ✓ mozjpeg produces ~20-30% smaller files vs browser JPEG
 *    ✓ EXIF orientation corrected automatically (phone photos)
 *    ✓ No service_role key needed — caller's JWT is forwarded as-is
 *    ✓ Public API surface unchanged: upload(folder, file, opts) → {path, publicUrl}
 */
(function (global) {
  "use strict";

  var BUCKET    = "news-media";
  var MAX_BYTES = 10 * 1024 * 1024;   // matches bucket file_size_limit in news-storage.sql

  /** Timeout for the client→server leg (browser → our Express server).
   *  Server-to-Supabase happens datacenter-speed and does not count. */
  var XHR_TIMEOUT_MS = 300000; // 5 minutes — generous for very slow uplinks

  var ALLOWED_MIME = {
    "image/jpeg":   "jpg",
    "image/jpg":    "jpg",
    "image/png":    "png",
    "image/webp":   "webp",
    "image/heic":   "webp",
    "image/heif":   "webp",
  };

  function noop() {}

  function shouldOptimize(file) {
    if (!global.TLKVImageOptimizer) return false;
    if (typeof global.TLKVImageOptimizer.isOptimizableRaster === "function") {
      return global.TLKVImageOptimizer.isOptimizableRaster(file);
    }
    return !!ALLOWED_MIME[file.type];
  }

  function mapOptimizePhase(phase, ratio) {
    if (phase === "validate") return 0.10;
    if (phase === "resize") return 0.25;
    if (phase === "convert") return 0.50;
    if (phase === "compress") return 0.75;
    if (phase === "optimized") return 0.75;
    if (phase === "auth") return 0.78;
    if (phase === "upload") return Math.max(0.78, Math.min(0.99, ratio));
    if (phase === "done") return 1;
    return ratio;
  }

  function phaseLabel(phase) {
    if (phase === "validate") return "Đang kiểm tra ảnh…";
    if (phase === "resize") return "Đang thay đổi kích thước…";
    if (phase === "convert") return "Đang chuyển sang WebP…";
    if (phase === "compress") return "Đang nén ảnh…";
    if (phase === "optimized") return "Đã tối ưu — chuẩn bị tải lên…";
    if (phase === "auth") return "Đang xác thực…";
    if (phase === "upload") return "Đang tải lên…";
    return "";
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  function validateFileType(file) {
    if (!file) throw new Error("Không có tệp.");
    if (global.TLKVImageOptimizer && typeof global.TLKVImageOptimizer.validateImage === "function") {
      global.TLKVImageOptimizer.validateImage(file);
      return;
    }
    if (!ALLOWED_MIME[file.type]) {
      throw new Error(
        "Định dạng không hỗ trợ: " + (file.type || "?") +
        " — chấp nhận JPEG, PNG, WebP, HEIC."
      );
    }
  }

  function validateFileSize(file) {
    if (file && file.size > MAX_BYTES) {
      throw new Error(
        "Ảnh quá lớn (" + (file.size / 1024 / 1024).toFixed(2) +
        " MB) — tối đa " + Math.round(MAX_BYTES / 1024 / 1024) + " MB."
      );
    }
  }

  // ── Auth token ────────────────────────────────────────────────────────────

  var cachedToken = null;
  var tokenInflight = null;
  var AUTH_TIMEOUT_MS = 12000;
  var AUTH_STORAGE_KEY = "tlkv-supabase-auth";

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error((label || "Thao tác") + " quá thời gian (" + Math.round(ms / 1000) + "s)."));
        }, ms);
      }),
    ]);
  }

  /** Sync read from persisted Supabase session — avoids cold getSession() on first upload. */
  function readTokenFromLocalStorage() {
    try {
      var ls = global.localStorage;
      if (!ls) return null;
      var raw = ls.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      var token = data.access_token;
      if (!token || typeof token !== "string") return null;
      var expiresAt = data.expires_at;
      if (typeof expiresAt === "number" && expiresAt * 1000 < Date.now() + 60000) {
        return null;
      }
      return token;
    } catch (e) {
      return null;
    }
  }

  function fetchAccessTokenFresh() {
    var sbPromise = (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient)
      ? global.TLKVSupabase.getSupabaseClient()
      : Promise.resolve(null);

    return sbPromise.then(function (sb) {
      if (!sb) return null;
      return sb.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        return session ? session.access_token : null;
      });
    });
  }

  /**
   * Retrieve JWT for upload — cached after first resolve so repeat picks are instant.
   */
  function getAccessToken() {
    if (cachedToken) return Promise.resolve(cachedToken);
    var localToken = readTokenFromLocalStorage();
    if (localToken) {
      cachedToken = localToken;
      return Promise.resolve(localToken);
    }
    if (tokenInflight) return tokenInflight;
    tokenInflight = withTimeout(fetchAccessTokenFresh(), AUTH_TIMEOUT_MS, "Lấy token đăng nhập")
      .then(function (token) {
        tokenInflight = null;
        if (token) cachedToken = token;
        return token;
      })
      .catch(function (e) {
        tokenInflight = null;
        throw e;
      });
    return tokenInflight;
  }

  /** Warm Supabase client + JWT before the user picks a file (fixes slow first upload). */
  function prewarmAuth() {
    console.log("[UPLOAD] prewarm auth");
    return getAccessToken().then(function (token) {
      console.log("[UPLOAD] prewarm ok", !!token);
      return token;
    });
  }

  function clearAuthCache() {
    cachedToken = null;
    tokenInflight = null;
  }

  // ── Core upload (XHR for real progress) ───────────────────────────────────

  /**
   * Upload a single image to /api/news/upload-image via XHR.
   *
   * Progress phases mapped to ratio [0-1]:
   *   validate  → 0.10  (immediate, synchronous)
   *   auth      → 0.15  (get JWT from Supabase client, <50ms)
   *   upload    → 0.15…0.90  (real XHR progress: bytes sent / total)
   *   done      → 1.0
   *
   * @param {'thumbnails'|'content'} folder
   * @param {File} file
   * @param {function} onPhase  — (phase: string, ratio: number) => void
   * @returns {Promise<{path: string, publicUrl: string}>}
   */
  async function doUpload(folder, file, onPhase, uploadOpts) {
    if (folder !== "thumbnails" && folder !== "content") {
      throw new Error("Folder không hợp lệ: " + folder);
    }

    function emit(phase, ratio, meta) {
      onPhase(phase, mapOptimizePhase(phase, ratio), meta || null);
    }

    // ── 1. Validate ──────────────────────────────────────────────────────
    console.log("[UPLOAD] start", { folder: folder, size: file.size, type: file.type });
    emit("validate", 0.10);
    validateFileType(file);
    validateFileSize(file);

    var optimizeMeta = null;

    // ── 2. Client-side optimize (Web Worker) ───────────────────────────
    if (
      global.TLKVImageOptimizer &&
      typeof global.TLKVImageOptimizer.optimizeNewsImage === "function" &&
      shouldOptimize(file)
    ) {
      try {
        var preset = (uploadOpts && uploadOpts.preset) ||
          (folder === "content" ? "NEWS_CONTENT" : "NEWS_THUMBNAIL");
        var optimized = await global.TLKVImageOptimizer.optimizeNewsImage(file, {
          preset: preset,
          onPhase: function (phase, progress) {
            emit(phase, progress);
          },
        });
        file = optimized.file;
        optimizeMeta = {
          previewUrl: optimized.previewUrl,
          stats: optimized.stats,
          skipped: optimized.skipped,
        };
        emit("optimized", 0.75, optimizeMeta);
        console.log("[UPLOAD] optimized", {
          size: file.size,
          type: file.type,
          skipped: optimized.skipped,
          saved: optimized.stats && optimized.stats.savedPercent,
        });
      } catch (e) {
        console.error("[UPLOAD] optimize failed:", e);
        throw new Error(
          (e && e.message) ? e.message : "Không thể tối ưu ảnh. Vui lòng thử ảnh khác."
        );
      }
    }

    // ── 3. Fetch JWT ──────────────────────────────────────────────────────
    emit("auth", 0.78);
    var jwt = await getAccessToken();
    if (!jwt) throw new Error("Chưa đăng nhập hoặc phiên đã hết hạn.");
    console.log("[UPLOAD] auth ok");

    // ── 4. Build multipart payload ────────────────────────────────────────
    var fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);

    // ── 5. XHR with real progress ─────────────────────────────────────────
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/news/upload-image");
      xhr.setRequestHeader("Authorization", "Bearer " + jwt);
      xhr.timeout = XHR_TIMEOUT_MS;

      xhr.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        // Map client→server upload bytes to the 15%–90% window.
        // The server processes + re-uploads to Supabase at datacenter speed
        // so we jump straight to 100% when we get a success response.
        var ratio = 0.78 + (e.loaded / e.total) * 0.21;
        emit("upload", Math.min(0.99, ratio));
      };

      xhr.onload = function () {
        var result;
        try { result = JSON.parse(xhr.responseText); } catch (e) {
          return reject(new Error("Phản hồi không hợp lệ từ server."));
        }
        if (xhr.status >= 200 && xhr.status < 300 && !result.error) {
          emit("done", 1, optimizeMeta);
          console.log("[UPLOAD] done", { path: result.path });
          resolve({
            path: result.path,
            publicUrl: result.url || "",
            optimize: optimizeMeta,
          });
        } else if (xhr.status === 401) {
          clearAuthCache();
          reject(new Error("Phiên đăng nhập hết hạn — tải lại trang và đăng nhập lại."));
        } else {
          var msg = (result && result.error) || ("Lỗi HTTP " + xhr.status);
          reject(new Error(msg));
        }
      };

      xhr.onerror = function () {
        reject(new Error("Lỗi mạng — không kết nối được đến server."));
      };

      xhr.ontimeout = function () {
        reject(new Error(
          "Upload quá thời gian (" + Math.round(XHR_TIMEOUT_MS / 60000) + " phút). " +
          "Kiểm tra kết nối mạng và thử lại."
        ));
      };

      xhr.send(fd);
    });
  }

  // ── Serial queue ──────────────────────────────────────────────────────────
  //
  //  Ensures at most ONE upload job runs at a time across the whole page
  //  (sidebar thumbnail, inline content image, Editor.js image block).
  //
  //  With the server-side architecture this is primarily a UX guard (one
  //  progress bar at a time, clear state) rather than a memory safety measure.
  //  A rejected / timed-out job never blocks the queue.

  var uploadChain = Promise.resolve();

  function enqueue(task) {
    var run = uploadChain.then(task, task);
    uploadChain = run.then(noop, noop); // keep chain alive regardless of outcome
    return run;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Upload an image to Supabase Storage via the server-side transcode route.
   *
   * @param {'thumbnails'|'content'} folder
   * @param {File} file
   * @param {{ onPhase?: (phase:string, ratio:number, meta?:object)=>void, preset?: string }} [opts]
   * @returns {Promise<{ path: string, publicUrl: string }>}
   */
  function upload(folder, file, opts) {
    var onPhase = opts && typeof opts.onPhase === "function" ? opts.onPhase : noop;
    return enqueue(function () { return doUpload(folder, file, onPhase, opts || {}); });
  }

  /** Best-effort delete of a Storage object by its path. */
  async function remove(path) {
    if (!path) return;
    var sb = (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient)
      ? await global.TLKVSupabase.getSupabaseClient()
      : null;
    if (!sb) return;
    try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { /* best-effort */ }
  }

  /** Reverse-map a public Storage URL back to its internal path. */
  function pathFromPublicUrl(url) {
    if (!url) return "";
    var m = String(url).match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  global.TLKVNewsStorage = {
    BUCKET:           BUCKET,
    MAX_BYTES:        MAX_BYTES,
    upload:           upload,
    getAccessToken:   getAccessToken,
    prewarmAuth:      prewarmAuth,
    clearAuthCache:   clearAuthCache,
    remove:           remove,
    pathFromPublicUrl: pathFromPublicUrl,
    mapOptimizePhase: mapOptimizePhase,
    phaseLabel: phaseLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
