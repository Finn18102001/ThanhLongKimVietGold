export type StockCountLineStatus = "PENDING" | "MATCH" | "EXCESS" | "LACK";

export type StockCountStatus =
  | "DRAFT"
  | "COUNTING"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "COMPLETED"
  | "REJECTED";

export type StockCountLine = {
  id: string;
  skuId: string;
  sku: string;
  name: string;
  systemQty: number;
  actualQty: number | null;
  difference: number | null;
  lineStatus: StockCountLineStatus;
};

export type StockCountSummary = {
  totalLines: number;
  matchCount: number;
  excessCount: number;
  lackCount: number;
  pendingCount: number;
};

export type StockCountSession = {
  id: string;
  countNo: string;
  warehouse: string;
  scopeType: "ALL" | "CATEGORY";
  scopeValue: string | null;
  status: StockCountStatus;
  note: string | null;
  actorEmail: string;
  approvedBy: string | null;
  rejectedReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  summary: StockCountSummary;
  items: StockCountLine[];
};

export type StockCountListRow = {
  id: string;
  countNo: string;
  warehouse: string;
  scopeType: "ALL" | "CATEGORY" | string;
  scopeValue: string | null;
  status: StockCountStatus;
  actorEmail: string;
  createdAt: string;
  completedAt: string | null;
};

export const COUNT_STATUS_LABEL: Record<StockCountStatus, string> = {
  DRAFT: "Nháp",
  COUNTING: "Đang kiểm",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  COMPLETED: "Hoàn tất",
  REJECTED: "Từ chối",
};

export const LINE_STATUS_LABEL: Record<StockCountLineStatus, string> = {
  PENDING: "Chưa nhập",
  MATCH: "Khớp",
  EXCESS: "Thừa",
  LACK: "Thiếu",
};
