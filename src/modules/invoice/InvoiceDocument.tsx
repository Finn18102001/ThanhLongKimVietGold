import type { CSSProperties, ReactNode } from "react";
import { formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViDate } from "@/shared/lib/datetime";
import { formatChi, invoiceIssuedParts } from "./labels";
import {
  GOLD_CERTIFICATE,
  type InvoicePrintPayload,
  type PrinterProfile,
} from "./print-template";
import type { InvoiceCharge, InvoiceDetail } from "./types";

const T = GOLD_CERTIFICATE;

export function invoiceCertificateRowCount(invoice: InvoiceDetail): number {
  return invoice.lines.length + (invoice.charges?.length ?? 0);
}

export function invoiceToPrintPayload(invoice: InvoiceDetail): InvoicePrintPayload {
  const staffName =
    invoice.operatorName || invoice.actorEmail.split("@")[0] || invoice.actorEmail;
  const issued = invoiceIssuedParts(invoice.issuedAt);
  const walkIn = invoice.isWalkIn || invoice.customerPhone === "WALKIN";
  const phone = walkIn ? "" : invoice.customerPhone;
  const citizenId = walkIn ? "" : (invoice.customerCitizenId ?? "");
  const birthDate = invoice.customerDateOfBirth
    ? formatViDate(invoice.customerDateOfBirth.slice(0, 10))
    : "";
  const paidDong = Math.max(0, invoice.paidDong);

  const productItems = invoice.lines.map((line, index) => ({
    stt: index + 1,
    productName: line.quantity > 1 ? `${line.name} x${line.quantity}` : line.name,
    purity: line.purity || "",
    weightLabel: line.weightChi > 0 ? formatChi(line.weightChi) : "",
    unitPriceDong: line.unitPriceDong,
    amountDong: line.totalPriceDong,
  }));
  const chargeItems = (invoice.charges ?? []).map((charge: InvoiceCharge, index) => ({
    stt: productItems.length + index + 1,
    productName: charge.name,
    purity: "",
    weightLabel: "",
    unitPriceDong: charge.amountDong,
    amountDong: charge.amountDong,
  }));

  return {
    customerName: invoice.customerName || "",
    citizenId,
    address: invoice.customerAddress || "",
    phone,
    birthDate,
    day: issued.day,
    month: issued.month,
    year: issued.year,
    time: issued.time,
    staffName,
    cashierName: "",
    controllerName: "",
    totalAmountDong: paidDong,
    amountInWords: formatDongInWords(paidDong),
    items: [...productItems, ...chargeItems].slice(0, T.table.maxRows),
  };
}

type InvoiceDocumentProps = {
  invoice?: InvoiceDetail;
  /** Override payload (test print). When set, `invoice` is ignored for field values. */
  payload?: InvoicePrintPayload;
  printer?: PrinterProfile;
  /** Show phôi background on screen (always hidden when printing). */
  showTemplateBackground?: boolean;
  /** Show P1–P4 marks (test / calibration). */
  showCalibrationMarks?: boolean;
};

