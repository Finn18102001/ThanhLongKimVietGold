"use client";

import { useState } from "react";
import { Package } from "@phosphor-icons/react";
import { formatDong } from "../labels";
import { receiveLabelOrderPurchase } from "../receive-actions";
import {
  GOLD_AGE_PATTERN,
  GOLD_AGE_SUGGESTIONS,
  type LabelReceiveOptions,
  type LabelReceivePaymentMethod,
  type LabelReceiveResult,
} from "../types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]";
const LABEL = "text-[12px] text-[var(--tlkv-muted)]";

type Draft = {
  name: string;
  brandId: string;
  categoryId: string;
  priceRowId: string;
  priceNote: string;
  skuPrefix: string;
  weightChi: string;
  goldAge: string;
  visible: boolean;
  expectedQty: string;
  receivedQty: string;
  costPriceDong: string;
  supplierName: string;
  paymentMethod: LabelReceivePaymentMethod;
  reason: string;
};

function emptyDraft(defaultBrandId: string): Draft {
  return {
    name: "",
    brandId: defaultBrandId,
    categoryId: "",
    priceRowId: "",
    priceNote: "",
    skuPrefix: "TLKVTS",
    weightChi: "1",
    goldAge: "",
    visible: false,
    expectedQty: "0",
    receivedQty: "1",
    costPriceDong: "",
    supplierName: "",
    paymentMethod: "CASH",
    reason: "Nhập hàng",
  };
}

