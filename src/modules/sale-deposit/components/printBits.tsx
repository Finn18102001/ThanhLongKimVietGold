import type { CSSProperties, ReactNode } from "react";
import { formatDongCompact } from "@/shared/lib/money";
import type { DepositCharge, DepositLine } from "../types";

const th: CSSProperties = {
  padding: "1.1mm 0.7mm",
  verticalAlign: "middle",
  fontWeight: 700,
};

const td: CSSProperties = {
  padding: "1.2mm 0.7mm",
  verticalAlign: "middle",
};

type GoodsRow = {
  key: string;
  /** Empty on detail rows (đá, tiền công): they belong to the product row above. */
  stt: string;
  name: string;
  detail: boolean;
  quantity: string;
  weight: string;
  unit: string;
  purity: string;
  unitPriceDong: number | null;
  amountDong: number;
};

/**
 * Big Change (QD-7): value components print separately instead of one combined unit price.
 * Product row = gold only (đơn giá vàng / chiếc, thành tiền vàng). Under it, only when present:
 * a stone detail row (TL đá, số lượng, đơn giá đá, thành tiền đá) and a labor detail row.
 * Extra charges print as their own rows. The rows always add up to the document total.
 * Gold-only products and lines sold before the split print exactly as before.
 */
export function depositGoodsRows(lines: DepositLine[], charges: DepositCharge[]): GoodsRow[] {
  const rows: GoodsRow[] = [];
  let stt = 0;
  for (const line of lines) {
    stt += 1;
    const split = line.goldAmountDong != null;
    rows.push({
      key: line.id,
      stt: String(stt),
      name: line.name,
      detail: false,
      quantity: String(line.quantity),
      weight: formatWeight(line.totalWeightChi),
      unit: "chiếc",
      purity: line.purity || "",
      unitPriceDong: split ? (line.goldAmountDong as number) : line.unitPriceDong,
      amountDong: split ? (line.goldAmountDong as number) * line.quantity : line.totalPriceDong,
    });
    if (!split) continue;
    if (line.stoneWeightChi > 0 || line.stonePriceDong > 0 || line.stoneQuantity > 0) {
      // Lines sold with a hand-typed stone amount have no stone quantity: print the amount per piece.
      const hasQty = line.stoneQuantity > 0;
      rows.push({
        key: `${line.id}-stone`,
        stt: "",
        name: "Đá kèm",
        detail: true,
        quantity: hasQty ? String(line.stoneQuantity * line.quantity) : String(line.quantity),
        weight: line.stoneWeightChi > 0 ? formatWeight(line.stoneWeightChi * line.quantity) : "",
        unit: hasQty ? "viên" : "chiếc",
        purity: "",
        unitPriceDong: hasQty ? line.stoneUnitPriceDong : line.stonePriceDong,
        amountDong: line.stonePriceDong * line.quantity,
      });
    }
    const labor = line.laborFinalDong ?? 0;
    if (labor !== 0) {
      rows.push({
        key: `${line.id}-labor`,
        stt: "",
        name: "Tiền công",
        detail: true,
        quantity: String(line.quantity),
        weight: "",
        unit: "chiếc",
        purity: "",
        unitPriceDong: labor,
        amountDong: labor * line.quantity,
      });
    }
  }
  for (const charge of charges) {
    stt += 1;
    rows.push({
      key: `charge-${charge.id}`,
      stt: String(stt),
      name: charge.name,
      detail: false,
      quantity: "",
      weight: "",
      unit: "",
      purity: "",
      unitPriceDong: null,
      amountDong: charge.amountDong,
    });
  }
  return rows;
}

export function DepositGoodsTable({
  lines,
  charges = [],
  amountHeader = "Thành tiền tạm tính",
}: {
  lines: DepositLine[];
  charges?: DepositCharge[];
  amountHeader?: string;
}) {
  const rows = depositGoodsRows(lines, charges);
  const empty = Math.max(0, 1 - rows.length);
  return (
    <table
      className="border-collapse"
      style={{
        width: "100%",
        tableLayout: "fixed",
        fontSize: "10pt",
        marginTop: "1.5mm",
      }}
    >
      <colgroup>
        <col style={{ width: "7%" }} />
        <col style={{ width: "28%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "12%" }} />
      </colgroup>
      <thead>
        <tr className="text-center">
          <th className="border border-black" style={th}>
            STT
          </th>
          <th className="border border-black" style={th}>
            Tên hàng hóa, dịch vụ
          </th>
          <th className="border border-black" style={th}>
            Số lượng
          </th>
          <th className="border border-black" style={th}>
            Tổng trọng lượng
          </th>
          <th className="border border-black" style={th}>
            Đơn vị tính
          </th>
          <th className="border border-black" style={th}>
            Hàm lượng
          </th>
          <th className="border border-black" style={th}>
            Đơn giá
          </th>
          <th className="border border-black" style={th}>
            {amountHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="border border-black text-center" style={td}>
              {row.stt}
            </td>
            <td
              className="border border-black text-left"
              style={row.detail ? { ...td, paddingLeft: "3mm", fontStyle: "italic" } : td}
            >
              {row.name}
            </td>
            <td className="border border-black text-center tabular-nums" style={td}>
              {row.quantity}
            </td>
            <td className="border border-black text-center tabular-nums" style={td}>
              {row.weight}
            </td>
            <td className="border border-black text-center" style={td}>
              {row.unit}
            </td>
            <td className="border border-black text-center" style={td}>
              {row.purity}
            </td>
            <td className="border border-black text-right tabular-nums" style={td}>
              {row.unitPriceDong == null ? "" : formatDongCompact(row.unitPriceDong)}
            </td>
            <td className="border border-black text-right tabular-nums" style={td}>
              {formatDongCompact(row.amountDong)}
            </td>
          </tr>
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <tr key={`empty-${i}`}>
            {Array.from({ length: 8 }).map((__, j) => (
              <td key={j} className="border border-black" style={{ ...td, height: "7mm" }}>
                {"\u00a0"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DottedFill({
  label,
  value,
  suffix,
}: {
  label?: string;
  value?: string | null;
  suffix?: string;
}) {
  return (
    <p className="flex items-end gap-x-1.5" style={{ marginTop: "1.6mm" }}>
      {label ? <span className="shrink-0">{label}</span> : null}
      <span className="min-w-0 flex-1" style={dotLine}>
        {value?.trim() ? value : "\u00a0"}
      </span>
      {suffix ? <span className="shrink-0">{suffix}</span> : null}
    </p>
  );
}

export function CheckMark({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="mr-3 inline-flex items-baseline gap-1">
      <span aria-hidden>{on ? "☑" : "☐"}</span>
      <span>{label}</span>
    </span>
  );
}

export function SignBlock({ children }: { children: ReactNode }) {
  return (
    <div className="text-center" style={{ minWidth: "42mm" }}>
      <p className="font-bold uppercase" style={{ fontSize: "11pt" }}>
        {children}
      </p>
      <p className="italic" style={{ fontSize: "10pt", marginTop: 2 }}>
        (Ký, ghi rõ họ tên)
      </p>
      <p style={{ marginTop: "22mm", minHeight: "6mm" }}>&nbsp;</p>
    </div>
  );
}

function formatWeight(chi: number): string {
  const n = Number.isFinite(chi) ? chi : 0;
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}

const dotLine: CSSProperties = {
  borderBottom: "1px dotted #000",
  paddingBottom: 1,
  paddingLeft: 2,
  minHeight: "5mm",
};
