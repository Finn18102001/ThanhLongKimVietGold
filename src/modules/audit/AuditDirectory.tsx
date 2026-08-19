"use client";

import { useState, useTransition } from "react";
import { Eye } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { listAuditLogs } from "./actions";
import { AuditDrawer } from "./components/AuditDrawer";
import { AUDIT_MODULE_OPTIONS, type AuditListPage, type AuditLogRow } from "./types";

export function AuditDirectory({ initial }: { initial: AuditListPage }) {
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AuditLogRow | null>(null);
  const [pending, startTransition] = useTransition();

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  function refresh(next: Partial<{ query: string; module: string; from: string; to: string; offset: number }>) {
    startTransition(async () => {
      const result = await listAuditLogs({
        query: next.query ?? query,
        module: (next.module ?? module) || null,
        from: (next.from ?? from) || null,
        to: (next.to ?? to) || null,
        limit: page.limit,
        offset: next.offset ?? 0,
      });
      setPage(result);
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div>
        <h1 className="text-[18px] font-semibold">Nhật ký hệ thống</h1>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Ghi lại mọi thao tác quan trọng: bán hàng, trả hàng, điều chỉnh kho, kiểm kê, hóa đơn,
          danh mục. Không thể sửa hay xóa bản ghi.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            refresh({ query: event.target.value, offset: 0 });
          }}
          placeholder="Tìm thao tác, người dùng, phân hệ..."
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        />
        <select
          value={module}
          onChange={(event) => {
            setModule(event.target.value);
            refresh({ module: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          {AUDIT_MODULE_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            refresh({ from: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            refresh({ to: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        />
      </div>

      <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Thời gian</th>
              <th className="py-2 font-medium">Người thực hiện</th>
              <th className="py-2 font-medium">Phân hệ</th>
              <th className="py-2 font-medium">Thao tác</th>
              <th className="py-2 font-medium">Tham chiếu</th>
              <th className="py-2 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--tlkv-muted)]">
                  Không có bản ghi nhật ký.
                </td>
              </tr>
            ) : (
              page.items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                    {formatViDateTime(row.createdAt)}
                  </td>
                  <td className="py-3 pr-3">{row.actorEmail.split("@")[0]}</td>
                  <td className="py-3 pr-3 uppercase">{row.entityType}</td>
                  <td className="py-3 pr-3 font-medium">{row.action}</td>
                  <td className="py-3 pr-3 text-[12px] text-[var(--tlkv-muted)]">
                    {row.entityId?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => setDetail(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                    >
                      <Eye size={14} />
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--tlkv-muted)]">
        <p>
          Trang {currentPage}/{pageCount} · {page.total} bản ghi
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => refresh({ offset: Math.max(0, page.offset - page.limit) })}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Trước
          </button>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => refresh({ offset: page.offset + page.limit })}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>

      {detail ? <AuditDrawer row={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}
