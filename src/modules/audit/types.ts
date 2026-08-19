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
  { value: "", label: "Tất cả module" },
  { value: "sale", label: "SALE" },
  { value: "invoice", label: "INVOICE" },
  { value: "return", label: "RETURN" },
  { value: "stock_adjustment", label: "INVENTORY" },
  { value: "stock_count", label: "STOCK COUNT" },
  { value: "customer", label: "CUSTOMER" },
  { value: "category", label: "CATEGORY" },
] as const;
