"use client";

import { useEffect, useMemo, useState } from "react";
import { formatActionError } from "@/shared/lib/action-result";
import { formatDong } from "@/shared/lib/money";
import {
  getLabelDraftAction,
  listPendingLabelDraftsAction,
} from "@/modules/label-print/draft-actions";
import type { LabelDraftDetail, LabelDraftSummary } from "@/modules/label-print/draft-types";
import { receiveLabelDraftAction } from "../draft-receive-actions";
import type { SellPriceMode } from "../priceLink";
import type { BrandCategoryLink, BrandOption, CategoryOption, PriceRowOption, ProductTypeOption } from "../types";
import { PriceLinkControls } from "./PriceLinkControls";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

type DiffRow = { field: string; draft: string; form: string };

function moneyText(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "(trống)";
  return formatDong(Math.round(v));
}

export function DraftReceivePanel({
  brands,
  categories,
  priceRows,
  productTypes,
  brandCategories,
}: {
  brands: BrandOption[];
  categories: CategoryOption[];
  priceRows: PriceRowOption[];
  productTypes: ProductTypeOption[];
  brandCategories: BrandCategoryLink[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LabelDraftSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LabelDraftDetail | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [priceRowId, setPriceRowId] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [skuPrefix, setSkuPrefix] = useState("TLKVTS");
  const [visible, setVisible] = useState(false);
  const [weightChi, setWeightChi] = useState(1);
  const [costPriceDong, setCostPriceDong] = useState("");
  const [sellPriceDong, setSellPriceDong] = useState("");
  const [sellMode, setSellMode] = useState<SellPriceMode>("link");
  const [heso, setHeso] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [reason, setReason] = useState("Nhập hàng từ draft tem");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null);

  const linkedCategories = useMemo(() => {
    const allowed = new Set(
      brandCategories.filter((link) => link.brandId === brandId).map((link) => link.categoryId),
    );
    return categories.filter((category) => allowed.has(category.id));
  }, [brandCategories, categories, brandId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listPendingLabelDraftsAction(query);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOptions(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function selectDraft(id: string) {
    setSelectedId(id);
    setError(null);
    setSuccess(null);
    setDiffRows(null);
    if (!id) {
      setDraft(null);
      return;
    }
    const result = await getLabelDraftAction(id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const d = result.data;
    setDraft(d);
    setName(d.productName);
    setWeightChi(d.weightChi ?? 1);
    setCostPriceDong(d.costPriceDong == null ? "" : String(d.costPriceDong));
    setSellPriceDong(d.sellPriceDong == null ? "" : String(d.sellPriceDong));
    setPriceRowId(d.priceRowId ?? "");
    setPriceNote(d.priceNote ?? "");
    // Brand/Category must be re-selected from system lists (PRE-19/20)
    setBrandId(brands[0]?.id ?? "");
    setCategoryId("");
    setProductTypeId("");
  }

  function restoreFromSnapshot() {
    if (!draft) return;
    setName(draft.productName);
    setWeightChi(draft.weightChi ?? 1);
    setCostPriceDong(draft.costPriceDong == null ? "" : String(draft.costPriceDong));
    setSellPriceDong(draft.sellPriceDong == null ? "" : String(draft.sellPriceDong));
    setPriceRowId(draft.priceRowId ?? "");
    setPriceNote(draft.priceNote ?? "");
    setDiffRows(null);
  }

  function buildDiffs(): DiffRow[] {
    if (!draft) return [];
    const rows: DiffRow[] = [];
    const snap = draft.snapshotJson;
    const draftName = String(snap.product_name ?? draft.productName);
    const draftCost = snap.cost_price_dong === "" || snap.cost_price_dong == null
      ? draft.costPriceDong
      : Number(snap.cost_price_dong);
    const draftSell = snap.sell_price_dong === "" || snap.sell_price_dong == null
      ? draft.sellPriceDong
      : Number(snap.sell_price_dong);
    const draftWeight = snap.weight_chi === "" || snap.weight_chi == null
      ? draft.weightChi
      : Number(snap.weight_chi);

    if (name.trim() !== draftName.trim()) {
      rows.push({ field: "Tên sản phẩm", draft: draftName, form: name.trim() || "(trống)" });
    }
    const formCost = costPriceDong.trim() === "" ? null : Number(costPriceDong);
    if (formCost !== (draftCost == null || Number.isNaN(Number(draftCost)) ? null : Number(draftCost))) {
      rows.push({
        field: "Giá nhập",
        draft: moneyText(draftCost == null ? null : Number(draftCost)),
        form: moneyText(formCost),
      });
    }
    const formSell = sellPriceDong.trim() === "" ? null : Number(sellPriceDong);
    if (formSell !== (draftSell == null || Number.isNaN(Number(draftSell)) ? null : Number(draftSell))) {
      rows.push({
        field: "Giá bán",
        draft: moneyText(draftSell == null ? null : Number(draftSell)),
        form: moneyText(formSell),
      });
    }
    if (Number(weightChi) !== Number(draftWeight ?? 1)) {
      rows.push({
        field: "Định lượng",
        draft: String(draftWeight ?? "(trống)"),
        form: String(weightChi),
      });
    }
    return rows;
  }

  async function confirmReceive(forceWithDiff: boolean) {
    if (!draft || pending) return;
    setError(null);
    setSuccess(null);

    if (!brandId || !categoryId) {
      setError("Phải chọn Brand và Category hợp lệ trong hệ thống trước khi nhập kho.");
      return;
    }
    if (!supplierName.trim()) {
      setError("Nhà cung cấp bắt buộc.");
      return;
    }
    const cost = Number(costPriceDong);
    if (!Number.isInteger(cost) || cost < 0) {
      setError("Giá vốn phải là số nguyên VND không âm.");
      return;
    }
    const sellRaw = sellPriceDong.trim();
    const sell = sellRaw === "" ? null : Number(sellRaw);
    if (sell != null && (!Number.isInteger(sell) || sell < 0)) {
      setError("Giá bán phải là số nguyên VND không âm.");
      return;
    }
    if (!/^[A-Za-z0-9]{2,12}$/.test(skuPrefix.trim())) {
      setError("Mã đầu SKU gồm 2–12 ký tự chữ hoặc số.");
      return;
    }

    const diffs = buildDiffs();
    if (diffs.length > 0 && !forceWithDiff) {
      setDiffRows(diffs);
      return;
    }

    setPending(true);
    try {
      const result = await receiveLabelDraftAction({
        draftId: draft.id,
        idempotencyKey,
        supplierName: supplierName.trim(),
        reason: reason.trim() || "Nhập hàng từ draft tem",
        brandId,
        categoryId,
        costPriceDong: cost,
        sellPriceDong: sell,
        paymentMethod,
        order: {
          name: name.trim(),
          priceRowId: priceRowId || null,
          priceNote,
          weightChi: Number(weightChi) || 1,
          skuPrefix: skuPrefix.trim().toUpperCase(),
          visible,
          productTypeId: productTypeId || null,
          goldAge: draft.goldAgeText,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIdempotencyKey(crypto.randomUUID());
      setDiffRows(null);
      setSuccess(
        `Đã nhập draft ${result.data.printableCode}` +
          (result.data.skuCode ? ` · SKU ${result.data.skuCode}` : "") +
          (result.data.unitId ? ` · Unit ${result.data.unitId.slice(0, 8)}…` : "") +
          (result.data.replayed ? " (replay idempotent)" : "") +
          `. Giá bán chưa ghi vào labor_fee/unit_price (sell_price_applied_to_sku=false).`,
      );
      setSelectedId("");
      setDraft(null);
      const refreshed = await listPendingLabelDraftsAction(query);
      if (refreshed.ok) setOptions(refreshed.data);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="text-[15px] font-semibold">Nhập từ tem draft (P7)</h2>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Chỉ chọn <strong>một</strong> draft đã in, chưa nhập. received_qty = 1. Brand/Category phải
        chọn lại từ danh mục hệ thống. Snapshot gốc không bị ghi đè.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Tìm draft chờ nhập
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="MSP / tên / brand…"
            className={FIELD}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Chọn draft (1)
          <select
            value={selectedId}
            onChange={(e) => void selectDraft(e.target.value)}
            className={FIELD}
          >
            <option value="">— Chọn tem chưa nhập kho —</option>
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.printableCode} · {row.productName} · {row.brandText || "—"} ·{" "}
                {row.printedAt ? new Date(row.printedAt).toLocaleString("vi-VN") : "—"}
              </option>
            ))}
          </select>
        </label>

        {draft ? (
          <>
            <p className="sm:col-span-2 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
              Draft <strong>{draft.printableCode}</strong> ({draft.codeMode}) · brand text:{" "}
              <em>{draft.brandText || "(trống)"}</em> · category text:{" "}
              <em>{draft.categoryText || "(trống)"}</em>
            </p>
            <label className="text-sm sm:col-span-2">
              Tên sản phẩm
              <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
            </label>
            <label className="text-sm">
              Brand (chọn lại) *
              <select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setCategoryId("");
                }}
                className={FIELD}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Category (chọn lại) *
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={FIELD}
              >
                <option value="">— Chọn —</option>
                {linkedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Loại sản phẩm (optional)
              <select
                value={productTypeId}
                onChange={(e) => setProductTypeId(e.target.value)}
                className={FIELD}
              >
                <option value="">— Không chọn —</option>
                {productTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Định lượng (chỉ)
              <input
                type="number"
                min={0}
                step="0.0001"
                value={weightChi}
                onChange={(e) => setWeightChi(Number(e.target.value))}
                className={FIELD}
              />
            </label>
            <PriceLinkControls
              priceRows={priceRows}
              priceRowId={priceRowId}
              onPriceRowIdChange={setPriceRowId}
              weightChi={weightChi}
              costPriceDong={costPriceDong}
              onCostPriceDongChange={setCostPriceDong}
              sellPriceDong={sellPriceDong}
              onSellPriceDongChange={setSellPriceDong}
              sellMode={sellMode}
              onSellModeChange={setSellMode}
              heso={heso}
              onHesoChange={setHeso}
            />
            <label className="text-sm">
              Mã đầu SKU
              <input
                value={skuPrefix}
                onChange={(e) => setSkuPrefix(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Ghi chú giá
              <input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} className={FIELD} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Hiển thị catalog
            </label>
            <label className="text-sm sm:col-span-2">
              Nhà cung cấp *
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Lý do
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm">Thanh toán</legend>
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
                    onClick={() => setPaymentMethod(option.value)}
                    className={`h-9 rounded-lg text-[12px] font-semibold ${
                      paymentMethod === option.value
                        ? "bg-[var(--tlkv-red)] text-white"
                        : "border border-[var(--tlkv-line)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              disabled={pending}
              onClick={() => void confirmReceive(false)}
              className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2"
            >
              {pending ? "Đang nhập…" : "Xác nhận nhập kho từ draft (qty=1)"}
            </button>
          </>
        ) : null}
      </div>

      {diffRows && diffRows.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px]">
          <p className="font-semibold text-amber-900">
            Thông tin nhập kho có sự khác biệt so với dữ liệu tem đã in
          </p>
          <table className="mt-3 w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-amber-200">
                <th className="py-1">Trường</th>
                <th className="py-1">Dữ liệu tem</th>
                <th className="py-1">Dữ liệu nhập kho</th>
              </tr>
            </thead>
            <tbody>
              {diffRows.map((row) => (
                <tr key={row.field} className="border-b border-amber-100">
                  <td className="py-1 font-medium">{row.field}</td>
                  <td className="py-1">{row.draft}</td>
                  <td className="py-1">{row.form}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void confirmReceive(true)}
              className="h-9 rounded-lg bg-[var(--tlkv-green)] px-3 text-[12px] font-semibold text-white"
            >
              Đồng ý thay đổi
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={restoreFromSnapshot}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-semibold"
            >
              Không đồng ý — reset về snapshot gốc
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {formatActionError(error)}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {success}
        </p>
      ) : null}
    </section>
  );
}
