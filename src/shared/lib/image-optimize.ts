/**
 * Generic client image pipeline — same algorithm as admin Product/News
 * (`js/utils/image-optimizer.js` main-thread path): resize → WebP → adaptive quality.
 * No product/news/CCCD business logic here.
 */

export type ImageOptimizePreset = {
  id: string;
  maxWidth: number;
  maxHeight: number;
  targetMaxBytes: number;
  format: "image/webp";
  qualitySteps: number[];
};

/** Matches admin PRODUCT preset. */
export const IMAGE_PRESET_PRODUCT: ImageOptimizePreset = {
  id: "product",
  maxWidth: 1200,
  maxHeight: 1200,
  targetMaxBytes: 350 * 1024,
  format: "image/webp",
  qualitySteps: [0.85, 0.8, 0.75, 0.7, 0.65],
};

/** CCCD uses the same Product pipeline (req: reuse, do not invent a new convert path). */
export const IMAGE_PRESET_CCCD = IMAGE_PRESET_PRODUCT;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export type OptimizeImageResult = {
  file: File;
  skipped: boolean;
  stats: {
    originalBytes: number;
    optimizedBytes: number;
    originalWidth: number;
    originalHeight: number;
    optimizedWidth: number;
    optimizedHeight: number;
    quality: number | null;
    savedPercent: number;
  };
};

function normalizeMime(file: File): string {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

function fileExtension(name: string): string {
  const m = /\.([^.]+)$/.exec(name || "");
  return (m?.[1] || "").toLowerCase();
}

export function validateImageFile(file: File): void {
  if (!file || !(file instanceof File)) {
    throw new Error("Không có file ảnh.");
  }
  if (file.size <= 0) throw new Error("File ảnh trống.");
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Ảnh quá lớn (tối đa 10MB trước khi tối ưu).");
  }
  const mime = normalizeMime(file);
  const ext = fileExtension(file.name);
  if (mime && !ALLOWED_MIME.has(mime)) {
    throw new Error("Định dạng ảnh không hỗ trợ. Dùng JPEG, PNG hoặc WebP.");
  }
  if (!mime && ext && !["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(ext)) {
    throw new Error("Định dạng ảnh không hỗ trợ. Dùng JPEG, PNG hoặc WebP.");
  }
}

function computeDimensions(srcW: number, srcH: number, maxW: number, maxH: number) {
  if (srcW <= maxW && srcH <= maxH) {
    return { width: srcW, height: srcH };
  }
  const ratio = Math.min(maxW / srcW, maxH / srcH);
  return {
    width: Math.max(1, Math.round(srcW * ratio)),
    height: Math.max(1, Math.round(srcH * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không thể chuyển đổi ảnh sang WebP."));
      },
      type,
      quality,
    );
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const ext = fileExtension(file.name);
      if (ext === "heic" || ext === "heif") {
        reject(
          new Error(
            "Không đọc được HEIC trên trình duyệt này. Dùng Safari/iOS hoặc chuyển sang JPEG.",
          ),
        );
      } else {
        reject(new Error("Không đọc được ảnh. File có thể bị hỏng."));
      }
    };
    img.src = url;
  });
}

/**
 * Same Product/News client algorithm: skip already-optimal WebP, else resize + WebP quality ladder.
 */
export async function optimizeImageFile(
  file: File,
  preset: ImageOptimizePreset = IMAGE_PRESET_PRODUCT,
): Promise<OptimizeImageResult> {
  validateImageFile(file);

  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const mime = normalizeMime(file);

  if (
    mime === "image/webp" &&
    file.size <= preset.targetMaxBytes &&
    srcW <= preset.maxWidth &&
    srcH <= preset.maxHeight
  ) {
    return {
      file,
      skipped: true,
      stats: {
        originalBytes: file.size,
        optimizedBytes: file.size,
        originalWidth: srcW,
        originalHeight: srcH,
        optimizedWidth: srcW,
        optimizedHeight: srcH,
        quality: null,
        savedPercent: 0,
      },
    };
  }

  const dims = computeDimensions(srcW, srcH, preset.maxWidth, preset.maxHeight);
  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, dims.width, dims.height);

  let blob: Blob | null = null;
  let usedQuality = preset.qualitySteps[0] ?? 0.85;
  for (const q of preset.qualitySteps) {
    usedQuality = q;
    blob = await canvasToBlob(canvas, preset.format, q);
    if (blob.size <= preset.targetMaxBytes) break;
  }
  if (!blob) throw new Error("Không thể tối ưu ảnh.");

  const outName = String(file.name || "image").replace(/\.[^.]+$/, "") + ".webp";
  const optimized = new File([blob], outName, {
    type: "image/webp",
    lastModified: Date.now(),
  });
  const savedPercent =
    file.size > 0 ? Number(((1 - optimized.size / file.size) * 100).toFixed(1)) : 0;

  return {
    file: optimized,
    skipped: false,
    stats: {
      originalBytes: file.size,
      optimizedBytes: optimized.size,
      originalWidth: srcW,
      originalHeight: srcH,
      optimizedWidth: dims.width,
      optimizedHeight: dims.height,
      quality: usedQuality,
      savedPercent,
    },
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.readAsDataURL(file);
  });
}
