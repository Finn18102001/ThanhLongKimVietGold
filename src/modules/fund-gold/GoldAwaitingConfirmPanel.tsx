"use client";

import { useState, useTransition } from "react";
import { formatDong } from "@/shared/lib/money";
import {
  confirmSaleGoldDelivery,
  refreshSalesAwaitingGold,
} from "./awaitingGoldActions";
import type { SaleAwaitingGoldRow } from "./types";

export function GoldAwaitingConfirmPanel({
  initialRows,
}: {
  initialRows: SaleAwaitingGoldRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await refreshSalesAwaitingGold();
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setRows(res.data.items);
      setMessage(null);
    });
  }

  function onConfirm(saleId: string) {
    startTransition(async () => {
      const res = await confirmSaleGoldDelivery(saleId);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setMessage(
        res.data.alreadyConfirmed
          ? `Đã xác nhận trước: ${res.data.invoiceNo}`
          : `Đã xác nhận trả vàng · ${res.data.invoiceNo}`,
      );
      const list = await refreshSalesAwaitingGold();
      if (list.ok) setRows(list.data.items);
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">Đơn chờ xác nhận trả vàng</h2>
          <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
            P10: sau khi Quỹ tiền xác nhận YC-THU, bấm xác nhận để trừ kho / giao vàng.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={pending}
          className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium disabled:opacity-50"
        >
          Làm mới
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px]">{message}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-[var(--tlkv-muted)]">Không có đơn chờ trả vàng.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.saleId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--tlkv-line)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--tlkv-red)]">
                  {row.invoiceNo || row.saleNo}
                </p>
                <p className="text-[12px] text-[var(--tlkv-muted)]">
                  {row.customerName || "—"} · {formatDong(row.totalDong)}
                  {row.pendingYcCount > 0
                    ? ` · Chờ QT (${row.pendingYcCount} YC)`
                    : row.canConfirmGold
                      ? " · QT đã xác nhận"
                      : " · Chưa có YC thu"}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !row.canConfirmGold}
                onClick={() => onConfirm(row.saleId)}
                className="h-9 shrink-0 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xác nhận trả vàng
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
