import type { CSSProperties, ReactNode } from "react";
import { INVOICE_CERTIFICATE_BG } from "@/shared/brand/assets";
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

/** Rows squeezed into the 4 printed lines of the phôi; beyond this the text gets unreadable. */
const MAX_FITTED_ROWS = 8;

type PrintItem = InvoicePrintPayload["items"][number];

function weightWithQty(weightChi: number, quantity: number): string {
  if (weightChi > 0) return quantity > 1 ? `${formatChi(weightChi)} × ${quantity}` : formatChi(weightChi);
  return quantity > 1 ? `× ${quantity}` : "";
}

/**
 * P4 C9 + Big Change BC-19: each product prints its gold row, then detail rows right under it:
 * đá (only when the piece has stone) and tiền công (only when ≠ 0). Gold unit price never includes stone / labor.
 * Stone row: số lượng viên in the name, TL đá in the weight cell (display only), đơn giá = giá / viên,
 * thành tiền = đơn giá × số lượng đá × số chiếc.
 * Lines sold before the split (goldAmountDong null) keep the single legacy row.
 * Row limit is unchanged: detail rows still count toward MAX_FITTED_ROWS.
 */
function invoiceProductRows(invoice: InvoiceDetail): Omit<PrintItem, "stt">[] {
  const rows: Omit<PrintItem, "stt">[] = [];
  for (const line of invoice.lines) {
    if (line.goldAmountDong == null) {
      rows.push({
        productName: line.name,
        purity: line.purity || "",
        weightLabel: weightWithQty(line.weightChi, line.quantity),
        unitPriceDong: line.weightChi > 0 ? Math.round(line.unitPriceDong / line.weightChi) : line.unitPriceDong,
        amountDong: line.totalPriceDong,
      });
      continue;
    }
    rows.push({
      productName: line.name,
      purity: line.purity || "",
      weightLabel: weightWithQty(line.weightChi, line.quantity),
      unitPriceDong: line.weightChi > 0 ? Math.round(line.goldAmountDong / line.weightChi) : line.goldAmountDong,
      amountDong: line.goldAmountDong * line.quantity,
    });
    if (line.stoneWeightChi > 0 || line.stonePriceDong > 0) {
      // Lines sold with a hand-typed stone amount (no stone quantity) keep printing that amount per piece.
      const hasStoneQty = line.stoneQuantity > 0;
      rows.push({
        productName: hasStoneQty ? `Đá (${line.stoneQuantity.toLocaleString("vi-VN")} viên)` : "Đá",
        purity: "",
        weightLabel: weightWithQty(line.stoneWeightChi, line.quantity),
        unitPriceDong: hasStoneQty ? line.stoneUnitPriceDong : line.stonePriceDong,
        amountDong: line.stonePriceDong * line.quantity,
      });
    }
    const labor = line.laborFinalDong ?? 0;
    if (labor !== 0) {
      rows.push({
        productName: "Tiền công",
        purity: "",
        weightLabel: line.quantity > 1 ? `× ${line.quantity}` : "",
        unitPriceDong: labor,
        amountDong: labor * line.quantity,
      });
    }
  }
  return rows;
}

export function invoiceCertificateRowCount(invoice: InvoiceDetail): number {
  return invoiceProductRows(invoice).length + (invoice.charges?.length ?? 0);
}

