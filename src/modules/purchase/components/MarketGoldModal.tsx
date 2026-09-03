"use client";

import { useState } from "react";
import { Info } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { Modal } from "@/shared/ui/Modal";
import type { MarketBuyLine, MarketGoldRef } from "../types";
import { parseDongInput, parseWeightInput, purchaseInputClass } from "./purchaseFormUtils";

type MarketFormState = {
  productName: string;
  goldType: string;
  goldAge: string;
  weightChi: string;
  quantity: string;
  priceRowId: string;
  unitPriceDong: string;
};

const EMPTY: MarketFormState = {
  productName: "Vàng thị trường",
  goldType: "Vàng 9999",
  goldAge: "",
  weightChi: "1",
  quantity: "1",
  priceRowId: "",
  unitPriceDong: "",
};

export function MarketGoldModal({
  marketRefs,
  onClose,
  onAdd,
}: {
  marketRefs: MarketGoldRef[];
  onClose: () => void;
  onAdd: (line: MarketBuyLine) => void;
}) {
  const [form, setForm] = useState<MarketFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function onPickHint(refId: string) {
    const ref = marketRefs.find((r) => r.id === refId);
    setForm((prev) => ({
      ...prev,
      priceRowId: refId,
      productName:
        prev.productName === "Vàng thị trường" || !prev.productName.trim()
          ? ref
            ? `${ref.product}${ref.purity ? ` (${ref.purity})` : ""}`
            : prev.productName
          : prev.productName,
      goldType: prev.goldType || "Vàng thị trường",
      unitPriceDong: ref && ref.buyDong > 0 ? String(ref.buyDong) : prev.unitPriceDong,
    }));
  }

  function submit() {
    const name = form.productName.trim();
    const weightChi = parseWeightInput(form.weightChi);
    const quantity = Math.floor(parseDongInput(form.quantity)) || 0;
    const unitPrice = parseDongInput(form.unitPriceDong);

    if (!name) {
      setError("Nhập tên sản phẩm / mô tả vàng thị trường.");
      return;
    }
    if (weightChi <= 0) {
      setError("Trọng lượng (chỉ) phải lớn hơn 0.");
      return;
    }
    if (quantity <= 0) {
      setError("Số lượng phải là số nguyên lớn hơn 0.");
      return;
    }
    if (form.unitPriceDong === "" || unitPrice < 0) {
      setError("Nhập giá mua / chỉ (số nguyên VND).");
      return;
    }

    onAdd({
      kind: "market",
      isMarketGold: true,
      localId: crypto.randomUUID(),
      productName: name,
      goldType: form.goldType.trim() || "Vàng thị trường",
      goldAge: form.goldAge.trim(),
      quantity,
      weightChi,
      unitPriceDong: unitPrice,
      referencePriceDongPerChi: 0,
      priceRowId: form.priceRowId || null,
      imageUrl: null,
      brandName: "Vàng thị trường",
    });
  }

  return (
    <Modal
      title="Thêm vàng thị trường"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Thêm vào phiếu
          </button>
        </>
      }
    >
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--tlkv-slate)]/20 bg-[var(--tlkv-slate-soft)] px-3 py-2.5 text-[12px] text-[var(--tlkv-slate)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Giá mua nhập thủ công - không áp dụng ±300.000đ/chỉ</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] sm:col-span-2">
          <span className="text-[var(--tlkv-muted)]">Tên hàng</span>
          <input
            value={form.productName}
            onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))}
            className={`${purchaseInputClass} mt-1`}
            placeholder="VD: Vàng thị trường"
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Loại vàng</span>
          <input
            value={form.goldType}
            onChange={(e) => setForm((p) => ({ ...p, goldType: e.target.value }))}
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Tuổi vàng</span>
          <input
            value={form.goldAge}
            onChange={(e) => setForm((p) => ({ ...p, goldAge: e.target.value }))}
            className={`${purchaseInputClass} mt-1`}
            placeholder="VD: 99.99"
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Trọng lượng (chỉ)</span>
          <input
            value={form.weightChi}
            onChange={(e) => setForm((p) => ({ ...p, weightChi: e.target.value }))}
            inputMode="decimal"
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Số lượng</span>
          <input
            value={form.quantity}
            onChange={(e) =>
              setForm((p) => ({ ...p, quantity: e.target.value.replace(/[^\d]/g, "") }))
            }
            inputMode="numeric"
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="text-[var(--tlkv-muted)]">Gợi ý bảng giá (tuỳ chọn)</span>
          <select
            value={form.priceRowId}
            onChange={(e) => onPickHint(e.target.value)}
            className={`${purchaseInputClass} mt-1`}
          >
            <option value="">Không dùng gợi ý</option>
            {marketRefs.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.product}
                {ref.purity ? ` · ${ref.purity}` : ""} · mua {formatDong(ref.buyDong)}/chỉ
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="text-[var(--tlkv-muted)]">Giá mua / chỉ (VND)</span>
          <input
            value={form.unitPriceDong}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                unitPriceDong: e.target.value.replace(/[^\d]/g, ""),
              }))
            }
            inputMode="numeric"
            className={`${purchaseInputClass} mt-1`}
            placeholder="Nhập thủ công"
          />
        </label>
      </div>

      {error ? <p className="mt-2 text-[12px] font-medium text-[var(--tlkv-red)]">{error}</p> : null}
    </Modal>
  );
}
