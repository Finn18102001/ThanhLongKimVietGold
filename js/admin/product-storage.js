(function (global) {
  "use strict";

  var MAX_BYTES = 10 * 1024 * 1024;
  var XHR_TIMEOUT_MS = 300000;
  var AUTH_TIMEOUT_MS = 12000;
  var cachedToken = null;
  var tokenInflight = null;
  var AUTH_STORAGE_KEY = "tlkv-supabase-auth";
  var uploadChain = Promise.resolve();

  function noop() {}

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

  function mapPhase(phase, ratio) {
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
      if (typeof expiresAt === "number" && expiresAt * 1000 < Date.now() + 60000) return null;
      return token;
    } catch (_) {
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

  function prewarmAuth() {
    return getAccessToken().catch(noop);
  }

  function clearAuthCache() {
    cachedToken = null;
    tokenInflight = null;
  }

  function enqueue(task) {
    var run = uploadChain.then(task, task);
    uploadChain = run.then(noop, noop);
    return run;
  }

  function validateFile(file) {
    if (!file) throw new Error("Không có tệp ảnh.");
    if (!global.TLKVImageOptimizer || typeof global.TLKVImageOptimizer.validateImage !== "function") {
      throw new Error("TLKVImageOptimizer chưa tải.");
    }
    global.TLKVImageOptimizer.validateImage(file);
    if (file.size > MAX_BYTES) {
      throw new Error(
        "Ảnh quá lớn (" + (file.size / 1024 / 1024).toFixed(2) + " MB) — tối đa 10 MB."
      );
    }
  }

  async function doUpload(file, opts) {
    opts = opts || {};
    var onPhase = typeof opts.onPhase === "function" ? opts.onPhase : noop;
    var productId = String(opts.productId || "new").trim() || "new";
    function emit(phase, ratio, meta) {
      onPhase(phase, mapPhase(phase, ratio), meta || null);
    }

    emit("validate", 0.10);
    validateFile(file);

    if (!global.TLKVImageOptimizer || typeof global.TLKVImageOptimizer.optimizeImage !== "function") {
      throw new Error("TLKVImageOptimizer chưa tải.");
    }

    var optimizedFile = file;
    var optimizeMeta = null;
    try {
      var optimized = await global.TLKVImageOptimizer.optimizeImage(file, "PRODUCT", {
        onPhase: function (phase, progress) {
          emit(phase, progress);
        },
      });
      optimizedFile = optimized.file;
      optimizeMeta = {
        previewUrl: optimized.previewUrl,
        stats: optimized.stats,
        skipped: optimized.skipped,
      };
      emit("optimized", 0.75, optimizeMeta);
    } catch (e) {
      throw new Error((e && e.message) ? e.message : "Không thể tối ưu ảnh.");
    }

    emit("auth", 0.78);
    var jwt = await getAccessToken();
    if (!jwt) throw new Error("Chưa đăng nhập hoặc phiên đã hết hạn.");

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var fd = new FormData();
      fd.append("file", optimizedFile);
      fd.append("productId", productId);
      xhr.open("POST", "/api/products/upload-image");
      xhr.setRequestHeader("Authorization", "Bearer " + jwt);
      xhr.timeout = XHR_TIMEOUT_MS;

      xhr.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        var ratio = 0.78 + (e.loaded / e.total) * 0.21;
        emit("upload", Math.min(0.99, ratio));
      };

      xhr.onload = function () {
        var result;
        try {
          result = JSON.parse(xhr.responseText);
        } catch (_) {
          return reject(new Error("Phản hồi không hợp lệ từ server."));
        }
        if (xhr.status >= 200 && xhr.status < 300 && !result.error) {
          emit("done", 1, optimizeMeta);
          resolve({
            path: result.path,
            publicUrl: result.url || "",
            optimize: optimizeMeta,
          });
          return;
        }
        if (xhr.status === 401) {
          clearAuthCache();
          return reject(new Error("Phiên đăng nhập hết hạn — tải lại trang và đăng nhập lại."));
        }
        reject(new Error((result && result.error) || ("Lỗi HTTP " + xhr.status)));
      };

      xhr.onerror = function () {
        reject(new Error("Lỗi mạng — không kết nối được đến server."));
      };

      xhr.ontimeout = function () {
        reject(new Error(
          "Upload quá thời gian (" + Math.round(XHR_TIMEOUT_MS / 60000) + " phút). Kiểm tra kết nối mạng và thử lại."
        ));
      };

      xhr.send(fd);
    });
  }

  function upload(file, opts) {
    return enqueue(function () {
      return doUpload(file, opts || {});
    });
  }

  async function remove(path) {
    if (!path) return;
    var sb = (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient)
      ? await global.TLKVSupabase.getSupabaseClient()
      : null;
    if (!sb) return;
    try { await sb.storage.from("product-media").remove([path]); } catch (_) {}
  }

  function pathFromPublicUrl(url) {
    if (!url) return "";
    var m = String(url).match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  global.TLKVProductStorage = {
    upload: upload,
    remove: remove,
    prewarmAuth: prewarmAuth,
    clearAuthCache: clearAuthCache,
    getAccessToken: getAccessToken,
    pathFromPublicUrl: pathFromPublicUrl,
    phaseLabel: phaseLabel,
    mapPhase: mapPhase,
  };
})(typeof window !== "undefined" ? window : globalThis);
