"use client";

import { X } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import type { AuditLogRow } from "../types";

export function AuditDrawer({ row, onClose }: { row: AuditLogRow; onClose: () => void }) {
  const payloadEntries = Object.entries(row.payload ?? {});

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/25" />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-[-12px_0_40px_rgb(31_41_55/0.12)]">
        <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">Chi tiết audit</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--tlkv-bg)]">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          <dl className="space-y-2">
            <Row label="Thời gian" value={formatViDateTime(row.createdAt)} />
            <Row label="User" value={row.actorEmail} />
            <Row label="Module" value={row.entityType.toUpperCase()} />
            <Row label="Action" value={row.action} />
            <Row label="Entity ID" value={row.entityId ?? "—"} />
            <Row label="Lý do" value={row.reason ?? "—"} />
          </dl>

          {payloadEntries.length > 0 ? (
            <div className="mt-4">
              <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Payload / thay đổi</p>
              <table className="mt-2 w-full text-left text-[12px]">
                <thead className="text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-2 font-medium">Trường</th>
                    <th className="py-2 font-medium">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {payloadEntries.map(([key, value]) => (
                    <tr key={key} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2 pr-2 font-medium">{key}</td>
                      <td className="py-2 break-all text-[var(--tlkv-muted)]">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-[var(--tlkv-muted)]">Không có payload chi tiết.</p>
          )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--tlkv-line)] py-2">
      <dt className="text-[var(--tlkv-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
