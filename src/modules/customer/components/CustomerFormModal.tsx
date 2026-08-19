"use client";

import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { createCustomer, updateCustomer } from "../actions";
import { GENDER_LABEL, GROUP_LABEL } from "../labels";
import type { CustomerGender, CustomerGroup, CustomerInput, CustomerRecord } from "../types";
import { CUSTOMER_GENDERS, CUSTOMER_GROUPS } from "../types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export function CustomerFormModal({
  title,
  initial,
  onClose,
  onSaved,
}: {
  title: string;
  initial?: CustomerRecord | null;
  onClose: () => void;
  onSaved: (customer: CustomerRecord) => void;
}) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [gender, setGender] = useState<CustomerGender | "">(initial?.gender ?? "");
  const [group, setGroup] = useState<CustomerGroup>(initial?.customerGroup ?? "RETAIL");

  async function onSubmit(formData: FormData) {
    setPending(true);
    const payload: CustomerInput = {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      address: String(formData.get("address") ?? ""),
      note: String(formData.get("note") ?? ""),
      gender: gender || null,
      customerGroup: group,
      dateOfBirth: String(formData.get("dateOfBirth") ?? "") || null,
    };
    try {
      const saved = initial
        ? await updateCustomer(initial.id, payload)
        : await createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setAlert({
        tone: "error",
        title: initial ? "Cập nhật khách thất bại" : "Tạo khách thất bại",
        reason: err instanceof Error ? err.message : "Không lưu được khách hàng",
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
            form="customer-form"
            disabled={pending}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Đang lưu..." : "Lưu khách hàng"}
          </button>
        </>
      }
    >
      <form id="customer-form" action={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[13px] sm:col-span-1">
          Họ và tên <span className="text-[var(--tlkv-red)]">*</span>
          <input name="name" required defaultValue={initial?.name ?? ""} className={FIELD} />
        </label>
        <label className="text-[13px]">
          Số điện thoại <span className="text-[var(--tlkv-red)]">*</span>
          <input name="phone" required defaultValue={initial?.phone === "WALKIN" ? "" : initial?.phone ?? ""} className={FIELD} />
        </label>
        <label className="text-[13px]">
          Giới tính
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value as CustomerGender | "")}
            className={FIELD}
          >
            <option value="">Chọn giới tính</option>
            {CUSTOMER_GENDERS.map((value) => (
              <option key={value} value={value}>
                {GENDER_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px]">
          Nhóm khách hàng
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value as CustomerGroup)}
            className={FIELD}
          >
            {CUSTOMER_GROUPS.map((value) => (
              <option key={value} value={value}>
                {GROUP_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] sm:col-span-2">
          Email
          <input name="email" type="email" defaultValue={initial?.email ?? ""} className={FIELD} />
        </label>
        <label className="text-[13px] sm:col-span-2">
          Địa chỉ
          <input name="address" defaultValue={initial?.address ?? ""} className={FIELD} />
        </label>
        <label className="text-[13px]">
          Ngày sinh
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={initial?.dateOfBirth?.slice(0, 10) ?? ""}
            className={FIELD}
          />
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
      </form>
    </Modal>
    {alert ? (
      <ResultAlert alert={alert} onClose={() => setAlert(null)}>
        <button
          type="button"
          onClick={() => setAlert(null)}
          className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
        >
          Đã hiểu
        </button>
      </ResultAlert>
    ) : null}
    </>
  );
}
