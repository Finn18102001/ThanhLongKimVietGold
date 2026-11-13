import { formatStoneDetail, purchaseLineWeightChi } from "../labels";
import { buyItemHasStone, type BuyDetailItem } from "../types";

/**
 * One printed row on Phiếu mua kiêm nhập kho / Phiếu 02.
 * Big Change BC-11: a gold-with-stone product is ONE row. Stone is a note under the product name,
 * never a separate numbered row. Amount = vàng + đá.
 */
export type BuyPrintRow = {
  key: string;
  stt: number;
  name: string;
  /** Stone note printed under the name, e.g. "Đá kèm: 5 viên · 2 chỉ · 600.000 đ/viên · tiền đá 3.000.000 đ". Null when no stone. */
  stoneNote: string | null;
  purity: string;
  /** Total gold weight of the row (SL × TL vàng / chiếc). Stone weight is never added here. */
  weightChi: number;
  /** Giá vàng / chỉ. */
  unitPriceDong: number;
  /** Whole line: tiền vàng + tiền đá. */
  amountDong: number;
};

function stoneNote(item: BuyDetailItem): string | null {
  if (!buyItemHasStone(item)) return null;
  // Stone detail is stored per piece; the amount printed is for the whole line so it adds up to the row total.
  const detail = formatStoneDetail(item);
  const amount = `${(item.stonePriceDong * item.quantity).toLocaleString("vi-VN")} đ`;
  const head = item.quantity > 1 ? "Đá kèm mỗi chiếc" : "Đá kèm";
  const amountLabel = item.quantity > 1 ? `tiền đá ${item.quantity} chiếc ${amount}` : `tiền đá ${amount}`;
  return `${head}: ${detail ? `${detail} · ` : ""}${amountLabel}`;
}

export function buyPrintRows(items: BuyDetailItem[]): BuyPrintRow[] {
  return items.map((item, index) => ({
    key: item.id,
    stt: index + 1,
    name: item.productName,
    stoneNote: stoneNote(item),
    purity: item.goldAge || item.goldType || "",
    weightChi: purchaseLineWeightChi(item.quantity, item.weightChi),
    unitPriceDong: item.unitPriceDong,
    amountDong: item.totalPriceDong,
  }));
}
