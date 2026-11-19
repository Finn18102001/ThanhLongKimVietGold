"use client";

import { useState, useTransition } from "react";
import { formatDong } from "@/shared/lib/money";
import { DongNumberInput } from "@/shared/ui/DongInput";
import { formatActionError } from "@/shared/lib/action-result";
import {
  cancelCashTransfer,
  confirmCashTransfer,
  createCashTransfer,
  refreshCashTransfers,
} from "./actions";
import { CtctTransferDocument } from "./CtctTransferDocument";
import type { CashTransferListPage, CashTransferRow, EmployeeCashAccount } from "./types";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã hủy",
};

export function CashTransferPanel({
  staffAccounts,
  initialTransfers,
  canCreate,
  onBalancesChanged,
}: {
  staffAccounts: EmployeeCashAccount[];
  initialTransfers: CashTransferListPage;
  canCreate: boolean;
  onBalancesChanged: () => void;
}) {
  const [transfers, setTransfers] = useState(initialTransfers);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amountDong, setAmountDong] = useState<number | null>(null);
  const [content, setContent] = useState("Chuyển tiền giữa quỹ nhân viên");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [printRow, setPrintRow] = useState<CashTransferRow | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await refreshCashTransfers();
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setTransfers(res.data);
    });
  }

  function onCreate() {
    if (!canCreate || !fromId || !toId || !amountDong || amountDong <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await createCashTransfer({
        fromAccountId: fromId,
        toAccountId: toId,
        amountDong,
        content,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã tạo ${res.data.code}. Số dư chưa đổi — chờ bên nhận xác nhận.`);
      setAmountDong(null);
      reload();
    });
  }

  function onConfirm(id: string) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await confirmCashTransfer(id);
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(
        res.data.alreadyConfirmed
          ? `${res.data.code} đã được xác nhận trước đó.`
          : `Đã xác nhận ${res.data.code}. Số dư hai quỹ đã cập nhật.`,
      );
      reload();
      onBalancesChanged();
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await cancelCashTransfer({ transferId: id, reason: "Hủy trên UI" });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã hủy ${res.data.code}.`);
      reload();
    });
  }

  function onPrint(row: CashTransferRow) {
    setPrintRow(row);
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <section className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[14px] font-semibold">Chuyển tiền CTCT</h2>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Tạo chứng từ → in A4 → bên nhận bấm Đã xác nhận. Trước xác nhận số dư không đổi.
        </p>

        {canCreate ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <select
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <option value="">Từ quỹ…</option>
              {staffAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.staffName || a.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">Đến quỹ…</option>
              {staffAccounts
                .filter((a) => a.id !== fromId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.staffName || a.name}
                  </option>
                ))}
            </select>
            <DongNumberInput
              value={amountDong}
              onValueChange={setAmountDong}
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <button
              type="button"
              disabled={!fromId || !toId || !amountDong || amountDong <= 0 || pending}
              onClick={onCreate}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Tạo CTCT
            </button>
            <input
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] md:col-span-2 lg:col-span-4"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung"
            />
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-[var(--tlkv-muted)]">Tài khoản chỉ xem — không tạo CTCT.</p>
        )}

        {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
        {notice ? (
          <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px]">{notice}</p>
        ) : null}
      </div>

      <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold">Danh sách chứng từ</h2>
          <button
            type="button"
            onClick={reload}
            className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
          >
            Làm mới
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 pr-3 font-medium">Mã</th>
                <th className="py-2 pr-3 font-medium">Trạng thái</th>
                <th className="py-2 pr-3 font-medium">Từ</th>
                <th className="py-2 pr-3 font-medium">Đến</th>
                <th className="py-2 pr-3 font-medium">Số tiền</th>
                <th className="py-2 pr-3 font-medium">Tạo lúc</th>
                <th className="py-2 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {transfers.items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2.5 pr-3 font-semibold">{row.code}</td>
                  <td className="py-2.5 pr-3">{STATUS_LABEL[row.status] || row.status}</td>
                  <td className="py-2.5 pr-3">
                    {row.fromAccountCode}
                    <span className="block text-[12px] text-[var(--tlkv-muted)]">
                      {row.fromStaffName}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.toAccountCode}
                    <span className="block text-[12px] text-[var(--tlkv-muted)]">
                      {row.toStaffName}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-medium">{formatDong(row.amountDong)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPrint(row)}
                        className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                      >
                        In A4
                      </button>
                      {row.status === "PENDING" && row.canConfirm ? (
                        <button
                          type="button"
                          onClick={() => onConfirm(row.id)}
                          className="h-8 rounded-lg bg-[var(--tlkv-red)] px-2.5 text-[12px] font-semibold text-white"
                        >
                          Đã xác nhận
                        </button>
                      ) : null}
                      {row.status === "PENDING" && row.canCancel ? (
                        <button
                          type="button"
                          onClick={() => onCancel(row.id)}
                          className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                        >
                          Hủy
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {transfers.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--tlkv-muted)]">
                    Chưa có chứng từ CTCT
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {printRow ? (
        <div className="hidden print:block">
          <CtctTransferDocument transfer={printRow} />
        </div>
      ) : null}
    </section>
  );
}
