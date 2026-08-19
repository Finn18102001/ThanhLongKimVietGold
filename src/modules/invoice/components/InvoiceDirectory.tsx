"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { fetchInvoiceDetail, searchInvoices } from "../actions";
import {
  formatInvoicePhone,
  invoiceStatusLabel,
  paymentBadgeClass,
  paymentLabel,
} from "../labels";
import type { InvoiceDetail, InvoiceListPage } from "../types";
import { InvoiceDrawer } from "./InvoiceDrawer";

const PAGE_SIZES = [5, 10, 20] as const;

export function InvoiceDirectory({ initial }: { initial: InvoiceListPage }) {
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "CASH" | "TRANSFER" | "CARD">("");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [pending, startTransition] = useTransition();

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));
  const fromRow = page.total === 0 ? 0 : page.offset + 1;
  const toRow = Math.min(page.offset + page.items.length, page.total);

  const pages = useMemo(() => pageNumbers(currentPage, pageCount), [currentPage, pageCount]);

  function refresh(next: {
    query?: string;
    from?: string;
    to?: string;
    paymentMethod?: "" | "CASH" | "TRANSFER" | "CARD";
    limit?: number;
    offset?: number;
  }) {
    const nextQuery = next.query ?? query;
    const nextFrom = next.from ?? from;
    const nextTo = next.to ?? to;
    const nextPayment = next.paymentMethod ?? paymentMethod;
    const nextLimit = next.limit ?? page.limit;
    const nextOffset = next.offset ?? 0;
    startTransition(async () => {
      try {
        const result = await searchInvoices({
          query: nextQuery,
          from: nextFrom || null,
          to: nextTo || null,
          paymentMethod: nextPayment || null,
          limit: nextLimit,
          offset: nextOffset,
        });
        setPage(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được hóa đơn.");
      }
    });
  }

  async function openDetail(invoiceNo: string) {
    try {
      setDetail(await fetchInvoiceDetail(invoiceNo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được chi tiết hóa đơn.");
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div>
        <h1 className="text-[18px] font-semibold">Hóa đơn</h1>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Danh sách hóa đơn bán hàng đã phát hành. Không xóa. Giá là snapshot lúc chốt.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_160px_160px_170px]">
        <label className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
          />
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              refresh({ query: value, offset: 0 });
            }}
            placeholder="Tìm mã HĐ, tên khách, SĐT, mã khách"
            className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <input
          type="date"
          value={from}
          onChange={(event) => {
            const value = event.target.value;
            setFrom(value);
            refresh({ from: value, offset: 0 });
          }}
          aria-label="Từ ngày"
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            const value = event.target.value;
            setTo(value);
            refresh({ to: value, offset: 0 });
          }}
          aria-label="Đến ngày"
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
        />
        <select
          value={paymentMethod}
          onChange={(event) => {
            const value = event.target.value as "" | "CASH" | "TRANSFER" | "CARD";
            setPaymentMethod(value);
            refresh({ paymentMethod: value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
        >
          <option value="">Thanh toán: Tất cả</option>
          <option value="CASH">Tiền mặt</option>
          <option value="TRANSFER">Chuyển khoản</option>
          <option value="CARD">Thẻ</option>
        </select>
      </div>

      {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

      <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Mã HĐ</th>
              <th className="py-2 pr-3 font-medium">Khách hàng</th>
              <th className="py-2 pr-3 font-medium">Tổng tiền</th>
              <th className="py-2 pr-3 font-medium">Thanh toán</th>
              <th className="py-2 pr-3 font-medium">Thời gian</th>
              <th className="py-2 pr-3 font-medium">Trạng thái</th>
              <th className="py-2 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-[var(--tlkv-muted)]" colSpan={7}>
                  Không có hóa đơn khớp bộ lọc.
                </td>
              </tr>
            ) : (
              page.items.map((row) => {
                const phone = formatInvoicePhone(row.customerPhone);
                return (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        onClick={() => void openDetail(row.invoiceNo)}
                        className="font-semibold text-[var(--tlkv-red)] hover:underline"
                      >
                        {row.invoiceNo}
                      </button>
                      <p className="text-[11px] text-[var(--tlkv-muted)]">{row.saleNo}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{row.customerName}</p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">
                        {row.isWalkIn ? "Khách vãng lai" : phone || row.customerNo || "—"}
                      </p>
                    </td>
                    <td className="py-3 pr-3 font-semibold">{formatDong(row.totalDong)}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${paymentBadgeClass(row.paymentMethod)}`}
                      >
                        {paymentLabel(row.paymentMethod)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                      {formatViDateTime(row.issuedAt)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-[var(--tlkv-green-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-green)]">
                        {invoiceStatusLabel(row.status, row.saleStatus)}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => void openDetail(row.invoiceNo)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
                      >
                        <Eye size={14} />
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--tlkv-muted)]">
        <p>
          Hiển thị {fromRow} - {toRow} trong {page.total} hóa đơn
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => refresh({ offset: Math.max(0, page.offset - page.limit) })}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Trước
          </button>
          {pages.map((item, index) =>
            item === "…" ? (
              <span key={`e-${index}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => refresh({ offset: (item - 1) * page.limit })}
                className={`h-8 min-w-8 rounded-lg px-2 ${
                  item === currentPage
                    ? "bg-[var(--tlkv-red)] font-semibold text-white"
                    : "border border-[var(--tlkv-line)]"
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => refresh({ offset: page.offset + page.limit })}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Sau
          </button>
          <select
            value={page.limit}
            onChange={(event) => {
              const limit = Number(event.target.value);
              refresh({ limit, offset: 0 });
            }}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / trang
              </option>
            ))}
          </select>
        </div>
      </div>

      {detail ? <InvoiceDrawer invoice={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}

function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}