function isWholeNumber(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

export function LabelReceiveSection({
  options,
  onReceived,
}: {
  options: LabelReceiveOptions;
  onReceived: (result: LabelReceiveResult) => void;
}) {
  const defaultBrandId = options.brands[0]?.id ?? "";
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultBrandId));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  const receivedQty = isWholeNumber(draft.receivedQty) ? Number(draft.receivedQty) : 0;
  const costPriceDong = isWholeNumber(draft.costPriceDong) ? Number(draft.costPriceDong) : 0;
  const totalDong = receivedQty * costPriceDong;

  function localError(): string | null {
    if (!draft.name.trim() || !draft.brandId) return "Tên sản phẩm và thương hiệu là bắt buộc.";
    if (!/^[A-Z0-9]{2,12}$/.test(draft.skuPrefix)) {
      return "Mã đầu gồm 2 đến 12 ký tự chữ hoặc số. Số phía sau do hệ thống tự tăng.";
    }
    const weight = Number(draft.weightChi);
    if (draft.weightChi.trim() === "" || !Number.isFinite(weight) || weight < 0) {
      return "Định lượng (chỉ) không hợp lệ.";
    }
    const goldAge = draft.goldAge.trim();
    if (goldAge) {
      if (!GOLD_AGE_PATTERN.test(goldAge)) return "Tuổi vàng là số, tối đa 3 chữ số thập phân.";
      const value = Number(goldAge);
      if (!(value > 0 && value <= 1000)) return "Tuổi vàng phải lớn hơn 0 và không quá 1000.";
    }
    if (!isWholeNumber(draft.expectedQty)) return "Số dự kiến phải là số nguyên không âm.";
    if (!isWholeNumber(draft.receivedQty) || receivedQty <= 0) {
      return "Số nhận thực tế phải là số nguyên > 0.";
    }
    if (!isWholeNumber(draft.costPriceDong)) return "Giá vốn phải là số nguyên VND không âm.";
    if (!draft.supplierName.trim()) return "Nhà cung cấp là bắt buộc.";
    return null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setSuccess(null);
    const invalid = localError();
    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    try {
      const result = await receiveLabelOrderPurchase({
        idempotencyKey,
        name: draft.name,
        brandId: draft.brandId,
        categoryId: draft.categoryId,
        priceRowId: draft.priceRowId,
        priceNote: draft.priceNote,
        skuPrefix: draft.skuPrefix,
        weightChi: Number(draft.weightChi),
        goldAge: draft.goldAge,
        visible: draft.visible,
        expectedQty: Number(draft.expectedQty),
        receivedQty,
        costPriceDong,
        supplierName: draft.supplierName,
        paymentMethod: draft.paymentMethod,
        reason: draft.reason,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIdempotencyKey(crypto.randomUUID());
      setDraft(emptyDraft(defaultBrandId));
      setSuccess(
        result.data.replayed
          ? `Phiếu ${result.data.receiptNo} đã ghi trước đó (mã ${result.data.skuCode}). Không cộng tồn lần nữa.`
          : `Đã nhập ${receivedQty} chiếc · phiếu ${result.data.receiptNo} · mã ${result.data.skuCode} · đã thanh toán ${formatDong(totalDong)}.`,
      );
      onReceived(result.data);
    } catch {
      setError("Không gửi được yêu cầu nhập hàng. Dữ liệu vẫn giữ nguyên, bấm Nhập hàng để thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Nhập hàng</h2>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            Tạo sản phẩm Order và nhận vào kho. Phiếu nhập tự thanh toán đủ (giá vốn × số nhận).
            Nhập xong, mã hàng được chọn sẵn ở Thông tin in.
          </p>
        </div>
        <Package size={20} className="shrink-0 text-[var(--tlkv-muted)]" />
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={`${LABEL} sm:col-span-2`}>
          Tên sản phẩm
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Thương hiệu
          <select
            value={draft.brandId}
            onChange={(e) => patch({ brandId: e.target.value })}
            className={FIELD}
          >
            <option value="">Chọn thương hiệu</option>
            {options.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Danh mục
          <select
            value={draft.categoryId}
            onChange={(e) => patch({ categoryId: e.target.value })}
            className={FIELD}
          >
            <option value="">Không chọn</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Dòng bảng giá
          <select
            value={draft.priceRowId}
            onChange={(e) => patch({ priceRowId: e.target.value })}
            className={FIELD}
          >
            <option value="">Không gắn dòng giá</option>
            {options.priceRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.brand} · {row.product}
                {row.purity ? ` · ${row.purity}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Giá / ghi chú
          <input
            value={draft.priceNote}
            onChange={(e) => patch({ priceNote: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Mã đầu
          <input
            value={draft.skuPrefix}
            onChange={(e) =>
              patch({ skuPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
            }
            maxLength={12}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Số tự tăng
          <input readOnly value="000000" className={`${FIELD} bg-[var(--tlkv-bg)]`} />
          <span className="mt-1 block text-[11px]">Hệ thống gán khi lưu phiếu. Không sửa số này.</span>
        </label>
        <label className={LABEL}>
          Định lượng (chỉ)
          <input
            type="number"
            min={0}
            step="0.0001"
            value={draft.weightChi}
            onChange={(e) => patch({ weightChi: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Tuổi vàng
          <input
            inputMode="decimal"
            list="label-receive-gold-age"
            placeholder="VD: 999.9, 750, 610.5"
            value={draft.goldAge}
            onChange={(e) => patch({ goldAge: e.target.value.replace(",", ".").trim() })}
            className={FIELD}
          />
          <datalist id="label-receive-gold-age">
            {GOLD_AGE_SUGGESTIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px]">Tối đa 3 chữ số thập phân. Để trống nếu chưa có.</span>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.visible}
            onChange={(e) => patch({ visible: e.target.checked })}
          />
          Hiển thị
          <span className="text-[11px] text-[var(--tlkv-muted)]">Mặc định không hiển thị.</span>
        </label>
        <label className={LABEL}>
          Dự kiến
          <input
            type="number"
            min={0}
            step={1}
            value={draft.expectedQty}
            onChange={(e) => patch({ expectedQty: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Nhận thực tế
          <input
            type="number"
            min={1}
            step={1}
            value={draft.receivedQty}
            onChange={(e) => patch({ receivedQty: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Giá vốn / chiếc (VND, số nguyên)
          <input
            type="number"
            min={0}
            step={1}
            value={draft.costPriceDong}
            onChange={(e) => patch({ costPriceDong: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Nhà cung cấp
          <input
            value={draft.supplierName}
            onChange={(e) => patch({ supplierName: e.target.value })}
            className={FIELD}
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Hình thức thanh toán</legend>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(
              [
                { value: "CASH" as const, label: "Tiền mặt" },
                { value: "TRANSFER" as const, label: "Chuyển khoản" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => patch({ paymentMethod: option.value })}
                className={`h-9 rounded-lg text-[12px] font-semibold ${
                  draft.paymentMethod === option.value
                    ? "bg-[var(--tlkv-red)] text-white"
                    : "border border-[var(--tlkv-line)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
            Thanh toán đủ {formatDong(totalDong)} khi nhập hàng.
          </p>
        </fieldset>
        <label className={`${LABEL} sm:col-span-2`}>
          Lý do
          <input
            value={draft.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            className={FIELD}
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 sm:col-span-2">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] sm:col-span-2"
        >
          {pending ? "Đang nhập..." : "Nhập hàng"}
        </button>
      </form>
    </section>
  );
}
