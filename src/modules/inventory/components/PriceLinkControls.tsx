"use client";

import { useEffect, useMemo } from "react";
import { DongInput } from "@/shared/ui/DongInput";
import type { PriceRowOption } from "../types";
import {
  boardUnitChiFromProductName,
  calcGoldReceiveCostDong,
  calcGoldSellDongFromHesoBoard,
  calcSellDongFromLink,
  formatDongPreview,
  looksLikeSilverLabel,
  purityToDecimal,
  type ReceiveMetalKind,
  type SellPriceMode,
} from "../priceLink";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export type PriceLinkControlsProps = {
  metalKind: ReceiveMetalKind;
  priceRows: PriceRowOption[];
  priceRowId: string;
  onPriceRowIdChange: (id: string) => void;
  weightChi: number;
  /** Hàm lượng / tuổi vàng text (gold). Parent may own a separate field — keep in sync. */
  purityText: string;
  onPurityTextChange: (value: string) => void;
  /** When true, render purity input here (ReceiveForm / Draft). Combined owns its own field. */
  showPurityField?: boolean;
  /** Giá NL 24K/9999 / chỉ (gold) — integer VND string. */
  spotBuyDong: string;
  onSpotBuyDongChange: (value: string) => void;
  /** Tiền công nhập (gold) — integer VND; cộng vào giá vốn, không ghi labor_fee bán. */
  receiveLaborDong: string;
  onReceiveLaborDongChange: (value: string) => void;
  /** Tiền công bán — lưu vào pos_skus.labor_fee_dong; prefill HĐ bán. */
  sellLaborDong: string;
  onSellLaborDongChange: (value: string) => void;
  /** P9.4: hiện riêng dòng tiền công trên phôi HĐ (chỉ trình bày). */
  invoiceShowLaborLine: boolean;
  onInvoiceShowLaborLineChange: (value: boolean) => void;
  costPriceDong: string;
  onCostPriceDongChange: (value: string) => void;
  sellPriceDong: string;
  onSellPriceDongChange: (value: string) => void;
  sellMode: SellPriceMode;
  onSellModeChange: (mode: SellPriceMode) => void;
  heso: string;
  onHesoChange: (value: string) => void;
  showRowSelect?: boolean;
  className?: string;
};

