"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatPhoneDisplay } from "@/modules/customer/labels";
import { formatActionError } from "@/shared/lib/action-result";
import { formatDong } from "@/shared/lib/money";
import { Modal } from "@/shared/ui/Modal";
import { listBuys } from "../actions";
import { paymentStatusBadgeClass, paymentStatusLabel, PAYMENT_STATUS_LABEL } from "../labels";
import type { BuyListRow, PaymentStatus } from "../types";
import { purchaseInputClass } from "./purchaseFormUtils";

const PAGE_SIZES = [10, 20, 30] as const;
const SEARCH_DEBOUNCE_MS = 350;

const PAYMENT_FILTERS: Array<{ value: "" | PaymentStatus; label: string }> = [
  { value: "", label: "Trạng thái TT: Tất cả" },
  ...(Object.entries(PAYMENT_STATUS_LABEL) as Array<[PaymentStatus, string]>).map(
    ([value, label]) => ({ value, label }),
  ),
];

export function RecentBuysModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (buyId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"" | PaymentStatus>("");
  const [limit, setLimit] = useState<number>(10);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<BuyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPage = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const fromRow = total === 0 ? 0 : offset + 1;
  const toRow = Math.min(offset + items.length, total);
  const pages = useMemo(() => pageNumbers(currentPage, pageCount), [currentPage, pageCount]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  useEffect(() => {
    void load({ q: "", paymentStatus: "", limit: 10, offset: 0 });
    // Mount fetch only. Later changes go through schedule() so search can debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(next: {
    q: string;
    paymentStatus: "" | PaymentStatus;
    limit: number;
    offset: number;
  }) {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const page = await listBuys({
        q: next.q,
        paymentStatus: next.paymentStatus || null,
        limit: next.limit,
        offset: next.offset,
      });
      if (seq !== requestSeq.current) return;
      setItems(page.items);
      setTotal(page.total);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(formatActionError(err, "Không tải được phiếu mua."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  function schedule(
    next: {
      q?: string;
      paymentStatus?: "" | PaymentStatus;
      limit?: number;
      offset?: number;
    },
    debounce = false,
  ) {
    const q = next.q ?? query;
    const status = next.paymentStatus ?? paymentStatus;
    const nextLimit = next.limit ?? limit;
    const nextOffset = next.offset ?? 0;
    if (next.q !== undefined) setQuery(next.q);
    if (next.paymentStatus !== undefined) setPaymentStatus(next.paymentStatus);
    if (next.limit !== undefined) setLimit(next.limit);
    setOffset(nextOffset);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const run = () => void load({ q, paymentStatus: status, limit: nextLimit, offset: nextOffset });
    if (debounce) {
      searchTimer.current = setTimeout(run, SEARCH_DEBOUNCE_MS);
    } else {
      run();
    }
  }

  return (
    <Modal
      title="Phiếu mua gần đây"
      wide
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-[var(--tlkv-muted)]">
            Hiển thị {fromRow}–{toRow} / {total} phiếu
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading || currentPage <= 1}
              onClick={() => schedule({ offset: Math.max(0, offset - limit) })}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px] disabled:opacity-40"
            >
              Trước
            </button>
            {pages.map((item, index) =>
              item === "…" ? (
                <span key={`gap-${index}`} className="px-1 text-[12px] text-[var(--tlkv-muted)]">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  disabled={loading}
                  onClick={() => schedule({ offset: (item - 1) * limit })}
                  className={`h-8 min-w-8 rounded-lg px-2 text-[12px] ${
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
              disabled={loading || currentPage >= pageCount}
              onClick={() => schedule({ offset: offset + limit })}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px] disabled:opacity-40"
            >
              Sau
            </button>
            <select
              value={limit}
              onChange={(event) => schedule({ limit: Number(event.target.value), offset: 0 })}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] bg-white px-2 text-[12px]"
              aria-label="Số phiếu mỗi trang"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / trang
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
            >
              Đóng
            </button>
          </div>
        </div>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block">
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tlkv-muted)]"
          />
          <input
            value={query}
            onChange={(event) => schedule({ q: event.target.value, offset: 0 }, true)}
            placeholder="Mã phiếu, tên khách, số điện thoại"
            className={`${purchaseInputClass} pl-8`}
            aria-label="Tìm phiếu mua"
          />
        </label>
        <select
          value={paymentStatus}
          onChange={(event) =>
            schedule({ paymentStatus: event.target.value as "" | PaymentStatus, offset: 0 })
          }
          className={purchaseInputClass}
          aria-label="Lọc trạng thái thanh toán"
        >
          {PAYMENT_FILTERS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mb-2 text-[12px] text-[var(--tlkv-red)]">{error}</p> : null}

      <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
        {items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--tlkv-muted)]">
            {loading ? "Đang tải phiếu..." : "Không có phiếu khớp bộ lọc."}
          </p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead className="text-[11px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 font-medium">Mã</th>
                <th className="py-2 font-medium">Khách</th>
                <th className="py-2 font-medium">Tổng</th>
                <th className="py-2 font-medium">Còn trả</th>
                <th className="py-2 font-medium">TT</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2.5 font-semibold">{row.buyNo}</td>
                  <td className="py-2.5">
                    <span className="block font-medium">{row.customerName}</span>
                    <span className="text-[11px] text-[var(--tlkv-muted)]">
                      {formatPhoneDisplay(row.customerPhone)}
                    </span>
                  </td>
                  <td className="py-2.5">{formatDong(row.totalDong)}</td>
                  <td className="py-2.5 font-medium">{formatDong(row.remainingDong)}</td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentStatusBadgeClass(row.paymentStatus)}`}
                    >
                      {paymentStatusLabel(row.paymentStatus)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpen(row.id)}
                      className="text-[12px] font-semibold text-[var(--tlkv-red)]"
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
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
