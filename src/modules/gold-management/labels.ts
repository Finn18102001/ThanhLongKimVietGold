import type {
  GoldObligationKind,
  ObligationStatus,
  PartyType,
  PayableStatus,
  ReceivableStatus,
} from "./types";

export const KIND_LABEL: Record<GoldObligationKind, string> = {
  RECEIVABLE: "Phải thu",
  PAYABLE: "Phải trả",
};

export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  SUPPLIER: "Nhà cung cấp",
  CUSTOMER: "Khách hàng",
  PARTNER: "Đối tác",
};

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  NOT_RECEIVED: "Chưa nhận",
  PARTIAL: "Đã nhận một phần",
  RECEIVED: "Đã nhận đủ",
};

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  NOT_DELIVERED: "Chưa giao",
  PARTIAL: "Đã giao một phần",
  DELIVERED: "Đã giao đủ",
};

export function statusLabel(kind: GoldObligationKind, status: ObligationStatus): string {
  if (kind === "RECEIVABLE") {
    return RECEIVABLE_STATUS_LABEL[status as ReceivableStatus] ?? status;
  }
  return PAYABLE_STATUS_LABEL[status as PayableStatus] ?? status;
}

export function receivableStatus(ordered: number, settled: number): ReceivableStatus {
  if (settled <= 0) return "NOT_RECEIVED";
  if (settled >= ordered) return "RECEIVED";
  return "PARTIAL";
}

export function payableStatus(ordered: number, settled: number): PayableStatus {
  if (settled <= 0) return "NOT_DELIVERED";
  if (settled >= ordered) return "DELIVERED";
  return "PARTIAL";
}

export function formatChi(value: number): string {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}
