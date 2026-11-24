"use client";

import { FolderOpen } from "@phosphor-icons/react";
import { formatPhoneDisplay } from "@/modules/customer/labels";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import type { BuyAwaitingFundRow } from "../types";

const PHASE_LABEL: Record<string, string> = {
  NEED_ISSUE: "Chưa in phiếu YC",
  AWAITING_FUND: "Chờ xác nhận QT",
  FUND_CONFIRMED: "Chờ Phiếu 02",
  FUND_REJECTED: "QT từ chối",
};

function phaseClass(phase: string): string {
  if (phase === "FUND_CONFIRMED") {
    return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  }
  if (phase === "FUND_REJECTED") {
    return "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]";
  }
  return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
}

export function PurchasePendingFundTable({
  items,
  seesAll,
  activeBuyId,
  loading,
  busyId,
  onOpen,
}: {
  items: BuyAwaitingFundRow[];
  seesAll: boolean;
  activeBuyId: string | null;
  loading: boolean;
  busyId: string | null;
  onOpen: (buyId: string) => void;
}) {
  const hint = seesAll
    ? "Phiếu mua chờ Quỹ tiền / chờ Phiếu 02. Admin thấy mọi phiếu đang xử lý."
    : "Phiếu mua bạn đã tạo — chờ Quỹ tiền xác nhận hoặc chờ hoàn tất Phiếu 02. Có thể tạo phiếu mới cho khách khác.";

  return (
    <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">
            Đơn mua đang chờ xác nhận ({items.length})
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">{hint}</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="text-[11px] font-medium text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã phiếu</th>
              <th className="py-2 pr-3 font-medium">Khách hàng</th>
              <th className="py-2 pr-3 font-medium">Số SP</th>
              <th className="py-2 pr-3 text-right font-medium">Tổng tiền</th>
              <th className="py-2 pr-3 font-medium">Tạo lúc</th>
              {seesAll ? <th className="py-2 pr-3 font-medium">Nhân viên</th> : null}
              <th className="py-2 pr-3 font-medium">Quỹ tiền</th>
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2].map((row) => (
                <tr key={row} className="border-b border-[var(--tlkv-line)]">
                  <td colSpan={seesAll ? 9 : 8} className="py-3">
                    <div className="h-8 animate-pulse rounded-md bg-[var(--tlkv-bg)]" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={seesAll ? 9 : 8}
                  className="py-8 text-center text-[13px] text-[var(--tlkv-muted)]"
                >
                  Chưa có đơn mua chờ xác nhận. Sau khi In phiếu YC-CHI, phiếu nằm đây — quầy trống
                  để nhận khách tiếp.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const active = item.buyId === activeBuyId;
                const busy = busyId === item.buyId;
                const fundLabel = item.cashAccountCode
                  ? item.cashAccountCode
                  : item.requestCode
                    ? `${item.requestCode} · chưa gán QT`
                    : "—";
                return (
                  <tr
                    key={item.buyId}
                    className={`border-b border-[var(--tlkv-line)] last:border-b-0 ${
                      active ? "bg-[var(--tlkv-red-soft)]" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-semibold">{item.buyNo}</td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{item.customerName || "—"}</p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">
                        {formatPhoneDisplay(item.customerPhone ?? "") || item.requestCode || ""}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">{item.itemCount || "—"}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold">
                      {formatDong(item.totalDong)}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                      {item.createdAt ? formatViDateTime(item.createdAt) : "—"}
                    </td>
                    {seesAll ? (
                      <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                        {item.actorEmail || "—"}
                      </td>
                    ) : null}
                    <td className="py-2.5 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                      {fundLabel}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${phaseClass(
                          item.fundPhase,
                        )}`}
                      >
                        {PHASE_LABEL[item.fundPhase] || item.fundPhase}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onOpen(item.buyId)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-semibold hover:bg-white active:scale-[0.98] disabled:opacity-40"
                        >
                          <FolderOpen size={14} />
                          Mở đơn
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
