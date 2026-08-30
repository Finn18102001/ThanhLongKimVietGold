"use client";

import { useState } from "react";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { Modal } from "@/shared/ui/Modal";
import {
  PRICE_EXCEPTION_THRESHOLD_DONG,
  isPriceException,
  type CatalogBuyLine,
  type PurchaseCatalogItem,
} from "../types";
import { parseDongInput, parseWeightInput, purchaseInputClass } from "./purchaseFormUtils";
import { PurchaseProductThumb } from "./PurchaseCatalogCard";

export function CatalogBuyModal({
  item,
  onClose,
  onAdd,
}: {
  item: PurchaseCatalogItem;
  onClose: () => void;
  onAdd: (line: CatalogBuyLine) => void;
}) {
  const [unitPrice, setUnitPrice] = useState(
    item.suggestedBuyDongPerChi > 0
      ? String(item.suggestedBuyDongPerChi)
      : item.referenceSellDongPerChi > 0
        ? String(item.referenceSellDongPerChi)
        : "",
  );
  const [weightChi, setWeightChi] = useState(
    item.weightChi > 0 ? String(item.weightChi) : "1",
  );
  const [quantity, setQuantity] = useState("1");
  const [goldType, setGoldType] = useState(item.goldTypeHint || item.browseGroup || "");
  const [goldAge, setGoldAge] = useState(item.goldAgeHint || "");
  const [error, setError] = useState<string | null>(null);

  const reference = item.referenceSellDongPerChi;
  const unit = parseDongInput(unitPrice);
  const exception = unitPrice !== "" && isPriceException(unit, reference, false);
  const diff = unit - reference;

  function submit() {
    const w = parseWeightInput(weightChi);
    const qty = Math.floor(parseDongInput(quantity)) || 0;
    if (reference <= 0) {
      setError("Sản phẩm chưa có giá niêm yết / chỉ.");
      return;
    }
    if (w <= 0) {
      setError("Trọng lượng (chỉ) phải lớn hơn 0.");
      return;
    }
    if (qty <= 0) {
      setError("Số lượng phải là số nguyên lớn hơn 0.");
      return;
    }
    if (unitPrice === "" || unit < 0) {
      setError("Nhập giá mua / chỉ (số nguyên VND).");
      return;
    }
    // Exception allowed on line; checkout still requires admin approve tick.

    onAdd({
      kind: "catalog",
      isMarketGold: false,
      localId: crypto.randomUUID(),
      skuId: item.skuId,
      sku: item.sku,
      productName: item.name,
      goldType: goldType.trim() || item.browseGroup || "Catalog",
      goldAge: goldAge.trim(),
      quantity: qty,
      weightChi: w,
      unitPriceDong: unit,
      referencePriceDongPerChi: reference,
      priceRowId: item.priceRowId,
      imageUrl: item.imageUrl,
    });
  }

  return (
    <Modal
      title="Thêm sản phẩm đang bán"
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
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f8f1e7]">
          <PurchaseProductThumb name={item.name} imageUrl={item.imageUrl} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{item.name}</p>
          <p className="text-[12px] text-[var(--tlkv-muted)]">{item.sku}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2.5 sm:col-span-2">
          <p className="text-[11px] text-[var(--tlkv-muted)]">Giá niêm yết hiện tại (tham chiếu / chỉ)</p>
          <p className="mt-0.5 text-[16px] font-bold text-[var(--tlkv-text)]">
            {reference > 0 ? formatDong(reference) : "Chưa có"}
          </p>
        </div>

        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Giá mua / chỉ (VND)</span>
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Trọng lượng (chỉ)</span>
          <input
            value={weightChi}
            onChange={(e) => setWeightChi(e.target.value)}
            inputMode="decimal"
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Số lượng</span>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-[var(--tlkv-muted)]">Tuổi vàng</span>
          <input
            value={goldAge}
            onChange={(e) => setGoldAge(e.target.value)}
            className={`${purchaseInputClass} mt-1`}
            placeholder="VD: 9999 / 18K"
          />
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="text-[var(--tlkv-muted)]">Loại vàng</span>
          <input
            value={goldType}
            onChange={(e) => setGoldType(e.target.value)}
            className={`${purchaseInputClass} mt-1`}
          />
        </label>
      </div>

      {unitPrice !== "" && reference > 0 ? (
        <div
          className={`mt-3 rounded-lg px-3 py-2.5 text-[12px] ${
            exception
              ? "border border-[var(--tlkv-amber)]/40 bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
              : "border border-[var(--tlkv-green)]/30 bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
          }`}
        >
          <p className="flex items-start gap-1.5 font-medium">
            {exception ? (
              <Warning size={14} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle size={14} className="mt-0.5 shrink-0" weight="fill" />
            )}
            <span>
              Chênh lệch {diff >= 0 ? "+" : ""}
              {formatDong(diff)}/chỉ
              {exception
                ? ` (vượt ngưỡng ±${formatDong(PRICE_EXCEPTION_THRESHOLD_DONG)}/chỉ - duyệt khi chốt phiếu)`
                : " - Trong phạm vi cho phép"}
            </span>
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-[12px] font-medium text-[var(--tlkv-red)]">{error}</p> : null}
    </Modal>
  );
}
