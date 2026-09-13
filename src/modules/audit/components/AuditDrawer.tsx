"use client";

import { X } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import type { AuditLogRow } from "../types";
import { formatAuditPayloadSections, type AuditDetailSection } from "../snapshotDisplay";

export function AuditDrawer({ row, onClose }: { row: AuditLogRow; onClose: () => void }) {
  const sections = formatAuditPayloadSections(row.action, row.payload);
  const leftover = leftoverPayloadEntries(row.payload, sections);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/25" />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-[-12px_0_40px_rgb(31_41_55/0.12)]">
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">Chi tiết nhật ký</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--tlkv-bg)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          <dl className="space-y-2">
            <Row label="Thời gian" value={formatViDateTime(row.createdAt)} />
            <Row label="Người thực hiện" value={row.actorEmail} />
            <Row label="Phân hệ" value={row.entityType.toUpperCase()} />
            <Row label="Thao tác" value={row.action} />
            <Row label="Mã đối tượng" value={row.entityId ?? "—"} />
            <Row label="Lý do" value={row.reason ?? "—"} />
          </dl>

          {sections.length > 0 ? (
            <div className="mt-4 space-y-4">
              {sections.map((section) => (
                <SnapshotSection key={section.title} section={section} />
              ))}
            </div>
          ) : null}

          {leftover.length > 0 ? (
            <div className="mt-4">
              <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">
                {sections.length > 0 ? "Thông tin kỹ thuật" : "Thông tin chi tiết"}
              </p>
              <dl className="mt-1 space-y-0">
                {leftover.map(([key, value]) => (
                  <Row
                    key={key}
                    label={key}
                    value={typeof value === "object" ? JSON.stringify(value) : String(value)}
                  />
                ))}
              </dl>
            </div>
          ) : null}

          {sections.length === 0 && leftover.length === 0 ? (
            <p className="mt-4 text-[12px] text-[var(--tlkv-muted)]">Không có thông tin chi tiết thêm.</p>
          ) : null}
        </div>
        <div className="border-t border-[var(--tlkv-line)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </div>
      </aside>
    </div>
  );
}

function SnapshotSection({ section }: { section: AuditDetailSection }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">{section.title}</p>
      {section.rows ? (
        <dl className="mt-1 space-y-0">
          {section.rows.map((row) => (
            <Row key={`${section.title}-${row.label}`} label={row.label} value={row.value} />
          ))}
        </dl>
      ) : null}
      {section.blocks?.map((block, index) => (
        <dl
          key={`${section.title}-block-${index}`}
          className="mt-2 space-y-0 border-t border-[var(--tlkv-line)] pt-2 first:mt-1 first:border-t-0 first:pt-0"
        >
          {block.map((row) => (
            <Row key={`${section.title}-${index}-${row.label}`} label={row.label} value={row.value} />
          ))}
        </dl>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--tlkv-line)] py-2">
      <dt className="text-[var(--tlkv-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

const SNAPSHOT_CONSUMED_KEYS = new Set([
  "snapshot",
  "invoice_no",
  "sale_id",
  "sale_no",
  "buyNo",
  "receipt_no",
  "total_dong",
  "totalDong",
  "paid_dong",
  "paidDong",
  "transaction_type",
  "fulfillment_status",
  "goods_status_before",
  "debt_net_before",
  "stock_restored",
  "stockReversed",
  "stock_reversed",
  "cash_refunded",
  "cashReclaimed",
]);

function leftoverPayloadEntries(
  payload: Record<string, unknown> | null | undefined,
  sections: AuditDetailSection[],
): Array<[string, unknown]> {
  if (!payload) return [];
  if (sections.length === 0) return Object.entries(payload);
  return Object.entries(payload).filter(([key]) => !SNAPSHOT_CONSUMED_KEYS.has(key));
}
