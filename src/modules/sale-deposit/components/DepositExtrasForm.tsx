"use client";

import type { DepositDocPayload } from "../types";

const FIELD =
  "mt-1 h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] outline-none focus:border-[var(--tlkv-red)]";

export function DepositExtrasForm({
  value,
  onChange,
  variant,
}: {
  value: DepositDocPayload;
  onChange: (next: DepositDocPayload) => void;
  variant: "agreement" | "slip" | "handover";
}) {
  function patch(partial: DepositDocPayload) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {variant === "agreement" ? (
        <>
          <Field
            label="Nơi ký thỏa thuận"
            value={value.place ?? ""}
            onChange={(place) => patch({ place })}
          />
          <Field
            label="Đại diện bên bán"
            value={value.seller_representative ?? ""}
            onChange={(seller_representative) => patch({ seller_representative })}
          />
          <Field
            label="Chức vụ bên bán"
            value={value.seller_title ?? ""}
            onChange={(seller_title) => patch({ seller_title })}
          />
          <Field
            label="Số tài khoản công ty"
            value={value.seller_bank_account ?? ""}
            onChange={(seller_bank_account) => patch({ seller_bank_account })}
          />
          <Field
            label="Ngân hàng"
            value={value.seller_bank_name ?? ""}
            onChange={(seller_bank_name) => patch({ seller_bank_name })}
          />
          <Field
            label="Đại diện bên mua (nếu tổ chức)"
            value={value.buyer_representative ?? ""}
            onChange={(buyer_representative) => patch({ buyer_representative })}
          />
          <Field
            label="Giao vàng từ ngày (dd/mm/yyyy)"
            value={value.delivery_from ?? ""}
            onChange={(delivery_from) => patch({ delivery_from })}
          />
          <Field
            label="Giao vàng đến ngày (dd/mm/yyyy)"
            value={value.delivery_to ?? ""}
            onChange={(delivery_to) => patch({ delivery_to })}
          />
          <Field
            label="Hình thức TT khác"
            value={value.payment_other ?? ""}
            onChange={(payment_other) => patch({ payment_other })}
          />
        </>
      ) : null}
      {variant === "slip" ? (
        <>
          <Field
            label="Địa điểm giao vàng"
            value={value.delivery_place ?? ""}
            onChange={(delivery_place) => patch({ delivery_place })}
          />
          <Field
            label="Số chứng từ / phiếu thu"
            value={value.receipt_no ?? ""}
            onChange={(receipt_no) => patch({ receipt_no })}
          />
          <Field
            label="Nội dung chuyển khoản"
            value={value.transfer_content ?? ""}
            onChange={(transfer_content) => patch({ transfer_content })}
          />
        </>
      ) : null}
      {variant === "handover" ? (
        <>
          <Field
            label="Đại diện bên bán"
            value={value.seller_representative ?? ""}
            onChange={(seller_representative) => patch({ seller_representative })}
          />
          <Field
            label="Chức vụ bên bán"
            value={value.seller_title ?? ""}
            onChange={(seller_title) => patch({ seller_title })}
          />
          <Field
            label="Nơi lập biên bản"
            value={value.place ?? ""}
            onChange={(place) => patch({ place })}
          />
          <Field
            label="Hình thức TT khác"
            value={value.payment_other ?? ""}
            onChange={(payment_other) => patch({ payment_other })}
          />
          <label className="block text-[12px] sm:col-span-2">
            Ghi nhận khác (để trống nếu không có)
            <input
              value={value.handover_note ?? ""}
              onChange={(e) => patch({ handover_note: e.target.value })}
              className={FIELD}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[12px]">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} />
    </label>
  );
}
