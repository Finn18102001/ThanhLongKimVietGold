"use client";

import { useState, useTransition } from "react";
import { Eye } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { getWorkShiftOverview, listWorkShifts } from "./actions";
import { WorkShiftDrawer } from "./components/WorkShiftDrawer";
import {
  WORK_SHIFT_CLOSE_OPTIONS,
  WORK_SHIFT_STATUS_OPTIONS,
  closeReasonLabel,
  statusLabel,
  type WorkShiftListPage,
  type WorkShiftOverview,
  type WorkShiftRow,
  type WorkShiftStaffOption,
} from "./types";

type Props = {
  initialOverview: WorkShiftOverview;
  initialPage: WorkShiftListPage;
  staffOptions: WorkShiftStaffOption[];
  today: string;
};

export function WorkShiftDirectory({
  initialOverview,
  initialPage,
  staffOptions,
  today,
}: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [page, setPage] = useState(initialPage);
  const [from, setFrom] = useState(initialPage.from || today);
  const [to, setTo] = useState(initialPage.to || today);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [detail, setDetail] = useState<WorkShiftRow | null>(null);
  const [pending, startTransition] = useTransition();

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  function refresh(
    next: Partial<{
      from: string;
      to: string;
      email: string;
      status: string;
      closeReason: string;
      offset: number;
    }>,
  ) {
    startTransition(async () => {
      const nextFrom = next.from ?? from;
      const nextTo = next.to ?? to;
      const nextEmail = next.email ?? email;
      const nextStatus = next.status ?? status;
      const nextClose = next.closeReason ?? closeReason;
      const [list, ov] = await Promise.all([
        listWorkShifts({
          from: nextFrom,
          to: nextTo,
          email: nextEmail || null,
          status: nextStatus || null,
          closeReason: nextClose || null,
          limit: page.limit,
          offset: next.offset ?? 0,
        }),
        getWorkShiftOverview(today),
      ]);
      setPage(list);
      setOverview(ov);
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div>
        <h1 className="text-[18px] font-semibold">Quản lý ca làm việc</h1>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Hệ thống tự ghi nhận mở ca khi nhân viên đăng nhập trong khung giờ, và đóng ca khi đăng
          xuất hoặc hết giờ 20:00. Chỉ Admin được xem lịch sử.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Đã mở ca hôm nay" value={overview.openedStaffCount} />
        <Kpi label="Đang trong ca" value={overview.activeCount} />
        <Kpi label="Đã đóng ca" value={overview.closedCount} />
        <Kpi label="Tự động đóng lúc 20:00" value={overview.autoClosedCount} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            refresh({ from: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Từ ngày"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            refresh({ to: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Đến ngày"
        />
        <select
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            refresh({ email: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          <option value="">Mọi nhân viên</option>
          {staffOptions.map((opt) => (
            <option key={opt.email} value={opt.email}>
              {opt.name} ({opt.email})
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            refresh({ status: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          {WORK_SHIFT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || "all-status"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={closeReason}
          onChange={(event) => {
            setCloseReason(event.target.value);
            refresh({ closeReason: event.target.value, offset: 0 });
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          {WORK_SHIFT_CLOSE_OPTIONS.map((opt) => (
            <option key={opt.value || "all-close"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[920px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Nhân viên</th>
              <th className="py-2 font-medium">Tài khoản</th>
              <th className="py-2 font-medium">Mở ca</th>
              <th className="py-2 font-medium">Đóng ca</th>
              <th className="py-2 font-medium">Trạng thái</th>
              <th className="py-2 font-medium">Hình thức đóng</th>
              <th className="py-2 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--tlkv-muted)]">
                  Chưa có bản ghi ca làm việc trong khoảng đã chọn.
                </td>
              </tr>
            ) : (
              page.items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-3 pr-3 font-medium">{row.employeeName}</td>
                  <td className="py-3 pr-3 text-[var(--tlkv-muted)]">{row.employeeEmail}</td>
                  <td className="py-3 pr-3">{formatViDateTime(row.openedAt)}</td>
                  <td className="py-3 pr-3">
                    {row.closedAt ? formatViDateTime(row.closedAt) : "—"}
                  </td>
                  <td className="py-3 pr-3">{statusLabel(row.status)}</td>
                  <td className="py-3 pr-3">{closeReasonLabel(row.closeReason)}</td>
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

      {detail ? <WorkShiftDrawer row={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-3 py-3">
      <p className="text-[11px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
