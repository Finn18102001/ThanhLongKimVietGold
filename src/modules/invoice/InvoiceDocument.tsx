import type { CSSProperties, ReactNode } from "react";
import { formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViDate } from "@/shared/lib/datetime";
import { formatChi, invoiceIssuedParts } from "./labels";
import type { InvoiceCharge, InvoiceDetail } from "./types";

/** PDF template canvas in points (Adobe Illustrator source). */
const PW = 600.945;
const PH = 430.866;

/** Data-row boxes from the PNG table grid (canvas points). */
const ROW_BOX = [
  { y: 221.8, h: 15.8 },
  { y: 238.6, h: 15.8 },
  { y: 255.6, h: 15.6 },
  { y: 272.4, h: 15.8 },
];

/** Vertical dividers: STT 59.8 | item 79.2 | purity 192.2 | weight 259.4 | unit 326.4 | amount 408.5 | 555.3 */
const COL = {
  item: { x: 86, w: 100 },
  purity: { x: 196, w: 60 },
  weight: { x: 263, w: 60 },
  unit: { x: 330, w: 74 },
  amount: { x: 414, w: 136 },
};

type CertRow = {
  key: string;
  name: string;
  purity: string;
  weightLabel: string;
  unitPriceDong: number;
  totalPriceDong: number;
};

function toCertRows(invoice: InvoiceDetail): CertRow[] {
  const products: CertRow[] = invoice.lines.map((line, index) => ({
    key: `line-${line.skuId}-${index}`,
    name: line.quantity > 1 ? `${line.name} x${line.quantity}` : line.name,
    purity: line.purity || "",
    weightLabel: line.weightChi > 0 ? formatChi(line.weightChi) : "",
    unitPriceDong: line.unitPriceDong,
    totalPriceDong: line.totalPriceDong,
  }));
  const extras: CertRow[] = (invoice.charges ?? []).map((charge: InvoiceCharge) => ({
    key: `charge-${charge.id}`,
    name: charge.name,
    purity: "",
    weightLabel: "",
    unitPriceDong: charge.amountDong,
    totalPriceDong: charge.amountDong,
  }));
  return [...products, ...extras];
}

export function invoiceCertificateRowCount(invoice: InvoiceDetail): number {
  return invoice.lines.length + (invoice.charges?.length ?? 0);
}

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const staffName =
    invoice.operatorName || invoice.actorEmail.split("@")[0] || invoice.actorEmail;
  const issued = invoiceIssuedParts(invoice.issuedAt);
  const walkIn = invoice.isWalkIn || invoice.customerPhone === "WALKIN";
  const phone = walkIn ? "" : invoice.customerPhone;
  const citizenId = walkIn ? "" : (invoice.customerCitizenId ?? "");
  const dob = invoice.customerDateOfBirth
    ? formatViDate(invoice.customerDateOfBirth.slice(0, 10))
    : "";
  const rows = toCertRows(invoice).slice(0, 4);
  const paidDong = Math.max(0, invoice.paidDong);
  const words = formatDongInWords(paidDong);

  return (
    <article
      className="invoice-print relative mx-auto w-full max-w-[212mm] overflow-hidden bg-white text-[#1f1f1f] aspect-[600.945/430.866]"
      style={{
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/invoice/gold-certificate.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      />

      <CertField x={202} y={145.6} w={148} h={12.4} className="font-semibold">
        {invoice.customerName}
      </CertField>
      <CertField x={424} y={145.6} w={128} h={12.4}>
        {citizenId}
      </CertField>
      <CertField x={118} y={163.4} w={164} h={12.4}>
        {invoice.customerAddress || ""}
      </CertField>
      <CertField x={357} y={163.4} w={90} h={12.4}>
        {phone}
      </CertField>
      <CertField x={498} y={163.4} w={58} h={12.4}>
        {dob}
      </CertField>
      <CertField x={98} y={181.4} w={38} h={12.4} align="center">
        {issued.day}
      </CertField>
      <CertField x={208} y={181.4} w={28} h={12.4} align="center">
        {issued.month}
      </CertField>
      <CertField x={294} y={181.4} w={42} h={12.4} align="center">
        {issued.year}
      </CertField>
      <CertField x={416} y={181.4} w={70} h={12.4}>
        {issued.time}
      </CertField>

      {rows.map((row, index) => (
        <CertificateLine key={row.key} row={row} box={ROW_BOX[index] ?? ROW_BOX[3]} />
      ))}

      <CertField x={208} y={289.2} w={118} h={11.2} size={8} className="leading-tight">
        {words}
      </CertField>
      <CertField
        x={414}
        y={289.2}
        w={136}
        h={11.2}
        align="center"
        size={11}
        className="font-bold text-[#9b0102]"
      >
        {formatDongCompact(paidDong)}
      </CertField>

      <CertField x={42} y={356} w={140} h={14} align="center" size={8.5}>
        {invoice.customerName}
      </CertField>
      <CertField x={175} y={356} w={155} h={14} align="center" size={8.5}>
        {staffName}
      </CertField>
    </article>
  );
}

function CertificateLine({
  row,
  box,
}: {
  row: CertRow;
  box: { y: number; h: number };
}) {
  const { y, h } = box;
  return (
    <>
      <CertField x={COL.item.x} y={y} w={COL.item.w} h={h} align="center" size={8}>
        {row.name}
      </CertField>
      <CertField x={COL.purity.x} y={y} w={COL.purity.w} h={h} align="center" size={8}>
        {row.purity}
      </CertField>
      <CertField x={COL.weight.x} y={y} w={COL.weight.w} h={h} align="center" size={8}>
        {row.weightLabel}
      </CertField>
      <CertField x={COL.unit.x} y={y} w={COL.unit.w} h={h} align="center" size={8}>
        {formatDongCompact(row.unitPriceDong)}
      </CertField>
      <CertField
        x={COL.amount.x}
        y={y}
        w={COL.amount.w}
        h={h}
        align="center"
        size={8}
        className="font-medium"
      >
        {formatDongCompact(row.totalPriceDong)}
      </CertField>
    </>
  );
}

function CertField({
  x,
  y,
  w,
  h,
  align = "left",
  size = 9.5,
  className = "",
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  align?: "left" | "center" | "right";
  size?: number;
  className?: string;
  children?: ReactNode;
}) {
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const style: CSSProperties = {
    position: "absolute",
    left: `${(x / PW) * 100}%`,
    top: `${(y / PH) * 100}%`,
    width: `${(w / PW) * 100}%`,
    height: `${(h / PH) * 100}%`,
    fontSize: `${size}pt`,
    lineHeight: 1.15,
    display: "flex",
    alignItems: "center",
    justifyContent: justify,
    overflow: "hidden",
    whiteSpace: size <= 8.5 ? "normal" : "nowrap",
    textOverflow: "ellipsis",
    paddingLeft: align === "left" ? "0.15em" : 0,
    paddingRight: align === "right" ? "0.15em" : 0,
    boxSizing: "border-box",
  };
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
