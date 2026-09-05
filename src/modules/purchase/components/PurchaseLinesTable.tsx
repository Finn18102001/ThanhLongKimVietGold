"use client";

import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatChi } from "../labels";
import {
  PRICE_EXCEPTION_THRESHOLD_DONG,
  clampBuyUnitPriceDong,
  lineHasPriceException,
  lineTotalDong,
  type BuyLine,
} from "../types";
import { parseDongInput, parseWeightInput, purchaseInputClass } from "./purchaseFormUtils";
import { PurchaseProductThumb } from "./PurchaseCatalogCard";

const STEP = 10_000;

export function PurchaseLinesTable({
  lines,
  onChangeLine,
  onRemove,
}: {
  lines: BuyLine[];
  onChangeLine: (localId: string, patch: Partial<BuyLine>) => void;
  onRemove: (localId: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <section className="rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
        <div className="border-b border-[var(--tlkv-line)] px-4 py-3">
          <h2 className="text-[15px] font-semibold">Danh sách mua ({lines.length})</h2>
        </div>
        <p className="px-4 py-8 text-center text-[13px] text-[var(--tlkv-muted)]">
          Chọn sản phẩm đang bán hoặc bấm &quot;+ Vàng thị trường&quot; để thêm dòng.
        </p>
      </section>
    );
  }

  function setUnitPrice(line: BuyLine, next: number) {
    const clamped = clampBuyUnitPriceDong(
      next,
      line.referencePriceDongPerChi,
      line.isMarketGold,
    );
    onChangeLine(line.localId, { unitPriceDong: clamped });
  }

  return (
    <section className="rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="border-b border-[var(--tlkv-line)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">Danh sách mua ({lines.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead className="text-[11px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Ảnh</th>
              <th className="py-2 font-medium">Tên</th>
              <th className="py-2 font-medium">Thương hiệu</th>
              <th className="py-2 font-medium">Tuổi</th>
              <th className="py-2 font-medium">SL</th>
              <th className="py-2 font-medium">TL</th>
              <th className="py-2 font-medium">Đơn giá mua</th>
              <th className="py-2 pr-2 text-right font-medium">Thành tiền</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const exception = lineHasPriceException(line);
              return (
                <tr key={line.localId} className="border-b border-[var(--tlkv-line)] align-middle">
                  <td className="px-3 py-2.5 text-[var(--tlkv-muted)]">{index + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div className="relative h-10 w-10 overflow-hidden rounded-md bg-[#f8f1e7]">
                      <PurchaseProductThumb name={line.productName} imageUrl={line.imageUrl} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-2">
                    <p className="font-medium">{line.productName}</p>
                    <p className="text-[10px] text-[var(--tlkv-muted)]">
                      {line.brandName ? `${line.brandName} · ` : ""}
                      {line.isMarketGold
                        ? "Vàng thị trường"
                        : line.kind === "catalog"
                          ? line.sku
                          : ""}
                      {exception
                        ? ` · Ngoài ±${(PRICE_EXCEPTION_THRESHOLD_DONG / 1000).toFixed(0)}k`
                        : ""}
                    </p>
                    {exception ? (
                      <p className="text-[10px] font-medium text-[var(--tlkv-red)]">
                        Chỉnh giá trong khoảng cho phép trước khi chốt
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 text-[11px]">{line.brandName || "—"}</td>
                  <td className="py-2.5 pr-2">
                    <input
                      value={line.goldAge}
                      onChange={(e) => onChangeLine(line.localId, { goldAge: e.target.value })}
                      className={`${purchaseInputClass} h-8 w-20`}
                    />
                  </td>
                  <td className="py-2.5 pr-2">
                    <input
                      value={String(line.quantity)}
                      onChange={(e) => {
                        const qty = Math.floor(parseDongInput(e.target.value)) || 0;
                        onChangeLine(line.localId, { quantity: Math.max(1, qty) });
                      }}
                      inputMode="numeric"
                      className={`${purchaseInputClass} h-8 w-14`}
                    />
                  </td>
                  <td className="py-2.5 pr-2">
                    <input
                      value={String(line.weightChi)}
                      onChange={(e) => {
                        const w = parseWeightInput(e.target.value);
                        onChangeLine(line.localId, { weightChi: w > 0 ? w : line.weightChi });
                      }}
                      inputMode="decimal"
                      className={`${purchaseInputClass} h-8 w-20`}
                      title={formatChi(line.weightChi)}
                    />
                  </td>
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-0.5">
                      {!line.isMarketGold ? (
                        <button
                          type="button"
                          aria-label="Giảm giá"
                          onClick={() => setUnitPrice(line, line.unitPriceDong - STEP)}
                          className="flex h-8 w-7 items-center justify-center rounded-md border border-[var(--tlkv-line)]"
                        >
                          <Minus size={11} />
                        </button>
                      ) : null}
                      <input
                        value={String(line.unitPriceDong)}
                        onChange={(e) => {
                          const raw = parseDongInput(e.target.value);
                          onChangeLine(line.localId, { unitPriceDong: raw });
                        }}
                        inputMode="numeric"
                        className={`${purchaseInputClass} h-8 w-[100px] ${exception ? "border-[var(--tlkv-red)]" : ""}`}
                      />
                      {!line.isMarketGold ? (
                        <button
                          type="button"
                          aria-label="Tăng giá"
                          onClick={() => setUnitPrice(line, line.unitPriceDong + STEP)}
                          className="flex h-8 w-7 items-center justify-center rounded-md border border-[var(--tlkv-line)]"
                        >
                          <Plus size={11} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-right font-semibold">
                    {formatDong(lineTotalDong(line))}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      aria-label="Xóa dòng"
                      onClick={() => onRemove(line.localId)}
                      className="text-[var(--tlkv-muted)] hover:text-[var(--tlkv-red)]"
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
