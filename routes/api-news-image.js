/**
 * POST /api/news/upload-image
 *
 * Server-side image ingest for the News CMS.
 *
 *  WHY server-side instead of browser canvas?
 *  ─────────────────────────────────────────
 *  Browser canvas (createImageBitmap + drawImage + toBlob) runs on the main
 *  thread, peaks at ~50+ MB of RAM for a single 4K image, and produces
 *  inferior JPEG quality vs libvips/mozjpeg.  On mobile, the tab is killed
 *  before the encode even finishes.
 *
 *  Here we:
 *    1. Accept the raw file via multipart (client → our Express server)
 *    2. Process with `sharp` (Node.js bindings to libvips) — auto-orient EXIF,
 *       resize to ≤1920 px, encode JPEG with mozjpeg at q=82.
 *    3. Upload the processed buffer to Supabase Storage using the caller's JWT
 *       → the existing RLS policies are satisfied without a service_role key.
 *    4. Return { url, path } — same shape the client already expects.
 *
 *  Result:
 *    ✓ Zero canvas on the browser — no OOM, no tab freeze, no mobile crash.
 *    ✓ Real upload progress via XHR.upload.onprogress (client → server leg).
 *    ✓ libvips is 10-50× faster than canvas encode at equivalent quality.
 *    ✓ mozjpeg produces 20-30% smaller files than browser JPEG at same quality.
 *    ✓ EXIF orientation is corrected automatically (common with phone photos).
 *    ✓ No extra env vars — uses the existing anon key + caller's auth JWT.
 */

"use strict";

const express = require("express");
const multer  = require("multer");
const sharp   = require("sharp");
const crypto  = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ── Constants ──────────────────────────────────────────────────────────────
const BUCKET      = "news-media";
const MAX_BYTES   = 10 * 1024 * 1024;   // mirrors the bucket file_size_limit
const MAX_DIM     = 1920;               // longest edge ceiling (px) — legacy fallback
const WEBP_PASSTHROUGH_MAX_DIM = 1200; // matches client-side optimizer
const WEBP_PASSTHROUGH_MAX_BYTES = 350 * 1024; // slight buffer over 300 KB target
const JPEG_QUALITY = 82;               // perceptually lossless for news photos
const JPEG_SMALL_PASSTHROUGH_BYTES = 2.5 * 1024 * 1024; // skip re-encode if tiny JPEG

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/svg+xml",
]);

/** Types that go through sharp resize/encode. SVG + GIF are uploaded as-is. */
const RASTER_COMPRESSIBLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_MAP = {
  "image/jpeg":   "jpg",
  "image/jpg":    "jpg",
  "image/png":    "jpg",  // re-encoded to JPEG (legacy)
  "image/webp":   "webp", // pass-through when pre-optimized by client
  "image/heic":   "webp",
  "image/heif":   "webp",
  "image/gif":    "gif",
  "image/svg+xml":"svg",
};

// ── Multer (memory storage — max 10 MB, no temp files) ────────────────────
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: function (req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Định dạng không hỗ trợ: " + (file.mimetype || "?") +
        " — chấp nhận JPG, PNG, WEBP, GIF, SVG."
      ));
    }
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────
function randomId() {
  return crypto.randomUUID();
}