/** Price / labor / sell-suggest controls for receive (kho + in tem). */
export function PriceLinkControls({
  metalKind,
  priceRows,
  priceRowId,
  onPriceRowIdChange,
  weightChi,
  purityText,
  onPurityTextChange,
  showPurityField = true,
  spotBuyDong,
  onSpotBuyDongChange,
  receiveLaborDong,
  onReceiveLaborDongChange,
  sellLaborDong,
  onSellLaborDongChange,
  invoiceShowLaborLine,
  onInvoiceShowLaborLineChange,
  costPriceDong,
  onCostPriceDongChange,
  sellPriceDong,
  onSellPriceDongChange,
  sellMode,
  onSellModeChange,
  heso,
  onHesoChange,
  showRowSelect = true,
  className = "",
}: PriceLinkControlsProps) {
  const filteredRows = useMemo(() => {
    if (metalKind === "silver") {
      const silver = priceRows.filter((row) => looksLikeSilverLabel(row.brand, row.product));
      return silver.length > 0 ? silver : priceRows;
    }
    const gold = priceRows.filter((row) => !looksLikeSilverLabel(row.brand, row.product));
    return gold.length > 0 ? gold : priceRows;
  }, [metalKind, priceRows]);

  const selected = useMemo(
    () => filteredRows.find((row) => row.id === priceRowId) ?? null,
    [filteredRows, priceRowId],
  );

  const boardUnit = selected ? boardUnitChiFromProductName(selected.product) : 1;
  const hesoNum = heso.trim() === "" ? NaN : Number(heso.replace(",", "."));
  const purityDec = purityToDecimal(purityText);
  const spotNum = spotBuyDong.trim() === "" ? NaN : Number(spotBuyDong);
  const laborNum = receiveLaborDong.trim() === "" ? 0 : Number(receiveLaborDong);
  const sellLaborNum = sellLaborDong.trim() === "" ? 0 : Number(sellLaborDong);

  // Gold only: spot gợi ý từ buy của dòng giá (vẫn sửa tay). Bạc: không autofill.
  useEffect(() => {
    if (metalKind !== "gold") return;
    if (selected) onSpotBuyDongChange(String(selected.buyDong));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalKind, selected?.id, selected?.buyDong]);

  useEffect(() => {
    if (metalKind !== "gold") return;
    if (purityDec == null || !Number.isFinite(spotNum) || spotNum < 0) return;
    if (!Number.isFinite(laborNum) || laborNum < 0 || !Number.isInteger(laborNum)) return;
    const cost = calcGoldReceiveCostDong(weightChi, purityDec, spotNum, laborNum);
    if (cost != null) onCostPriceDongChange(String(cost));

    if (!Number.isFinite(sellLaborNum) || sellLaborNum < 0 || !Number.isInteger(sellLaborNum)) {
      return;
    }

    if (sellMode === "link" && selected) {
      const sell = calcSellDongFromLink(
        selected.sellDong,
        weightChi,
        boardUnit,
        sellLaborNum,
      );
      if (sell != null) onSellPriceDongChange(String(sell));
      return;
    }
    if (sellMode === "heso" && selected && Number.isFinite(hesoNum) && hesoNum > 0) {
      const sell = calcGoldSellDongFromHesoBoard(
        selected.sellDong,
        boardUnit,
        weightChi,
        purityDec,
        sellLaborNum,
        hesoNum,
      );
      if (sell != null) onSellPriceDongChange(String(sell));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    metalKind,
    selected,
    weightChi,
    sellMode,
    hesoNum,
    boardUnit,
    purityDec,
    spotNum,
    laborNum,
    sellLaborNum,
  ]);

  return (
    <div className={`contents ${className}`}>
      {showRowSelect ? (
        <label className="text-sm sm:col-span-2">
          Dòng bảng giá (tùy chọn)
          <select
            value={priceRowId}
            onChange={(e) => onPriceRowIdChange(e.target.value)}
            className={FIELD}
          >
            <option value="">Không gắn dòng giá</option>
            {filteredRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.brand} · {row.product}
                {row.purity ? ` · ${row.purity}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
            {metalKind === "silver"
              ? "Bạc: liên kết tùy chọn — không autofill / ghi đè giá mua-bán thủ công."
              : "Liên kết không bắt buộc. Vàng: buy gợi ý giá NL; sell dùng cho giá bán gợi ý."}
          </span>
        </label>
      ) : null}

      {selected && metalKind === "gold" ? (
        <div className="sm:col-span-2 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
          <p className="font-medium text-[var(--tlkv-text)]">Giá liên kết</p>
          <p className="mt-1 text-[var(--tlkv-muted)]">
            Mua (buy):{" "}
            <span className="tabular-nums text-[var(--tlkv-text)]">
              {formatDongPreview(selected.buyDong)}
            </span>
            {" · "}
            Bán (sell / board_sell):{" "}
            <span className="tabular-nums text-[var(--tlkv-text)]">
              {formatDongPreview(selected.sellDong)}
            </span>
            {" · "}
            Board: <span className="tabular-nums text-[var(--tlkv-text)]">{boardUnit}</span> chỉ
            {selected.purity ? (
              <>
                {" · "}HL:{" "}
                <span className="tabular-nums text-[var(--tlkv-text)]">{selected.purity}</span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {metalKind === "gold" ? (
        <>
          {showPurityField ? (
            <label className="text-sm sm:col-span-2">
              Hàm lượng vàng / tuổi vàng
              <input
                inputMode="decimal"
                placeholder="VD: 999.9, 750, 610"
                value={purityText}
                onChange={(e) => onPurityTextChange(e.target.value.replace(",", ".").trim())}
                className={FIELD}
              />
              <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                Quy đổi: 610 → 0,61 · 999 → 0,999 · 9999 → 0,9999. Khác hệ số kinh doanh.
              </span>
            </label>
          ) : null}
          <label className="text-sm sm:col-span-2">
            Giá vàng nguyên liệu 24K/9999 (VND / chỉ)
            <DongInput
              value={spotBuyDong}
              onValueChange={onSpotBuyDongChange}
              className={FIELD}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Tiền công nhập (VND)
            <DongInput
              value={receiveLaborDong}
              onValueChange={onReceiveLaborDongChange}
              className={FIELD}
            />
            <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
              Cộng vào tổng tiền nhập / giá vốn. Độc lập với tiền công bán.
            </span>
          </label>
          <p className="sm:col-span-2 text-[11px] text-[var(--tlkv-muted)]">
            Giá vốn gợi ý = TL × HL × giá NL + tiền công nhập
            {purityDec != null && Number.isFinite(spotNum)
              ? ` → ${formatDongPreview(
                  calcGoldReceiveCostDong(
                    weightChi,
                    purityDec,
                    spotNum,
                    Number.isInteger(laborNum) && laborNum >= 0 ? laborNum : 0,
                  ),
                )}`
              : ""}
            .
          </p>
        </>
      ) : (
        <p className="sm:col-span-2 text-[11px] text-[var(--tlkv-muted)]">
          Nhập bạc: giá vốn và giá bán nhập tay. Không lấy giá vàng / không autofill từ bảng giá.
        </p>
      )}

      <label className="text-sm sm:col-span-2">
        Giá vốn / chiếc (VND, số nguyên)
        <DongInput
          name="cost_price_dong"
          required
          value={costPriceDong}
          onValueChange={onCostPriceDongChange}
          className={FIELD}
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Tiền công bán (VND)
        <DongInput
          name="sell_labor_dong"
          value={sellLaborDong}
          onValueChange={onSellLaborDongChange}
          className={FIELD}
        />
        <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
          Lưu vào mã hàng (`labor_fee_dong`), tự điền TextField công trên hóa đơn bán (vẫn sửa được).
          Không cộng vào giá vốn nhập.
        </span>
      </label>

      <label className="sm:col-span-2 flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--tlkv-line)] px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="invoice_show_labor_line"
          checked={invoiceShowLaborLine}
          onChange={(e) => onInvoiceShowLaborLineChange(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--tlkv-red)]"
        />
        <span>
          <span className="font-medium">Hiện riêng dòng tiền công bán trên hóa đơn</span>
          <span className="mt-0.5 block text-[11px] text-[var(--tlkv-muted)]">
            Bật: phôi in có dòng “Tiền công”. Tắt: gộp công vào dòng vàng. Tổng tiền không đổi.
          </span>
        </span>
      </label>

      {metalKind === "gold" ? (
        <>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm">Cách tính giá bán gợi ý</legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {(
                [
                  { value: "link" as const, label: "Theo giá link không hệ số" },
                  { value: "heso" as const, label: "Theo giá link có hệ số" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSellModeChange(option.value)}
                  className={`h-9 rounded-lg text-[12px] font-semibold ${
                    sellMode === option.value
                      ? "bg-[var(--tlkv-red)] text-white"
                      : "border border-[var(--tlkv-line)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
              Không hệ số = vàng ta · Có hệ số = vàng tây. Người dùng chọn tay; không tự nhận diện.
            </p>
          </fieldset>

          {sellMode === "heso" ? (
            <label className="text-sm sm:col-span-2">
              Hệ số (nhập tay, không mặc định)
              <input
                type="number"
                min={0}
                step="0.0001"
                value={heso}
                onChange={(e) => onHesoChange(e.target.value)}
                placeholder="VD: 1.3"
                className={FIELD}
              />
              <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                Gợi ý = (TL × HL × board_sell + tiền công bán) × hệ số. Không dùng spot 24K.
              </span>
            </label>
          ) : (
            <p className="sm:col-span-2 text-[11px] text-[var(--tlkv-muted)]">
              Mode không hệ số: gợi ý = board_sell × TL (+ quy đổi board) + tiền công bán.
            </p>
          )}
        </>
      ) : null}

      <label className="text-sm sm:col-span-2">
        Giá bán gợi ý / chiếc (VND, số nguyên)
        <DongInput
          name="sell_price_dong"
          value={sellPriceDong}
          onValueChange={onSellPriceDongChange}
          className={FIELD}
        />
        <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
          {metalKind === "silver"
            ? "Bạc: nhập tay (all-in). Không autofill từ bảng giá."
            : "Có link bảng giá: gợi ý theo LINK/HESO (+ công). Không link: bắt buộc nhập tay — lưu làm giá cơ sở trên Bán hàng (cộng công bán nếu có)."}
        </span>
      </label>
    </div>
  );
}
