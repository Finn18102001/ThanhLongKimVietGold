"use client";

import { useMemo, useState } from "react";
import { FileXls, MagnifyingGlass } from "@phosphor-icons/react";
import { downloadCsv } from "@/shared/lib/csv";
import { formatViDate, formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/modules/invoice/types";
import type { CashObligationFilters, CashObligationRow, CashObligationSide } from "./types";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const SIDE_TABS: Array<{ id: CashObligationFilters["side"]; label: string }> = [
  { id: "ALL", label: "Tất cả" },
  { id: "RECEIVABLE", label: "Cần phải thu" },
  { id: "PAYABLE", label: "Cần phải chi" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "OPEN", label: "Còn công nợ" },
  { value: "ALL", label: "Tất cả trạng thái" },
  ...Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const TXN_LABEL: Record<string, string> = {
  SALE: "Bán ngay",
  PREORDER: "Đặt hàng",
  DEPOSIT: "Đặt cọc",
  BUY: "Mua từ khách",
  STOCK_RECEIPT: "Nhập hàng",
};

function statusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status;
}

function statusTone(status: string): string {
  if (status === "PAID") return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  if (status === "PARTIALLY_PAID") return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  if (status === "OVERDUE") return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
}

function sideLabel(side: CashObligationSide): string {
  return side === "RECEIVABLE" ? "Phải thu" : "Phải chi";
}

function applyFilters(rows: CashObligationRow[], filters: CashObligationFilters): CashObligationRow[] {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.side !== "ALL" && row.side !== filters.side) return false;
    const day = row.occurredAt.slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    if (filters.status === "OPEN") return row.remainingDong > 0;
    if (filters.status && filters.status !== "ALL" && row.paymentStatus !== filters.status) {
      return false;
    }
    if (q) {
      const haystack = [row.code, row.invoiceNo ?? "", row.partyName, row.actorEmail]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function CashObligationsTab({ rows }: { rows: CashObligationRow[] }) {
  const [side, setSide] = useState<CashObligationFilters["side"]>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => applyFilters(rows, { side, from, to, status, q }),
    [rows, side, from, to, status, q],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => {
          if (row.side === "RECEIVABLE") acc.receivable += row.remainingDong;
          else acc.payable += row.remainingDong;
          return acc;
        },
        { receivable: 0, payable: 0 },
      ),
    [filtered],
  );

  function patch(next: Partial<{ side: typeof side; from: string; to: string; status: string; q: string }>) {
    if (next.side !== undefined) setSide(next.side);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    if (next.status !== undefined) setStatus(next.status);
    if (next.q !== undefined) setQ(next.q);
    setPage(0);
  }

  function exportExcel() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `don-phai-thu-chi-${stamp}.csv`,
      [
        "Mã đơn",
        "Số hóa đơn",
        "Ngày giao dịch",
        "Khách hàng / đối tác",
        "Loại giao dịch",
        "Tổng tiền",
        "Đã thu / đã chi",
        "Còn phải thu / còn phải chi",
        "Trạng thái thanh toán",
        "Nhân viên thực hiện",
        "Ngày hẹn thanh toán",
      ],
      filtered.map((row) => [
        row.code,
        row.invoiceNo ?? "",
        formatViDateTime(row.occurredAt),
        row.partyName,
        `${sideLabel(row.side)} - ${TXN_LABEL[row.transactionType] ?? row.transactionType}`,
        row.totalDong,
        row.settledDong,
        row.remainingDong,
        statusLabel(row.paymentStatus),
        row.actorEmail,
        row.dueDate ? formatViDate(row.dueDate) : "",
      ]),
    );
  }

  const settledHeader = side === "PAYABLE" ? "Đã chi" : side === "RECEIVABLE" ? "Đã thu" : "Đã thu / đã chi";
  const remainHeader =
    side === "PAYABLE" ? "Còn phải chi" : side === "RECEIVABLE" ? "Còn phải thu" : "Còn lại";

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SIDE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => patch({ side: item.id })}
              className={`h-9 rounded-full px-3 text-[13px] font-medium active:scale-[0.98] ${
                side === item.id
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "bg-[var(--tlkv-bg)] hover:bg-[var(--tlkv-red-soft)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportExcel}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-semibold active:scale-[0.98]"
        >
          <FileXls size={15} />
          Xuất Excel
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => patch({ from: e.target.value })}
            className="mt-1 block h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(e) => patch({ to: e.target.value })}
            className="mt-1 block h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Trạng thái thanh toán
          <select
            value={status}
            onChange={(e) => patch({ status: e.target.value })}
            className="mt-1 block h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="relative text-[12px] text-[var(--tlkv-muted)]">
          Tìm đơn
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute top-[34px] left-3 text-[var(--tlkv-faint)]"
          />
          <input
            value={q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Mã đơn, hóa đơn, khách, nhân viên"
            className="mt-1 block h-10 w-[260px] rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] text-[var(--tlkv-text)]"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Summary label="Đơn đang xem" value={String(filtered.length)} />
        <Summary label="Còn phải thu" value={formatDong(totals.receivable)} tone="in" />
        <Summary label="Còn phải chi" value={formatDong(totals.payable)} tone="out" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã đơn / Hóa đơn</th>
              <th className="py-2 pr-3 font-medium">Ngày giao dịch</th>
              <th className="py-2 pr-3 font-medium">Khách hàng / đối tác</th>
              <th className="py-2 pr-3 font-medium">Loại giao dịch</th>
              <th className="py-2 pr-3 text-right font-medium">Tổng tiền</th>
              <th className="py-2 pr-3 text-right font-medium">{settledHeader}</th>
              <th className="py-2 pr-3 text-right font-medium">{remainHeader}</th>
              <th className="py-2 pr-3 font-medium">Trạng thái thanh toán</th>
              <th className="py-2 pr-3 font-medium">Nhân viên</th>
              <th className="py-2 font-medium">Ngày hẹn thanh toán</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-[var(--tlkv-muted)]">
                  Không có đơn công nợ phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]/60 last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <p className="font-medium">{row.code}</p>
                    {row.invoiceNo ? (
                      <p className="text-[11px] text-[var(--tlkv-muted)]">{row.invoiceNo}</p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                    {formatViDateTime(row.occurredAt)}
                  </td>
                  <td className="py-2.5 pr-3 max-w-[180px] truncate" title={row.partyName}>
                    {row.partyName}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span
                      className={`mr-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                        row.side === "RECEIVABLE"
                          ? "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
                          : "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
                      }`}
                    >
                      {sideLabel(row.side)}
                    </span>
                    {TXN_LABEL[row.transactionType] ?? row.transactionType}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatDong(row.totalDong)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--tlkv-green)]">
                    {formatDong(row.settledDong)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-[var(--tlkv-red)]">
                    {formatDong(row.remainingDong)}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone(row.paymentStatus)}`}
                    >
                      {statusLabel(row.paymentStatus)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 max-w-[140px] truncate text-[12px]" title={row.actorEmail}>
                    {row.actorEmail.split("@")[0] ?? row.actorEmail}
                  </td>
                  <td className="py-2.5 whitespace-nowrap tabular-nums">
                    {row.dueDate ? formatViDate(row.dueDate) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--tlkv-muted)]">
        <p>
          Trang {safePage + 1}/{pageCount} · {filtered.length} đơn
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span>Số dòng/trang</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px]"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Trước
          </button>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "in" | "out" }) {
  return (
    <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">{label}</p>
      <p
        className={`mt-1 text-[18px] font-bold tabular-nums ${
          tone === "in" ? "text-[var(--tlkv-green)]" : tone === "out" ? "text-[var(--tlkv-red)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
