"use client";

import { EnvelopeSimple, MapPin, PencilSimple, Phone, Trash } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { deleteCustomer } from "../actions";
import { customerInitials, formatPhoneDisplay, GROUP_LABEL, historyPayLabel } from "../labels";
import type { CustomerDetail } from "../types";
import { useState } from "react";

export function CustomerDetailModal({
  detail,
  onClose,
  onEdit,
  onSelect,
  onDeleted,
}: {
  detail: CustomerDetail;
  onClose: () => void;
  onEdit: () => void;
  onSelect?: (customer: CustomerDetail["customer"]) => void;
  onDeleted?: () => void;
}) {
  const { customer, history } = detail;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = !customer.isWalkIn && customer.saleCount === 0 && onDeleted;

  return (
    <Modal
      title="Thông tin khách hàng"
      wide
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
          >
            Hủy
          </button>
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(customer)}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
            >
              Chọn khách hàng
            </button>
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-[12px] border border-[var(--tlkv-line)] p-5 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-2xl font-bold text-[var(--tlkv-red)]">
            {customerInitials(customer.name)}
          </div>
          <p className="mt-3 text-[16px] font-semibold">{customer.name}</p>
          <span className="mt-2 inline-flex rounded-full bg-[var(--tlkv-red-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-red)]">
            {GROUP_LABEL[customer.customerGroup]}
          </span>
          <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">{customer.customerNo}</p>
          <ul className="mt-4 space-y-2 text-left text-[13px]">
            <li className="flex items-start gap-2">
              <Phone size={16} className="mt-0.5 text-[var(--tlkv-muted)]" />
              {formatPhoneDisplay(customer.phone) || "Không có SĐT"}
            </li>
            <li className="flex items-start gap-2">
              <EnvelopeSimple size={16} className="mt-0.5 text-[var(--tlkv-muted)]" />
              {customer.email || "Chưa có email"}
            </li>
            <li className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 text-[var(--tlkv-muted)]" />
              {customer.address || "Chưa có địa chỉ"}
            </li>
          </ul>
          {!customer.isWalkIn ? (
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
              >
                <PencilSimple size={14} />
                Chỉnh sửa
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteCustomer(customer.id);
                      onDeleted?.();
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : "Không xóa được");
                    }
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium text-[var(--tlkv-red)] hover:bg-[var(--tlkv-red-soft)]"
                >
                  <Trash size={14} />
                  Xóa
                </button>
              ) : null}
            </div>
          ) : null}
          {deleteError ? <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{deleteError}</p> : null}
        </aside>

        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Tổng mua hàng" value={formatDong(customer.totalDong)} />
            <Stat label="Số lần mua" value={String(customer.saleCount)} />
            <Stat label="Công nợ hiện tại" value={formatDong(customer.debtDong)} />
          </div>
          <h3 className="mt-5 text-[14px] font-semibold">Lịch sử mua/bán gần đây</h3>
          <table className="mt-2 w-full text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 font-medium">Loại</th>
                <th className="py-2 font-medium">Mã</th>
                <th className="py-2 font-medium">Ngày</th>
                <th className="py-2 font-medium">Số tiền</th>
                <th className="py-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--tlkv-muted)]">
                    Chưa có giao dịch hoàn tất.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.activityId} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.activityKind === "BUY"
                            ? "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
                            : "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                        }`}
                      >
                        {row.activityKind === "BUY" ? "Mua vào" : "Bán hàng"}
                      </span>
                    </td>
                    <td className="py-2.5 font-semibold text-[var(--tlkv-red)]">{row.docNo}</td>
                    <td className="py-2.5 text-[var(--tlkv-muted)]">
                      {formatViDateTime(row.issuedAt)}
                    </td>
                    <td className="py-2.5 font-medium">{formatDong(row.totalDong)}</td>
                    <td className="py-2.5">
                      <span className="rounded-full bg-[var(--tlkv-green-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-green)]">
                        {historyPayLabel(row)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--tlkv-line)] p-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[16px] font-bold">{value}</p>
    </div>
  );
}
