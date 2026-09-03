"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DownloadSimple, Eye, MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { downloadCsv } from "@/shared/lib/csv";
import { ROUTES } from "@/shared/navigation/routes";
import { exportInvoiceCsv, fetchInvoiceDetail, searchInvoices } from "../actions";
import {
  documentTypeLabel,
  effectivePaymentStatus,
  formatInvoicePhone,
  paymentBadgeClass,
  paymentLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
} from "../labels";
import type { DocumentType, InvoiceDetail, InvoiceListPage, InvoiceListRow, PaymentStatus } from "../types";
import { InvoiceDrawer } from "./InvoiceDrawer";

const PAGE_SIZES = [5, 10, 20] as const;
const PAYMENT_STATUS_OPTIONS: { value: "" | PaymentStatus; label: string }[] = [
  { value: "", label: "Trạng thái TT: Tất cả" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "PARTIALLY_PAID", label: "Một phần" },
  { value: "UNPAID", label: "Chưa thanh toán" },
  { value: "OVERDUE", label: "Quá hạn" },
];
const DOCUMENT_TYPE_OPTIONS: { value: "" | DocumentType; label: string }[] = [
  { value: "", label: "Loại: Tất cả" },
  { value: "SALE_TO_CUSTOMER", label: "Bán cho khách" },
  { value: "PURCHASE_FROM_CUSTOMER", label: "Mua từ khách" },
  { value: "STOCK_RECEIPT", label: "Nhập hàng" },
];

