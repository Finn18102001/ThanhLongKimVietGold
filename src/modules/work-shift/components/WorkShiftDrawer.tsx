"use client";

import { X } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { closeReasonLabel, statusLabel, type WorkShiftRow } from "../types";

export function WorkShiftDrawer({
  row,
  onClose,
}: {
  row: WorkShiftRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25">
      <button type="button" className="flex-1 cursor-default" aria-label="Đóng" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-[var(--tlkv-shadow)]">
        <header className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)] uppercase">
              Chi tiết ca
            </p>
            <h2 className="mt-1 text-[16px] font-semibold">{row.employeeName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tlkv-line)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-5 text-[13px]">
          <Field label="Tài khoản" value={row.employeeEmail} />
          <Field label="Ngày làm việc" value={row.workDate} />
          <Field label="Mở ca" value={formatViDateTime(row.openedAt)} />
          <Field
            label="Đóng ca"
            value={row.closedAt ? formatViDateTime(row.closedAt) : "—"}
          />
          <Field label="Trạng thái" value={statusLabel(row.status)} />
          <Field label="Lý do đóng ca" value={closeReasonLabel(row.closeReason)} />
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--tlkv-line)] pb-3">
      <p className="text-[11px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 font-medium break-all">{value}</p>
    </div>
  );
}
