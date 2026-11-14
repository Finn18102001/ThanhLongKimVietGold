"use client";

import { useState, useTransition } from "react";
import { formatActionError } from "@/shared/lib/action-result";
import {
  createLabelDraftAction,
  recordLabelDraftPrintAction,
} from "../draft-actions";
import type { LabelDraftCodeMode } from "../draft-types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]";

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
  const [weightChi, setWeightChi] = useState("");
  const [goldAgeText, setGoldAgeText] = useState("");
  const [note, setNote] = useState("");
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [testMarker, setTestMarker] = useState("");

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
      const printed = await recordLabelDraftPrintAction({ draftId: created.data.id, printQty: 1 });
      if (!printed.ok) {
        setError(printed.message);
        setMessage(`Đã tạo draft ${created.data.printableCode} nhưng chưa ghi nhận in.`);
        return;
      }
      setMessage(
        `Đã tạo + ghi nhận in draft · mã ${created.data.printableCode}` +
          (created.data.reservedMsp ? ` · MSP ${created.data.reservedMsp}` : "") +
          `. Sang Kho › Nhập hàng để chọn draft này.`,
      );
    });
  }

  function onReprint() {
    if (!lastDraftId) return;
    setError(null);
    startTransition(async () => {
      const printed = await recordLabelDraftPrintAction({ draftId: lastDraftId, printQty: 1 });
      if (!printed.ok) {
        setError(printed.message);
        return;
      }
      setMessage(`In lại draft · ${printed.data.printableCode} (${printed.data.actionType}).`);
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="text-[15px] font-semibold">Tem trước nhập kho (draft)</h2>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Không chọn SKU · không tăng tồn · không bán được. Brand có thể nhập text (chưa có trong hệ
        thống). Khi nhập kho phải chọn lại Brand/Category hợp lệ.
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
            className={`h-9 rounded-lg text-[12px] font-semibold ${
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
          Tên sản phẩm *
          <input value={productName} onChange={(e) => setProductName(e.target.value)} className={FIELD} />
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
          <input value={typeCode} onChange={(e) => setTypeCode(e.target.value)} className={FIELD} />
        </label>
        {codeMode === "PRE_ASSIGNED" ? (
          <label className="text-[12px] text-[var(--tlkv-muted)]">
            Số sản phẩm (được có chữ)
            <input
              value={productNumber}
              onChange={(e) => setProductNumber(e.target.value)}
              className={FIELD}
            />
          </label>
        ) : (
          <p className="self-end text-[12px] text-[var(--tlkv-muted)]">
            Serial MSP được reserve ngay khi tạo draft (không reuse nếu hủy).
          </p>
        )}
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Giá nhập (VND)
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
          Giá bán trên tem (VND)
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
          Định lượng (chỉ)
          <input
            type="number"
            min={0}
            step="0.0001"
            value={weightChi}
            onChange={(e) => setWeightChi(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Tuổi vàng / bạc (tùy chọn)
          <input
            value={goldAgeText}
            onChange={(e) => setGoldAgeText(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
          Ghi chú
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !productName.trim()}
          onClick={onCreateAndPrint}
          className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Đang xử lý…" : "Tạo draft + ghi nhận in"}
        </button>
        <button
          type="button"
          disabled={pending || !lastDraftId}
          onClick={onReprint}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-semibold disabled:opacity-40"
        >
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
  );
}
