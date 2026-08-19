export type AuditLogRow = {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
};

export type AuditListPage = {
  items: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export const AUDIT_MODULE_OPTIONS = [
  { value: "", label: "Tất cả phân hệ" },
  { value: "sale", label: "Bán hàng" },
  { value: "invoice", label: "Hóa đơn" },
  { value: "return", label: "Trả hàng" },
  { value: "stock_adjustment", label: "Kho hàng" },
  { value: "stock_count", label: "Kiểm kê" },
  { value: "customer", label: "Khách hàng" },
  { value: "category", label: "Danh mục" },
] as const;
