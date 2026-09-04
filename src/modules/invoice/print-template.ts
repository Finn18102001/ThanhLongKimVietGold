/**
 * Giấy đảm bảo vàng — print overlay template (physical blank 205 × 148 mm).
 * Coordinates are millimetres from top-left (0,0). Do not use px for print layout.
 */

export const GOLD_CERTIFICATE_TEMPLATE_ID = "gold-guarantee-certificate" as const;

export const GOLD_CERTIFICATE = {
  id: GOLD_CERTIFICATE_TEMPLATE_ID,
  name: "Giấy đảm bảo vàng",
  widthMm: 205,
  heightMm: 148,
  orientation: "landscape" as const,
  table: {
    startY: 76.19,
    rowHeight: 5.77,
    maxRows: 4,
  },
  columns: {
    /** Phôi vẫn có cột STT in sẵn - không in số STT; để trống. */
    productName: { x: 29.34, w: 34.11 },
    purity: { x: 66.86, w: 20.47 },
    weight: { x: 89.72, w: 20.47 },
    unitPrice: { x: 112.57, w: 25.24 },
    amount: { x: 141.23, w: 46.39 },
  },
  fields: {
    customerName: { x: 68.91, y: 50.01, w: 50.49, h: 4.26, fontSizePt: 9.5, align: "left" as const, weight: "600" },
    citizenId: { x: 144.64, y: 50.01, w: 43.66, h: 4.26, fontSizePt: 9.5, align: "left" as const },
    address: { x: 40.25, y: 56.13, w: 55.95, h: 4.26, fontSizePt: 9.5, align: "left" as const },
    phone: { x: 121.78, y: 56.13, w: 30.7, h: 4.26, fontSizePt: 9.5, align: "left" as const },
    birthDate: { x: 169.88, y: 56.13, w: 19.79, h: 4.26, fontSizePt: 9.5, align: "left" as const },
    day: { x: 33.43, y: 62.31, w: 12.96, h: 4.26, fontSizePt: 9.5, align: "center" as const },
    month: { x: 70.95, y: 62.31, w: 9.55, h: 4.26, fontSizePt: 9.5, align: "center" as const },
    year: { x: 100.29, y: 62.31, w: 14.33, h: 4.26, fontSizePt: 9.5, align: "center" as const },
    time: { x: 141.91, y: 62.31, w: 23.88, h: 4.26, fontSizePt: 9.5, align: "left" as const },
    /** Two-line box so full amount-in-words is visible (no clip). */
    amountInWords: { x: 70.95, y: 98.2, w: 66.0, h: 7.2, fontSizePt: 7.5, align: "left" as const },
    totalAmount: {
      x: 141.23,
      y: 99.34,
      w: 46.39,
      h: 3.85,
      fontSizePt: 11,
      align: "center" as const,
      weight: "700",
      color: "#9b0102",
    },
    customerSign: { x: 14.33, y: 122.28, w: 47.76, h: 4.81, fontSizePt: 8.5, align: "center" as const },
    staffSign: { x: 59.7, y: 122.28, w: 52.88, h: 4.81, fontSizePt: 8.5, align: "center" as const },
    /** Phôi may label cashier / controller; leave empty when no data. */
    cashierSign: { x: 115.0, y: 122.28, w: 40, h: 4.81, fontSizePt: 8.5, align: "center" as const },
    controllerSign: { x: 158.0, y: 122.28, w: 40, h: 4.81, fontSizePt: 8.5, align: "center" as const },
  },
  /** Calibration corner marks for test print (mm). */
  calibrationMarks: [
    { id: "P1", x: 10, y: 10 },
    { id: "P2", x: 195, y: 10 },
    { id: "P3", x: 10, y: 138 },
    { id: "P4", x: 195, y: 138 },
  ] as const,
} as const;

export type PrinterProfile = {
  name: string;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export const DEFAULT_PRINTER_PROFILE: PrinterProfile = {
  name: "Mặc định",
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export const PRINT_PROFILE_STORAGE_KEY = "tlkv.invoice.print.gold-certificate.v1";

export type InvoicePrintPayload = {
  customerName: string;
  citizenId: string;
  address: string;
  phone: string;
  birthDate: string;
  day: string;
  month: string;
  year: string;
  time: string;
  staffName: string;
  cashierName: string;
  controllerName: string;
  totalAmountDong: number;
  amountInWords: string;
  items: Array<{
    stt: number;
    productName: string;
    purity: string;
    weightLabel: string;
    unitPriceDong: number;
    amountDong: number;
  }>;
};

export function createTestPrintPayload(): InvoicePrintPayload {
  return {
    customerName: "TEST CUSTOMER",
    citizenId: "012345678901",
    address: "01 Nguyen Hue, Q1, TP.HCM",
    phone: "0901234567",
    birthDate: "01/01/1990",
    day: "01",
    month: "09",
    year: "2026",
    time: "09:30",
    staffName: "NV TEST",
    cashierName: "",
    controllerName: "",
    totalAmountDong: 12_858_000,
    amountInWords: "Mười hai triệu tám trăm năm mươi tám nghìn đồng",
    items: [
      {
        stt: 1,
        productName: "TEST PRODUCT 1",
        purity: "999.9",
        weightLabel: "0,2 chỉ",
        unitPriceDong: 4_286_000,
        amountDong: 4_286_000,
      },
      {
        stt: 2,
        productName: "TEST PRODUCT 2",
        purity: "999.9",
        weightLabel: "0,5 chỉ",
        unitPriceDong: 4_286_000,
        amountDong: 4_286_000,
      },
      {
        stt: 3,
        productName: "TEST PRODUCT 3 tên dài không được đè cột kế",
        purity: "999.9",
        weightLabel: "1 chỉ",
        unitPriceDong: 4_286_000,
        amountDong: 4_286_000,
      },
    ],
  };
}
