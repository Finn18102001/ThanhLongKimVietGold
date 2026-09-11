import type { DepositSaleBundle, DepositWorkflowStatus } from "./types";

export const DEPOSIT_POS_STEPS = [
  { id: "confirm", label: "Xác nhận HĐ" },
  { id: "agreement", label: "Thỏa thuận đặt cọc" },
  { id: "slip", label: "Phiếu đặt cọc" },
  { id: "wait", label: "Chờ nhận vàng" },
] as const;

export const DEPOSIT_INVOICE_STEPS = [
  { id: "collect", label: "Thu tiền còn thiếu" },
  { id: "handover", label: "Biên bản giao nhận" },
  { id: "invoice", label: "In hóa đơn bán hàng" },
  { id: "done", label: "Hoàn thành" },
] as const;

export const DEPOSIT_WORKFLOW_LABEL: Record<DepositWorkflowStatus, string> = {
  AWAITING_AGREEMENT: "Chờ thỏa thuận đặt cọc",
  AGREEMENT_CONFIRMED: "Đã xác nhận thỏa thuận",
  SLIP_ISSUED: "Đã lập phiếu đặt cọc",
  AWAITING_DELIVERY: "Chờ giao nhận vàng",
  COMPLETED: "Hoàn thành giao nhận",
  CANCELLED: "Đã hủy",
};

export function depositWorkflowLabel(status: string | null | undefined): string {
  if (!status) return "";
  return DEPOSIT_WORKFLOW_LABEL[status as DepositWorkflowStatus] ?? status;
}

export function depositPosStepIndex(bundle: Pick<DepositSaleBundle, "depositWorkflowStatus">): number {
  const wf = bundle.depositWorkflowStatus;
  if (wf === "CANCELLED") return -1;
  if (!wf || wf === "AWAITING_AGREEMENT") return 1;
  if (wf === "AGREEMENT_CONFIRMED") return 2;
  return 3;
}

export function depositInvoiceStepIndex(
  bundle: Pick<
    DepositSaleBundle,
    "depositWorkflowStatus" | "remainingDong" | "fulfillmentStatus" | "deliveryReceiptNo"
  >,
): number {
  const wf = bundle.depositWorkflowStatus;
  if (wf === "CANCELLED") return -1;
  if (wf === "COMPLETED" || bundle.fulfillmentStatus === "FULFILLED") return 3;
  if (wf === "AWAITING_DELIVERY" || bundle.deliveryReceiptNo) {
    return bundle.fulfillmentStatus === "FULFILLED" ? 2 : 1;
  }
  if (bundle.remainingDong <= 0) return 1;
  return 0;
}

export function itemStatusLabel(status: string): string {
  if (status === "IN_STOCK") return "Hàng sẵn giao";
  if (status === "BACKORDER") return "Hàng đặt, chưa có";
  if (status === "READY") return "Đã đủ hàng, chờ giao";
  if (status === "PARTIAL") return "Đã giao một phần";
  if (status === "DELIVERED") return "Đã giao đủ";
  return status;
}

/** Word Số: ……/TTĐC/2026 from stored TTĐC/2026-0001 or already-formatted. */
export function formatLegalDocNo(raw: string | null | undefined, kind: "TTĐC" | "PDC" | "BBGN"): string {
  if (!raw) return `……/${kind}/${new Date().getFullYear()}`;
  const ttdc = raw.match(/^TTĐC\/(\d{4})-(\d+)$/);
  if (ttdc) return `${ttdc[2]}/${kind}/${ttdc[1]}`;
  const bbgn = raw.match(/^BBGN\/(\d{4})-(\d+)$/);
  if (bbgn) return `${bbgn[2]}/${kind}/${bbgn[1]}`;
  const pdc = raw.match(/^PDC-(\d+)$/);
  if (pdc) return `${pdc[1]}/${kind}/${new Date().getFullYear()}`;
  return raw;
}
