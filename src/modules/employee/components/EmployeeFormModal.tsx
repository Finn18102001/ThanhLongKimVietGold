"use client";

import { useState } from "react";
import { formatActionError } from "@/shared/lib/action-result";
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
    if (pending) return;
    setPending(true);
    setAlert(null);
    try {
      if (mode === "password") {
        const password = String(formData.get("password") ?? "");
        const currentPassword = String(formData.get("currentPassword") ?? "");
        if (!initial) {
          setAlert({
            tone: "error",
            title: "Đổi mật khẩu thất bại",
            reason: "Thiếu nhân viên",
          });
          return;
        }
        const requireCurrent = initial.role === "ADMIN";
        if (requireCurrent && !currentPassword) {
          setAlert({
            tone: "error",
            title: "Đổi mật khẩu thất bại",
            reason: "Đổi mật khẩu tài khoản ADMIN bắt buộc nhập mật khẩu cũ.",
          });
          return;
        }
        const result = await resetStaffPassword(
          initial.id,
          password,
          requireCurrent ? currentPassword : undefined,
        );
        if (!result.ok) {
          setAlert({
            tone: "error",
            title: "Đổi mật khẩu thất bại",
            reason: formatActionError(result.message, "Không đổi được mật khẩu"),
          });
          return;
        }
        setAlert({
          tone: "success",
          title: "Đã đổi mật khẩu",
          reason: `Mật khẩu mới cho ${initial.fullName} đã được cập nhật.`,
        });
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

      const result = initial
        ? await updateStaff(initial.id, payload)
        : await createStaff(payload);
      if (!result.ok) {
        setAlert({
          tone: "error",
          title: initial ? "Cập nhật thất bại" : "Tạo nhân viên thất bại",
          reason: formatActionError(
            result.message,
            initial ? "Không cập nhật được nhân viên" : "Không tạo được nhân viên",
          ),
        });
        return;
      }
      onSaved(result.data);
    } catch (err) {
      setAlert({
        tone: "error",
        title:
          mode === "password"
            ? "Đổi mật khẩu thất bại"
            : initial
              ? "Cập nhật thất bại"
              : "Tạo nhân viên thất bại",
        reason: formatActionError(err, "Không lưu được nhân viên"),
      });
    } finally {
      setPending(false);
    }
  }

  function closeAlert() {
    const wasSuccess = alert?.tone === "success";
    setAlert(null);
    if (wasSuccess && mode === "password") {
      onSaved(initial ?? undefined);
    }
  }

  return (
    <>
      <Modal
        title={title}
        onClose={pending ? () => undefined : onClose}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="staff-form"
              disabled={pending}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {pending
                ? mode === "password"
                  ? "Đang đổi mật khẩu..."
                  : "Đang lưu..."
                : mode === "password"
                  ? "Đổi mật khẩu"
                  : "Lưu"}
            </button>
          </>
        }
      >
        <form id="staff-form" action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pending ? (
            <p className="sm:col-span-2 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px] text-[var(--tlkv-muted)]">
              {mode === "password" ? "Đang đổi mật khẩu, vui lòng chờ..." : "Đang lưu, vui lòng chờ..."}
            </p>
          ) : null}
          {mode === "password" ? (
            <>
              {initial?.role === "ADMIN" ? (
                <label className="text-[13px] sm:col-span-2">
                  Mật khẩu cũ <span className="text-[var(--tlkv-red)]">*</span>
                  <input
                    name="currentPassword"
                    type="password"
                    required
                    disabled={pending}
                    autoComplete="current-password"
                    className={`${FIELD} disabled:opacity-50`}
                  />
                  <span className="mt-1 block text-[12px] text-[var(--tlkv-muted)]">
                    Tài khoản ADMIN bắt buộc xác nhận mật khẩu hiện tại trước khi đổi.
                  </span>
                </label>
              ) : (
                <p className="sm:col-span-2 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
                  Admin được đặt mật khẩu mới trực tiếp cho nhân viên (không cần mật khẩu cũ).
                </p>
              )}
              <label className="text-[13px] sm:col-span-2">
                Mật khẩu mới <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={7}
                  disabled={pending}
                  autoComplete="new-password"
                  className={`${FIELD} disabled:opacity-50`}
                />
                <span className="mt-1 block text-[12px] text-[var(--tlkv-muted)]">
                  Tối thiểu 7 ký tự.
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="text-[13px] sm:col-span-2">
                Họ và tên <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  name="fullName"
                  required
                  disabled={pending}
                  defaultValue={initial?.fullName ?? ""}
                  className={`${FIELD} disabled:opacity-50`}
                />
              </label>
              <label className="text-[13px]">
                Email đăng nhập <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  name="email"
                  type="email"
                  required
                  disabled={Boolean(initial) || pending}
                  defaultValue={initial?.email ?? ""}
                  className={`${FIELD} disabled:bg-[var(--tlkv-bg)]`}
                />
              </label>
              <label className="text-[13px]">
                Số điện thoại
                <input
                  name="phone"
                  disabled={pending}
                  defaultValue={initial?.phone ?? ""}
                  className={`${FIELD} disabled:opacity-50`}
                />
              </label>
              <label className="text-[13px]">
                Vai trò
                <select
                  value={role}
                  disabled={pending}
                  onChange={(event) => setRole(event.target.value as StaffRole)}
                  className={`${FIELD} disabled:opacity-50`}
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
                    disabled={pending}
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
                    minLength={7}
                    disabled={pending}
                    autoComplete="new-password"
                    className={`${FIELD} disabled:opacity-50`}
                  />
                </label>
              )}
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isShared}
                  disabled={pending}
                  onChange={(event) => setIsShared(event.target.checked)}
                />
                Tài khoản POS dùng chung (phải chọn NV đứng quầy khi chốt đơn)
              </label>
              <label className="text-[13px] sm:col-span-2">
                Ghi chú
                <textarea
                  name="note"
                  rows={3}
                  disabled={pending}
                  defaultValue={initial?.note ?? ""}
                  className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)] disabled:opacity-50"
                />
              </label>
            </>
          )}
        </form>
      </Modal>
      {alert ? (
        <ResultAlert alert={alert} onClose={closeAlert}>
          <button
            type="button"
            onClick={closeAlert}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </ResultAlert>
      ) : null}
    </>
  );
}
