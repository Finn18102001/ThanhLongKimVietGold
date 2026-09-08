import type { BuyDetail, BuyWorkflowStatus } from "./types";

/** Figma 9-step melt buy stepper (UI chrome; maps onto BuyWorkflowStatus + derived docs). */
export const BUY_WORKFLOW_STEPS = [
  { id: "intake", label: "Tiếp nhận", status: "INTAKE" as const },
  { id: "commitment", label: "Cam kết nấu", status: "MELT_COMMITTED" as const },
  { id: "melting", label: "Nấu vàng", status: "MELTING" as const },
  { id: "weight", label: "Nhập KL sau nấu", status: "WEIGHT_ENTERED" as const },
  { id: "confirm", label: "Xác nhận", status: "AWAITING_CONFIRM" as const },
  { id: "form02", label: "Phiếu 02", status: null },
  { id: "invoice", label: "Hóa đơn mua", status: null },
  { id: "pdf", label: "Đính kèm PDF", status: null },
  { id: "done", label: "Hoàn tất", status: "COMPLETED" as const },
] as const;

export type BuyWorkflowStepId = (typeof BUY_WORKFLOW_STEPS)[number]["id"];

export const BUY_WORKFLOW_STATUS_LABEL: Record<BuyWorkflowStatus, string> = {
  INTAKE: "Tiếp nhận",
  MELT_COMMITTED: "Đã cam kết nấu",
  MELTING: "Đang nấu vàng",
  WEIGHT_ENTERED: "Đã nhập KL sau nấu",
  AWAITING_CONFIRM: "Chờ xác nhận",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export function workflowStatusLabel(status: string): string {
  return BUY_WORKFLOW_STATUS_LABEL[status as BuyWorkflowStatus] ?? status;
}

/**
 * Active step index 0..8 for the horizontal stepper.
 * Steps 5–7 (Phiếu 02 / Hóa đơn / PDF) are derived after confirm → COMPLETED.
 */
export function buyWorkflowStepIndex(buy: Pick<
  BuyDetail,
  "workflowStatus" | "status" | "form02No" | "attachmentPdfPath"
>): number {
  const wf = String(buy.workflowStatus || "");
  if (wf === "CANCELLED" || buy.status === "CANCELLED") return -1;

  if (wf === "COMPLETED" || buy.status === "COMPLETED") {
    if (buy.attachmentPdfPath) return 8;
    if (buy.form02No) return 7; // invoice done; PDF optional
    return 6;
  }

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
    default:
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
    wf === "AWAITING_CONFIRM"
  );
}
