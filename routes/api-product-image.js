"use strict";

const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { supabasePublicEnv } = require("../lib/supabase-public-env");

const BUCKET = "product-media";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 1920;
const WEBP_PASSTHROUGH_MAX_DIM = 1200;
const WEBP_PASSTHROUGH_MAX_BYTES = 400 * 1024;
const JPEG_QUALITY = 82;
const JPEG_SMALL_PASSTHROUGH_BYTES = 2.5 * 1024 * 1024;

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

const RASTER_COMPRESSIBLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_MAP = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "jpg",
  "image/webp": "webp",
  "image/heic": "webp",
  "image/heif": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: function (_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError(
      "LIMIT_UNEXPECTED_FILE",
      "Định dạng không hỗ trợ: " + (file.mimetype || "?") + " — chấp nhận JPG, PNG, WEBP, GIF, SVG."
    ));
  },
});

function randomId() {
  return crypto.randomUUID();
}

function sanitizeProductId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "new";
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

function supabaseForJwt(jwt) {
  const { url, anonKey } = supabasePublicEnv();
  if (!url || !anonKey) {
    throw new Error(
      "Thiếu SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL hoặc anon|publishable key trong .env trên server."
    );
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function handleUpload(req, res) {
  try {
    const authHeader = String(req.headers.authorization || "");
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!jwt) return res.status(401).json({ error: "Chưa xác thực — cần đăng nhập trước." });

    const sb = supabaseForJwt(jwt);
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }
    if (!req.file) return res.status(400).json({ error: "Không nhận được file ảnh." });

    let outBuffer, outMime, outExt;

    if (RASTER_COMPRESSIBLE.has(req.file.mimetype)) {
      if (req.file.mimetype === "image/webp") {
        const meta = await sharp(req.file.buffer).metadata();
        const srcW = meta.width || 0;
        const srcH = meta.height || 0;
        const withinDims = Math.max(srcW, srcH) <= WEBP_PASSTHROUGH_MAX_DIM;
        const withinBytes = req.file.size <= WEBP_PASSTHROUGH_MAX_BYTES;
        if (withinDims && withinBytes) {
          outBuffer = req.file.buffer;
          outMime = "image/webp";
          outExt = "webp";
        }
      }

      if (!outBuffer) {
        const meta = await sharp(req.file.buffer).metadata();
        const srcW = meta.width || 0;
        const srcH = meta.height || 0;
        const needsResize = Math.max(srcW, srcH) > MAX_DIM;
        const isSmallJpeg = (
          req.file.mimetype === "image/jpeg" &&
          !needsResize &&
          req.file.size <= JPEG_SMALL_PASSTHROUGH_BYTES
        );

        if (isSmallJpeg) {
          outBuffer = req.file.buffer;
          outMime = "image/jpeg";
        } else {
          let pipeline = sharp(req.file.buffer).rotate();
          if (needsResize) {
            pipeline = pipeline.resize(MAX_DIM, MAX_DIM, {
              fit: "inside",
              withoutEnlargement: true,
            });
          }
          outBuffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
          outMime = "image/jpeg";
        }
        outExt = outExt || "jpg";
      }
    } else {
      outBuffer = req.file.buffer;
      outMime = req.file.mimetype;
      outExt = EXT_MAP[req.file.mimetype] || "bin";
    }

    const productId = sanitizeProductId(req.body && req.body.productId);
    const basename = sanitizeBasename(req.file.originalname);
    const storagePath = `products/${productId}/thumbnail/${randomId()}-${basename}.${outExt}`;

    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(
      storagePath,
      outBuffer,
      { contentType: outMime, cacheControl: "31536000", upsert: false }
    );
    if (uploadErr) {
      const msg = uploadErr.message || "";
      if (/violates.*policy|insufficient_privilege|not authorized/i.test(msg)) {
        return res.status(403).json({ error: "Tài khoản không có quyền ghi vào storage." });
      }
      return res.status(502).json({ error: "Lưu ảnh lên storage thất bại: " + msg });
    }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    return res.json({
      path: storagePath,
      url: pub && pub.publicUrl ? pub.publicUrl : "",
    });
  } catch (err) {
    const msg = err && err.message ? err.message : "Upload thất bại.";
    const isConfig = /thiếu supabase_url|supabaseurl is required/i.test(msg);
    return res.status(isConfig ? 503 : 500).json({ error: msg });
  }
}

module.exports = function productImageRouter() {
  const router = express.Router();
  router.post(
    "/upload-image",
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
