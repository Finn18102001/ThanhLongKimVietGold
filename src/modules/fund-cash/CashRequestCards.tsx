"use client";

import { useMemo, useState, useTransition } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatActionError } from "@/shared/lib/action-result";
import { Modal } from "@/shared/ui/Modal";
import {
  confirmCashRequest,
  refreshCashRequests,
  rejectCashRequest,
} from "./actions";
import { YcPrintPreviewOverlay } from "./YcPrintPreviewOverlay";
import type { CashRequestKind, CashRequestListPage, CashRequestRow } from "./types";

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
  REVERSED: "Đã đảo (hủy HĐ)",
};

/**
 * Card grid for Quỹ tiền clerk on Bán/Mua — compact summary, detail on click.
 * UI-first: template admin cards; confirm/reject wired but hard-test may focus layout.
 */
export function CashRequestCards({
  kind,
  title,
  subtitle,
  initialRequests,
  canAct,
  embedded = false,
}: {
  kind: CashRequestKind;
  title: string;
  subtitle: string;
  initialRequests: CashRequestListPage;
  canAct: boolean;
  /** true = khối trong /fund-cash; false = full shell Bán/Mua */
  embedded?: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CashRequestRow | null>(null);
  const [printRow, setPrintRow] = useState<CashRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.items.filter((row) => {
      if (row.kind !== kind) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.code,
        row.sourceCode,
        row.customerName,
        row.relatedStaffName,
        String(row.amountDong),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests.items, kind, statusFilter, query]);

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

  function onConfirm(row: CashRequestRow) {
    if (!canAct || !row.canConfirm) return;
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
          ? `${res.data.code} đã xác nhận trước.`
          : `Đã xác nhận ${res.data.code}.`,
      );
      setSelected(null);
      reload();
    });
  }

  function onReject(row: CashRequestRow) {
    if (!canAct || !row.canReject) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await rejectCashRequest({
        requestId: row.id,
        reason: "Từ chối từ Quỹ tiền (UI)",
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã từ chối ${res.data.code}.`);
      setSelected(null);
      reload();
    });
  }

  const shellClass = embedded
    ? `rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)] ${pending ? "opacity-80" : ""}`
    : `-mx-6 -my-5 flex min-h-[calc(100dvh-8rem)] flex-col bg-[var(--tlkv-bg)] ${pending ? "opacity-80" : ""}`;
  const innerClass = embedded
    ? "space-y-4"
    : "flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-6 py-4";

  return (
    <div className={shellClass}>
      <div className={innerClass}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className={embedded ? "text-[15px] font-semibold" : "text-[18px] font-semibold"}>
              {title}
            </h1>
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px]"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                reload(e.target.value);
              }}
            >
              <option value="PENDING">Chờ xác nhận</option>
              <option value="CONFIRMED">Đã xác nhận</option>
              <option value="REJECTED">Từ chối</option>
              <option value="">Tất cả</option>
            </select>
            <button
              type="button"
              onClick={() => reload()}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
            >
              Làm mới
            </button>
          </div>
        </div>

        <label className="relative max-w-xl">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã YC / hóa đơn / khách…"
            className="h-10 w-full rounded-full border border-[var(--tlkv-line)] bg-white pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>

        {error ? <p className="text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
        {notice ? (
          <p className="rounded-lg bg-white px-3 py-2 text-[13px] shadow-[var(--tlkv-shadow)]">{notice}</p>
        ) : null}

        {cards.length === 0 ? (
          <div className="rounded-[12px] bg-white p-8 text-center text-[13px] text-[var(--tlkv-muted)] shadow-[var(--tlkv-shadow)]">
            Không có phiếu {kind === "THU" ? "thu" : "chi"} phù hợp bộ lọc.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row)}
                className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-4 text-left shadow-[var(--tlkv-shadow)] transition hover:border-[var(--tlkv-red)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[var(--tlkv-red)]">{row.code}</p>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      row.status === "PENDING"
                        ? "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
                        : row.status === "CONFIRMED"
                          ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
                          : "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]"
                    }`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </div>
                <p className="mt-2 text-[13px] font-medium">
                  {row.sourceCode || row.sourceId.slice(0, 8)}
                </p>
                <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
                  {row.customerName || "— khách —"}
                </p>
                <p className="mt-3 text-[16px] font-semibold tabular-nums">
                  {formatDong(row.amountDong)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--tlkv-faint)]">{formatWhen(row.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <Modal
          title={selected.code}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => setPrintRow(selected)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                In phiếu
              </button>
              {canAct && selected.canReject ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onReject(selected)}
                  className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium disabled:opacity-40"
                >
                  Từ chối
                </button>
              ) : null}
              {canAct && selected.canConfirm ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onConfirm(selected)}
                  className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Xác nhận
                </button>
              ) : null}
            </>
          }
        >
          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[var(--tlkv-muted)]">Loại</dt>
              <dd className="font-semibold">{selected.kind === "THU" ? "THU TIỀN" : "CHI TIỀN"}</dd>
            </div>
            <div>
              <dt className="text-[var(--tlkv-muted)]">Trạng thái</dt>
              <dd className="font-semibold">{STATUS_LABEL[selected.status]}</dd>
            </div>
            <div>
              <dt className="text-[var(--tlkv-muted)]">Hóa đơn / phiếu</dt>
              <dd className="font-semibold">{selected.sourceCode || selected.sourceId}</dd>
            </div>
            <div>
              <dt className="text-[var(--tlkv-muted)]">Số tiền</dt>
              <dd className="font-semibold tabular-nums">{formatDong(selected.amountDong)}</dd>
            </div>
            <div>
              <dt className="text-[var(--tlkv-muted)]">Khách</dt>
              <dd>{selected.customerName || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--tlkv-muted)]">CCCD</dt>
              <dd>{selected.customerCccd || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--tlkv-muted)]">NV / Quỹ vàng liên quan</dt>
              <dd>
                {[selected.relatedStaffName, selected.relatedGoldAccountCode]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--tlkv-muted)]">Nội dung</dt>
              <dd>{selected.content || "—"}</dd>
            </div>
          </dl>
          {selected.lines.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-2 pr-2 font-medium">Hàng</th>
                    <th className="py-2 pr-2 font-medium">HL</th>
                    <th className="py-2 pr-2 font-medium">KL</th>
                    <th className="py-2 font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line, i) => (
                    <tr key={`${selected.id}-line-${i}`} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2 pr-2">{line.name}</td>
                      <td className="py-2 pr-2">{line.purity || "—"}</td>
                      <td className="py-2 pr-2">{line.weight ?? "—"}</td>
                      <td className="py-2 tabular-nums">
                        {line.amountDong != null ? formatDong(line.amountDong) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {printRow ? (
        <YcPrintPreviewOverlay request={printRow} onClose={() => setPrintRow(null)} />
      ) : null}
    </div>
  );
}
