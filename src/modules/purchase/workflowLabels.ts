import type { BuyAttachment, BuyDetail, BuyWorkflowStatus } from "./types";

/**
 * Official melt buy stepper:
 * Tiếp nhận → Cam kết → Nấu → KL + phiếu HL → Xác nhận → HĐ mua → Phiếu 02 → Hoàn tất
 */
export const BUY_WORKFLOW_STEPS = [
  { id: "intake", label: "Tiếp nhận", status: "INTAKE" as const },
  { id: "commitment", label: "Cam kết nấu", status: "MELT_COMMITTED" as const },
  { id: "melting", label: "Nấu vàng", status: "MELTING" as const },
  { id: "weight", label: "KL + phiếu HL", status: "WEIGHT_ENTERED" as const },
  { id: "confirm", label: "Xác nhận KH", status: "AWAITING_CONFIRM" as const },
  { id: "invoice", label: "Hóa đơn mua", status: "INVOICE_ISSUED" as const },
  { id: "form02", label: "Phiếu 02", status: "FORM02_READY" as const },
  { id: "done", label: "Hoàn tất", status: "COMPLETED" as const },
] as const;

export type BuyWorkflowStepId = (typeof BUY_WORKFLOW_STEPS)[number]["id"];

export const BUY_WORKFLOW_STATUS_LABEL: Record<BuyWorkflowStatus, string> = {
  INTAKE: "Tiếp nhận",
  MELT_COMMITTED: "Đã cam kết nấu",
  MELTING: "Đang nấu vàng",
  WEIGHT_ENTERED: "Đã nhập KL — chờ phiếu HL",
  AWAITING_CONFIRM: "Chờ xác nhận khách",
  INVOICE_ISSUED: "Hóa đơn bán hàng",
  FORM02_READY: "Phiếu 02",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export const BUY_ATTACHMENT_KIND_LABEL: Record<string, string> = {
  PURITY_TEST: "Phiếu kiểm tra hàm lượng",
  RELATED: "Tài liệu liên quan",
  SIGNED_PDF: "PDF đã ký",
};

export function workflowStatusLabel(status: string): string {
  return BUY_WORKFLOW_STATUS_LABEL[status as BuyWorkflowStatus] ?? status;
}

export function buyAttachmentKindLabel(kind: string): string {
  return BUY_ATTACHMENT_KIND_LABEL[kind] ?? kind;
}

/**
 * Active step index 0..7 for the horizontal stepper.
 */
export function buyWorkflowStepIndex(
  buy: Pick<BuyDetail, "workflowStatus" | "status" | "form02No">,
): number {
  const wf = String(buy.workflowStatus || "");
  if (wf === "CANCELLED" || buy.status === "CANCELLED") return -1;

  switch (wf) {
    case "INTAKE":
      return 0;
    case "MELT_COMMITTED":
      return 1;
    case "MELTING":
      return 2;
    case "WEIGHT_ENTERED":
      return 3;
    case "AWAITING_CONFIRM":
      return 4;
    case "INVOICE_ISSUED":
      return 5;
    case "FORM02_READY":
      return 6;
    case "COMPLETED":
      return 7;
    default:
      if (buy.status === "COMPLETED") return 7;
      return 0;
  }
}

export function isBuyInMeltWorkflow(buy: Pick<BuyDetail, "status" | "workflowStatus">): boolean {
  const status = String(buy.status || "");
  const wf = String(buy.workflowStatus || "");
  if (status === "PROCESSING") return true;
  return (
    wf === "INTAKE" ||
    wf === "MELT_COMMITTED" ||
    wf === "MELTING" ||
    wf === "WEIGHT_ENTERED" ||
    wf === "AWAITING_CONFIRM" ||
    wf === "INVOICE_ISSUED" ||
    wf === "FORM02_READY"
  );
}

/** Commitment print only while still on the commitment step. */
export function canPrintCommitmentFromFlow(wf: string): boolean {
  return wf === "MELT_COMMITTED";
}

export function hasPurityTestAttachment(attachments: BuyAttachment[] | undefined): boolean {
  return (attachments ?? []).some((a) => a.docKind === "PURITY_TEST");
}
