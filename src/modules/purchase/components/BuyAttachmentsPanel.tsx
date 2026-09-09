"use client";

import { useRef, useState } from "react";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { IMAGE_PRESET_PRODUCT, optimizeImageFile } from "@/shared/lib/image-optimize";
import { formatViDateTime } from "@/shared/lib/datetime";
import { getBuyPdfSignedUrl, uploadBuyFile } from "../actions";
import type { BuyAttachmentDocKind, BuyDetail } from "../types";
import { buyAttachmentKindLabel } from "../workflowLabels";

/**
 * Related documents tab for a buy / purchase invoice detail.
 * Lists all uploads from the melt flow; supports download + optional late upload.
 */
export function BuyAttachmentsPanel({
  buy,
  onUpdated,
  allowUpload = true,
}: {
  buy: BuyDetail;
  onUpdated?: (next: BuyDetail) => void;
  allowUpload?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attachments = buy.attachments ?? [];
  const canUpload =
    allowUpload &&
    (buy.status === "COMPLETED" ||
      ["INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(String(buy.workflowStatus)));

  async function onDownload(storagePath: string, id: string, fileName: string) {
    setDownloadingId(id);
    try {
      const url = await getBuyPdfSignedUrl(storagePath);
      if (!url) {
        setError("Không tạo được link tải.");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "tai-lieu";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } finally {
      setDownloadingId(null);
    }
  }

  async function onUpload(file: File | null) {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    try {
      let next = file;
      const mime = (file.type || "").toLowerCase();
      const isPdf = mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf && mime.startsWith("image/")) {
        const optimized = await optimizeImageFile(file, IMAGE_PRESET_PRODUCT);
        next = optimized.file;
      }
      const fd = new FormData();
      fd.set("buyId", buy.id);
      fd.set("docKind", "RELATED" satisfies BuyAttachmentDocKind);
      fd.set("file", next);
      const result = await uploadBuyFile(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onUpdated?.(result.buy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload thất bại");
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">Tài liệu liên quan</p>
        {canUpload ? (
          <>
            <input
              id="buy-attachments-related-file"
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              tabIndex={-1}
              disabled={pending}
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="buy-attachments-related-file"
              aria-disabled={pending || undefined}
              className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[11px] font-medium ${
                pending ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <UploadSimple size={12} />
              {pending ? "Đang tải..." : "Thêm tài liệu"}
            </label>
          </>
        ) : null}
      </div>
      <p className="text-[11px] text-[var(--tlkv-muted)]">
        Gồm phiếu kiểm tra hàm lượng, tài liệu bước Phiếu 02 và PDF đã ký. PDF giữ nguyên; ảnh chuyển
        WebP. Upload lỗi không làm mất file cũ.
      </p>
      {error ? <p className="text-[12px] text-[var(--tlkv-red)]">{error}</p> : null}
      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--tlkv-line)] px-3 py-6 text-center text-[12px] text-[var(--tlkv-muted)]">
          Chưa có tài liệu đính kèm.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--tlkv-line)] rounded-[10px] border border-[var(--tlkv-line)]">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12px]">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.fileName}</p>
                <p className="text-[11px] text-[var(--tlkv-muted)]">
                  {buyAttachmentKindLabel(a.docKind)}
                  {a.createdAt ? ` · ${formatViDateTime(a.createdAt)}` : ""}
                  {a.byteSize != null ? ` · ${Math.round(a.byteSize / 1024)} KB` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={downloadingId === a.id}
                onClick={() => void onDownload(a.storagePath, a.id, a.fileName)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[11px] font-medium disabled:opacity-40"
              >
                <DownloadSimple size={12} />
                {downloadingId === a.id ? "..." : "Tải"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