function sanitizeBasename(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function todayFolder() {
  const d  = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}/${mm}`;
}

/**
 * Create a Supabase client that authenticates every request with the caller's
 * JWT.  The existing RLS policies (`auth.jwt() ->> 'email' = '...'`) are
 * therefore evaluated against the real user — no service_role key needed.
 */
function supabaseForJwt(jwt) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global:  { headers: { Authorization: `Bearer ${jwt}` } },
      auth:    { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );
}

// ── Route handler ──────────────────────────────────────────────────────────
async function handleUpload(req, res) {
  try {
    // 1. Validate JWT ──────────────────────────────────────────────────────
    const authHeader = String(req.headers.authorization || "");
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!jwt) {
      return res.status(401).json({ error: "Chưa xác thực — cần đăng nhập trước." });
    }

    const sb = supabaseForJwt(jwt);
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }

    // 2. Validate folder ───────────────────────────────────────────────────
    const folder = (["thumbnails", "content"].includes(req.body && req.body.folder))
      ? req.body.folder
      : "content";

    // 3. File guard (multer already checked size + MIME) ───────────────────
    if (!req.file) {
      return res.status(400).json({ error: "Không nhận được file ảnh." });
    }

    // 4. Image processing with sharp ───────────────────────────────────────
    let outBuffer, outMime, outExt;

    if (RASTER_COMPRESSIBLE.has(req.file.mimetype)) {
      /*
       * Pre-optimized WebP from the client (image-optimizer.js):
       * pass-through to preserve format and avoid double-encoding.
       */
      if (req.file.mimetype === "image/webp") {
        const meta = await sharp(req.file.buffer).metadata();
        const srcW = meta.width  || 0;
        const srcH = meta.height || 0;
        const withinDims = Math.max(srcW, srcH) <= WEBP_PASSTHROUGH_MAX_DIM;
        const withinBytes = req.file.size <= WEBP_PASSTHROUGH_MAX_BYTES;
        if (withinDims && withinBytes) {
          outBuffer = req.file.buffer;
          outMime   = "image/webp";
          outExt    = "webp";
        }
      }

      if (!outBuffer) {
      /*
       * Pipeline:
       *   a) rotate()          — honour EXIF orientation (phone photos)
       *   b) resize(…inside)   — scale down if longest edge > MAX_DIM
       *   c) jpeg({mozjpeg})   — mozjpeg encoder (better than browser JPEG)
       *
       * Small JPEG pass-through: if the original is already JPEG, already
       * within dimensions, AND below the byte budget, skip re-encoding to
       * preserve quality and save CPU.
       */
      const meta = await sharp(req.file.buffer).metadata();
      const srcW = meta.width  || 0;
      const srcH = meta.height || 0;
      const needsResize = Math.max(srcW, srcH) > MAX_DIM;
      const isSmallJpeg = (
        req.file.mimetype === "image/jpeg" &&
        !needsResize &&
        req.file.size <= JPEG_SMALL_PASSTHROUGH_BYTES
      );

      if (isSmallJpeg) {
        // Pass-through: already optimised, no re-encode needed.
        outBuffer = req.file.buffer;
        outMime   = "image/jpeg";
      } else {
        let pipeline = sharp(req.file.buffer).rotate();   // fix EXIF orientation
        if (needsResize) {
          pipeline = pipeline.resize(MAX_DIM, MAX_DIM, {
            fit: "inside",           // maintain aspect ratio, never enlarge
            withoutEnlargement: true,
          });
        }
        outBuffer = await pipeline
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toBuffer();
        outMime = "image/jpeg";
      }
      outExt = outExt || "jpg";
      }

    } else {
      // SVG / GIF: pass-through (animated GIF is preserved, SVG is vector)
      outBuffer = req.file.buffer;
      outMime   = req.file.mimetype;
      outExt    = EXT_MAP[req.file.mimetype] || "bin";
    }

    // 5. Build unique storage path ─────────────────────────────────────────
    const basename     = sanitizeBasename(req.file.originalname);
    const storagePath  = `${folder}/${todayFolder()}/${randomId()}-${basename}.${outExt}`;

    // 6. Upload to Supabase Storage ────────────────────────────────────────
    //    The user's JWT is forwarded, so the storage RLS is evaluated with the
    //    real caller identity.  If the email doesn't match the admin policy
    //    the upload will return a 403 from the storage API.
    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(
      storagePath,
      outBuffer,
      { contentType: outMime, cacheControl: "31536000", upsert: false }
    );
    if (uploadErr) {
      console.error("[news-image] Supabase storage error:", uploadErr);
      const msg = uploadErr.message || "";
      if (/violates.*policy|insufficient_privilege|not authorized/i.test(msg)) {
        return res.status(403).json({ error: "Tài khoản không có quyền ghi vào storage." });
      }
      return res.status(502).json({ error: "Lưu ảnh lên storage thất bại: " + msg });
    }

    // 7. Return public URL ─────────────────────────────────────────────────
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    return res.json({
      path: storagePath,
      url:  pub && pub.publicUrl ? pub.publicUrl : "",
    });

  } catch (err) {
    console.error("[news-image] unhandled error:", err);
    return res.status(500).json({ error: err.message || "Upload thất bại." });
  }
}

// ── Router factory ─────────────────────────────────────────────────────────
module.exports = function newsImageRouter() {
  const router = express.Router();

  /*
   * POST /api/news/upload-image
   *
   * multipart/form-data fields:
   *   file    (required) — the image File
   *   folder  (optional) — "thumbnails" | "content"  (default: "content")
   *
   * Headers:
   *   Authorization: Bearer <supabase_access_token>
   *
   * Response 200:
   *   { path: string, url: string }
   * Response 4xx / 5xx:
   *   { error: string }
   */
  router.post(
    "/upload-image",
    // Run multer first; handle its own errors before the async handler.
    function (req, res, next) {
      multerUpload.single("file")(req, res, function (err) {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              error: `Ảnh quá lớn — tối đa ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
            });
          }
          return res.status(400).json({ error: err.message || "File không hợp lệ." });
        }
        return res.status(400).json({ error: (err && err.message) || "Lỗi upload." });
      });
    },
    handleUpload
  );

  return router;
};
