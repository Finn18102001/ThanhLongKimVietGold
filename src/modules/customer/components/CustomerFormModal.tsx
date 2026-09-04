"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { createCustomer, updateCustomer, uploadCustomerCccd } from "../actions";
import {
  formatCustomerSaveError,
  GENDER_LABEL,
  GROUP_LABEL,
  normalizeCitizenIdInput,
  TYPE_LABEL,
} from "../labels";
import type {
  CccdDocumentType,
  CustomerGender,
  CustomerGroup,
  CustomerInput,
  CustomerRecord,
  CustomerType,
} from "../types";
import { CUSTOMER_GENDERS, CUSTOMER_GROUPS, CUSTOMER_TYPES } from "../types";
import { CccdFormPhotos, type CccdPendingPhotos } from "./CccdFormPhotos";

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
  const [persistedId, setPersistedId] = useState<string | null>(initial?.id ?? null);
  const [savedForClose, setSavedForClose] = useState<CustomerRecord | null>(null);
  const [gender, setGender] = useState<CustomerGender | "">(initial?.gender ?? "");
  const [group, setGroup] = useState<CustomerGroup>(initial?.customerGroup ?? "RETAIL");
  const [customerType, setCustomerType] = useState<CustomerType>(
    initial?.customerType ?? "INDIVIDUAL",
  );
  const [photos, setPhotos] = useState<CccdPendingPhotos>({});

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone === "WALKIN" ? "" : (initial?.phone ?? ""),
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    note: initial?.note ?? "",
    dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? "",
    nationality: initial?.nationality ?? "Việt Nam",
    citizenId: initial?.citizenId ?? "",
    citizenIdIssueDate: initial?.citizenIdIssueDate?.slice(0, 10) ?? "",
    citizenIdIssuePlace: initial?.citizenIdIssuePlace ?? "",
    taxCode: initial?.taxCode ?? "",
    businessName: initial?.businessName ?? "",
    representativeName: initial?.representativeName ?? "",
  });

  const isBusiness = customerType === "BUSINESS";

  const nameRequired = useMemo(
    () =>
      isBusiness
        ? form.businessName.trim().length > 0 || form.name.trim().length > 0
        : form.name.trim().length > 0,
    [form.businessName, form.name, isBusiness],
  );

  function patchForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function onPickPhoto(type: CccdDocumentType, file: File | null) {
    setPhotos((prev) => ({ ...prev, [type]: file }));
  }

  function buildPayload(): CustomerInput {
    const citizenId = normalizeCitizenIdInput(form.citizenId);
    return {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      address: form.address || null,
      note: form.note || null,
      gender: gender || null,
      customerGroup: group,
      dateOfBirth: form.dateOfBirth || null,
      customerType,
      nationality: form.nationality || null,
      citizenId: citizenId || null,
      citizenIdIssueDate: form.citizenIdIssueDate || null,
      citizenIdIssuePlace: form.citizenIdIssuePlace || null,
      taxCode: form.taxCode || null,
      businessName: form.businessName || null,
      representativeName: form.representativeName || null,
    };
  }

  async function uploadPendingPhotos(customerId: string): Promise<string | null> {
    const types: CccdDocumentType[] = ["CCCD_FRONT", "CCCD_BACK"];
    try {
      for (const type of types) {
        const file = photos[type];
        if (!file) continue;
        const base64 = await fileToBase64(file);
        await uploadCustomerCccd({
          customerId,
          documentType: type,
          fileName: file.name,
          contentType: file.type,
          base64,
        });
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Không tải được ảnh căn cước";
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nameRequired) {
      setAlert({
        tone: "error",
        title: "Thiếu thông tin bắt buộc",
        reason: isBusiness
          ? "Cần tên doanh nghiệp hoặc tên hiển thị."
          : "Cần họ và tên khách hàng.",
      });
      return;
    }

    setPending(true);
    const payload = buildPayload();
    try {
      const saved = persistedId
        ? await updateCustomer(persistedId, payload)
        : await createCustomer(payload);
      setPersistedId(saved.id);
      const photoError = isBusiness ? null : await uploadPendingPhotos(saved.id);
      if (photoError) {
        setSavedForClose(saved);
        setAlert({
          tone: "error",
          title: "Đã lưu khách, ảnh căn cước chưa lên",
          reason: photoError,
        });
        return;
      }
      onSaved(saved);
    } catch (err) {
      const mapped = formatCustomerSaveError(
        err instanceof Error ? err.message : "Không lưu được khách hàng",
      );
      setAlert({
        tone: "error",
        title: initial ? mapped.title || "Cập nhật khách thất bại" : mapped.title || "Tạo khách thất bại",
        reason: mapped.reason,
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
        <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-2 text-[13px] font-medium text-[var(--tlkv-muted)]">
              Loại khách hàng
            </legend>
            {CUSTOMER_TYPES.map((type) => (
              <label
                key={type}
                className={`flex h-10 cursor-pointer items-center justify-center rounded-lg border text-[13px] font-medium transition-colors ${
                  customerType === type
                    ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                    : "border-[var(--tlkv-line)] hover:bg-[var(--tlkv-bg)]"
                }`}
              >
                <input
                  type="radio"
                  name="customerType"
                  value={type}
                  checked={customerType === type}
                  onChange={() => setCustomerType(type)}
                  className="sr-only"
                />
                {TYPE_LABEL[type]}
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isBusiness ? (
              <>
                <label className="text-[13px] sm:col-span-2">
                  Tên doanh nghiệp <span className="text-[var(--tlkv-red)]">*</span>
                  <input
                    required
                    value={form.businessName}
                    onChange={(e) => patchForm({ businessName: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Mã số thuế
                  <input
                    value={form.taxCode}
                    onChange={(e) => patchForm({ taxCode: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Người đại diện
                  <input
                    value={form.representativeName}
                    onChange={(e) => patchForm({ representativeName: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px] sm:col-span-2">
                  Tên hiển thị (tuỳ chọn)
                  <input
                    value={form.name}
                    onChange={(e) => patchForm({ name: e.target.value })}
                    placeholder="Mặc định dùng tên doanh nghiệp"
                    className={FIELD}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="text-[13px] sm:col-span-2">
                  Họ và tên <span className="text-[var(--tlkv-red)]">*</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => patchForm({ name: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Số CCCD
                  <input
                    value={form.citizenId}
                    onChange={(e) =>
                      patchForm({ citizenId: normalizeCitizenIdInput(e.target.value) })
                    }
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    placeholder="Chỉ nhập số, 9–12 chữ số"
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Quốc tịch
                  <input
                    value={form.nationality}
                    onChange={(e) => patchForm({ nationality: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Ngày cấp CCCD
                  <input
                    type="date"
                    value={form.citizenIdIssueDate}
                    onChange={(e) => patchForm({ citizenIdIssueDate: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="text-[13px]">
                  Nơi cấp CCCD
                  <input
                    value={form.citizenIdIssuePlace}
                    onChange={(e) => patchForm({ citizenIdIssuePlace: e.target.value })}
                    className={FIELD}
                  />
                </label>
              </>
            )}

            <label className="text-[13px]">
              Số điện thoại <span className="text-[var(--tlkv-red)]">*</span>
              <input
                required
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
                className={FIELD}
              />
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
            {!isBusiness ? (
              <label className="text-[13px]">
                Ngày sinh
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => patchForm({ dateOfBirth: e.target.value })}
                  className={FIELD}
                />
              </label>
            ) : null}
            <label className="text-[13px] sm:col-span-2">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                className={FIELD}
              />
            </label>
            <label className="text-[13px] sm:col-span-2">
              Địa chỉ
              <input
                value={form.address}
                onChange={(e) => patchForm({ address: e.target.value })}
                className={FIELD}
              />
            </label>
            <label className="text-[13px] sm:col-span-2">
              Ghi chú
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => patchForm({ note: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
              />
            </label>
          </div>

          {!isBusiness ? (
            <CccdFormPhotos
              documents={initial?.documents ?? []}
              pending={photos}
              onPick={onPickPhoto}
              disabled={pending}
            />
          ) : null}
        </form>
      </Modal>
      {alert ? (
        <ResultAlert
          alert={alert}
          onClose={() => {
            setAlert(null);
            if (savedForClose) onSaved(savedForClose);
          }}
        >
          <button
            type="button"
            onClick={() => {
              setAlert(null);
              if (savedForClose) onSaved(savedForClose);
            }}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đã hiểu
          </button>
        </ResultAlert>
      ) : null}
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}
