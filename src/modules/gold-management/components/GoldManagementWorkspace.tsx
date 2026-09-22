"use client";

import { useMemo, useState } from "react";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { downloadCsv } from "@/shared/lib/csv";
import { formatViDateTime } from "@/shared/lib/datetime";
import { GoldKpis } from "./GoldKpis";
import {
  formatChi,
  KIND_LABEL,
  PARTY_TYPE_LABEL,
  PAYABLE_STATUS_LABEL,
  RECEIVABLE_STATUS_LABEL,
  statusLabel,
} from "../labels";
import type {
  GoldFilterState,
  GoldObligationRow,
  GoldObligationSummary,
  GoldTab,
} from "../types";

const PAGE_SIZE = 12;

const TABS: { id: GoldTab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "receivable", label: "Phải thu" },
  { id: "payable", label: "Phải trả" },
];

const EMPTY_FILTER: GoldFilterState = {
  dateFrom: "",
  dateTo: "",
  partyQuery: "",
  actorQuery: "",
  brand: "",
  productQuery: "",
  status: "OPEN",
};

function matchesDate(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function isOpenStatus(row: GoldObligationRow): boolean {
  return row.quantityRemaining > 0;
}

function matchesStatus(row: GoldObligationRow, status: string): boolean {
  if (!status || status === "ALL") return true;
  if (status === "OPEN") return isOpenStatus(row);
  return row.status === status;
}

export function GoldManagementWorkspace({
  rows,
  summary,
}: {
  rows: GoldObligationRow[];
  summary: GoldObligationSummary;
}) {
  const [tab, setTab] = useState<GoldTab>("overview");
  const [filter, setFilter] = useState<GoldFilterState>(EMPTY_FILTER);
  const [page, setPage] = useState(0);

  const brands = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.brandName).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [rows],
  );

  const tabRows = useMemo(() => {
    if (tab === "receivable") return rows.filter((r) => r.kind === "RECEIVABLE");
    if (tab === "payable") return rows.filter((r) => r.kind === "PAYABLE");
    return rows;
  }, [rows, tab]);

  const filtered = useMemo(() => {
    const partyQ = filter.partyQuery.trim().toLowerCase();
    const actorQ = filter.actorQuery.trim().toLowerCase();
    const productQ = filter.productQuery.trim().toLowerCase();

    return tabRows.filter((row) => {
      if (!matchesDate(row.occurredAt, filter.dateFrom, filter.dateTo)) return false;
      if (!matchesStatus(row, filter.status)) return false;
      if (filter.brand) {
        if (filter.brand === "__none__") {
          if (row.brandName) return false;
        } else if (row.brandName !== filter.brand) {
          return false;
        }
      }
      if (
        partyQ &&
        !row.partyName.toLowerCase().includes(partyQ) &&
        !PARTY_TYPE_LABEL[row.partyType].toLowerCase().includes(partyQ)
      ) {
        return false;
      }
      if (actorQ && !row.actorEmail.toLowerCase().includes(actorQ)) return false;
      if (
        productQ &&
        !row.productName.toLowerCase().includes(productQ) &&
        !row.skuCode.toLowerCase().includes(productQ)
      ) {
        return false;
      }
      return true;
    });
  }, [tabRows, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function patchFilter(patch: Partial<GoldFilterState>) {
    setFilter((prev) => ({ ...prev, ...patch }));
    setPage(0);
  }

  function onExportExcel() {
    const tabSlug =
      tab === "overview" ? "tong-quan" : tab === "receivable" ? "phai-thu" : "phai-tra";
    downloadCsv(
      `quan-ly-vang-${tabSlug}.csv`,
      [
        "STT",
        "Ngày tháng năm",
        "Mã đơn / Mã hóa đơn",
        "Loại phải thu / phải trả",
        "Loại đối tượng",
        "Tên đối tượng",
        "Thương hiệu",
        "Tên sản phẩm",
        "Số lượng",
        "Định lượng",
        "Tổng số chỉ",
        "Nhân viên thực hiện",
        "Trạng thái",
        "Số điện thoại",
        "CCCD",
        "Lịch sử thanh toán",
      ],
      filtered.map((row, index) => [
        index + 1,
        formatViDateTime(row.occurredAt),
        row.documentNo,
        KIND_LABEL[row.kind],
        PARTY_TYPE_LABEL[row.partyType],
        row.partyName,
        row.brandName || "Không brand",
        row.productName,
        row.quantityRemaining,
        row.weightChiPerUnit,
        row.totalChiRemaining,
        row.actorEmail,
        statusLabel(row.kind, row.status),
        row.partyPhone,
        row.partyCitizenId,
        row.paymentHistory,
      ]),
    );
  }

  const statusOptions =
    tab === "payable"
      ? [
          { value: "OPEN", label: "Còn phải trả" },
          { value: "ALL", label: "Tất cả trạng thái" },
          ...Object.entries(PAYABLE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
        ]
      : tab === "receivable"
        ? [
            { value: "OPEN", label: "Còn phải thu" },
            { value: "ALL", label: "Tất cả trạng thái" },
            ...Object.entries(RECEIVABLE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
          ]
        : [
            { value: "OPEN", label: "Còn mở" },
            { value: "ALL", label: "Tất cả trạng thái" },
          ];

  const remainingColLabel =
    tab === "payable" ? "Phải trả" : tab === "receivable" ? "Phải thu" : "Còn lại";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">Quản lý vàng</h1>
          <p className="text-[12px] text-[var(--tlkv-muted)]">
            Theo dõi vàng phải thu / phải trả theo đơn nguồn. Không tạo kho riêng; số dư cập nhật khi
            nhận hàng hoặc giao vàng.
          </p>
        </div>
        <button
          type="button"
          onClick={onExportExcel}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)] active:scale-[0.98]"
        >
          <DownloadSimple size={15} weight="bold" />
          Xuất Excel
        </button>
      </div>

      <GoldKpis
        receivableCount={String(summary.receivableCount)}
        receivableChi={formatChi(summary.receivableChi)}
        payableCount={String(summary.payableCount)}
        payableChi={formatChi(summary.payableChi)}
      />

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setPage(0);
                setFilter((prev) => ({
                  ...prev,
                  status: "OPEN",
                }));
              }}
              className={`h-9 rounded-full px-3 text-[13px] font-medium ${
                tab === item.id
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "bg-[var(--tlkv-bg)] hover:bg-[var(--tlkv-red-soft)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Từ ngày
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => patchFilter({ dateFrom: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Đến ngày
            <input
              type="date"
              value={filter.dateTo}
              onChange={(e) => patchFilter({ dateTo: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="relative text-[12px] text-[var(--tlkv-muted)] md:col-span-2">
            Đối tượng (mối / NCC / khách / đối tác)
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-[34px] left-3 text-[var(--tlkv-faint)]"
            />
            <input
              value={filter.partyQuery}
              onChange={(e) => patchFilter({ partyQuery: e.target.value })}
              placeholder="Tìm theo tên đối tượng..."
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Nhân viên
            <input
              value={filter.actorQuery}
              onChange={(e) => patchFilter({ actorQuery: e.target.value })}
              placeholder="Email / nhân viên..."
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Thương hiệu
            <select
              value={filter.brand}
              onChange={(e) => patchFilter({ brand: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
            >
              <option value="">Tất cả thương hiệu</option>
              <option value="__none__">Không brand</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Sản phẩm
            <input
              value={filter.productQuery}
              onChange={(e) => patchFilter({ productQuery: e.target.value })}
              placeholder="Tên / mã hàng..."
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Trạng thái
            <select
              value={filter.status}
              onChange={(e) => patchFilter({ status: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--tlkv-muted)]">
          <p>
            Hiển thị {filtered.length} dòng
            {summary.receivableCount + summary.payableCount > 0
              ? ` · Mở toàn hệ thống: ${summary.receivableCount} thu / ${summary.payableCount} trả`
              : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter(EMPTY_FILTER);
              setPage(0);
            }}
            className="rounded-lg px-2 py-1 hover:bg-[var(--tlkv-bg)]"
          >
            Xóa bộ lọc
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-[var(--tlkv-line)] text-[12px] text-[var(--tlkv-muted)]">
              <tr>
                <th className="px-2 py-2 font-medium">Ngày</th>
                <th className="px-2 py-2 font-medium">Mã đơn</th>
                {tab === "overview" ? (
                  <th className="px-2 py-2 font-medium">Loại</th>
                ) : null}
                <th className="px-2 py-2 font-medium">Đối tượng</th>
                <th className="px-2 py-2 font-medium">Tên đối tượng</th>
                <th className="px-2 py-2 font-medium">Thương hiệu</th>
                <th className="px-2 py-2 font-medium">Sản phẩm</th>
                <th className="px-2 py-2 text-right font-medium">SL</th>
                <th className="px-2 py-2 text-right font-medium">Định lượng</th>
                <th className="px-2 py-2 text-right font-medium">{remainingColLabel}</th>
                <th className="px-2 py-2 text-right font-medium">Tổng số chỉ</th>
                <th className="px-2 py-2 font-medium">Nhân viên</th>
                <th className="px-2 py-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={tab === "overview" ? 13 : 12}
                    className="px-2 py-10 text-center text-[var(--tlkv-muted)]"
                  >
                    Không có giao dịch vàng phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--tlkv-line)]/50 last:border-0 hover:bg-[var(--tlkv-bg)]/60"
                  >
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]">
                      {formatViDateTime(row.occurredAt)}
                    </td>
                    <td className="px-2 py-2.5 font-medium whitespace-nowrap">{row.documentNo}</td>
                    {tab === "overview" ? (
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            row.kind === "RECEIVABLE"
                              ? "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
                              : "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
                          }`}
                        >
                          {KIND_LABEL[row.kind]}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {PARTY_TYPE_LABEL[row.partyType]}
                    </td>
                    <td className="px-2 py-2.5 max-w-[160px] truncate" title={row.partyName}>
                      {row.partyName}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {row.brandName || "Không brand"}
                    </td>
                    <td className="px-2 py-2.5 min-w-[160px]">
                      <p className="font-medium">{row.productName}</p>
                      {row.skuCode ? (
                        <p className="text-[11px] text-[var(--tlkv-muted)]">{row.skuCode}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{row.quantityOrdered}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.weightChiPerUnit.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                      {row.quantityRemaining}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.totalChiRemaining.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-2 py-2.5 max-w-[140px] truncate text-[12px]" title={row.actorEmail}>
                      {row.actorEmail}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <StatusPill kind={row.kind} status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-2 text-[13px]">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-40"
            >
              Trước
            </button>
            <span className="text-[var(--tlkv-muted)]">
              Trang {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StatusPill({
  kind,
  status,
}: {
  kind: GoldObligationRow["kind"];
  status: GoldObligationRow["status"];
}) {
  const open =
    status === "NOT_RECEIVED" ||
    status === "NOT_DELIVERED" ||
    status === "PARTIAL";
  const done = status === "RECEIVED" || status === "DELIVERED";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
        done
          ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
          : open
            ? "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
            : "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]"
      }`}
    >
      {statusLabel(kind, status)}
    </span>
  );
}
