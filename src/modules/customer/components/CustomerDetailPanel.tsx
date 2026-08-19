"use client";

import {
  ChatCircleDots,
  EnvelopeSimple,
  PencilSimple,
  Phone,
  Trash,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { formatViDateOnly } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { deleteCustomer } from "../actions";
import {
  customerInitials,
  formatPhoneDisplay,
  GENDER_LABEL,
  GROUP_LABEL,
  groupBadgeClass,
} from "../labels";
import type { CustomerDetail } from "../types";

export function CustomerDetailPanel({
  detail,
  onClose,
  onEdit,
  onDeleted,
}: {
  detail: CustomerDetail;
  onClose: () => void;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const { customer, history } = detail;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = !customer.isWalkIn && customer.saleCount === 0 && onDeleted;
  const phone = formatPhoneDisplay(customer.phone);
  const avgOrder =
    customer.saleCount > 0 ? Math.round(customer.totalDong / customer.saleCount) : 0;

  return (
    <aside className="flex h-full w-full max-w-[380px] shrink-0 flex-col rounded-[12px] border border-[var(--tlkv-line)] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">Chi tiết khách hàng</h2>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-xl font-bold text-[var(--tlkv-red)]">
            {customerInitials(customer.name)}
          </div>
          <p className="mt-3 text-[17px] font-semibold">{customer.name}</p>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{customer.customerNo}</p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${groupBadgeClass(customer.customerGroup)}`}
          >
            {GROUP_LABEL[customer.customerGroup]}
          </span>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {phone ? (
            <a
              href={`tel:${customer.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Gọi điện"
            >
              <Phone size={16} />
            </a>
          ) : null}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
            aria-label="Nhắn tin"
          >
            <ChatCircleDots size={16} />
          </button>
          {customer.email ? (
            <a
              href={`mailto:${customer.email}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Gửi email"
            >
              <EnvelopeSimple size={16} />
            </a>
          ) : null}
          {!customer.isWalkIn ? (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Chỉnh sửa"
            >
              <PencilSimple size={16} />
            </button>
          ) : null}
        </div>

        <section className="mt-5 space-y-2.5 text-[13px]">
          <InfoRow label="Ngày sinh" value={customer.dateOfBirth ? formatViDateOnly(customer.dateOfBirth) : "—"} />
          <InfoRow
            label="Giới tính"
            value={customer.gender ? GENDER_LABEL[customer.gender] : "—"}
          />
          <InfoRow label="Địa chỉ" value={customer.address || "—"} />
          <InfoRow label="Email" value={customer.email || "—"} />
          <InfoRow label="Nhóm" value={GROUP_LABEL[customer.customerGroup]} />
          <InfoRow label="Ngày tham gia" value={formatViDateOnly(customer.createdAt)} />
          <InfoRow label="Ghi chú" value={customer.note || "—"} />
        </section>

        <section className="mt-5">
          <h3 className="text-[13px] font-semibold">Tổng quan giao dịch</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniStat label="Tổng chi tiêu" value={formatDong(customer.totalDong)} />
            <MiniStat label="Số đơn hàng" value={String(customer.saleCount)} />
            <MiniStat label="TB / đơn" value={formatDong(avgOrder)} />
            <MiniStat
              label="Mua gần nhất"
              value={
                customer.saleCount > 0 ? formatViDateOnly(customer.lastActivityAt) : "—"
              }
            />
          </div>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Lịch sử giao dịch</h3>
            {history.length > 0 ? (
              <Link
                href={invoiceDetailPath(history[0].invoiceNo)}
                className="text-[12px] font-medium text-[var(--tlkv-red)] hover:underline"
              >
                Xem tất cả
              </Link>
            ) : null}
          </div>
          <ul className="mt-2 space-y-2">
            {history.length === 0 ? (
              <li className="rounded-lg border border-dashed border-[var(--tlkv-line)] px-3 py-4 text-center text-[12px] text-[var(--tlkv-muted)]">
                Chưa có giao dịch hoàn tất.
              </li>
            ) : (
              history.slice(0, 5).map((row) => (
                <li
                  key={row.invoiceId}
                  className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={invoiceDetailPath(row.invoiceNo)}
                        className="text-[13px] font-semibold text-[var(--tlkv-red)] hover:underline"
                      >
                        {row.invoiceNo}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-[var(--tlkv-muted)]">
                        {formatViDateOnly(row.issuedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold">{formatDong(row.totalDong)}</p>
                      <span className="mt-1 inline-flex rounded-full bg-[var(--tlkv-green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-green)]">
                        Hoàn tất
                      </span>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        {canDelete ? (
          <div className="mt-5 border-t border-[var(--tlkv-line)] pt-4">
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
              Xóa khách hàng
            </button>
            {deleteError ? (
              <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{deleteError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-[var(--tlkv-line)] pb-2 last:border-b-0">
      <span className="w-[96px] shrink-0 text-[var(--tlkv-muted)]">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
      <p className="text-[11px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-bold">{value}</p>
    </div>
  );
}
