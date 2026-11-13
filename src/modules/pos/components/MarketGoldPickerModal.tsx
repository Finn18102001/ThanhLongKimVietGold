"use client";

import { formatDong } from "@/shared/lib/money";
import { formatViDate, formatVnIsoDate } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { MARKET_GOLD_CLASS_LABEL, type MarketGoldClass, type PosCatalogItem } from "../types";

/**
 * Pick the real MG piece behind a market group card. The cart still holds that MG `skuId`,
 * so price (last cost), stock and invoice detail stay exactly as before.
 */
export function MarketGoldPickerModal({
  marketClass,
  items,
  inCartQty,
  onPick,
  onClose,
}: {
  marketClass: MarketGoldClass;
  items: PosCatalogItem[];
  inCartQty: (skuId: string) => number;
  onPick: (item: PosCatalogItem) => void;
  onClose: () => void;
}) {
  const rows = [...items].sort((a, b) => (a.boughtAt ?? "").localeCompare(b.boughtAt ?? ""));

  return (
    <Modal title={`Chọn món · ${MARKET_GOLD_CLASS_LABEL[marketClass]}`} wide onClose={onClose}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[var(--tlkv-muted)]">
          Chưa có món nào còn tồn trong nhóm này.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-white text-[12px] text-[var(--tlkv-muted)]">
              <tr>
                <th className="py-2 pr-3 font-medium">Món</th>
                <th className="py-2 pr-3 font-medium">Loại / tuổi vàng</th>
                <th className="py-2 pr-3 text-right font-medium">KL (chỉ)</th>
                <th className="py-2 pr-3 text-right font-medium">Giá / chỉ</th>
                <th className="py-2 pr-3 font-medium">Ngày mua</th>
                <th className="py-2 pr-3 text-right font-medium">Tồn</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tlkv-line)]">
              {rows.map((item) => {
                const taken = inCartQty(item.skuId);
                const full = taken >= item.quantity;
                const perChi =
                  item.goldUnitDong != null && item.weightChi > 0
                    ? Math.round(item.goldUnitDong / item.weightChi)
                    : null;
                return (
                  <tr key={item.skuId}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="font-mono text-[11px] text-[var(--tlkv-muted)]">{item.sku}</p>
                    </td>
                    <td className="py-2 pr-3">
                      {[item.goldType, item.goldAge].filter(Boolean).join(" · ") || "—"}
                      {(item.stoneWeightChi ?? 0) > 0 || (item.stonePriceDong ?? 0) > 0 ? (
                        <span className="block text-[11px] text-[var(--tlkv-muted)]">
                          Đá {(item.stoneWeightChi ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ ·{" "}
                          {(item.stoneQuantity ?? 0) > 0
                            ? `${item.stoneQuantity} viên × ${formatDong(item.stoneUnitPriceDong ?? 0)} = `
                            : ""}
                          {formatDong(item.stonePriceDong ?? 0)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {perChi === null ? "Chưa có giá" : formatDong(perChi)}
                    </td>
                    <td className="py-2 pr-3">
                      {item.boughtAt ? formatViDate(formatVnIsoDate(item.boughtAt)) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={full || item.unitPriceDong === null}
                        onClick={() => onPick(item)}
                        className="h-8 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white disabled:opacity-40 active:scale-[0.98]"
                      >
                        {full ? "Đã chọn" : "Chọn"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
