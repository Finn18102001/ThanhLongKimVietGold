"use client";

import { FolderOpen, Trash } from "@phosphor-icons/react";
import { formatPhoneDisplay } from "@/modules/customer/labels";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import type { SaleAwaitingGoldRow } from "@/modules/fund-gold/types";
import { HELD_ORDER_STATUS_LABEL } from "../labels";
import type { HeldOrderListItem } from "../types";

export function PosHeldOrdersTable({
  items,
  awaitingGold = [],
  visibleToAll,
  seesAll,
  activeHoldId,
  loading,
  busyId,
  onResume,
  onCancel,
  onOpenAwaitingGold,
}: {
  items: HeldOrderListItem[];
  awaitingGold?: SaleAwaitingGoldRow[];
  visibleToAll: boolean;
  seesAll: boolean;
  activeHoldId: string | null;
  loading: boolean;
  busyId: string | null;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenAwaitingGold?: (row: SaleAwaitingGoldRow) => void;
}) {
  const showSaver = seesAll;
  const totalRows = items.length + awaitingGold.length;
  const hint = visibleToAll
    ? "Chưa thanh toán / chờ quỹ. Mọi tài khoản quầy đều thấy danh sách này."
    : seesAll
      ? "Chưa thanh toán / chờ quỹ. Admin thấy mọi đơn lưu trong hệ thống."
      : "Chưa thanh toán / chờ quỹ. Chỉ tài khoản đã lưu mới thấy và mở lại được.";

  return (
    <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">Đơn đã lưu ({totalRows})</h2>
          <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">{hint}</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-[11px] font-medium text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã đơn</th>
              <th className="py-2 pr-3 font-medium">Khách hàng</th>
              <th className="py-2 pr-3 font-medium">Số SP</th>
              <th className="py-2 pr-3 text-right font-medium">Tạm tính</th>
              <th className="py-2 pr-3 font-medium">Lưu lúc</th>
              {showSaver ? <th className="py-2 pr-3 font-medium">Nhân viên</th> : null}
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2].map((row) => (
                <tr key={row} className="border-b border-[var(--tlkv-line)]">
                  <td colSpan={showSaver ? 8 : 7} className="py-3">
                    <div className="h-8 animate-pulse rounded-md bg-[var(--tlkv-bg)]" />
                  </td>
                </tr>
              ))
            ) : totalRows === 0 ? (
              <tr>
                <td
                  colSpan={showSaver ? 8 : 7}
                  className="py-8 text-center text-[13px] text-[var(--tlkv-muted)]"
                >
                  Chưa có đơn lưu.
                </td>
              </tr>
            ) : (
              <>
                {awaitingGold.map((row) => {
                  const busy = busyId === row.saleId;
                  const statusLabel = row.canConfirmGold
                    ? "Chờ trả vàng"
                    : "Chờ xác nhận QT";
                  return (
                    <tr key={`gold-${row.saleId}`} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2.5 pr-3 font-semibold">
                        {row.invoiceNo || row.saleNo}
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{row.customerName || "—"}</p>
                        <p className="text-[12px] text-[var(--tlkv-muted)]">{row.saleNo}</p>
                      </td>
                      <td className="py-2.5 pr-3">—</td>
                      <td className="py-2.5 pr-3 text-right font-semibold">
                        {formatDong(row.totalDong)}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                        {row.createdAt ? formatViDateTime(row.createdAt) : "—"}
                      </td>
                      {showSaver ? (
                        <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">—</td>
                      ) : null}
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            row.canConfirmGold
                              ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                              : "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy || !onOpenAwaitingGold}
                            onClick={() => onOpenAwaitingGold?.(row)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-semibold hover:bg-white active:scale-[0.98] disabled:opacity-40"
                          >
                            <FolderOpen size={14} />
                            Mở đơn
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.map((item) => {
                  const active = item.id === activeHoldId;
                  const busy = busyId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-[var(--tlkv-line)] last:border-b-0 ${
                        active ? "bg-[var(--tlkv-red-soft)]" : ""
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-semibold">{item.holdNo}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{item.customerName}</p>
                        <p className="text-[12px] text-[var(--tlkv-muted)]">
                          {item.isWalkIn
                            ? "Khách vãng lai"
                            : formatPhoneDisplay(item.customerPhone) || item.customerNo || ""}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">{item.itemCount}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold">
                        {formatDong(item.estimatedTotalDong)}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                        {formatViDateTime(item.updatedAt || item.createdAt)}
                      </td>
                      {showSaver ? (
                        <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                          {item.savedByEmail}
                        </td>
                      ) : null}
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
                          {HELD_ORDER_STATUS_LABEL}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onResume(item.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-semibold hover:bg-white active:scale-[0.98] disabled:opacity-40"
                          >
                            <FolderOpen size={14} />
                            Mở đơn
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onCancel(item.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-red-soft)] hover:text-[var(--tlkv-red)] active:scale-[0.98] disabled:opacity-40"
                          >
                            <Trash size={14} />
                            Hủy
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
