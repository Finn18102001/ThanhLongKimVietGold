/**
 * TLKVNewsStorage — Supabase Storage abstraction for News.
 *
 *   - Single bucket:    news-media
 *   - Folder strategy:  thumbnails/<YYYY>/<MM>/   |   content/<YYYY>/<MM>/
 *   - Name convention:  <uuid>-<sanitized-basename>.<ext>
 *
 *   Large local images are compressed in-browser before upload so admins can
 *   select phone/camera photos without hitting Storage limits.
 */
(function (global) {
  "use strict";

  var BUCKET = "news-media";
  var MAX_BYTES = 10 * 1024 * 1024; // hard ceiling after compression
  var TARGET_BYTES = 2.5 * 1024 * 1024;
  var MAX_DIMENSION = 1920;
  var ALLOWED_MIME = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
    "image/svg+xml": "svg",
  };

  function randomId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function sanitizeBasename(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")            // strip extension
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  }

  function todayFolder() {
    var d = new Date();
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return yyyy + "/" + mm;
  }

  function getSupabaseClient() {
    if (global.TLKVSupabase && global.TLKVSupabase.getSupabaseClient) {
      return global.TLKVSupabase.getSupabaseClient();
    }
    return Promise.resolve(null);
  }

  function validateFileType(file) {
    if (!file) throw new Error("Không có tệp.");
    if (!ALLOWED_MIME[file.type]) {
      throw new Error("Định dạng không hỗ trợ: " + (file.type || "?") + " (chấp nhận JPG, PNG, WEBP, GIF, SVG).");
    }
  }

  function validateFileSize(file) {
    if (file.size > MAX_BYTES) {
      throw new Error("Ảnh quá lớn (" + (file.size / 1024 / 1024).toFixed(2) + " MB) — tối đa 10 MB.");
    }
  }

  function canCompress(file) {
    return file && /image\/(jpeg|png|webp)/i.test(file.type || "");
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, type, quality);
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = global.URL && global.URL.createObjectURL ? global.URL.createObjectURL(file) : "";
      var img = new Image();
      img.onload = function () {
        if (url) global.URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        if (url) global.URL.revokeObjectURL(url);
        reject(new Error("Không đọc được ảnh để nén."));
      };
      img.src = url;
    });
  }

  async function compressImageIfNeeded(file) {
    validateFileType(file);
    if (!canCompress(file)) {
      validateFileSize(file);
      return file;
    }
    if (file.size <= TARGET_BYTES) return file;

    var img = await loadImage(file);
    var scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      validateFileSize(file);
      return file;
    }
    ctx.drawImage(img, 0, 0, width, height);

    var qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
    var blob = null;
    for (var i = 0; i < qualities.length; i++) {
      blob = await canvasToBlob(canvas, "image/jpeg", qualities[i]);
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) {
      validateFileSize(file);
      return file;
    }

    var name = String(file.name || "image").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    var compressed = typeof File !== "undefined"
      ? new File([blob], name, { type: "image/jpeg", lastModified: Date.now() })
      : blob;
    compressed.name = compressed.name || name;
    validateFileSize(compressed);
    return compressed;
  }

  function buildPath(folder, file) {
    var ext = ALLOWED_MIME[file.type] || "bin";
    var safe = sanitizeBasename(file.name);
    return folder + "/" + todayFolder() + "/" + randomId() + "-" + safe + "." + ext;
  }

  /**
   * Upload to a top-level folder ('thumbnails' or 'content').
   * @returns {Promise<{ path: string, publicUrl: string }>}
   */
  async function upload(folder, file) {
    if (folder !== "thumbnails" && folder !== "content") {
      throw new Error("Folder không hợp lệ: " + folder);
    }
    file = await compressImageIfNeeded(file);
    var sb = await getSupabaseClient();
    if (!sb) throw new Error("Supabase chưa cấu hình.");

    var path = buildPath(folder, file);
    var { error } = await sb.storage.from(BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw new Error("Upload thất bại: " + (error.message || JSON.stringify(error)));

    var { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return { path: path, publicUrl: pub && pub.publicUrl ? pub.publicUrl : "" };
  }

  /** Best-effort delete (we keep going if the file is already gone). */
  async function remove(path) {
    if (!path) return;
    var sb = await getSupabaseClient();
    if (!sb) return;
    try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { /* ignore */ }
  }

  /** Try to map a public URL back to a storage path so admins can prune images. */
  function pathFromPublicUrl(url) {
    if (!url) return "";
    var m = String(url).match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  global.TLKVNewsStorage = {
    BUCKET: BUCKET,
    MAX_BYTES: MAX_BYTES,
    upload: upload,
    remove: remove,
    pathFromPublicUrl: pathFromPublicUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
