"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { FileXls, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { formatViDateOnly } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { exportCustomers, fetchCustomer, searchCustomers } from "./actions";
import { CustomerDetailPanel } from "./components/CustomerDetailPanel";
import { CustomerFormModal } from "./components/CustomerFormModal";
import { CustomerKpiRow } from "./components/CustomerKpiRow";
import {
  customerInitials,
  formatPhoneDisplay,
  GENDER_LABEL,
  GROUP_LABEL,
  groupBadgeClass,
  TYPE_LABEL,
} from "./labels";
import type {
  CustomerActivityFilter,
  CustomerDetail,
  CustomerDirectoryStats,
  CustomerGroup,
  CustomerListPage,
  CustomerRecord,
} from "./types";
import { CUSTOMER_GROUPS } from "./types";

const PAGE_SIZES = [10, 20, 50] as const;

export function CustomerDirectory({
  initial,
  stats: initialStats,
}: {
  initial: CustomerListPage;
  stats: CustomerDirectoryStats;
}) {
  const [page, setPage] = useState(initial);
  const [stats] = useState(initialStats);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"" | CustomerGroup>("");
  const [activity, setActivity] = useState<CustomerActivityFilter>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    group?: "" | CustomerGroup;
    activity?: CustomerActivityFilter;
    limit?: number;
    offset?: number;
    selectId?: string | null;
  }) {
    const nextQuery = next.query ?? query;
    const nextGroup = next.group ?? group;
    const nextActivity = next.activity ?? activity;
    const nextLimit = next.limit ?? page.limit;
    const nextOffset = next.offset ?? 0;

    startTransition(async () => {
      try {
        const result = await searchCustomers({
          query: nextQuery,
          group: nextGroup || null,
          activity: nextActivity,
          limit: nextLimit,
          offset: nextOffset,
          sort: "newest",
        });
        setPage(result);
        setError(null);

        const pickId = next.selectId ?? selectedId;
        const stillVisible = pickId && result.items.some((row) => row.id === pickId);
        const nextSelected = stillVisible ? pickId : null;
        setSelectedId(nextSelected);
        if (nextSelected) {
          setDetail(await fetchCustomer(nextSelected));
        } else {
          setDetail(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được khách hàng");
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

  async function openCustomer(id: string) {
    try {
      setSelectedId(id);
      setDetail(await fetchCustomer(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được chi tiết khách");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const rows = await exportCustomers({
        query,
        group: group || null,
        activity,
        sort: "newest",
      });
      downloadCustomersCsv(rows.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Khách hàng quầy</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Quản lý khách hàng và lịch sử mua hàng. Tổng chi tiêu chỉ tính từ các đơn đã bán
              thành công trên quầy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || page.total === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
            >
              <FileXls size={16} />
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
            >
              <Plus size={14} weight="bold" />
              Thêm khách hàng
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
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
              placeholder="Tìm theo tên, SĐT, mã KH, CCCD hoặc MST"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={group}
              onChange={(event) => {
                const value = event.target.value as "" | CustomerGroup;
                setGroup(value);
                refresh({ group: value, offset: 0 });
              }}
              aria-label="Nhóm khách hàng"
              className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            >
              <option value="">Nhóm khách hàng: Tất cả</option>
              {CUSTOMER_GROUPS.map((value) => (
                <option key={value} value={value}>
                  {GROUP_LABEL[value]}
                </option>
              ))}
            </select>
            <select
              value={activity}
              onChange={(event) => {
                const value = event.target.value as CustomerActivityFilter;
                setActivity(value);
                refresh({ activity: value, offset: 0 });
              }}
              aria-label="Trạng thái mua hàng"
              className="h-10 min-w-0 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            >
              <option value="">Trạng thái: Tất cả</option>
              <option value="purchased">Đã mua hàng</option>
              <option value="never">Chưa mua hàng</option>
            </select>
          </div>
        </div>
      </section>

      <CustomerKpiRow stats={stats} />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <section
          className={`min-w-0 flex-1 rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] ${pending ? "opacity-60" : ""}`}
        >
          {error ? <p className="mb-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 pr-3 font-medium">Khách hàng</th>
                  <th className="py-2 pr-3 font-medium">Nhóm</th>
                  <th className="py-2 pr-3 font-medium">Số điện thoại</th>
                  <th className="py-2 pr-3 font-medium">Tổng chi tiêu</th>
                  <th className="py-2 pr-3 font-medium">Số đơn hàng</th>
                  <th className="py-2 font-medium">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {page.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[var(--tlkv-muted)]">
                      Không có khách hàng khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  page.items.map((row) => {
                    const active = row.id === selectedId;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-[var(--tlkv-line)] last:border-b-0 ${
                          active ? "bg-[var(--tlkv-red-soft)]/60" : "hover:bg-[var(--tlkv-bg)]"
                        }`}
                      >
                        <td className="py-3 pr-3">
                          <button
                            type="button"
                            onClick={() => void openCustomer(row.id)}
                            className="flex items-center gap-2.5 text-left"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[11px] font-bold text-[var(--tlkv-red)]">
                              {customerInitials(row.name)}
                            </span>
                            <span>
                              <span className="block font-medium">{row.name}</span>
                              <span className="text-[12px] text-[var(--tlkv-muted)]">
                                {row.customerNo}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${groupBadgeClass(row.customerGroup)}`}
                          >
                            {GROUP_LABEL[row.customerGroup]}
                          </span>
                        </td>
                        <td className="py-3 pr-3">{formatPhoneDisplay(row.phone) || "—"}</td>
                        <td className="py-3 pr-3 font-semibold text-[var(--tlkv-red)]">
                          {formatDong(row.totalDong)}
                        </td>
                        <td className="py-3 pr-3">{row.saleCount}</td>
                        <td className="py-3 text-[var(--tlkv-muted)]">
                          {formatViDateOnly(row.lastActivityAt)}
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
              Hiển thị {fromRow}-{toRow} / {page.total.toLocaleString("vi-VN")} khách
            </p>
            <div className="flex flex-wrap items-center gap-1">
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
                  <span key={`gap-${index}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => refresh({ offset: (item - 1) * page.limit })}
                    className={`h-8 min-w-8 rounded-lg border px-2 ${
                      item === currentPage
                        ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] font-semibold text-[var(--tlkv-red)]"
                        : "border-[var(--tlkv-line)]"
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
                    {size} dòng
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {detail ? (
          <CustomerDetailPanel
            detail={detail}
            onClose={() => {
              setDetail(null);
              setSelectedId(null);
            }}
            onEdit={() => {
              setEditing(detail.customer);
            }}
            onDeleted={() => {
              setDetail(null);
              setSelectedId(null);
              refresh({ offset: page.offset });
            }}
          />
        ) : null}
      </div>

      {creating ? (
        <CustomerFormModal
          title="Thêm khách hàng mới"
          onClose={() => setCreating(false)}
          onSaved={(customer) => {
            setCreating(false);
            refresh({ offset: 0, selectId: customer.id });
          }}
        />
      ) : null}

      {editing ? (
        <CustomerFormModal
          title="Chỉnh sửa khách hàng"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (customer) => {
            setEditing(null);
            setSelectedId(customer.id);
            setDetail(await fetchCustomer(customer.id));
            refresh({ selectId: customer.id });
          }}
        />
      ) : null}
    </div>
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

function downloadCustomersCsv(rows: CustomerRecord[]) {
  const header = [
    "Mã KH",
    "Loại KH",
    "Tên hiển thị",
    "Tên doanh nghiệp",
    "MST",
    "Người đại diện",
    "CCCD",
    "Quốc tịch",
    "SĐT",
    "Email",
    "Giới tính",
    "Ngày sinh",
    "Ngày cấp CCCD",
    "Nơi cấp CCCD",
    "Địa chỉ",
    "Nhóm",
    "Tổng chi tiêu",
    "Số đơn",
    "Ngày tham gia",
    "Cập nhật",
  ];
  const lines = rows.map((row) =>
    [
      row.customerNo,
      TYPE_LABEL[row.customerType],
      row.name,
      row.businessName ?? "",
      row.taxCode ?? "",
      row.representativeName ?? "",
      row.citizenId ?? "",
      row.nationality ?? "",
      formatPhoneDisplay(row.phone),
      row.email ?? "",
      row.gender ? GENDER_LABEL[row.gender] : "",
      row.dateOfBirth ? formatViDateOnly(row.dateOfBirth) : "",
      row.citizenIdIssueDate ? formatViDateOnly(row.citizenIdIssueDate) : "",
      row.citizenIdIssuePlace ?? "",
      row.address ?? "",
      GROUP_LABEL[row.customerGroup],
      row.totalDong,
      row.saleCount,
      formatViDateOnly(row.createdAt),
      formatViDateOnly(row.lastActivityAt),
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  const csv = `\uFEFF${[header.join(","), ...lines].join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