export function invoiceToPrintPayload(invoice: InvoiceDetail): InvoicePrintPayload {
  const issued = invoiceIssuedParts(invoice.issuedAt);
  const walkIn = invoice.isWalkIn || invoice.customerPhone === "WALKIN";
  const phone = walkIn ? "" : invoice.customerPhone;
  const citizenId = walkIn ? "" : (invoice.customerCitizenId ?? "");
  const birthDate = invoice.customerDateOfBirth
    ? formatViDate(invoice.customerDateOfBirth.slice(0, 10))
    : "";
  const paidDong = Math.max(0, invoice.paidDong);

  // Đơn giá on phôi: vàng = giá / 1 chỉ; đá = giá / 1 viên; công = giá / 1 chiếc. Qty goes into the weight cell.
  const productItems = invoiceProductRows(invoice).map((row, index) => ({ stt: index + 1, ...row }));
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
    // Phôi: để trống ô ký nhân viên bán hàng (ký tay).
    staffName: "",
    cashierName: "",
    controllerName: "",
    totalAmountDong: paidDong,
    amountInWords: formatDongInWords(paidDong),
    items: [...productItems, ...chargeItems].slice(0, MAX_FITTED_ROWS),
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
  printer = {
    name: "Mặc định",
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    amountInWordsOffsetX: -33,
    amountInWordsOffsetY: 4.5,
    totalAmountOffsetX: 0,
    totalAmountOffsetY: 0,
  },
  showTemplateBackground = true,
  showCalibrationMarks = false,
}: InvoiceDocumentProps) {
  const payload =
    payloadProp ?? (invoice ? invoiceToPrintPayload(invoice) : null);
  if (!payload) return null;

  const ox = printer.offsetX;
  const oy = printer.offsetY;
  const scale = printer.scale > 0 ? printer.scale : 1;
  const wordsOx = ox + (printer.amountInWordsOffsetX ?? 0);
  const wordsOy = oy + (printer.amountInWordsOffsetY ?? 0);
  const totalOx = ox + (printer.totalAmountOffsetX ?? 0);
  const totalOy = oy + (printer.totalAmountOffsetY ?? 0);

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
          src={INVOICE_CERTIFICATE_BG}
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
        // More rows than printed lines: shrink rows evenly inside the same 4-line band.
        const fit = Math.min(1, T.table.maxRows / Math.max(payload.items.length, 1));
        const h = T.table.rowHeight * fit;
        const y = T.table.startY + index * h;
        const fs = (pt: number) => Math.max(5.5, pt * Math.max(fit, 0.75));
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
              size={fs(7.5)}
            >
              {item.productName}
            </PrintBox>
            <PrintBox x={T.columns.purity.x} y={y} w={T.columns.purity.w} h={h} ox={ox} oy={oy} align="center" size={fs(8)}>
              {item.purity}
            </PrintBox>
            <PrintBox x={T.columns.weight.x} y={y} w={T.columns.weight.w} h={h} ox={ox} oy={oy} align="center" size={fs(7.5)}>
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
              size={fs(8)}
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
              size={fs(8)}
              className="font-medium"
            >
              {formatDongCompact(item.amountDong)}
            </PrintBox>
          </div>
        );
      })}

      <PrintField field={T.fields.amountInWords} ox={wordsOx} oy={wordsOy}>
        {payload.amountInWords}
      </PrintField>
      <PrintField field={T.fields.totalAmount} ox={totalOx} oy={totalOy} className="font-bold text-[#9b0102]">
        {formatDongCompact(payload.totalAmountDong)}
      </PrintField>

      <PrintField field={T.fields.customerSign} ox={ox} oy={oy}>
        {payload.customerName}
      </PrintField>
      {/* staffSign intentionally blank — phôi ký tay, không in tên tài khoản. */}
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
  /** When true, text wraps inside width/height (used by amount-in-words). */
  wrap?: boolean;
  lineHeight?: number;
  letterSpacing?: string | number;
  fontFamily?: string;
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
      wrap={field.wrap === true}
      lineHeight={field.lineHeight}
      letterSpacing={field.letterSpacing}
      fontFamily={field.fontFamily}
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
  wrap = false,
  lineHeight,
  letterSpacing,
  fontFamily,
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
  wrap?: boolean;
  lineHeight?: number;
  letterSpacing?: string | number;
  fontFamily?: string;
  className?: string;
  children?: ReactNode;
}) {
  const text = children == null || children === "" ? null : children;
  if (text == null) return null;

  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const textAlign = align;
  const style: CSSProperties = wrap
    ? {
        position: "absolute",
        left: `calc(${x}mm + ${ox}mm)`,
        top: `calc(${y}mm + ${oy}mm)`,
        width: `${w}mm`,
        maxWidth: `${w}mm`,
        height: `${h}mm`,
        fontSize: `${size}pt`,
        fontFamily: fontFamily ?? "Arial, Helvetica, sans-serif",
        fontWeight: weight ?? 400,
        color,
        lineHeight: lineHeight ?? 1.25,
        letterSpacing,
        display: "block",
        overflow: "hidden",
        whiteSpace: "normal",
        overflowWrap: "break-word",
        wordBreak: "normal",
        textAlign,
        paddingTop: "0.15mm",
        paddingLeft: align === "left" ? "0.15em" : 0,
        paddingRight: align === "right" ? "0.15em" : 0,
        boxSizing: "border-box",
      }
    : {
        position: "absolute",
        left: `calc(${x}mm + ${ox}mm)`,
        top: `calc(${y}mm + ${oy}mm)`,
        width: `${w}mm`,
        height: `${h}mm`,
        fontSize: `${size}pt`,
        fontFamily: fontFamily ?? "Arial, Helvetica, sans-serif",
        fontWeight: weight ?? 400,
        color,
        lineHeight: lineHeight ?? 1.15,
        letterSpacing,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        minWidth: 0,
        paddingLeft: align === "left" ? "0.15em" : 0,
        paddingRight: align === "right" ? "0.15em" : 0,
        boxSizing: "border-box",
      };
  return (
    <div
      style={style}
      className={`invoice-print-field ${wrap ? "invoice-print-wrap" : ""} ${className}`.trim()}
    >
      {text}
    </div>
  );
}
