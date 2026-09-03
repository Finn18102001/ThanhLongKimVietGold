"use client";

import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { createStaff, resetStaffPassword, updateStaff } from "../actions";
import { ROLE_LABEL } from "../labels";
import type { StaffInput, StaffRecord, StaffRole } from "../types";
import { STAFF_ROLES } from "../types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export function EmployeeFormModal({
  title,
  initial,
  mode = "edit",
  onClose,
  onSaved,
}: {
  title: string;
  initial?: StaffRecord | null;
  mode?: "create" | "edit" | "password";
  onClose: () => void;
  onSaved: (staff?: StaffRecord) => void;
}) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [role, setRole] = useState<StaffRole>(initial?.role ?? "STAFF");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isShared, setIsShared] = useState(initial?.isShared ?? false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    try {
      if (mode === "password") {
        const password = String(formData.get("password") ?? "");
        if (!initial) throw new Error("Thiếu nhân viên");
        await resetStaffPassword(initial.id, password);
        onSaved(initial);
        return;
      }

      const payload: StaffInput = {
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        role,
        note: String(formData.get("note") ?? ""),
        password: String(formData.get("password") ?? "") || undefined,
        isActive,
        isShared,
      };

      const saved = initial
        ? await updateStaff(initial.id, payload)
        : await createStaff(payload);
      onSaved(saved);
    } catch (err) {
      setAlert({
        tone: "error",
        title:
          mode === "password"
            ? "Đổi mật khẩu thất bại"
            : initial
              ? "Cập nhật thất bại"
              : "Tạo nhân viên thất bại",
        reason: err instanceof Error ? err.message : "Không lưu được nhân viên",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="staff-form"
              disabled={pending}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Đang lưu..." : mode === "password" ? "Đổi mật khẩu" : "Lưu"}
            </button>
          </>
        }
      >
        <form id="staff-form" action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mode === "password" ? (
            <label className="text-[13px] sm:col-span-2">
              Mật khẩu mới <span className="text-[var(--tlkv-red)]">*</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={FIELD}
              />
              <span className="mt-1 block text-[12px] text-[var(--tlkv-muted)]">
                Tối thiểu 8 ký tự.
              </span>
            </label>
          ) : (
            <>
              <label className="text-[13px] sm:col-span-2">
                Họ và tên <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  name="fullName"
                  required
                  defaultValue={initial?.fullName ?? ""}
                  className={FIELD}
                />
              </label>
              <label className="text-[13px]">
                Email đăng nhập <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  name="email"
                  type="email"
                  required
                  disabled={Boolean(initial)}
                  defaultValue={initial?.email ?? ""}
                  className={`${FIELD} disabled:bg-[var(--tlkv-bg)]`}
                />
              </label>
              <label className="text-[13px]">
                Số điện thoại
                <input name="phone" defaultValue={initial?.phone ?? ""} className={FIELD} />
              </label>
              <label className="text-[13px]">
                Vai trò
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as StaffRole)}
                  className={FIELD}
                >
                  {STAFF_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABEL[value]}
                    </option>
                  ))}
                </select>
              </label>
              {initial ? (
                <label className="flex items-center gap-2 pt-6 text-[13px]">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  Đang hoạt động
                </label>
              ) : (
                <label className="text-[13px]">
                  Mật khẩu <span className="text-[var(--tlkv-red)]">*</span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={FIELD}
                  />
                </label>
              )}
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(event) => setIsShared(event.target.checked)}
                />
                Tài khoản POS dùng chung (phải chọn NV đứng quầy khi chốt đơn)
              </label>
              <label className="text-[13px] sm:col-span-2">
                Ghi chú
                <textarea
                  name="note"
                  rows={3}
                  defaultValue={initial?.note ?? ""}
                  className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>
            </>
          )}
        </form>
      </Modal>
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
    </>
  );
}
