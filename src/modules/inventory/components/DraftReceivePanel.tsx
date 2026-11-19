"use client";

import { useEffect, useMemo, useState } from "react";
import { formatActionError } from "@/shared/lib/action-result";
import { formatDong } from "@/shared/lib/money";
import { DongInput } from "@/shared/ui/DongInput";
import {
  getLabelDraftAction,
  listPendingLabelDraftsAction,
} from "@/modules/label-print/draft-actions";
import type { LabelDraftDetail, LabelDraftSummary } from "@/modules/label-print/draft-types";
import { receiveLabelDraftAction } from "../draft-receive-actions";
import type { ReceiveMetalKind, SellPriceMode } from "../priceLink";
import type {
  BrandCategoryLink,
  BrandOption,
  CategoryOption,
  PriceRowOption,
  ProductTypeOption,
} from "../types";
import { PriceLinkControls } from "./PriceLinkControls";
// ReceiveMetalTabs tạm ẩn trên P7 draft receive — chưa chốt rule lọc vàng/bạc theo draft.

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";
const PAGE_SIZES = [5, 10, 20, 50] as const;
const TH = "px-2 py-2 text-left text-[11px] font-medium text-[var(--tlkv-muted)]";
const TD = "px-2 py-2 align-middle text-[12px]";

type DiffRow = { field: string; draft: string; form: string };

function moneyText(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "(trống)";
  return formatDong(Math.round(v));
}

