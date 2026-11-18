"use client";

import { useEffect, useMemo } from "react";
import { DongInput } from "@/shared/ui/DongInput";
import type { PriceRowOption } from "../types";
import {
  boardUnitChiFromProductName,
  calcCostDongFromBuy,
  calcGoldReceiveCostDong,
  calcGoldSellDongFromHeso,
  calcSellDongFromHeso,
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

/**
 * Reading this as: POS admin receive form controls for TLKV staff,
 * matching existing --tlkv-* template (not a marketing landing).
 */
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

  useEffect(() => {
    if (selected) {
      onSpotBuyDongChange(String(selected.buyDong));
    }
    // Intentionally omit onSpotBuyDongChange from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.buyDong]);

  useEffect(() => {
    if (metalKind === "gold") {
      if (purityDec == null || !Number.isFinite(spotNum) || spotNum < 0) return;
      if (!Number.isFinite(laborNum) || laborNum < 0 || !Number.isInteger(laborNum)) return;
      const cost = calcGoldReceiveCostDong(weightChi, purityDec, spotNum, laborNum);
      if (cost != null) onCostPriceDongChange(String(cost));

      if (sellMode === "link" && selected) {
        const sell = calcSellDongFromLink(selected.sellDong, weightChi, boardUnit);
        if (sell != null) onSellPriceDongChange(String(sell));
        return;
      }
      if (sellMode === "heso" && Number.isFinite(hesoNum) && hesoNum > 0) {
        const sell = calcGoldSellDongFromHeso(spotNum, weightChi, purityDec, hesoNum);
        if (sell != null) onSellPriceDongChange(String(sell));
      }
      return;
    }

    // Silver: keep buy×TL suggestion; sell default = cost when no heso; never apply gold formula.
    if (selected) {
      const cost = calcCostDongFromBuy(selected.buyDong, weightChi);
      if (cost != null) onCostPriceDongChange(String(cost));
      if (sellMode === "link") {
        const sell = calcSellDongFromLink(selected.sellDong, weightChi, boardUnit);
        if (sell != null) onSellPriceDongChange(String(sell));
        else if (cost != null) onSellPriceDongChange(String(cost));
        return;
      }
      if (Number.isFinite(hesoNum) && hesoNum > 0) {
        const sell = calcSellDongFromHeso(selected.sellDong, weightChi, hesoNum);
        if (sell != null) onSellPriceDongChange(String(sell));
      }
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
            Liên kết không bắt buộc. Nhập hàng lấy giá mua (`buy`) làm gợi ý; vẫn sửa tay được.
          </span>
        </label>
      ) : null}

      {selected ? (
        <div className="sm:col-span-2 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
          <p className="font-medium text-[var(--tlkv-text)]">Giá liên kết</p>
          <p className="mt-1 text-[var(--tlkv-muted)]">
            Mua (buy):{" "}
            <span className="tabular-nums text-[var(--tlkv-text)]">
              {formatDongPreview(selected.buyDong)}
            </span>
            {" · "}
            Bán (sell):{" "}
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
                placeholder="VD: 999.9, 750, 61"
                value={purityText}
                onChange={(e) => onPurityTextChange(e.target.value.replace(",", ".").trim())}
                className={FIELD}
              />
              <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                Quy đổi: 75 → 0,75 · 750 → 0,75 · 999,9 → 0,9999. Khác hệ số kinh doanh.
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
              Cộng vào tổng tiền nhập / giá vốn. Không phải tiền công bán (công bán chỉ trên hóa đơn).
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
          Nhập bạc: giá vốn nhập tay hoặc gợi ý buy × TL. Không áp công thức bán bạc vào giá vốn.
          Không có tiền công bán trên form nhập.
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

      <fieldset className="sm:col-span-2">
        <legend className="text-sm">Cách tính giá bán gợi ý</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "link" as const, label: "Theo giá link" },
              { value: "heso" as const, label: "Theo hệ số" },
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
            {metalKind === "gold"
              ? "Gợi ý bán = (giá NL × TL × HL) × hệ số. Chưa cộng công bán (công bán trên HĐ)."
              : "Gợi ý bán = sell × TL × hệ số. Chưa cộng công bán."}{" "}
            Hệ số ≠ hàm lượng.
          </span>
        </label>
      ) : (
        <p className="sm:col-span-2 text-[11px] text-[var(--tlkv-muted)]">
          {metalKind === "silver"
            ? "Bạc bán trực tiếp: giá bán mặc định ≈ giá nhập khi không có link. Mode link: sell × TL / board."
            : "Mode link: giá bán gợi ý = sell × TL / board_unit. Tiền công bán nhập trên hóa đơn bán."}
        </p>
      )}

      <label className="text-sm sm:col-span-2">
        Giá bán gợi ý / chiếc (VND, số nguyên)
        <DongInput
          name="sell_price_dong"
          value={sellPriceDong}
          onValueChange={onSellPriceDongChange}
          className={FIELD}
        />
        <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
          Không ghi vào tiền công bán của SKU. Không tự lấy tiền công nhập làm công bán.
        </span>
      </label>
    </div>
  );
}