export function InvoiceDocument({
  invoice,
  payload: payloadProp,
  printer = { name: "Mặc định", offsetX: 0, offsetY: 0, scale: 1 },
  showTemplateBackground = true,
  showCalibrationMarks = false,
}: InvoiceDocumentProps) {
  const payload =
    payloadProp ?? (invoice ? invoiceToPrintPayload(invoice) : null);
  if (!payload) return null;

  const ox = printer.offsetX;
  const oy = printer.offsetY;
  const scale = printer.scale > 0 ? printer.scale : 1;

  return (
    <article
      className="invoice-print-page relative mx-auto overflow-hidden bg-white text-[#1f1f1f]"
      style={{
        width: `${T.widthMm}mm`,
        maxWidth: "100%",
        aspectRatio: `${T.widthMm} / ${T.heightMm}`,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {showTemplateBackground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/invoice/gold-certificate.png"
          alt=""
          className="invoice-template-background pointer-events-none absolute inset-0 h-full w-full select-none"
        />
      ) : null}

      <PrintField field={T.fields.customerName} ox={ox} oy={oy} className="font-semibold">
        {payload.customerName}
      </PrintField>
      <PrintField field={T.fields.citizenId} ox={ox} oy={oy}>
        {payload.citizenId}
      </PrintField>
      <PrintField field={T.fields.address} ox={ox} oy={oy}>
        {payload.address}
      </PrintField>
      <PrintField field={T.fields.phone} ox={ox} oy={oy}>
        {payload.phone}
      </PrintField>
      <PrintField field={T.fields.birthDate} ox={ox} oy={oy}>
        {payload.birthDate}
      </PrintField>
      <PrintField field={T.fields.day} ox={ox} oy={oy}>
        {payload.day}
      </PrintField>
      <PrintField field={T.fields.month} ox={ox} oy={oy}>
        {payload.month}
      </PrintField>
      <PrintField field={T.fields.year} ox={ox} oy={oy}>
        {payload.year}
      </PrintField>
      <PrintField field={T.fields.time} ox={ox} oy={oy}>
        {payload.time}
      </PrintField>

      {payload.items.map((item, index) => {
        const y = T.table.startY + index * T.table.rowHeight;
        const h = T.table.rowHeight;
        return (
          <div key={`item-${index}-${item.productName}`}>
            <PrintBox
              x={T.columns.productName.x}
              y={y}
              w={T.columns.productName.w}
              h={h}
              ox={ox}
              oy={oy}
              align="center"
              size={8}
            >
              {item.productName}
            </PrintBox>
            <PrintBox x={T.columns.purity.x} y={y} w={T.columns.purity.w} h={h} ox={ox} oy={oy} align="center" size={8}>
              {item.purity}
            </PrintBox>
            <PrintBox x={T.columns.weight.x} y={y} w={T.columns.weight.w} h={h} ox={ox} oy={oy} align="center" size={8}>
              {item.weightLabel}
            </PrintBox>
            <PrintBox
              x={T.columns.unitPrice.x}
              y={y}
              w={T.columns.unitPrice.w}
              h={h}
              ox={ox}
              oy={oy}
              align="center"
              size={8}
            >
              {formatDongCompact(item.unitPriceDong)}
            </PrintBox>
            <PrintBox
              x={T.columns.amount.x}
              y={y}
              w={T.columns.amount.w}
              h={h}
              ox={ox}
              oy={oy}
              align="center"
              size={8}
              className="font-medium"
            >
              {formatDongCompact(item.amountDong)}
            </PrintBox>
          </div>
        );
      })}

      <PrintField field={T.fields.amountInWords} ox={ox} oy={oy}>
        {payload.amountInWords}
      </PrintField>
      <PrintField field={T.fields.totalAmount} ox={ox} oy={oy} className="font-bold text-[#9b0102]">
        {formatDongCompact(payload.totalAmountDong)}
      </PrintField>

      <PrintField field={T.fields.customerSign} ox={ox} oy={oy}>
        {payload.customerName}
      </PrintField>
      <PrintField field={T.fields.staffSign} ox={ox} oy={oy}>
        {payload.staffName}
      </PrintField>
      {payload.cashierName ? (
        <PrintField field={T.fields.cashierSign} ox={ox} oy={oy}>
          {payload.cashierName}
        </PrintField>
      ) : null}
      {payload.controllerName ? (
        <PrintField field={T.fields.controllerSign} ox={ox} oy={oy}>
          {payload.controllerName}
        </PrintField>
      ) : null}

      {showCalibrationMarks
        ? T.calibrationMarks.map((mark) => (
            <div
              key={mark.id}
              className="invoice-print-field pointer-events-none"
              style={{
                position: "absolute",
                left: `calc(${mark.x}mm + ${ox}mm)`,
                top: `calc(${mark.y}mm + ${oy}mm)`,
                width: "4mm",
                height: "4mm",
                marginLeft: "-2mm",
                marginTop: "-2mm",
                border: "0.3mm solid #9b0102",
                borderRadius: "50%",
                boxSizing: "border-box",
                fontSize: "6pt",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9b0102",
                fontWeight: 700,
              }}
              aria-hidden
            >
              {mark.id}
            </div>
          ))
        : null}
    </article>
  );
}

type FieldBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePt: number;
  align: "left" | "center" | "right";
  weight?: string;
  color?: string;
};

function PrintField({
  field,
  ox,
  oy,
  className = "",
  children,
}: {
  field: FieldBox;
  ox: number;
  oy: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <PrintBox
      x={field.x}
      y={field.y}
      w={field.w}
      h={field.h}
      ox={ox}
      oy={oy}
      align={field.align}
      size={field.fontSizePt}
      weight={field.weight}
      color={field.color}
      className={className}
    >
      {children}
    </PrintBox>
  );
}

function PrintBox({
  x,
  y,
  w,
  h,
  ox,
  oy,
  align = "left",
  size = 9.5,
  weight,
  color,
  className = "",
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  align?: "left" | "center" | "right";
  size?: number;
  weight?: string;
  color?: string;
  className?: string;
  children?: ReactNode;
}) {
  const text = children == null || children === "" ? null : children;
  if (text == null) return null;

  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const style: CSSProperties = {
    position: "absolute",
    left: `calc(${x}mm + ${ox}mm)`,
    top: `calc(${y}mm + ${oy}mm)`,
    width: `${w}mm`,
    height: `${h}mm`,
    fontSize: `${size}pt`,
    fontFamily: "Arial, Helvetica, sans-serif",
    fontWeight: weight ?? 400,
    color: color,
    lineHeight: 1.15,
    display: "flex",
    alignItems: size <= 8.5 ? "flex-start" : "center",
    justifyContent: justify,
    overflow: "hidden",
    whiteSpace: size <= 8.5 ? "normal" : "nowrap",
    textOverflow: size <= 8.5 ? "clip" : "ellipsis",
    paddingTop: size <= 8.5 ? "0.1mm" : 0,
    paddingLeft: align === "left" ? "0.15em" : 0,
    paddingRight: align === "right" ? "0.15em" : 0,
    boxSizing: "border-box",
  };
  return (
    <div style={style} className={`invoice-print-field ${className}`.trim()}>
      {text}
    </div>
  );
}
