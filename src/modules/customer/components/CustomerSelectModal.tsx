"use client";

import { useEffect, useState } from "react";
import { CaretRight, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { fetchCustomer, searchCustomers } from "../actions";
import { customerInitials, formatPhoneDisplay, GROUP_LABEL } from "../labels";
import type {
  CustomerDetail,
  CustomerGroup,
  CustomerListPage,
  CustomerRecord,
  CustomerSort,
} from "../types";
import { CUSTOMER_GROUPS } from "../types";
import { CustomerDetailModal } from "./CustomerDetailModal";
import { CustomerFormModal } from "./CustomerFormModal";

const PAGE_SIZE = 5;

export function CustomerSelectModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (customer: CustomerRecord) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("");
  const [sort, setSort] = useState<CustomerSort>("newest");
  const [page, setPage] = useState<CustomerListPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const result = await searchCustomers({
          query,
          group: group || null,
          sort,
          limit: PAGE_SIZE,
          offset,
        });
        if (!cancelled) {
          setPage(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không tải được khách hàng");
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, group, sort, offset]);

  const totalPages = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <>
      <Modal title="Chọn khách hàng" wide onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder="Tìm theo tên, SĐT, mã khách"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setOffset(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Tất cả nhóm</option>
            {CUSTOMER_GROUPS.map((value) => (
              <option key={value} value={value}>
                {GROUP_LABEL[value as CustomerGroup]}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as CustomerSort);
              setOffset(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="newest">Mới nhất</option>
            <option value="name">Tên A-Z</option>
            <option value="total">Tổng mua</option>
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
          >
            <Plus size={14} weight="bold" />
            Thêm khách hàng mới
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--tlkv-red)]">{error}</p> : null}

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Khách hàng</th>
              <th className="py-2 font-medium">Số điện thoại</th>
              <th className="py-2 font-medium">Tổng mua</th>
              <th className="py-2 font-medium">Số lần mua</th>
              <th className="py-2 font-medium">Cập nhật</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(page?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có khách. Tạo khách mới hoặc bán cho khách lẻ.
                </td>
              </tr>
            ) : (
              (page?.items ?? []).map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[11px] font-bold text-[var(--tlkv-red)]">
                        {customerInitials(row.name)}
                      </span>
                      <span>
                        <span className="block font-medium">{row.name}</span>
                        <span className="text-[12px] text-[var(--tlkv-muted)]">{row.customerNo}</span>
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5">{formatPhoneDisplay(row.phone)}</td>
                  <td className="py-2.5 font-medium">{formatDong(row.totalDong)}</td>
                  <td className="py-2.5">{row.saleCount}</td>
                  <td className="py-2.5 text-[var(--tlkv-muted)]">
                    {formatViDateTime(row.lastActivityAt)}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      aria-label={`Xem ${row.name}`}
                      onClick={async () => {
                        try {
                          setDetail(await fetchCustomer(row.id));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Không tải được khách");
                        }
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--tlkv-bg)]"
                    >
                      <CaretRight size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--tlkv-muted)]">
          <p>
            Hiển thị {page && page.total > 0 ? offset + 1 : 0} -{" "}
            {Math.min(offset + PAGE_SIZE, page?.total ?? 0)} / {page?.total ?? 0} khách
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Trước
            </button>
            <span className="flex h-8 items-center px-2">
              {currentPage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </Modal>

      {creating ? (
        <CustomerFormModal
          title="Thêm khách hàng mới"
          onClose={() => setCreating(false)}
          onSaved={(customer) => {
            setCreating(false);
            onSelect(customer);
          }}
        />
      ) : null}

      {detail ? (
        <CustomerDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail.customer);
            setDetail(null);
          }}
          onSelect={(customer) => {
            setDetail(null);
            onSelect(customer);
          }}
        />
      ) : null}

      {editing ? (
        <CustomerFormModal
          title="Chỉnh sửa khách hàng"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(customer) => {
            setEditing(null);
            onSelect(customer);
          }}
        />
      ) : null}
    </>
  );
}
