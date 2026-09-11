import type { CSSProperties, ReactNode } from "react";
import { formatDongCompact } from "@/shared/lib/money";
import type { DepositLine } from "../types";

const th: CSSProperties = {
  padding: "1.1mm 0.7mm",
  verticalAlign: "middle",
  fontWeight: 700,
};

const td: CSSProperties = {
  padding: "1.2mm 0.7mm",
  verticalAlign: "middle",
};

export function DepositGoodsTable({
  lines,
  amountHeader = "Thành tiền tạm tính",
}: {
  lines: DepositLine[];
  amountHeader?: string;
}) {
  const rows = lines.length > 0 ? lines : [];
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
        {rows.map((line, index) => (
          <tr key={line.id}>
            <td className="border border-black text-center" style={td}>
              {index + 1}
            </td>
            <td className="border border-black text-left" style={td}>
              {line.name}
            </td>
            <td className="border border-black text-center tabular-nums" style={td}>
              {line.quantity}
            </td>
            <td className="border border-black text-center tabular-nums" style={td}>
              {formatWeight(line.totalWeightChi)}
            </td>
            <td className="border border-black text-center" style={td}>
              chiếc
            </td>
            <td className="border border-black text-center" style={td}>
              {line.purity || ""}
            </td>
            <td className="border border-black text-right tabular-nums" style={td}>
              {formatDongCompact(line.unitPriceDong)}
            </td>
            <td className="border border-black text-right tabular-nums" style={td}>
              {formatDongCompact(line.totalPriceDong)}
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
