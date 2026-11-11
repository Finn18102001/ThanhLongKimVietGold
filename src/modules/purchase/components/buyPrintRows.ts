import { purchaseLineWeightChi } from "../labels";
import { buyItemHasStone, type BuyDetailItem } from "../types";

/** One printed row on Phiếu mua kiêm nhập kho / Phiếu 02. Gold-with-stone lines print as gold row + stone row. */
export type BuyPrintRow = {
  key: string;
  stt: number;
  isStone: boolean;
  name: string;
  purity: string;
  /** Total weight of the row (SL × TL / chiếc). */
  weightChi: number;
  /** Gold: giá / chỉ. Stone: giá đá / chiếc. */
  unitPriceDong: number;
  amountDong: number;
};

export function buyPrintRows(items: BuyDetailItem[]): BuyPrintRow[] {
  const rows: BuyPrintRow[] = [];
  for (const item of items) {
    const hasStone = buyItemHasStone(item);
    rows.push({
      key: item.id,
      stt: rows.length + 1,
      isStone: false,
      name: item.productName,
      purity: item.goldAge || item.goldType || "",
      weightChi: purchaseLineWeightChi(item.quantity, item.weightChi),
      unitPriceDong: item.unitPriceDong,
      amountDong: hasStone ? item.goldAmountDong : item.totalPriceDong,
    });
    if (hasStone) {
      rows.push({
        key: `${item.id}-stone`,
        stt: rows.length + 1,
        isStone: true,
        name: item.quantity > 1 ? `Đá kèm ${item.productName} (${item.quantity} chiếc)` : `Đá kèm ${item.productName}`,
        purity: "",
        weightChi: purchaseLineWeightChi(item.quantity, item.stoneWeightChi),
        unitPriceDong: item.stonePriceDong,
        amountDong: item.stonePriceDong * item.quantity,
      });
    }
  }
  return rows;
}
