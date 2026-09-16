"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Printer, Plus, ArrowClockwise } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { mintLabelPiece, recordLabelPrint, listPiecesForSkuAction } from "../actions";
import {
  ACTION_LABEL,
  STOCK_SIZE_LABEL,
  formatChi,
  formatDong,
} from "../labels";
import { printLabelNodes } from "../print";
import { LabelPreview, LabelTag } from "./LabelPreview";
import {
  DEFAULT_LABEL_OFFSETS,
  OFFSET_RANGE,
  OFFSET_STEP_MM,
  clampOffsetMm,
  loadLabelOffsets,
  saveLabelOffsets,
  type LabelPrintOffsets,
  type LabelZoneOffset,
} from "../offsets";
import {
  DEFAULT_LABEL_FONTS,
  FONT_FACE_RANGE,
  FONT_TAIL_RANGE,
  clampFaceFontPt,
  clampTailFontPt,
  loadLabelFonts,
  saveLabelFonts,
  type LabelPrintFonts,
} from "../fonts";
import type {
  LabelHistoryFilter,
  LabelPiece,
  LabelPrintAction,
  LabelPrintLogRow,
  LabelPrintPayload,
  LabelSkuOption,
  LabelStockSize,
} from "../types";
import {
  DEFAULT_ADDRESS_LINE,
  DEFAULT_COMPANY_SHORT,
} from "../types";

type Tab = "print" | "history";

const EMPTY_HISTORY_FILTER: LabelHistoryFilter = {
  dateFrom: "",
  dateTo: "",
  productType: "",
  productQuery: "",
  brand: "",
  actorQuery: "",
  codeQuery: "",
};

