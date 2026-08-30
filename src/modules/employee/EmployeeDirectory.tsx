"use client";

import { useMemo, useState, useTransition } from "react";
import { Key, MagnifyingGlass, Plus, Prohibit, Trash, UserCheck } from "@phosphor-icons/react";
import { formatViDateOnly } from "@/shared/lib/datetime";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { deleteStaff, searchStaff, setStaffActive } from "./actions";
import { ROLE_LABEL, roleBadgeClass, staffInitials } from "./labels";
import type { StaffListPage, StaffRecord, StaffRole } from "./types";
import { STAFF_ROLES } from "./types";
import { EmployeeFormModal } from "./components/EmployeeFormModal";

export function EmployeeDirectory({ initial }: { initial: StaffListPage }) {
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"" | StaffRole>("");
  const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRecord | null>(null);
  const [passwordFor, setPasswordFor] = useState<StaffRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [pending, startTransition] = useTransition();

  const activeCount = useMemo(
    () => page.items.filter((row) => row.isActive).length,
    [page.items],
  );

  function refresh(next?: {
    query?: string;
    role?: "" | StaffRole;
    activeFilter?: "" | "1" | "0";
    offset?: number;
  }) {
    const nextQuery = next?.query ?? query;
    const nextRole = next?.role ?? role;
    const nextActive = next?.activeFilter ?? activeFilter;
    startTransition(async () => {
      try {
        const result = await searchStaff({
          query: nextQuery,
          role: nextRole || null,
          active: nextActive === "" ? null : nextActive === "1",
          limit: page.limit || 50,
          offset: next?.offset ?? 0,
        });
        setPage(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được danh sách nhân viên");
      }
    });
  }

  async function toggleActive(row: StaffRecord) {
    try {
      await setStaffActive(row.id, !row.isActive);
      refresh();
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không đổi được trạng thái",
        reason: err instanceof Error ? err.message : "Thao tác thất bại",
      });
    }
  }

  async function removeStaff(row: StaffRecord) {
    if (!window.confirm(`Xóa nhân viên ${row.fullName}? Tài khoản đăng nhập cũng sẽ bị xóa.`)) {
      return;
    }
    try {
      await deleteStaff(row.id);
      refresh();
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Xóa thất bại",
        reason: err instanceof Error ? err.message : "Không xóa được nhân viên",
      });
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Nhân viên</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Tạo tài khoản, gán vai trò Quản trị / Nhân viên, bật tắt và đổi mật khẩu. Chỉ quản trị
              mới truy cập được mục này.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
          >
            <Plus size={14} weight="bold" />
            Thêm nhân viên
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
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
              placeholder="Tìm theo tên, email, số điện thoại hoặc mã NV"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <select
            value={role}
            onChange={(event) => {
              const value = event.target.value as "" | StaffRole;
              setRole(value);
              refresh({ role: value, offset: 0 });
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          >
            <option value="">Vai trò: Tất cả</option>
            {STAFF_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>
          <select
            value={activeFilter}
            onChange={(event) => {
              const value = event.target.value as "" | "1" | "0";
              setActiveFilter(value);
              refresh({ activeFilter: value, offset: 0 });
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          >
            <option value="">Trạng thái: Tất cả</option>
            <option value="1">Đang hoạt động</option>
            <option value="0">Đã tắt</option>
          </select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <p className="text-[12px] text-[var(--tlkv-muted)]">Tổng nhân viên</p>
          <p className="mt-1 text-[22px] font-semibold">{page.total}</p>
        </div>
        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <p className="text-[12px] text-[var(--tlkv-muted)]">Đang hoạt động (trang này)</p>
          <p className="mt-1 text-[22px] font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)] sm:col-span-1 col-span-2">
          <p className="text-[12px] text-[var(--tlkv-muted)]">Vai trò</p>
          <p className="mt-1 text-[13px] font-medium">Quản trị / Nhân viên</p>
        </div>
      </section>

      <section
        className={`rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] ${pending ? "opacity-60" : ""}`}
      >
        {error ? <p className="mb-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 pr-3 font-medium">Nhân viên</th>
                <th className="py-2 pr-3 font-medium">Vai trò</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Điện thoại</th>
                <th className="py-2 pr-3 font-medium">Trạng thái</th>
                <th className="py-2 pr-3 font-medium">Cập nhật</th>
                <th className="py-2 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {page.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--tlkv-muted)]">
                    Chưa có nhân viên khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                page.items.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[11px] font-bold text-[var(--tlkv-red)]">
                          {staffInitials(row.fullName)}
                        </span>
                        <span>
                          <span className="block font-medium">{row.fullName}</span>
                          <span className="text-[12px] text-[var(--tlkv-muted)]">{row.staffNo}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${roleBadgeClass(row.role)}`}
                      >
                        {ROLE_LABEL[row.role]}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{row.email}</td>
                    <td className="py-3 pr-3">{row.phone || "—"}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {row.isActive ? "Hoạt động" : "Đã tắt"}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[var(--tlkv-muted)]">
                      {formatViDateOnly(row.updatedAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          className="h-8 rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] hover:bg-[var(--tlkv-bg)]"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          title="Đổi mật khẩu"
                          onClick={() => setPasswordFor(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] hover:bg-[var(--tlkv-bg)]"
                        >
                          <Key size={14} />
                        </button>
                        <button
                          type="button"
                          title={row.isActive ? "Tắt" : "Bật"}
                          onClick={() => void toggleActive(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] hover:bg-[var(--tlkv-bg)]"
                        >
                          {row.isActive ? <Prohibit size={14} /> : <UserCheck size={14} />}
                        </button>
                        <button
                          type="button"
                          title="Xóa"
                          onClick={() => void removeStaff(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] text-[var(--tlkv-red)] hover:bg-[var(--tlkv-red-soft)]"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {creating ? (
        <EmployeeFormModal
          title="Thêm nhân viên"
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}
      {editing ? (
        <EmployeeFormModal
          title="Sửa nhân viên"
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {passwordFor ? (
        <EmployeeFormModal
          title={`Đổi mật khẩu — ${passwordFor.fullName}`}
          mode="password"
          initial={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSaved={() => setPasswordFor(null)}
        />
      ) : null}
      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </ResultAlert>
      ) : null}
    </div>
  );
}
