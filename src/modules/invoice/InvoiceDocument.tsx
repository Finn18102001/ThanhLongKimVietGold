import type { CSSProperties, ReactNode } from "react";
import { formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViDate } from "@/shared/lib/datetime";
import { formatChi, invoiceIssuedParts } from "./labels";
import type { InvoiceDetail, InvoiceLine } from "./types";

/** PDF template canvas in points (Adobe Illustrator source). */
const PW = 600.945;
const PH = 430.866;

const ROW_TOP = [222.6, 239.8, 256.2, 273.0];

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const staffName = invoice.actorEmail.split("@")[0] ?? invoice.actorEmail;
  const issued = invoiceIssuedParts(invoice.issuedAt);
  const walkIn = invoice.isWalkIn || invoice.customerPhone === "WALKIN";
  const phone = walkIn ? "" : invoice.customerPhone;
  const citizenId = walkIn ? "" : (invoice.customerCitizenId ?? "");
  const dob = invoice.customerDateOfBirth
    ? formatViDate(invoice.customerDateOfBirth.slice(0, 10))
    : "";
  const lines = invoice.lines.slice(0, 4);
  const words = formatDongInWords(invoice.totalDong);

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

      {lines.map((line, index) => (
        <CertificateLine key={`${line.skuId}-${index}`} line={line} top={ROW_TOP[index] ?? 273} />
      ))}

      <CertField x={210} y={287.4} w={116} h={28} size={8} className="leading-tight">
        {words}
      </CertField>
      <CertField
        x={432}
        y={292.4}
        w={120}
        h={14}
        align="right"
        size={11}
        className="font-bold text-[#9b0102]"
      >
        {formatDongCompact(invoice.totalDong)}
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

function CertificateLine({ line, top }: { line: InvoiceLine; top: number }) {
  const qtyLabel = line.quantity > 1 ? ` x${line.quantity}` : "";
  return (
    <>
      <CertField x={72} y={top} w={122} h={13} size={8}>
        {`${line.name}${qtyLabel}`}
      </CertField>
      <CertField x={198} y={top} w={62} h={13} align="center" size={8}>
        {line.purity || ""}
      </CertField>
      <CertField x={262} y={top} w={68} h={13} align="center" size={8}>
        {line.weightChi > 0 ? formatChi(line.weightChi) : ""}
      </CertField>
      <CertField x={332} y={top} w={96} h={13} align="right" size={8}>
        {formatDongCompact(line.unitPriceDong)}
      </CertField>
      <CertField x={430} y={top} w={122} h={13} align="right" size={8} className="font-medium">
        {formatDongCompact(line.totalPriceDong)}
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
  const style: CSSProperties = {
    position: "absolute",
    left: `${(x / PW) * 100}%`,
    top: `${(y / PH) * 100}%`,
    width: `${(w / PW) * 100}%`,
    height: `${(h / PH) * 100}%`,
    fontSize: `${size}pt`,
    lineHeight: 1.15,
    textAlign: align,
    overflow: "hidden",
    whiteSpace: size <= 8.5 ? "normal" : "nowrap",
    textOverflow: "ellipsis",
  };
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
