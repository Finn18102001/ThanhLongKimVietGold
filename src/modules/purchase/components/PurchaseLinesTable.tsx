"use client";

import { Trash } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatChi } from "../labels";
import { lineHasPriceException, lineTotalDong, type BuyLine } from "../types";
import { parseDongInput, parseWeightInput, purchaseInputClass } from "./purchaseFormUtils";
import { PurchaseProductThumb } from "./PurchaseCatalogCard";

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

  return (
    <section className="rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="border-b border-[var(--tlkv-line)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">Danh sách mua ({lines.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12px]">
          <thead className="text-[11px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Ảnh</th>
              <th className="py-2 font-medium">Tên</th>
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
                      {line.isMarketGold
                        ? "Vàng thị trường"
                        : line.kind === "catalog"
                          ? line.sku
                          : ""}
                      {exception ? " · Ngoại lệ ±300k" : ""}
                    </p>
                  </td>
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
                    <input
                      value={String(line.unitPriceDong)}
                      onChange={(e) =>
                        onChangeLine(line.localId, {
                          unitPriceDong: parseDongInput(e.target.value),
                        })
                      }
                      inputMode="numeric"
                      className={`${purchaseInputClass} h-8 w-[110px]`}
                    />
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
