"use client";

import { useState, useTransition } from "react";
import { formatDong } from "@/shared/lib/money";
import { formatActionError } from "@/shared/lib/action-result";
import {
  confirmCashRequest,
  createCashRequestFromSale,
  refreshCashRequests,
  rejectCashRequest,
} from "./actions";
import { YcPrintPreviewOverlay } from "./YcPrintPreviewOverlay";
import type { CashRequestListPage, CashRequestRow } from "./types";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
};

export function CashRequestPanel({
  initialRequests,
  canMutateQueue,
  canAdminSeed,
  onBalancesChanged,
}: {
  initialRequests: CashRequestListPage;
  canMutateQueue: boolean;
  canAdminSeed: boolean;
  onBalancesChanged: () => void;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [saleId, setSaleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [printRow, setPrintRow] = useState<CashRequestRow | null>(null);
  const [pending, startTransition] = useTransition();

  function reload(status?: string) {
    startTransition(async () => {
      const res = await refreshCashRequests({
        status: status === undefined ? statusFilter || null : status || null,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setRequests(res.data);
    });
  }

  function onSeed() {
    if (!canAdminSeed || !saleId.trim()) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await createCashRequestFromSale({ saleId: saleId.trim() });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã tạo ${res.data.code}.`);
      setSaleId("");
      reload("PENDING");
      setStatusFilter("PENDING");
    });
  }

  function onConfirm(row: CashRequestRow) {
    if (!canMutateQueue || !row.canConfirm) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await confirmCashRequest(row.id);
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(
        res.data.alreadyConfirmed
          ? `${res.data.code} đã xác nhận trước đó.`
          : `Đã xác nhận ${res.data.code} → ${res.data.cashAccountCode}.`,
      );
      reload();
      onBalancesChanged();
    });
  }

  function onReject(row: CashRequestRow) {
    if (!canMutateQueue || !row.canReject) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await rejectCashRequest({ requestId: row.id, reason: "Từ chối từ Quỹ tiền" });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã từ chối ${res.data.code}. Trạng thái HĐ không đổi.`);
      reload();
    });
  }

  return (
    <section className={`rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)] ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[14px] font-semibold">Hàng đợi YC thu/chi</h2>
        <select
          className="h-9 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px]"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            reload(e.target.value);
          }}
        >
          <option value="">Tất cả</option>
          <option value="PENDING">Chờ xác nhận</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="REJECTED">Từ chối</option>
        </select>
        <button
          type="button"
          onClick={() => reload()}
          className="ml-auto h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
        >
          Làm mới
        </button>
      </div>
      <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">
        Số dư Quỹ tiền chỉ đổi khi xác nhận. Người xác nhận ghi nhận vào quỹ của mình (Admin không có quỹ
        NV → QT-ADMIN).
      </p>

      {canAdminSeed ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--tlkv-line)] p-3">
          <div className="min-w-[280px] flex-1">
            <label className="text-[11px] font-medium text-[var(--tlkv-muted)]">
              Seed YC-THU từ sale_id (hard-test / trước khi F9 tự tạo)
            </label>
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              placeholder="UUID sale…"
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={!saleId.trim() || pending}
            onClick={onSeed}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Tạo YC-THU
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
      {notice ? (
        <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px]">{notice}</p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã</th>
              <th className="py-2 pr-3 font-medium">Loại</th>
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 pr-3 font-medium">HĐ / phiếu</th>
              <th className="py-2 pr-3 font-medium">Số tiền</th>
              <th className="py-2 pr-3 font-medium">Tạo lúc</th>
              <th className="py-2 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {requests.items.map((row) => (
              <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                <td className="py-2.5 pr-3 font-semibold">{row.code}</td>
                <td className="py-2.5 pr-3">{row.kind === "CHI" ? "Chi" : "Thu"}</td>
                <td className="py-2.5 pr-3">{STATUS_LABEL[row.status] || row.status}</td>
                <td className="py-2.5 pr-3">{row.sourceCode || "—"}</td>
                <td className="py-2.5 pr-3 font-medium">{formatDong(row.amountDong)}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                <td className="py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPrintRow(row)}
                      className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                    >
                      In A4
                    </button>
                    {canMutateQueue && row.canConfirm ? (
                      <button
                        type="button"
                        onClick={() => onConfirm(row)}
                        className="h-8 rounded-lg bg-[var(--tlkv-red)] px-2.5 text-[12px] font-semibold text-white"
                      >
                        Xác nhận
                      </button>
                    ) : null}
                    {canMutateQueue && row.canReject ? (
                      <button
                        type="button"
                        onClick={() => onReject(row)}
                        className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                      >
                        Từ chối
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {requests.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[var(--tlkv-muted)]">
                  Chưa có yêu cầu thu/chi
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {printRow ? (
        <YcPrintPreviewOverlay request={printRow} onClose={() => setPrintRow(null)} />
      ) : null}
    </section>
  );
}
