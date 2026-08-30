"use client";

import { IdentificationCard, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import { CCCD_DOC_LABEL } from "../labels";
import type { CccdDocumentType, CustomerDocument } from "../types";

const DOC_TYPES: CccdDocumentType[] = ["CCCD_FRONT", "CCCD_BACK"];

export type CccdPendingPhotos = Partial<Record<CccdDocumentType, File | null>>;

export function CccdFormPhotos({
  documents,
  pending,
  onPick,
  disabled,
}: {
  documents: CustomerDocument[];
  pending: CccdPendingPhotos;
  onPick: (type: CccdDocumentType, file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<CccdDocumentType | null>(null);

  const existing = useMemo(() => {
    const map: Partial<Record<CccdDocumentType, { url: string | null; stored: boolean }>> = {};
    for (const doc of documents) {
      map[doc.documentType] = { url: doc.signedUrl ?? null, stored: true };
    }
    return map;
  }, [documents]);

  return (
    <section className="rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] p-3">
      <div className="flex items-start gap-2">
        <IdentificationCard size={18} className="mt-0.5 shrink-0 text-[var(--tlkv-red)]" />
        <div>
          <p className="text-[13px] font-medium">Ảnh căn cước 2 mặt</p>
          <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
            JPEG, PNG hoặc WebP. Tối đa 5MB mỗi mặt. Ảnh lưu riêng tư, không công khai.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const type = pendingTypeRef.current;
          const file = event.target.files?.[0] ?? null;
          if (type) onPick(type, file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DOC_TYPES.map((type) => (
          <CccdFaceSlot
            key={type}
            type={type}
            file={pending[type] ?? null}
            existingUrl={existing[type]?.url ?? null}
            stored={Boolean(existing[type]?.stored)}
            disabled={disabled}
            onChoose={() => {
              pendingTypeRef.current = type;
              inputRef.current?.click();
            }}
            onClear={() => onPick(type, null)}
          />
        ))}
      </div>
    </section>
  );
}

function CccdFaceSlot({
  type,
  file,
  existingUrl,
  stored,
  disabled,
  onChoose,
  onClear,
}: {
  type: CccdDocumentType;
  file: File | null;
  existingUrl: string | null;
  stored?: boolean;
  disabled?: boolean;
  onChoose: () => void;
  onClear: () => void;
}) {
  const objectUrl = useObjectUrl(file);
  const preview = objectUrl ?? existingUrl;
  const hasNew = Boolean(file);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--tlkv-line)] bg-white">
      <div className="relative flex h-28 items-center justify-center bg-[var(--tlkv-bg)]">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={CCCD_DOC_LABEL[type]} className="h-full w-full object-cover" />
        ) : (
          <p className="px-3 text-center text-[11px] text-[var(--tlkv-muted)]">Chưa có ảnh</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium">{CCCD_DOC_LABEL[type]}</p>
          <p className="text-[11px] text-[var(--tlkv-muted)]">
            {hasNew ? "Ảnh mới, lưu khi bấm Lưu" : stored ? "Đã lưu" : "Tùy chọn"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {hasNew ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              aria-label={`Bỏ ${CCCD_DOC_LABEL[type]}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={onChoose}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--tlkv-red-soft)] px-2 text-[11px] font-semibold text-[var(--tlkv-red)] disabled:opacity-40"
          >
            <UploadSimple size={14} />
            {preview ? "Đổi" : "Tải lên"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}