function chiText(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function tablePrice(row: LabelDraftSummary) {
  if (row.sellPriceDong != null) return formatDong(row.sellPriceDong);
  if (row.costPriceDong != null) return formatDong(row.costPriceDong);
  return "—";
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
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LabelDraftSummary[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LabelDraftDetail | null>(null);
  const [lockPrefill, setLockPrefill] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [priceRowId, setPriceRowId] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [skuPrefix, setSkuPrefix] = useState("TLKVTS");
  const [typeCode, setTypeCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [weightChi, setWeightChi] = useState(1);
  const [kltChi, setKltChi] = useState("");
  const [klvChi, setKlvChi] = useState("");
  /** Tạm cố định vàng khi ẩn tab P9; bật lại ReceiveMetalTabs khi chốt rule lọc. */
  const metalKind: ReceiveMetalKind = "gold";
  const [purityText, setPurityText] = useState("");
  const [spotBuyDong, setSpotBuyDong] = useState("");
  const [receiveLaborDong, setReceiveLaborDong] = useState("0");
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

  // Keep existing Search action/predicate (listPendingLabelDraftsAction + query).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const result = await listPendingLabelDraftsAction(query);
      if (cancelled) return;
      setLoadingList(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setOptions(Array.isArray(result.data) ? result.data : []);
      setPage(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const pageCount = Math.max(1, Math.ceil(options.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = options.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function applyDraftFields(d: LabelDraftDetail) {
    const weight = d.weightChi ?? d.klvChi ?? d.kltChi ?? 1;
    const type = (d.typeCode ?? "").trim().toUpperCase();

    setName(d.productName);
    setWeightChi(weight);
    setKltChi(chiText(d.kltChi ?? (d.weightChi != null ? d.weightChi : null)));
    setKlvChi(chiText(d.klvChi ?? (d.weightChi != null ? d.weightChi : null)));
    setPurityText(d.goldAgeText ?? "");
    setSpotBuyDong("");
    setReceiveLaborDong(d.laborFeeDong == null ? "0" : String(Math.round(d.laborFeeDong)));
    setCostPriceDong(d.costPriceDong == null ? "" : String(d.costPriceDong));
    setSellPriceDong(d.sellPriceDong == null ? "" : String(d.sellPriceDong));
    setPriceRowId(d.priceRowId ?? "");
    setPriceNote(d.priceNote ?? "");
    setTypeCode(type);
    if (/^[A-Za-z0-9]{2,12}$/.test(type)) {
      setSkuPrefix(type);
    }
    // Brand/Category must be re-selected from system lists (PRE-19/20) — unchanged.
    setBrandId(brands[0]?.id ?? "");
    setCategoryId("");
    setProductTypeId("");
  }

  /** Re-assert draft money fields while PriceLinkControls may auto-suggest after price_row bind. */
  useEffect(() => {
    if (!draft || !lockPrefill) return;
    if (draft.costPriceDong != null) setCostPriceDong(String(draft.costPriceDong));
    if (draft.sellPriceDong != null) setSellPriceDong(String(draft.sellPriceDong));
    if (draft.laborFeeDong != null) {
      setReceiveLaborDong(String(Math.round(draft.laborFeeDong)));
    }
    if (draft.goldAgeText != null) setPurityText(draft.goldAgeText);
    if (draft.weightChi != null) setWeightChi(draft.weightChi);
    const timer = window.setTimeout(() => setLockPrefill(false), 120);
    return () => window.clearTimeout(timer);
  }, [
    draft,
    lockPrefill,
    priceRowId,
    spotBuyDong,
    receiveLaborDong,
    purityText,
    weightChi,
    metalKind,
  ]);

  async function selectDraftForReceive(id: string) {
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
    applyDraftFields(d);
    setLockPrefill(true);
  }

  function restoreFromSnapshot() {
    if (!draft) return;
    applyDraftFields(draft);
    setLockPrefill(true);
    setDiffRows(null);
  }

  function buildDiffs(): DiffRow[] {
    if (!draft) return [];
    const rows: DiffRow[] = [];
    const snap = draft.snapshotJson;
    const draftName = String(snap.product_name ?? draft.productName);
    const draftCost =
      snap.cost_price_dong === "" || snap.cost_price_dong == null
        ? draft.costPriceDong
        : Number(snap.cost_price_dong);
    const draftSell =
      snap.sell_price_dong === "" || snap.sell_price_dong == null
        ? draft.sellPriceDong
        : Number(snap.sell_price_dong);
    const draftWeight =
      snap.weight_chi === "" || snap.weight_chi == null ? draft.weightChi : Number(snap.weight_chi);
    const draftLabor =
      snap.labor_fee_dong === "" || snap.labor_fee_dong == null
        ? draft.laborFeeDong
        : Number(snap.labor_fee_dong);
    const draftGoldAge = String(snap.gold_age_text ?? draft.goldAgeText ?? "");
    const draftType = String(snap.type_code ?? draft.typeCode ?? "").trim().toUpperCase();
    const draftKlt =
      snap.klt_chi === "" || snap.klt_chi == null ? draft.kltChi : Number(snap.klt_chi);
    const draftKlv =
      snap.klv_chi === "" || snap.klv_chi == null ? draft.klvChi : Number(snap.klv_chi);

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
    const formLabor = receiveLaborDong.trim() === "" ? 0 : Number(receiveLaborDong);
    const expectedLabor =
      draftLabor == null || Number.isNaN(Number(draftLabor)) ? 0 : Number(draftLabor);
    if (formLabor !== expectedLabor) {
      rows.push({
        field: "Tiền công",
        draft: moneyText(expectedLabor),
        form: moneyText(formLabor),
      });
    }
    if (Number(weightChi) !== Number(draftWeight ?? 1)) {
      rows.push({
        field: "Định lượng",
        draft: String(draftWeight ?? "(trống)"),
        form: String(weightChi),
      });
    }
    if (chiText(draftKlt) !== kltChi.trim()) {
      rows.push({
        field: "KLT",
        draft: chiText(draftKlt) || "(trống)",
        form: kltChi.trim() || "(trống)",
      });
    }
    if (chiText(draftKlv) !== klvChi.trim()) {
      rows.push({
        field: "KLV",
        draft: chiText(draftKlv) || "(trống)",
        form: klvChi.trim() || "(trống)",
      });
    }
    if (purityText.trim() !== draftGoldAge.trim()) {
      rows.push({
        field: "Tuổi vàng / bạc (HL)",
        draft: draftGoldAge || "(trống)",
        form: purityText.trim() || "(trống)",
      });
    }
    if (typeCode.trim().toUpperCase() !== draftType) {
      rows.push({
        field: "Mã loại (type_code)",
        draft: draftType || "(trống)",
        form: typeCode.trim().toUpperCase() || "(trống)",
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
          goldAge: metalKind === "gold" ? purityText.trim() || draft.goldAgeText : null,
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
          `. Giá bán gợi ý không ghi labor_fee (công bán chỉ trên HĐ; công nhập chỉ trong giá vốn).`,
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
        Chỉ chọn <strong>một</strong> draft đã in, chưa nhập. received_qty = 1. Nút{" "}
        <strong>Nhập kho</strong> trên bảng chỉ chọn tem và điền form — chưa hoàn tất nhập. Brand /
        Category chọn lại từ danh mục hệ thống. Snapshot gốc không bị ghi đè.
      </p>

      {/* P9 tabs Nhập vàng/Nhập bạc: tạm ẩn — list draft chưa có metal_kind chốt được. */}

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[220px] flex-1 text-sm">
            Tìm draft chờ nhập
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="MSP / tên / brand…"
              className={FIELD}
            />
          </label>
          <button
            type="button"
            disabled={loadingList}
            onClick={() => {
              setError(null);
              void (async () => {
                setLoadingList(true);
                const result = await listPendingLabelDraftsAction(query);
                setLoadingList(false);
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setOptions(Array.isArray(result.data) ? result.data : []);
                setPage(0);
              })();
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold disabled:opacity-40"
          >
            {loadingList ? "Đang tải…" : "Tải lại danh sách"}
          </button>
        </div>

        <div>
          <p className="text-sm font-medium">Chọn draft (1)</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--tlkv-line)]">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[var(--tlkv-bg)]">
                <tr>
                  <th className={TH}>STT</th>
                  <th className={TH}>MSP</th>
                  <th className={TH}>SKU</th>
                  <th className={TH}>Tên sản phẩm</th>
                  <th className={TH}>Hàm lượng</th>
                  <th className={`${TH} text-right`}>Trọng lượng</th>
                  <th className={`${TH} text-right`}>Giá</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[var(--tlkv-muted)]">
                      Đang tải danh sách draft…
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[var(--tlkv-muted)]">
                      {query.trim()
                        ? "Không có draft khớp tìm kiếm."
                        : "Chưa có draft chờ nhập."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, index) => {
                    const selected = row.id === selectedId;
                    const stt = safePage * pageSize + index + 1;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-[var(--tlkv-line)] ${
                          selected ? "bg-red-50/60" : "hover:bg-[var(--tlkv-bg)]"
                        }`}
                      >
                        <td className={`${TD} tabular-nums text-[var(--tlkv-muted)]`}>{stt}</td>
                        <td className={`${TD} font-medium tabular-nums`}>{row.printableCode}</td>
                        <td className={`${TD} text-[var(--tlkv-muted)]`}>—</td>
                        <td className={TD}>
                          <div>{row.productName}</div>
                          <div className="text-[11px] text-[var(--tlkv-muted)]">
                            {row.brandText || "—"}
                            {row.categoryText ? ` · ${row.categoryText}` : ""}
                          </div>
                        </td>
                        <td className={`${TD} text-[var(--tlkv-muted)]`}>—</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {row.weightChi == null ? "—" : row.weightChi}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{tablePrice(row)}</td>
                        <td className={TD}>Chưa nhập kho</td>
                        <td className={TD}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void selectDraftForReceive(row.id)}
                            className={`h-8 rounded-lg px-2.5 text-[11px] font-semibold disabled:opacity-40 ${
                              selected
                                ? "bg-[var(--tlkv-red)] text-white"
                                : "border border-[var(--tlkv-line)] bg-white hover:border-[var(--tlkv-red)]"
                            }`}
                          >
                            {selected ? "Đã chọn" : "Nhập kho"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--tlkv-muted)]">
            <span>
              Hiển thị {options.length === 0 ? 0 : safePage * pageSize + 1}–
              {Math.min((safePage + 1) * pageSize, options.length)} / {options.length}
            </span>
            <label className="inline-flex items-center gap-1">
              Số dòng
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                  setPage(0);
                }}
                className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px]"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Trước
            </button>
            <span>
              {safePage + 1}/{pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {draft ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
            Draft <strong>{draft.printableCode}</strong> ({draft.codeMode}) · brand text:{" "}
            <em>{draft.brandText || "(trống)"}</em> · category text:{" "}
            <em>{draft.categoryText || "(trống)"}</em>
            {typeCode ? (
              <>
                {" "}
                · type_code: <em>{typeCode}</em>
              </>
            ) : null}
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
          <label className="text-sm">
            Mã loại (type_code)
            <input
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={24}
              className={FIELD}
            />
          </label>
          <label className="text-sm">
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
          <label className="text-sm">
            KLT (chỉ)
            <input
              type="number"
              min={0}
              step="0.0001"
              value={kltChi}
              onChange={(e) => setKltChi(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-sm">
            KLV (chỉ)
            <input
              type="number"
              min={0}
              step="0.0001"
              value={klvChi}
              onChange={(e) => setKlvChi(e.target.value)}
              className={FIELD}
            />
          </label>
          {metalKind === "silver" ? (
            <>
              <label className="text-sm sm:col-span-2">
                Tuổi bạc / HL (từ tem)
                <input
                  value={purityText}
                  onChange={(e) => setPurityText(e.target.value)}
                  placeholder="VD: 999 · để trống nếu tem không in"
                  maxLength={16}
                  className={FIELD}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Tiền công từ tem (VND)
                <DongInput
                  value={receiveLaborDong}
                  onValueChange={setReceiveLaborDong}
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                  Đối chiếu với tem. Nhập bạc không dùng công này để tính giá vốn.
                </span>
              </label>
            </>
          ) : null}
          <PriceLinkControls
            metalKind={metalKind}
            priceRows={priceRows}
            priceRowId={priceRowId}
            onPriceRowIdChange={setPriceRowId}
            weightChi={weightChi}
            purityText={purityText}
            onPurityTextChange={setPurityText}
            spotBuyDong={spotBuyDong}
            onSpotBuyDongChange={setSpotBuyDong}
            receiveLaborDong={receiveLaborDong}
            onReceiveLaborDongChange={setReceiveLaborDong}
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
        </div>
      ) : null}

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
