/**
 * TLKV Image Optimizer — Web Worker
 *
 * Runs decode → resize → WebP encode → adaptive compression off the main thread.
 * Communicates via postMessage; returns transferable ArrayBuffer on success.
 */
"use strict";

var QUALITY_STEPS = [0.85, 0.80, 0.75, 0.70, 0.65];
var WEBP_MIME = "image/webp";

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

function postPhase(id, phase, progress) {
  self.postMessage({ type: "progress", id: id, phase: phase, progress: progress });
}

async function encodeAdaptive(canvas, targetMaxBytes, jobId) {
  var resultBlob = null;
  var usedQuality = QUALITY_STEPS[0];

  for (var i = 0; i < QUALITY_STEPS.length; i++) {
    usedQuality = QUALITY_STEPS[i];
    postPhase(jobId, i === 0 ? "convert" : "compress", i === 0 ? 0.5 : 0.75);
    resultBlob = await canvas.convertToBlob({ type: WEBP_MIME, quality: usedQuality });
    if (resultBlob.size <= targetMaxBytes) break;
    if (usedQuality === 0.65) break;
  }

  return { blob: resultBlob, quality: usedQuality };
}

async function processJob(job) {
  var id = job.id;
  var config = job.config;
  var mime = job.mime;
  var fileName = job.fileName;
  var startedAt = performance.now();

  postPhase(id, "validate", 0.1);

  var inputBlob = new Blob([job.buffer], { type: mime });
  var bitmap;
  try {
    bitmap = await createImageBitmap(inputBlob);
  } catch (e) {
    throw new Error("Không đọc được ảnh. File có thể bị hỏng hoặc định dạng không được hỗ trợ.");
  }

  var srcW = bitmap.width;
  var srcH = bitmap.height;
  var originalBytes = job.buffer.byteLength;

  if (
    mime === WEBP_MIME &&
    originalBytes <= config.targetMaxBytes &&
    srcW <= config.maxWidth &&
    srcH <= config.maxHeight
  ) {
    bitmap.close();
    self.postMessage({
      type: "result",
      id: id,
      skipped: true,
      buffer: job.buffer,
      mime: mime,
      fileName: fileName,
      stats: {
        originalBytes: originalBytes,
        optimizedBytes: originalBytes,
        originalWidth: srcW,
        originalHeight: srcH,
        optimizedWidth: srcW,
        optimizedHeight: srcH,
        quality: null,
        skipped: true,
        processingMs: Math.round(performance.now() - startedAt),
        savedPercent: 0,
      },
    });
    return;
  }

  postPhase(id, "resize", 0.25);
  var dims = computeDimensions(srcW, srcH, config.maxWidth, config.maxHeight);
  var canvas = new OffscreenCanvas(dims.width, dims.height);
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("Worker không khởi tạo được canvas.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
  bitmap.close();

  var encoded = await encodeAdaptive(canvas, config.targetMaxBytes, id);
  var outBuffer = await encoded.blob.arrayBuffer();
  var optimizedBytes = outBuffer.byteLength;
  var savedPercent = originalBytes > 0
    ? Number(((1 - optimizedBytes / originalBytes) * 100).toFixed(1))
    : 0;

  var outName = String(fileName || "image").replace(/\.[^.]+$/, "") + ".webp";

  self.postMessage({
    type: "result",
    id: id,
    skipped: false,
    buffer: outBuffer,
    mime: WEBP_MIME,
    fileName: outName,
    stats: {
      originalBytes: originalBytes,
      optimizedBytes: optimizedBytes,
      originalWidth: srcW,
      originalHeight: srcH,
      optimizedWidth: dims.width,
      optimizedHeight: dims.height,
      quality: encoded.quality,
      skipped: false,
      resized: dims.resized,
      processingMs: Math.round(performance.now() - startedAt),
      savedPercent: savedPercent,
    },
  }, [outBuffer]);
}

self.onmessage = function (event) {
  var data = event.data;
  if (!data || data.type !== "optimize") return;

  processJob(data).catch(function (err) {
    self.postMessage({
      type: "error",
      id: data.id,
      message: (err && err.message) ? err.message : "Xử lý ảnh thất bại trong worker.",
    });
  });
};
