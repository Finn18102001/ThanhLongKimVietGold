"use client";

import { useEffect, useMemo } from "react";
import type { PriceRowOption } from "../types";
import {
  boardUnitChiFromProductName,
  calcCostDongFromBuy,
  calcSellDongFromHeso,
  calcSellDongFromLink,
  formatDongPreview,
  type SellPriceMode,
} from "../priceLink";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export type PriceLinkControlsProps = {
  priceRows: PriceRowOption[];
  priceRowId: string;
  onPriceRowIdChange: (id: string) => void;
  weightChi: number;
  costPriceDong: string;
  onCostPriceDongChange: (value: string) => void;
  sellPriceDong: string;
  onSellPriceDongChange: (value: string) => void;
  sellMode: SellPriceMode;
  onSellModeChange: (mode: SellPriceMode) => void;
  heso: string;
  onHesoChange: (value: string) => void;
  /** When false, hide the price-row select (caller owns it). */
  showRowSelect?: boolean;
  className?: string;
};

/**
 * Reading this as: POS admin receive form controls for TLKV staff,
 * matching existing --tlkv-* template (not a marketing landing).
 */
export function PriceLinkControls({
  priceRows,
  priceRowId,
  onPriceRowIdChange,
  weightChi,
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
  const selected = useMemo(
    () => priceRows.find((row) => row.id === priceRowId) ?? null,
    [priceRows, priceRowId],
  );

  const boardUnit = selected ? boardUnitChiFromProductName(selected.product) : 1;
  const hesoNum = heso.trim() === "" ? NaN : Number(heso.replace(",", "."));

  useEffect(() => {
    if (!selected) return;
    const cost = calcCostDongFromBuy(selected.buyDong, weightChi);
    if (cost != null) onCostPriceDongChange(String(cost));

    if (sellMode === "link") {
      const sell = calcSellDongFromLink(selected.sellDong, weightChi, boardUnit);
      if (sell != null) onSellPriceDongChange(String(sell));
      return;
    }
    if (Number.isFinite(hesoNum) && hesoNum > 0) {
      const sell = calcSellDongFromHeso(selected.sellDong, weightChi, hesoNum);
      if (sell != null) onSellPriceDongChange(String(sell));
    }
    // Intentionally omit on*Change from deps to avoid loops; parents pass stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, weightChi, sellMode, hesoNum, boardUnit]);

  return (
    <div className={`contents ${className}`}>
      {showRowSelect ? (
        <label className="text-sm sm:col-span-2">
          Dòng bảng giá
          <select
            value={priceRowId}
            onChange={(e) => onPriceRowIdChange(e.target.value)}
            className={FIELD}
          >
            <option value="">Không gắn dòng giá</option>
            {priceRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.brand} · {row.product}
                {row.purity ? ` · ${row.purity}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
            Chỉ các dòng đang hiển thị trên bảng giá. Nhập hàng lấy giá mua (`buy`).
          </span>
        </label>
      ) : null}

      {selected ? (
        <div className="sm:col-span-2 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
          <p className="font-medium text-[var(--tlkv-text)]">Giá liên kết</p>
          <p className="mt-1 text-[var(--tlkv-muted)]">
            Mua (buy): <span className="tabular-nums text-[var(--tlkv-text)]">{formatDongPreview(selected.buyDong)}</span>
            {" · "}
            Bán (sell): <span className="tabular-nums text-[var(--tlkv-text)]">{formatDongPreview(selected.sellDong)}</span>
            {" · "}
            Board: <span className="tabular-nums text-[var(--tlkv-text)]">{boardUnit}</span> chỉ
          </p>
          <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
            Giá vốn gợi ý = buy × TL (không hệ số). Giá bán gợi ý theo mode bên dưới; vẫn sửa tay được.
          </p>
        </div>
      ) : null}

      <label className="text-sm sm:col-span-2">
        Giá vốn / chiếc (VND, số nguyên)
        <input
          name="cost_price_dong"
          type="number"
          min={0}
          step={1}
          required
          value={costPriceDong}
          onChange={(e) => onCostPriceDongChange(e.target.value)}
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
            Giá bán gợi ý = sell × TL × hệ số. Không dùng cho giá vốn. Khác hàm lượng vàng.
          </span>
        </label>
      ) : (
        <p className="sm:col-span-2 text-[11px] text-[var(--tlkv-muted)]">
          Mode link: giá bán gợi ý = sell × TL / board_unit (như công thức POS hiện tại, chưa cộng công).
        </p>
      )}

      <label className="text-sm sm:col-span-2">
        Giá bán / chiếc (VND, số nguyên)
        <input
          name="sell_price_dong"
          type="number"
          min={0}
          step={1}
          value={sellPriceDong}
          onChange={(e) => onSellPriceDongChange(e.target.value)}
          className={FIELD}
        />
        <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
        </span>
      </label>
    </div>
  );
}
