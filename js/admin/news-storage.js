/**
 * TLKVNewsStorage — Supabase Storage abstraction for News.
 *
 *   - Single bucket:    news-media
 *   - Folder strategy:  thumbnails/<YYYY>/<MM>/   |   content/<YYYY>/<MM>/
 *   - Name convention:  <uuid>-<sanitized-basename>.<ext>
 *
 *   Server-side validation lives in RLS / bucket policies; client validation
 *   here is to fail fast and give a nice error message before we waste bytes.
 */
(function (global) {
  "use strict";

  var BUCKET = "news-media";
  var MAX_BYTES = 10 * 1024 * 1024; // 10 MB
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
    return Promise.resolve().then(function () {
      var cfg =
        typeof globalThis !== "undefined" && globalThis.__TLKV_SUPABASE__
          ? globalThis.__TLKV_SUPABASE__
          : { url: "", anonKey: "" };
      var url = String(cfg.url || "").trim();
      var anonKey = String(cfg.anonKey || "").trim();
      var sdk = typeof globalThis !== "undefined" ? globalThis.supabase : null;
      if (!url || !anonKey || !sdk || typeof sdk.createClient !== "function") return null;
      return sdk.createClient(url, anonKey);
    });
  }

  function validateFile(file) {
    if (!file) throw new Error("Không có tệp.");
    if (!ALLOWED_MIME[file.type]) {
      throw new Error("Định dạng không hỗ trợ: " + (file.type || "?") + " (chấp nhận JPG, PNG, WEBP, GIF, SVG).");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("Ảnh quá lớn (" + (file.size / 1024 / 1024).toFixed(2) + " MB) — tối đa 10 MB.");
    }
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
    validateFile(file);
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
