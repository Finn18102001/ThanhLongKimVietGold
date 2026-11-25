"use client";

import { useMemo, useState } from "react";
import { Printer } from "@phosphor-icons/react";
import {
  applySkuManualSellByCode,
  applySkuInvoiceShowLaborByCode,
  applySkuSellLaborByCode,
  applySkuSellPricingByCode,
} from "@/modules/inventory/actions";
import { PriceLinkControls } from "@/modules/inventory/components/PriceLinkControls";
import { ReceiveMetalTabs } from "@/modules/inventory/components/ReceiveMetalTabs";
import {
  resolveSkuSellPricingInput,
  type ReceiveMetalKind,
  type SellPriceMode,
} from "@/modules/inventory/priceLink";
import type { PriceRowOption } from "@/modules/inventory/types";
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
  metalKind: ReceiveMetalKind;
  name: string;
  brandId: string;
  categoryId: string;
  productTypeId: string;
  priceRowId: string;
  skuPrefix: string;
  weightChi: string;
  goldAge: string;
  spotBuyDong: string;
  receiveLaborDong: string;
  sellLaborDong: string;
  invoiceShowLaborLine: boolean;
  visible: boolean;
  expectedQty: string;
  receivedQty: string;
  costPriceDong: string;
  sellPriceDong: string;
  sellMode: SellPriceMode;
  heso: string;
  supplierName: string;
  paymentMethod: LabelReceivePaymentMethod;
  reason: string;
};

function emptyDraft(defaultBrandId: string): Draft {
  return {
    metalKind: "gold",
    name: "",
    brandId: defaultBrandId,
    categoryId: "",
    productTypeId: "",
    priceRowId: "",
    skuPrefix: "TLKVTS",
    weightChi: "1",
    goldAge: "",
    spotBuyDong: "",
    receiveLaborDong: "0",
    sellLaborDong: "0",
    invoiceShowLaborLine: true,
    visible: false,
    expectedQty: "0",
    receivedQty: "1",
    costPriceDong: "",
    sellPriceDong: "",
    sellMode: "link",
    heso: "",
    supplierName: "",
    paymentMethod: "CASH",
    reason: "In tem kiêm nhập kho",
  };
}

