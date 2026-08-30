"use client";

import { ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { auditViewCccd, uploadCustomerCccd } from "../actions";
import { CCCD_DOC_LABEL } from "../labels";
import type { CccdDocumentType, CustomerDocument } from "../types";

const DOC_TYPES: CccdDocumentType[] = ["CCCD_FRONT", "CCCD_BACK"];

export function CccdDocumentsSection({
  customerId,
  documents,
  onUpdated,
}: {
  customerId: string;
  documents: CustomerDocument[];
  onUpdated: (docs: CustomerDocument[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<CccdDocumentType | null>(null);
  const [pendingType, setPendingType] = useState<CccdDocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  function docFor(type: CccdDocumentType) {
    return documents.find((doc) => doc.documentType === type) ?? null;
  }

  async function onPickFile(type: CccdDocumentType, file: File | null) {
    if (!file) return;
    setPendingType(type);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const saved = await uploadCustomerCccd({
        customerId,
        documentType: type,
        fileName: file.name,
        contentType: file.type,
        base64,
      });
      const next = documents.filter((doc) => doc.documentType !== type).concat(saved);
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được ảnh CCCD");
    } finally {
      setPendingType(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openPreview(doc: CustomerDocument) {
    if (!doc.signedUrl) return;
    await auditViewCccd(customerId, doc.documentType);
    setViewing(doc.signedUrl);
  }

  return (
    <section className="mt-5">
      <h3 className="text-[13px] font-semibold">Ảnh CCCD</h3>
      <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
        Lưu trữ riêng tư. Chỉ xem qua liên kết có thời hạn.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const type = pendingTypeRef.current;
          const file = event.target.files?.[0] ?? null;
          if (type) void onPickFile(type, file);
        }}
      />
      <div className="mt-2 grid grid-cols-1 gap-2">
        {DOC_TYPES.map((type) => {
          const doc = docFor(type);
          const loading = pendingType === type;
          return (
            <div
              key={type}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--tlkv-line)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium">{CCCD_DOC_LABEL[type]}</p>
                <p className="text-[11px] text-[var(--tlkv-muted)]">
                  {doc ? "Đã tải lên" : "Chưa có ảnh"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {doc?.signedUrl ? (
                  <button
                    type="button"
                    onClick={() => void openPreview(doc)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2 text-[11px] font-medium hover:bg-[var(--tlkv-bg)]"
                  >
                    <ImageSquare size={14} />
                    Xem
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    pendingTypeRef.current = type;
                    setPendingType(type);
                    inputRef.current?.click();
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--tlkv-red-soft)] px-2 text-[11px] font-semibold text-[var(--tlkv-red)] disabled:opacity-40"
                >
                  <UploadSimple size={14} />
                  {loading ? "Đang tải..." : doc ? "Thay ảnh" : "Tải lên"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{error}</p> : null}
      {viewing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] max-w-lg overflow-auto rounded-xl bg-white p-3 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing} alt="Ảnh CCCD" className="max-h-[70vh] w-full rounded-lg object-contain" />
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mt-3 h-9 w-full rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium"
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}
