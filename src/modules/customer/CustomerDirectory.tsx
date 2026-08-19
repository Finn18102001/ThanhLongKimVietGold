"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { fetchCustomer, searchCustomers } from "./actions";
import { CustomerDetailModal } from "./components/CustomerDetailModal";
import { CustomerFormModal } from "./components/CustomerFormModal";
import { customerInitials, formatPhoneDisplay, GROUP_LABEL } from "./labels";
import type { CustomerDetail, CustomerListPage, CustomerRecord } from "./types";

export function CustomerDirectory({ initial }: { initial: CustomerListPage }) {
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextQuery = query, offset = 0) {
    try {
      setPage(await searchCustomers({ query: nextQuery, limit: 12, offset }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được khách hàng");
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold">Khách hàng quầy</h1>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            Tổng mua lấy từ giao dịch COMPLETED. Công nợ chưa mở sổ phải thu nên luôn 0 đ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
        >
          <Plus size={14} weight="bold" />
          Thêm khách hàng
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          void refresh(value, 0);
        }}
        placeholder="Tìm tên, số điện thoại, mã khách"
        className="mt-4 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
      />

      {error ? <p className="mt-3 text-sm text-[var(--tlkv-red)]">{error}</p> : null}

      <table className="mt-4 w-full text-left text-[13px]">
        <thead className="text-[12px] text-[var(--tlkv-muted)]">
          <tr className="border-b border-[var(--tlkv-line)]">
            <th className="py-2 font-medium">Khách hàng</th>
            <th className="py-2 font-medium">Nhóm</th>
            <th className="py-2 font-medium">Số điện thoại</th>
            <th className="py-2 font-medium">Tổng mua</th>
            <th className="py-2 font-medium">Số lần</th>
            <th className="py-2 font-medium">Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {page.items.length === 0 ? (
            <tr>
              <td className="py-4 text-[var(--tlkv-muted)]" colSpan={6}>
                Chưa có khách. Tạo mới hoặc khách sẽ được gắn khi bán hàng.
              </td>
            </tr>
          ) : (
            page.items.map((row) => (
              <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                <td className="py-3">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setDetail(await fetchCustomer(row.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Không tải được khách");
                      }
                    }}
                    className="flex items-center gap-2.5 text-left"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[11px] font-bold text-[var(--tlkv-red)]">
                      {customerInitials(row.name)}
                    </span>
                    <span>
                      <span className="block font-medium">{row.name}</span>
                      <span className="text-[12px] text-[var(--tlkv-muted)]">{row.customerNo}</span>
                    </span>
                  </button>
                </td>
                <td className="py-3">{GROUP_LABEL[row.customerGroup]}</td>
                <td className="py-3">{formatPhoneDisplay(row.phone)}</td>
                <td className="py-3 font-medium">{formatDong(row.totalDong)}</td>
                <td className="py-3">{row.saleCount}</td>
                <td className="py-3 text-[var(--tlkv-muted)]">
                  {formatViDateTime(row.lastActivityAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {creating ? (
        <CustomerFormModal
          title="Thêm khách hàng mới"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refresh();
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
          onDeleted={() => {
            setDetail(null);
            void refresh();
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
            setDetail(await fetchCustomer(customer.id));
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}