export function LabelPrintWorkspace({
  skus,
  initialHistory,
}: {
  skus: LabelSkuOption[];
  initialHistory: LabelPrintLogRow[];
}) {
  const [tab, setTab] = useState<Tab>("print");
  const [history, setHistory] = useState(initialHistory);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [skuId, setSkuId] = useState("");
  const [pieces, setPieces] = useState<LabelPiece[]>([]);
  const [pieceId, setPieceId] = useState("");
  const [stockSize, setStockSize] = useState<LabelStockSize>("90x14");
  const [printQty, setPrintQty] = useState(1);
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_SHORT);
  const [addressLine, setAddressLine] = useState(DEFAULT_ADDRESS_LINE);
  const [laborFeeDong, setLaborFeeDong] = useState(0);
  const [priceDong, setPriceDong] = useState(0);
  const [historyFilter, setHistoryFilter] = useState(EMPTY_HISTORY_FILTER);
  const [offsets, setOffsets] = useState<LabelPrintOffsets>(DEFAULT_LABEL_OFFSETS);
  const [fonts, setFonts] = useState<LabelPrintFonts>(DEFAULT_LABEL_FONTS);

  useEffect(() => {
    setOffsets(loadLabelOffsets());
    setFonts(loadLabelFonts());
  }, []);

  useEffect(() => {
    saveLabelOffsets(offsets);
  }, [offsets]);

  useEffect(() => {
    saveLabelFonts(fonts);
  }, [fonts]);

  function patchZone(
    zone: keyof LabelPrintOffsets,
    axis: keyof LabelZoneOffset,
    value: number,
  ) {
    setOffsets((prev) => ({
      ...prev,
      [zone]: { ...prev[zone], [axis]: clampOffsetMm(value) },
    }));
  }

  function resetOffsets() {
    setOffsets({
      face1: { x: 0, y: 0 },
      face2: { x: 0, y: 0 },
      tail: { x: 0, y: 0 },
    });
  }

  function resetFonts() {
    setFonts({ face1Pt: 0, face2Pt: 0, tailPt: 0 });
  }

  function nudgeFont(key: keyof LabelPrintFonts, delta: number) {
    setFonts((prev) => {
      if (key === "tailPt") {
        return { ...prev, tailPt: clampTailFontPt(prev.tailPt + delta) };
      }
      return { ...prev, [key]: clampFaceFontPt(prev[key] + delta) };
    });
  }

  const selectedSku = useMemo(
    () => skus.find((s) => s.skuId === skuId) ?? null,
    [skus, skuId],
  );
  const selectedPiece = useMemo(
    () => pieces.find((p) => p.id === pieceId) ?? null,
    [pieces, pieceId],
  );

  const kltChi = selectedSku?.weightChi ?? 0;
  const klvChi = selectedSku?.weightChi ?? 0;

  useEffect(() => {
    if (!selectedSku) {
      setLaborFeeDong(0);
      setPriceDong(0);
      return;
    }
    setLaborFeeDong(selectedSku.laborFeeDong);
    setPriceDong(selectedSku.unitPriceDong ?? 0);
  }, [selectedSku]);

  useEffect(() => {
    if (!skuId) {
      setPieces([]);
      setPieceId("");
      return;
    }
    let cancelled = false;
    void listPiecesForSkuAction(skuId)
      .then((rows) => {
        if (cancelled) return;
        setPieces(rows);
        setPieceId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được MSP");
      });
    return () => {
      cancelled = true;
    };
  }, [skuId]);

  const payload: LabelPrintPayload | null =
    selectedSku && selectedPiece
      ? {
          pieceId: selectedPiece.id,
          msp: selectedPiece.msp,
          barcode: selectedPiece.barcode,
          productName: selectedSku.name,
          productType: selectedSku.category,
          brandName: selectedSku.brandName ?? "",
          companyName,
          addressLine,
          kltChi,
          klvChi,
          laborFeeDong,
          priceDong,
          stockSize,
          printQty,
          actionType: "FIRST_PRINT",
        }
      : null;

  const hasPrintedBefore = useMemo(
    () => (selectedPiece ? history.some((h) => h.pieceId === selectedPiece.id) : false),
    [history, selectedPiece],
  );

  function onMint() {
    if (!skuId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const minted = await mintLabelPiece(skuId);
        const rows = await listPiecesForSkuAction(skuId);
        setPieces(rows);
        setPieceId(minted.id);
        setMessage(`Đã tạo MSP ${minted.msp} / ${minted.barcode}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tạo được MSP");
      }
    });
  }

  function onPrint() {
    if (!payload || !selectedPiece || !selectedSku) return;
    setError(null);
    setMessage(null);
    const actionType: LabelPrintAction = hasPrintedBefore ? "REPRINT" : "FIRST_PRINT";
    startTransition(async () => {
      try {
        const recorded = await recordLabelPrint({
          pieceId: selectedPiece.id,
          printQty,
          stockSize,
          actionType,
          companyName,
          addressLine,
          kltChi,
          klvChi,
          laborFeeDong,
          priceDong,
        });
        const now = new Date().toISOString();
        setHistory((prev) => [
          {
            id: recorded.logId,
            printedAt: now,
            msp: selectedPiece.msp,
            barcode: selectedPiece.barcode,
            productName: selectedSku.name,
            productType: selectedSku.category,
            brandName: selectedSku.brandName ?? "—",
            kltChi,
            klvChi,
            laborFeeDong,
            priceDong,
            printQty,
            stockSize,
            actorEmail: recorded.actorEmail || "—",
            actionType,
            pieceId: selectedPiece.id,
            skuId: selectedSku.skuId,
            companyName,
            addressLine,
          },
          ...prev,
        ]);
        setMessage(
          `${ACTION_LABEL[actionType]} ${printQty} tem · MSP ${selectedPiece.msp} (không đổi tồn kho).`,
        );
        // Preview batch then open print dialog
        window.setTimeout(() => printLabelNodes(stockSize), 120);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không ghi lịch sử in");
      }
    });
  }

  function loadReprint(row: LabelPrintLogRow) {
    setTab("print");
    setSkuId(row.skuId);
    setPieceId(row.pieceId);
    setStockSize("90x14");
    setPrintQty(1);
    setCompanyName(row.companyName || DEFAULT_COMPANY_SHORT);
    setAddressLine(row.addressLine || DEFAULT_ADDRESS_LINE);
    setLaborFeeDong(row.laborFeeDong);
    setPriceDong(row.priceDong);
    setMessage(`Đã nạp MSP ${row.msp} để in lại. Layout phôi 90×14 mm.`);
  }

  const filteredHistory = useMemo(() => {
    const q = historyFilter.productQuery.trim().toLowerCase();
    const actor = historyFilter.actorQuery.trim().toLowerCase();
    const code = historyFilter.codeQuery.trim().toLowerCase();
    return history.filter((row) => {
      const day = row.printedAt.slice(0, 10);
      if (historyFilter.dateFrom && day < historyFilter.dateFrom) return false;
      if (historyFilter.dateTo && day > historyFilter.dateTo) return false;
      if (historyFilter.productType && row.productType !== historyFilter.productType) return false;
      if (historyFilter.brand && row.brandName !== historyFilter.brand) return false;
      if (q && !row.productName.toLowerCase().includes(q)) return false;
      if (actor && !row.actorEmail.toLowerCase().includes(actor)) return false;
      if (
        code &&
        !row.msp.toLowerCase().includes(code) &&
        !row.barcode.toLowerCase().includes(code)
      ) {
        return false;
      }
      return true;
    });
  }, [history, historyFilter]);

  const historyTypes = useMemo(
    () => Array.from(new Set(history.map((h) => h.productType).filter(Boolean))),
    [history],
  );
  const historyBrands = useMemo(
    () => Array.from(new Set(history.map((h) => h.brandName).filter((b) => b && b !== "—"))),
    [history],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold">In tem sản phẩm</h1>
        <p className="text-[12px] text-[var(--tlkv-muted)]">
          MSP + mã vạch định danh từng sản phẩm vật lý. In/in lại chỉ ghi lịch sử tem, không đổi tồn
          kho hay hóa đơn.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "print" as const, label: "In tem" },
            { id: "history" as const, label: "Lịch sử" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-9 rounded-full px-3 text-[13px] font-medium ${
              tab === item.id
                ? "bg-[var(--tlkv-red)] text-white"
                : "bg-white shadow-[var(--tlkv-shadow)] hover:bg-[var(--tlkv-red-soft)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {message}
        </p>
      ) : null}

      {tab === "print" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[15px] font-semibold">Thông tin in</h2>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
                Sản phẩm (SKU)
                <select
                  value={skuId}
                  onChange={(e) => setSkuId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
                >
                  <option value="">Chọn sản phẩm...</option>
                  {skus.map((s) => (
                    <option key={s.skuId} value={s.skuId}>
                      {s.name} ({s.sku}) · tồn {s.stockQty}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1 text-[12px] text-[var(--tlkv-muted)]">
                  MSP đã tạo cho SKU này
                  <select
                    value={pieceId}
                    onChange={(e) => setPieceId(e.target.value)}
                    disabled={!skuId || pieces.length === 0}
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] disabled:bg-[var(--tlkv-bg)]"
                  >
                    {pieces.length === 0 ? (
                      <option value="">Chưa có MSP — bấm Tạo MSP</option>
                    ) : (
                      pieces.map((p) => (
                        <option key={p.id} value={p.id}>
                          MSP {p.msp} · {p.barcode}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!skuId || pending}
                  onClick={onMint}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
                >
                  <Plus size={15} weight="bold" />
                  Tạo MSP mới
                </button>
              </div>

              <label className="text-[12px] text-[var(--tlkv-muted)]">
                MSP
                <input
                  value={selectedPiece?.msp ?? ""}
                  disabled
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px] text-[var(--tlkv-text)]"
                />
              </label>
              <label className="text-[12px] text-[var(--tlkv-muted)]">
                Mã vạch
                <input
                  value={selectedPiece?.barcode ?? ""}
                  disabled
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px] text-[var(--tlkv-text)]"
                />
              </label>

              <label className="text-[12px] text-[var(--tlkv-muted)]">
                KLT (Khối lượng tổng)
                <input
                  value={selectedSku ? `${formatChi(kltChi)} chỉ` : ""}
                  disabled
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px] text-[var(--tlkv-text)]"
                />
              </label>
              <label className="text-[12px] text-[var(--tlkv-muted)]">
                KLV (Khối lượng vàng)
                <input
                  value={selectedSku ? `${formatChi(klvChi)} chỉ` : ""}
                  disabled
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px] text-[var(--tlkv-text)]"
                />
              </label>

              <label className="text-[12px] text-[var(--tlkv-muted)]">
                C (Công) — đ
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={laborFeeDong}
                  onChange={(e) => setLaborFeeDong(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>
              <label className="text-[12px] text-[var(--tlkv-muted)]">
                G (Giá) — đ
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={priceDong}
                  onChange={(e) => setPriceDong(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>

              <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
                Tên công ty (in trên tem)
                <div className="mt-1 flex flex-wrap gap-2">
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="h-10 min-w-[220px] flex-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                  />
                  <button
                    type="button"
                    onClick={() => setCompanyName(DEFAULT_COMPANY_SHORT)}
                    className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] hover:bg-[var(--tlkv-bg)]"
                  >
                    Dùng tên rút gọn
                  </button>
                </div>
              </label>

              <label className="text-[12px] text-[var(--tlkv-muted)] sm:col-span-2">
                Địa chỉ (in trên dây nối / đuôi tem)
                <input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>

              <label className="text-[12px] text-[var(--tlkv-muted)]">
                Khổ tem
                <select
                  value={stockSize}
                  onChange={(e) => setStockSize(e.target.value as LabelStockSize)}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)]"
                >
                  <option value="90x14">{STOCK_SIZE_LABEL["90x14"]}</option>
                </select>
              </label>
              <label className="text-[12px] text-[var(--tlkv-muted)]">
                Số lượng tem
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={printQty}
                  onChange={(e) =>
                    setPrintQty(Math.min(500, Math.max(1, Math.round(Number(e.target.value) || 1))))
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] text-[var(--tlkv-text)] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>

              <div className="sm:col-span-2 rounded-[12px] border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--tlkv-text)]">
                    Offset in (mm)
                  </p>
                  <button
                    type="button"
                    onClick={resetOffsets}
                    className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] hover:bg-white"
                  >
                    Reset mặc định
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                  Layout chuẩn đã bake offset. Ô trống = 0 · chỉ nhập khi cần chỉnh thêm (X: +
                  phải / − trái · Y: + xuống / − lên).
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <OffsetZoneEditor
                    title="Mặt 1 (công ty/MSP)"
                    zone={offsets.face1}
                    onChange={(axis, value) => patchZone("face1", axis, value)}
                  />
                  <OffsetZoneEditor
                    title="Mặt 2 (KLT…)"
                    zone={offsets.face2}
                    onChange={(axis, value) => patchZone("face2", axis, value)}
                  />
                  <OffsetZoneEditor
                    title="Dây / đuôi (Đc)"
                    zone={offsets.tail}
                    onChange={(axis, value) => patchZone("tail", axis, value)}
                  />
                </div>
              </div>

              <div className="sm:col-span-2 rounded-[12px] border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--tlkv-text)]">
                    Cỡ chữ (pt)
                  </p>
                  <button
                    type="button"
                    onClick={resetFonts}
                    className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] hover:bg-white"
                  >
                    Reset mặc định
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                  Layout chuẩn: Mặt1 6 pt · Mặt2 7 pt · Đuôi 5.4 pt. Ô trống = 0 (không đổi) ·
                  ± chỉ khi cần chỉnh thêm.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <FontSizeEditor
                    title="Mặt 1 (công ty/MSP)"
                    value={fonts.face1Pt}
                    min={FONT_FACE_RANGE.min}
                    max={FONT_FACE_RANGE.max}
                    step={FONT_FACE_RANGE.step}
                    onChange={(v) => setFonts((p) => ({ ...p, face1Pt: clampFaceFontPt(v) }))}
                    onNudge={(d) => nudgeFont("face1Pt", d)}
                  />
                  <FontSizeEditor
                    title="Mặt 2 (KLT…)"
                    value={fonts.face2Pt}
                    min={FONT_FACE_RANGE.min}
                    max={FONT_FACE_RANGE.max}
                    step={FONT_FACE_RANGE.step}
                    onChange={(v) => setFonts((p) => ({ ...p, face2Pt: clampFaceFontPt(v) }))}
                    onNudge={(d) => nudgeFont("face2Pt", d)}
                  />
                  <FontSizeEditor
                    title="Dây / đuôi (Đc)"
                    value={fonts.tailPt}
                    min={FONT_TAIL_RANGE.min}
                    max={FONT_TAIL_RANGE.max}
                    step={FONT_TAIL_RANGE.step}
                    onChange={(v) => setFonts((p) => ({ ...p, tailPt: clampTailFontPt(v) }))}
                    onNudge={(d) => nudgeFont("tailPt", d)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!payload || pending}
                onClick={onPrint}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-40 active:scale-[0.98]"
              >
                <Printer size={16} weight="bold" />
                {hasPrintedBefore ? "In lại" : "In tem"}
              </button>
            </div>
          </section>

          <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[15px] font-semibold">Layout tem</h2>
            <div className="mt-4">
              <LabelPreview
                payload={payload}
                copies={printQty}
                offsets={offsets}
                fonts={fonts}
              />
            </div>
            {/* Hidden print batch: exact copies for iframe print */}
            {payload ? (
              <div className="label-print-batch pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
                {Array.from({ length: printQty }).map((_, i) => (
                  <LabelTag
                    key={`print-${payload.msp}-${i}`}
                    payload={payload}
                    forPrint
                    offsets={offsets}
                    fonts={fonts}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <HistoryPanel
          rows={filteredHistory}
          filter={historyFilter}
          onFilter={(patch) => setHistoryFilter((f) => ({ ...f, ...patch }))}
          types={historyTypes}
          brands={historyBrands}
          onReprint={loadReprint}
          onClear={() => setHistoryFilter(EMPTY_HISTORY_FILTER)}
        />
      )}
    </div>
  );
}

function OffsetZoneEditor({
  title,
  zone,
  onChange,
}: {
  title: string;
  zone: LabelZoneOffset;
  onChange: (axis: keyof LabelZoneOffset, value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] bg-white p-2.5">
      <p className="text-[12px] font-medium text-[var(--tlkv-text)]">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[var(--tlkv-muted)]">
          ΔX
          <input
            type="number"
            step={OFFSET_STEP_MM}
            min={OFFSET_RANGE.min}
            max={OFFSET_RANGE.max}
            value={zone.x === 0 ? "" : zone.x}
            placeholder="0"
            onChange={(e) =>
              onChange("x", e.target.value === "" ? 0 : Number(e.target.value))
            }
            className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <label className="text-[11px] text-[var(--tlkv-muted)]">
          ΔY
          <input
            type="number"
            step={OFFSET_STEP_MM}
            min={OFFSET_RANGE.min}
            max={OFFSET_RANGE.max}
            value={zone.y === 0 ? "" : zone.y}
            placeholder="0"
            onChange={(e) =>
              onChange("y", e.target.value === "" ? 0 : Number(e.target.value))
            }
            className="mt-0.5 h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
      </div>
    </div>
  );
}

function FontSizeEditor({
  title,
  value,
  min,
  max,
  step,
  onChange,
  onNudge,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] bg-white p-2.5">
      <p className="text-[12px] font-medium text-[var(--tlkv-text)]">{title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNudge(-step)}
          className="h-8 w-8 shrink-0 rounded-md border border-[var(--tlkv-line)] text-[14px] font-semibold hover:bg-[var(--tlkv-bg)] active:scale-[0.98]"
          aria-label={`Giảm cỡ chữ ${title}`}
        >
          −
        </button>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="h-8 w-full rounded-md border border-[var(--tlkv-line)] px-2 text-center text-[12px] tabular-nums outline-none focus:border-[var(--tlkv-red)]"
        />
        <button
          type="button"
          onClick={() => onNudge(step)}
          className="h-8 w-8 shrink-0 rounded-md border border-[var(--tlkv-line)] text-[14px] font-semibold hover:bg-[var(--tlkv-bg)] active:scale-[0.98]"
          aria-label={`Tăng cỡ chữ ${title}`}
        >
          +
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] text-[var(--tlkv-muted)]">Δ pt</p>
    </div>
  );
}

function HistoryPanel({
  rows,
  filter,
  onFilter,
  types,
  brands,
  onReprint,
  onClear,
}: {
  rows: LabelPrintLogRow[];
  filter: LabelHistoryFilter;
  onFilter: (patch: Partial<LabelHistoryFilter>) => void;
  types: string[];
  brands: string[];
  onReprint: (row: LabelPrintLogRow) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h2 className="text-[15px] font-semibold">Lịch sử in tem</h2>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Từ ngày
          <input
            type="date"
            value={filter.dateFrom}
            onChange={(e) => onFilter({ dateFrom: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Đến ngày
          <input
            type="date"
            value={filter.dateTo}
            onChange={(e) => onFilter({ dateTo: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Loại sản phẩm
          <select
            value={filter.productType}
            onChange={(e) => onFilter({ productType: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Tất cả</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Thương hiệu
          <select
            value={filter.brand}
            onChange={(e) => onFilter({ brand: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Tất cả</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Tên sản phẩm
          <input
            value={filter.productQuery}
            onChange={(e) => onFilter({ productQuery: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            placeholder="Tìm tên..."
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Nhân viên
          <input
            value={filter.actorQuery}
            onChange={(e) => onFilter({ actorQuery: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            placeholder="Email..."
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)] md:col-span-2">
          MSP / mã vạch
          <input
            value={filter.codeQuery}
            onChange={(e) => onFilter({ codeQuery: e.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            placeholder="000001 hoặc BC000001..."
          />
        </label>
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[var(--tlkv-muted)]">
        <span>{rows.length} bản ghi</span>
        <button type="button" onClick={onClear} className="hover:underline">
          Xóa bộ lọc
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-[12px]">
          <thead className="border-b border-[var(--tlkv-line)] text-[var(--tlkv-muted)]">
            <tr>
              <th className="px-2 py-2 font-medium">Thời gian</th>
              <th className="px-2 py-2 font-medium">MSP</th>
              <th className="px-2 py-2 font-medium">Mã vạch</th>
              <th className="px-2 py-2 font-medium">Loại SP</th>
              <th className="px-2 py-2 font-medium">Sản phẩm</th>
              <th className="px-2 py-2 font-medium">Thương hiệu</th>
              <th className="px-2 py-2 text-right font-medium">KLT</th>
              <th className="px-2 py-2 text-right font-medium">KLV</th>
              <th className="px-2 py-2 text-right font-medium">C</th>
              <th className="px-2 py-2 text-right font-medium">G</th>
              <th className="px-2 py-2 text-right font-medium">SL in</th>
              <th className="px-2 py-2 font-medium">Khổ tem</th>
              <th className="px-2 py-2 font-medium">Nhân viên</th>
              <th className="px-2 py-2 font-medium">Loại</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-2 py-10 text-center text-[var(--tlkv-muted)]">
                  Chưa có lịch sử in tem phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)]/50 last:border-0">
                  <td className="px-2 py-2 whitespace-nowrap">{formatViDateTime(row.printedAt)}</td>
                  <td className="px-2 py-2 font-medium">{row.msp}</td>
                  <td className="px-2 py-2">{row.barcode}</td>
                  <td className="px-2 py-2">{row.productType}</td>
                  <td className="px-2 py-2 max-w-[160px] truncate" title={row.productName}>
                    {row.productName}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.brandName}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatChi(row.kltChi)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatChi(row.klvChi)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatDong(row.laborFeeDong)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatDong(row.priceDong)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.printQty}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{STOCK_SIZE_LABEL[row.stockSize]}</td>
                  <td className="px-2 py-2 max-w-[120px] truncate" title={row.actorEmail}>
                    {row.actorEmail}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{ACTION_LABEL[row.actionType]}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onReprint(row)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--tlkv-red)] hover:bg-[var(--tlkv-red-soft)]"
                    >
                      <ArrowClockwise size={12} />
                      In lại
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