function isWholeNumber(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

/** Combined receive + label print (kho Order path). */
export function CombinedReceivePrintPanel({
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<LabelReceiveResult | null>(null);

  const priceRows: PriceRowOption[] = options.priceRows.map((row) => ({
    id: row.id,
    brand: row.brand,
    product: row.product,
    purity: row.purity,
    buyDong: row.buyDong,
    sellDong: row.sellDong,
  }));

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  const linkedCategories = useMemo(() => {
    const allowed = new Set(
      options.brandCategories
        .filter((link) => link.brandId === draft.brandId)
        .map((link) => link.categoryId),
    );
    return options.categories.filter((category) => allowed.has(category.id));
  }, [draft.brandId, options.brandCategories, options.categories]);

  const selectedPrice = priceRows.find((row) => row.id === draft.priceRowId) ?? null;
  const brandName = options.brands.find((b) => b.id === draft.brandId)?.name ?? "—";
  const categoryName =
    options.categories.find((c) => c.id === draft.categoryId)?.name ?? "(không chọn)";
  const receivedQty = isWholeNumber(draft.receivedQty) ? Number(draft.receivedQty) : 0;
  const costPriceDong = isWholeNumber(draft.costPriceDong) ? Number(draft.costPriceDong) : 0;
  const totalDong = receivedQty * costPriceDong;
  const weightChi = Number(draft.weightChi);

  function localError(): string | null {
    if (!draft.name.trim() || !draft.brandId) return "Tên sản phẩm và thương hiệu là bắt buộc.";
    if (!/^[A-Z0-9]{2,12}$/.test(draft.skuPrefix)) {
      return "Mã đầu gồm 2 đến 12 ký tự chữ hoặc số.";
    }
    if (draft.weightChi.trim() === "" || !Number.isFinite(weightChi) || weightChi < 0) {
      return "Định lượng (chỉ) không hợp lệ.";
    }
    if (draft.metalKind === "gold") {
      const goldAge = draft.goldAge.trim();
      if (!goldAge) return "Nhập vàng cần hàm lượng / tuổi vàng.";
      if (!GOLD_AGE_PATTERN.test(goldAge)) return "Tuổi vàng là số, tối đa 3 chữ số thập phân.";
      const value = Number(goldAge);
      if (!(value > 0 && value <= 1000)) return "Tuổi vàng phải lớn hơn 0 và không quá 1000.";
    }
    if (!isWholeNumber(draft.expectedQty)) return "Số dự kiến phải là số nguyên không âm.";
    if (!isWholeNumber(draft.receivedQty) || receivedQty <= 0) {
      return "Số nhận thực tế phải là số nguyên > 0.";
    }
    if (!isWholeNumber(draft.costPriceDong)) return "Giá vốn phải là số nguyên VND không âm.";
    if (draft.metalKind === "silver") {
      const sell = draft.sellPriceDong.trim() === "" ? NaN : Number(draft.sellPriceDong);
      if (!Number.isInteger(sell) || sell <= 0) {
        return "Nhập bạc cần giá bán / chiếc là số nguyên VND > 0 để hiện trên bán hàng.";
      }
    } else if (!draft.priceRowId.trim()) {
      // P9.4: vàng không link → bắt buộc giá gợi ý tay.
      const sell = draft.sellPriceDong.trim() === "" ? NaN : Number(draft.sellPriceDong);
      if (!Number.isInteger(sell) || sell <= 0) {
        return "Vàng không liên kết bảng giá cần giá bán gợi ý / chiếc (số nguyên VND > 0).";
      }
    }
    if (!draft.supplierName.trim()) return "Nhà cung cấp là bắt buộc.";
    return null;
  }

  function openConfirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const invalid = localError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmReceiveAndPrint() {
    if (pending) return;
    setConfirmOpen(false);
    setPending(true);
    setError(null);
    try {
      const result = await receiveLabelOrderPurchase({
        idempotencyKey,
        name: draft.name,
        brandId: draft.brandId,
        categoryId: draft.categoryId,
        productTypeId: draft.productTypeId,
        priceRowId: draft.priceRowId,
        priceNote: "",
        skuPrefix: draft.skuPrefix,
        weightChi,
        goldAge: draft.metalKind === "gold" ? draft.goldAge : "",
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
      const sellLabor = Math.trunc(Number(draft.sellLaborDong.replace(/\D/g, "")) || 0);
      const sellPricing = resolveSkuSellPricingInput({
        metalKind: draft.metalKind,
        sellMode: draft.sellMode,
        purityText: draft.goldAge,
        heso: draft.heso,
      });
      if (result.data.skuCode) {
        try {
          if (sellLabor >= 0) {
            await applySkuSellLaborByCode(result.data.skuCode, sellLabor);
          }
          await applySkuInvoiceShowLaborByCode(
            result.data.skuCode,
            draft.invoiceShowLaborLine,
          );
          await applySkuSellPricingByCode(result.data.skuCode, sellPricing);
          const sellRaw = draft.sellPriceDong.trim();
          const sellDong = sellRaw === "" ? null : Number(sellRaw);
          const hasPriceLink = Boolean(draft.priceRowId.trim());
          await applySkuManualSellByCode(result.data.skuCode, {
            metalKind: draft.metalKind,
            manualSellDong:
              draft.metalKind === "gold" && hasPriceLink
                ? null
                : sellDong != null && Number.isInteger(sellDong)
                  ? sellDong
                  : null,
          });
        } catch (laborErr) {
          setError(
            `Đã nhập phiếu ${result.data.receiptNo} nhưng chưa lưu công bán / chế độ giá / giá bán: ${
              laborErr instanceof Error ? laborErr.message : "lỗi không xác định"
            }`,
          );
        }
      }
      // Keep same key until success so retry after print failure does not double-receive
      // when user re-submits; rotate only after successful receive.
      setIdempotencyKey(crypto.randomUUID());
      setLastReceipt(result.data);
      setDraft(emptyDraft(defaultBrandId));
      setSuccess(
        result.data.replayed
          ? `Phiếu ${result.data.receiptNo} đã ghi trước (mã ${result.data.skuCode}). Không cộng tồn lần nữa. In lại ở khung In tem bên dưới.`
          : `Đã nhập ${receivedQty} chiếc · phiếu ${result.data.receiptNo} · mã ${result.data.skuCode}. SKU đã đẩy xuống khung In tem bên dưới - in ngay tại đây.`,
      );
      onReceived(result.data);
    } catch {
      setError("Không gửi được yêu cầu. Dữ liệu form còn nguyên — thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">1. Nhập kho Order</h2>
          <p className="mt-1 max-w-[65ch] text-[12px] text-[var(--tlkv-muted)]">
            Điền Order, xác nhận nhập kho. Sau khi ghi thành công, SKU/Unit đẩy xuống khung{" "}
            <span className="font-medium text-[var(--tlkv-text)]">2. In tem</span> bên dưới - in
            ngay trên cùng màn hình, không đổi tab. In lỗi: giữ phiếu, chỉ in lại.
          </p>
        </div>
        <Printer size={20} className="shrink-0 text-[var(--tlkv-muted)]" aria-hidden />
      </div>

      {lastReceipt ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          Phiếu gần nhất: <strong>{lastReceipt.receiptNo}</strong> · SKU{" "}
          <strong>{lastReceipt.skuCode}</strong>
          {lastReceipt.replayed ? " (replay)" : ""}. In ở khung bên dưới - không nhập lại nếu chỉ
          lỗi in.
        </div>
      ) : null}

      <div className="mt-4">
        <ReceiveMetalTabs
          value={draft.metalKind}
          onChange={(metalKind) =>
            patch({
              metalKind,
              priceRowId: "",
              spotBuyDong: "",
              receiveLaborDong: "0",
              sellLaborDong: "0",
              invoiceShowLaborLine: true,
              costPriceDong: "",
              sellPriceDong: "",
              heso: "",
              goldAge: metalKind === "silver" ? "" : draft.goldAge,
            })
          }
        />
      </div>

      <form onSubmit={openConfirm} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            onChange={(e) => {
              const brandId = e.target.value;
              const still = options.brandCategories.some(
                (link) => link.brandId === brandId && link.categoryId === draft.categoryId,
              );
              patch({ brandId, categoryId: still ? draft.categoryId : "" });
            }}
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
            {linkedCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Loại sản phẩm
          <select
            value={draft.productTypeId}
            onChange={(e) => patch({ productTypeId: e.target.value })}
            className={FIELD}
          >
            <option value="">Chưa phân loại</option>
            {options.productTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
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
        {draft.metalKind === "gold" ? (
          <label className={`${LABEL} sm:col-span-2`}>
            Tuổi vàng / hàm lượng
            <input
              inputMode="decimal"
              list="combined-receive-gold-age"
              placeholder="VD: 999.9, 750, 610.5"
              value={draft.goldAge}
              onChange={(e) => patch({ goldAge: e.target.value.replace(",", ".").trim() })}
              className={FIELD}
            />
            <datalist id="combined-receive-gold-age">
              {GOLD_AGE_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
        ) : null}

        <PriceLinkControls
          metalKind={draft.metalKind}
          priceRows={priceRows}
          priceRowId={draft.priceRowId}
          onPriceRowIdChange={(id) => patch({ priceRowId: id })}
          weightChi={Number.isFinite(weightChi) ? weightChi : 0}
          purityText={draft.goldAge}
          onPurityTextChange={(value) => patch({ goldAge: value })}
          showPurityField={false}
          spotBuyDong={draft.spotBuyDong}
          onSpotBuyDongChange={(value) => patch({ spotBuyDong: value })}
          receiveLaborDong={draft.receiveLaborDong}
          onReceiveLaborDongChange={(value) => patch({ receiveLaborDong: value })}
          sellLaborDong={draft.sellLaborDong}
          onSellLaborDongChange={(value) => patch({ sellLaborDong: value })}
          invoiceShowLaborLine={draft.invoiceShowLaborLine}
          onInvoiceShowLaborLineChange={(value) => patch({ invoiceShowLaborLine: value })}
          costPriceDong={draft.costPriceDong}
          onCostPriceDongChange={(value) => patch({ costPriceDong: value })}
          sellPriceDong={draft.sellPriceDong}
          onSellPriceDongChange={(value) => patch({ sellPriceDong: value })}
          sellMode={draft.sellMode}
          onSellModeChange={(mode) => patch({ sellMode: mode })}
          heso={draft.heso}
          onHesoChange={(value) => patch({ heso: value })}
        />

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
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.visible}
            onChange={(e) => patch({ visible: e.target.checked })}
          />
          Hiển thị
          <span className="text-[11px] text-[var(--tlkv-muted)]">Mặc định tắt — chỉnh sau ở /admin.</span>
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
          Nhà cung cấp
          <input
            value={draft.supplierName}
            onChange={(e) => patch({ supplierName: e.target.value })}
            className={FIELD}
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-[12px] text-[var(--tlkv-muted)]">Thanh toán phiếu nhập</legend>
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
          <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2"
        >
          {pending ? "Đang ghi..." : "Xác nhận nhập kho"}
        </button>
      </form>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
            <h3 className="text-[15px] font-semibold">Xác nhận nhập kho</h3>
            <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
              Sau khi ghi kho, form In tem bên dưới nhận SKU vừa tạo để in ngay.
            </p>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Thương hiệu</dt>
                <dd className="text-right font-medium">{brandName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Danh mục / SP</dt>
                <dd className="text-right font-medium">
                  {categoryName} · {draft.name.trim()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Hàm lượng</dt>
                <dd className="text-right font-medium">{draft.goldAge.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Trọng lượng</dt>
                <dd className="text-right font-medium tabular-nums">{weightChi} chỉ</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Số lượng nhận</dt>
                <dd className="text-right font-medium tabular-nums">{receivedQty}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Dòng giá</dt>
                <dd className="max-w-[60%] text-right font-medium">
                  {selectedPrice
                    ? `${selectedPrice.brand} · ${selectedPrice.product}`
                    : "(không gắn)"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Giá mua (buy)</dt>
                <dd className="text-right font-medium tabular-nums">
                  {selectedPrice ? formatDong(selectedPrice.buyDong) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Giá vốn / chiếc</dt>
                <dd className="text-right font-medium tabular-nums">{formatDong(costPriceDong)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Giá bán gợi ý</dt>
                <dd className="text-right font-medium tabular-nums">
                  {draft.sellPriceDong ? formatDong(Number(draft.sellPriceDong)) : "—"}
                  {draft.sellMode === "heso" ? " (mode hệ số)" : " (mode link)"}
                </dd>
              </div>
              {draft.sellMode === "heso" ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--tlkv-muted)]">Hệ số</dt>
                  <dd className="text-right font-medium tabular-nums">{draft.heso || "(chưa nhập)"}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-[var(--tlkv-line)] pt-2">
                <dt className="text-[var(--tlkv-muted)]">Thành tiền vốn</dt>
                <dd className="text-right font-semibold tabular-nums">{formatDong(totalDong)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">NCC / TT</dt>
                <dd className="text-right font-medium">
                  {draft.supplierName} · {draft.paymentMethod === "CASH" ? "Tiền mặt" : "CK"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--tlkv-muted)]">Mã đầu tem</dt>
                <dd className="text-right font-medium">{draft.skuPrefix} + 6 số</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void confirmReceiveAndPrint()}
                className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-[13px] font-semibold text-white"
              >
                Xác nhận nhập kho
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