export function InvoiceDirectory({ initial }: { initial: InvoiceListPage }) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"" | PaymentStatus>("");
  const [documentType, setDocumentType] = useState<"" | DocumentType>("");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));
  const fromRow = page.total === 0 ? 0 : page.offset + 1;
  const toRow = Math.min(page.offset + page.items.length, page.total);

  const pages = useMemo(() => pageNumbers(currentPage, pageCount), [currentPage, pageCount]);

  function refresh(next: {
    query?: string;
    from?: string;
    to?: string;
    paymentStatus?: "" | PaymentStatus;
    documentType?: "" | DocumentType;
    limit?: number;
    offset?: number;
  }) {
    const nextQuery = next.query ?? query;
    const nextFrom = next.from ?? from;
    const nextTo = next.to ?? to;
    const nextPayStatus = next.paymentStatus ?? paymentStatus;
    const nextDocumentType = next.documentType ?? documentType;
    const nextLimit = next.limit ?? page.limit;
    const nextOffset = next.offset ?? 0;
    startTransition(async () => {
      try {
        const result = await searchInvoices({
          query: nextQuery,
          from: nextFrom || null,
          to: nextTo || null,
          paymentStatus: nextPayStatus || null,
          documentType: nextDocumentType || null,
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

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q) return;
    setQuery(q);
    refresh({ query: q, offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- áp dụng theo ?q= trên URL
  }, [searchParams]);

  async function openDetail(invoiceNo: string) {
    try {
      setDetail(await fetchInvoiceDetail(invoiceNo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được chi tiết hóa đơn.");
    }
  }

  function openRow(row: InvoiceListRow) {
    if (row.documentType === "PURCHASE_FROM_CUSTOMER") {
      router.push(`${ROUTES.purchase}?buy=${row.id}`);
      return;
    }
    if (row.documentType === "STOCK_RECEIPT") {
      router.push(ROUTES.inventoryReceive);
      return;
    }
    void openDetail(row.invoiceNo);
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportInvoiceCsv({
        query,
        from: from || null,
        to: to || null,
        paymentStatus: paymentStatus || null,
        documentType: documentType || null,
      });
      downloadCsv(
        "chung-tu.csv",
        [
          "Loại",
          "Số chứng từ",
          "Đối tác",
          "SĐT",
          "Tổng",
          "Đã trả",
          "Còn lại",
          "Trạng thái TT",
          "Hình thức",
          "Thời gian",
          "Tham chiếu",
        ],
        result.items.map((row) => [
          documentTypeLabel(row.documentType),
          row.invoiceNo,
          row.customerName,
          row.customerPhone,
          row.totalDong,
          row.paidDong,
          row.remainingDong,
          paymentStatusLabel(row.paymentStatus),
          paymentLabel(row.paymentMethod),
          formatViDateTime(row.issuedAt),
          row.saleNo,
        ]),
      );
      if (result.total !== page.total) {
        setError(
          `Export ${result.total} dòng, danh sách đang hiện tổng ${page.total}. Tải lại bộ lọc rồi xuất lại.`,
        );
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative w-full max-w-md">
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
              placeholder="Tìm số chứng từ, tên khách, SĐT"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-white pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting || page.total === 0}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            <DownloadSimple size={16} />
            {exporting ? "Đang xuất..." : "Xuất CSV"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select
            value={documentType}
            onChange={(event) => {
              const value = event.target.value as "" | DocumentType;
              setDocumentType(value);
              refresh({ documentType: value, offset: 0 });
            }}
            aria-label="Loại chứng từ"
            className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              const value = event.target.value;
              setFrom(value);
              refresh({ from: value, offset: 0 });
            }}
            aria-label="Từ ngày"
            className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
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
            className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
          <select
            value={paymentStatus}
            onChange={(event) => {
              const value = event.target.value as "" | PaymentStatus;
              setPaymentStatus(value);
              refresh({ paymentStatus: value, offset: 0 });
            }}
            aria-label="Trạng thái thanh toán"
            className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          >
            {PAYMENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

      <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[1080px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Số chứng từ</th>
              <th className="py-2 pr-3 font-medium">Loại</th>
              <th className="py-2 pr-3 font-medium">Đối tác</th>
              <th className="py-2 pr-3 font-medium">Tổng / Còn lại</th>
              <th className="py-2 pr-3 font-medium">Hình thức</th>
              <th className="py-2 pr-3 font-medium">Trạng thái TT</th>
              <th className="py-2 pr-3 font-medium">Thời gian</th>
              <th className="py-2 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-[var(--tlkv-muted)]" colSpan={8}>
                  Không có chứng từ khớp bộ lọc.
                </td>
              </tr>
            ) : (
              page.items.map((row) => {
                const phone = formatInvoicePhone(row.customerPhone);
                const payStatus = effectivePaymentStatus(
                  row.paymentStatus,
                  row.remainingDong,
                  row.dueDate,
                );
                return (
                  <tr key={`${row.documentType}-${row.id}`} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="font-semibold text-[var(--tlkv-red)] hover:underline"
                      >
                        {row.invoiceNo}
                      </button>
                      {row.saleNo && row.saleNo !== row.invoiceNo ? (
                        <p className="text-[11px] text-[var(--tlkv-muted)]">{row.saleNo}</p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-[12px]">{documentTypeLabel(row.documentType)}</td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{row.customerName}</p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">
                        {row.isWalkIn ? "Khách vãng lai" : phone || row.customerNo || "-"}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{formatDong(row.totalDong)}</p>
                      <p className="text-[11px] text-[var(--tlkv-muted)]">
                        {row.remainingDong > 0
                          ? `Còn ${formatDong(row.remainingDong)}`
                          : "Đã đủ"}
                      </p>
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${paymentBadgeClass(row.paymentMethod)}`}
                      >
                        {paymentLabel(row.paymentMethod)}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${paymentStatusBadgeClass(payStatus)}`}
                      >
                        {paymentStatusLabel(payStatus)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                      {formatViDateTime(row.issuedAt)}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-medium transition active:scale-[0.98] hover:bg-[var(--tlkv-bg)]"
                      >
                        <Eye size={14} />
                        Xem
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
          Hiển thị {fromRow} - {toRow} trong {page.total} chứng từ
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

      {detail ? (
        <InvoiceDrawer
          invoice={detail}
          onClose={() => setDetail(null)}
          onUpdated={(next) => {
            setDetail(next);
            refresh({ offset: page.offset });
          }}
        />
      ) : null}
    </>
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
