"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowClockwise, Printer } from "@phosphor-icons/react";
import { formatActionError } from "@/shared/lib/action-result";
import {
  createLabelDraftAction,
  recordLabelDraftPrintAction,
} from "../draft-actions";
import type { LabelDraftCodeMode } from "../draft-types";
import { composePreassignedLabelCode, normalizeLabelCodePart } from "../msp";
import { printLabelNodes } from "../print";
import { LabelPreview, LabelTag } from "./LabelPreview";
import {
  DEFAULT_ADDRESS_LINE,
  DEFAULT_COMPANY_SHORT,
  DEFAULT_ORIGIN,
  type LabelPrintPayload,
} from "../types";
import { loadLabelOffsets } from "../offsets";
import { loadLabelFonts } from "../fonts";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]";

function barcodeFromPrintableCode(code: string, mode: LabelDraftCodeMode): string {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return "PREVIEW";
  if (mode === "PRE_ASSIGNED") return trimmed;
  const serial = trimmed.includes("-") ? trimmed.split("-").pop() || trimmed : trimmed;
  return `BC${serial}`;
}

/**
 * Reading this as: redesign of existing POS admin In-tem draft tab — preserve TLKV
 * admin tokens/layout, match SKU print split (form + sticky Layout tem).
 */
export function DraftLabelPanel() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [codeMode, setCodeMode] = useState<LabelDraftCodeMode>("AUTO_MSP");
  const [typeCode, setTypeCode] = useState("");
  const [productNumber, setProductNumber] = useState("");
  const [productName, setProductName] = useState("");
  const [brandText, setBrandText] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [costPriceDong, setCostPriceDong] = useState("");
  const [sellPriceDong, setSellPriceDong] = useState("");
  const [laborFeeDong, setLaborFeeDong] = useState("0");
  const [weightChi, setWeightChi] = useState("");
  const [kltChi, setKltChi] = useState("");
  const [klvChi, setKlvChi] = useState("");
  const [kldChi, setKldChi] = useState("0");
  const [goldAgeText, setGoldAgeText] = useState("");
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_SHORT);
  const [addressLine, setAddressLine] = useState(DEFAULT_ADDRESS_LINE);
  const [originText, setOriginText] = useState(DEFAULT_ORIGIN);
  const [note, setNote] = useState("");
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [testMarker, setTestMarker] = useState("");
  const [offsets] = useState(() => loadLabelOffsets());
  const [fonts] = useState(() => loadLabelFonts());

  const previewCode = useMemo(() => {
    if (lastCode) return lastCode;
    if (codeMode === "PRE_ASSIGNED") {
      return composePreassignedLabelCode(typeCode, productNumber);
    }
    const type = normalizeLabelCodePart(typeCode);
    return type ? `${type}-······` : "······";
  }, [lastCode, codeMode, typeCode, productNumber]);

  const weightNum = weightChi.trim() === "" ? 0 : Number(weightChi) || 0;
  const kltNum = kltChi.trim() === "" ? weightNum : Number(kltChi) || 0;
  const klvNum = klvChi.trim() === "" ? weightNum : Number(klvChi) || 0;
  const kldNum = kldChi.trim() === "" ? 0 : Math.max(0, Number(kldChi) || 0);
  const laborNum = laborFeeDong.trim() === "" ? 0 : Math.max(0, Math.round(Number(laborFeeDong) || 0));
  const priceNum = sellPriceDong.trim() === "" ? 0 : Math.max(0, Math.round(Number(sellPriceDong) || 0));

  const canPreview = productName.trim().length > 0 && previewCode.replace(/[·.]/g, "").length >= 2;

  const payload: LabelPrintPayload | null = useMemo(() => {
    if (!canPreview) return null;
    const msp = previewCode.includes("·") ? previewCode.replace(/·/g, "0") : previewCode;
    return {
      pieceId: lastDraftId ?? "draft-preview",
      msp: previewCode,
      barcode: barcodeFromPrintableCode(msp, codeMode),
      productName: productName.trim(),
      productType: categoryText.trim() || brandText.trim() || "Draft",
      brandName: brandText.trim(),
      companyName: companyName.trim() || DEFAULT_COMPANY_SHORT,
      addressLine: addressLine.trim() || DEFAULT_ADDRESS_LINE,
      tagName: productName.trim(),
      goldAgeText: goldAgeText.trim(),
      originText: originText.trim(),
      kltChi: kltNum,
      klvChi: klvNum,
      kldChi: kldNum,
      laborFeeDong: laborNum,
      priceDong: priceNum,
      stockSize: "90x14",
      printQty: 1,
      actionType: lastDraftId ? "REPRINT" : "FIRST_PRINT",
    };
  }, [
    canPreview,
    previewCode,
    lastDraftId,
    codeMode,
    productName,
    categoryText,
    brandText,
    companyName,
    addressLine,
    goldAgeText,
    originText,
    kltNum,
    klvNum,
    kldNum,
    laborNum,
    priceNum,
  ]);

  function printPayloadJson() {
    return {
      company_name: companyName.trim(),
      address_line: addressLine.trim(),
      origin_text: originText.trim(),
      klt_chi: kltNum,
      klv_chi: klvNum,
      kld_chi: kldNum,
      labor_fee_dong: laborNum,
      price_dong: priceNum,
      gold_age_text: goldAgeText.trim(),
      product_name: productName.trim(),
      brand_text: brandText.trim(),
      category_text: categoryText.trim(),
    };
  }

  function onCreateAndPrint() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const created = await createLabelDraftAction({
        codeMode,
        typeCode,
        productNumber: codeMode === "PRE_ASSIGNED" ? productNumber : undefined,
        productName,
        brandText,
        categoryText,
        costPriceDong: costPriceDong.trim() === "" ? null : Number(costPriceDong),
        sellPriceDong: sellPriceDong.trim() === "" ? null : Number(sellPriceDong),
        laborFeeDong: laborFeeDong.trim() === "" ? null : Number(laborFeeDong),
        weightChi: weightChi.trim() === "" ? null : Number(weightChi),
        goldAgeText,
        note,
        testMarker: testMarker.trim() || null,
      });
      if (!created.ok) {
        setError(created.message);
        return;
      }
      setLastDraftId(created.data.id);
      setLastCode(created.data.printableCode);
      const printed = await recordLabelDraftPrintAction({
        draftId: created.data.id,
        printQty: 1,
        payload: printPayloadJson(),
      });
      if (!printed.ok) {
        setError(printed.message);
        setMessage(`Đã tạo draft ${created.data.printableCode} nhưng chưa ghi nhận in.`);
        return;
      }
      setMessage(
        `Đã tạo + in draft · mã ${created.data.printableCode}` +
          (created.data.reservedMsp ? ` · MSP ${created.data.reservedMsp}` : "") +
          `. Sang Kho › Nhập hàng để chọn draft này.`,
      );
      window.setTimeout(() => printLabelNodes("90x14"), 120);
    });
  }

  function onReprint() {
    if (!lastDraftId) return;
    setError(null);
    startTransition(async () => {
      const printed = await recordLabelDraftPrintAction({
        draftId: lastDraftId,
        printQty: 1,
        payload: printPayloadJson(),
      });
      if (!printed.ok) {
        setError(printed.message);
        return;
      }
      setMessage(`In lại draft · ${printed.data.printableCode} (${printed.data.actionType}).`);
      window.setTimeout(() => printLabelNodes("90x14"), 120);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Tem trước nhập kho (draft)</h2>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Không chọn SKU · không tăng tồn · không bán được. Layout tem giống tab In tem (SKU). Khi
          nhập kho phải chọn lại Brand/Category hợp lệ.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1.5 sm:max-w-md">
          {(
            [
              { value: "AUTO_MSP" as const, label: "MSP tự động" },
              { value: "PRE_ASSIGNED" as const, label: "Mã có sẵn" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCodeMode(option.value)}
              className={`h-9 rounded-lg text-[12px] font-semibold active:scale-[0.98] ${
                codeMode === option.value
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "border border-[var(--tlkv-line)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
            Tên sản phẩm (dòng đầu Mặt 2) *
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Thương hiệu (text draft)
            <input value={brandText} onChange={(e) => setBrandText(e.target.value)} className={FIELD} />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Danh mục (text draft)
            <input
              value={categoryText}
              onChange={(e) => setCategoryText(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Mã loại (type_code)
            <input
              value={typeCode}
              onChange={(e) => setTypeCode(normalizeLabelCodePart(e.target.value))}
              placeholder={codeMode === "PRE_ASSIGNED" ? "VD: CHARM" : "VD: NHAN"}
              maxLength={24}
              className={FIELD}
            />
          </label>
          {codeMode === "PRE_ASSIGNED" ? (
            <label className="text-[12px] text-[var(--tlkv-muted)]">
              Số sản phẩm (được có chữ)
              <input
                value={productNumber}
                onChange={(e) => setProductNumber(normalizeLabelCodePart(e.target.value))}
                placeholder="VD: 766HHH"
                maxLength={32}
                className={FIELD}
              />
            </label>
          ) : (
            <p className="self-end text-[12px] text-[var(--tlkv-muted)]">
              Serial MSP reserve khi tạo draft (không reuse nếu hủy). Preview hiện placeholder đến
              khi tạo xong.
            </p>
          )}
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Mã trên tem (preview / sau tạo)
            <input
              value={previewCode}
              disabled
              className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px] font-medium text-[var(--tlkv-text)]"
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Giá nhập (VND) — không in trên tem
            <input
              type="number"
              min={0}
              step={1}
              value={costPriceDong}
              onChange={(e) => setCostPriceDong(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            G / Giá bán trên tem (VND)
            <input
              type="number"
              min={0}
              step={1}
              value={sellPriceDong}
              onChange={(e) => setSellPriceDong(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            C / Tiền công (VND)
            <input
              type="number"
              min={0}
              step={1}
              value={laborFeeDong}
              onChange={(e) => setLaborFeeDong(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Định lượng mặc định (chỉ)
            <input
              type="number"
              min={0}
              step="0.0001"
              value={weightChi}
              onChange={(e) => {
                setWeightChi(e.target.value);
                if (kltChi.trim() === "") setKltChi(e.target.value);
                if (klvChi.trim() === "") setKlvChi(e.target.value);
              }}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
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
          <label className="text-[12px] text-[var(--tlkv-muted)]">
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
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            KLĐ — chỉ (0 nếu không có)
            <input
              type="number"
              min={0}
              step="0.0001"
              value={kldChi}
              onChange={(e) => setKldChi(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Tuổi vàng / bạc (HL)
            <input
              value={goldAgeText}
              onChange={(e) => setGoldAgeText(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
            Công ty (Mặt 1)
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
            Địa chỉ đuôi tem
            <input
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Xuất xứ
            <input
              value={originText}
              onChange={(e) => setOriginText(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Ghi chú (không in)
            <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
          </label>
          <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
            Test marker (hard-test, tùy chọn)
            <input
              value={testMarker}
              onChange={(e) => setTestMarker(e.target.value)}
              placeholder="P7-HT-YYYYMMDD-…"
              className={FIELD}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !productName.trim()}
            onClick={onCreateAndPrint}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40 active:scale-[0.98]"
          >
            <Printer size={16} weight="bold" />
            {pending ? "Đang xử lý…" : "Tạo draft + in tem"}
          </button>
          <button
            type="button"
            disabled={pending || !lastDraftId}
            onClick={onReprint}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-semibold disabled:opacity-40 active:scale-[0.98]"
          >
            <ArrowClockwise size={16} weight="bold" />
            In lại draft vừa tạo
          </button>
        </div>

        {lastCode ? (
          <p className="mt-3 text-[12px] text-[var(--tlkv-muted)]">
            Draft gần nhất: <span className="font-semibold text-[var(--tlkv-text)]">{lastCode}</span>
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {formatActionError(error)}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            {message}
          </p>
        ) : null}
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] xl:sticky xl:top-4 xl:self-start">
        <h2 className="text-[15px] font-semibold">Layout tem</h2>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Cùng phôi 90×14 với tab In tem (SKU). Điền form bên trái để xem trước; in thật sau khi tạo
          draft.
        </p>
        <div className="mt-4">
          <LabelPreview payload={payload} copies={1} offsets={offsets} fonts={fonts} />
        </div>
        {payload ? (
          <div
            className="label-print-batch pointer-events-none fixed -left-[9999px] top-0 opacity-0"
            aria-hidden
          >
            <LabelTag
              key={`draft-print-${payload.msp}`}
              payload={payload}
              forPrint
              offsets={offsets}
              fonts={fonts}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
