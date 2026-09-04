import type {
  CccdDocumentType,
  CustomerDetail,
  CustomerDocument,
  CustomerGender,
  CustomerGroup,
  CustomerHistoryItem,
  CustomerListPage,
  CustomerRecord,
  CustomerType,
} from "./types";

type DocumentJson = {
  id: string;
  document_type: CccdDocumentType;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

type CustomerJson = {
  id: string;
  customer_no: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  note: string | null;
  gender: CustomerGender | null;
  customer_group: CustomerGroup;
  date_of_birth: string | null;
  is_walk_in: boolean;
  customer_type?: CustomerType | null;
  nationality?: string | null;
  citizen_id?: string | null;
  citizen_id_issue_date?: string | null;
  citizen_id_issue_place?: string | null;
  citizen_id_expiry_date?: string | null;
  business_name?: string | null;
  representative_name?: string | null;
  documents?: DocumentJson[] | null;
  created_at: string;
  updated_at: string;
  total_dong: number;
  sale_count: number;
  debt_dong: number;
  last_activity_at: string;
};

type HistoryJson = {
  activity_id?: string;
  activity_kind?: "SALE" | "BUY";
  doc_no?: string;
  invoice_id?: string | null;
  invoice_no?: string;
  sale_no?: string;
  issued_at: string;
  total_dong: number;
  paid_dong?: number;
  remaining_dong?: number;
  payment_status?: string;
  transaction_type?: string;
  fulfillment_status?: string;
  status: string;
  payment_method: string;
};

function mapDocument(row: DocumentJson): CustomerDocument {
  return {
    id: row.id,
    documentType: row.document_type,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size == null ? null : Number(row.byte_size),
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

export function mapCustomer(row: CustomerJson): CustomerRecord {
  return {
    id: row.id,
    customerNo: row.customer_no,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    taxCode: row.tax_code,
    note: row.note,
    gender: row.gender,
    customerGroup: row.customer_group,
    dateOfBirth: row.date_of_birth,
    isWalkIn: row.is_walk_in,
    customerType: row.customer_type === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
    nationality: row.nationality ?? null,
    citizenId: row.citizen_id ?? null,
    citizenIdIssueDate: row.citizen_id_issue_date ?? null,
    citizenIdIssuePlace: row.citizen_id_issue_place ?? null,
    citizenIdExpiryDate: row.citizen_id_expiry_date ?? null,
    businessName: row.business_name ?? null,
    representativeName: row.representative_name ?? null,
    documents: (row.documents ?? []).map(mapDocument),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalDong: Number(row.total_dong ?? 0),
    saleCount: Number(row.sale_count ?? 0),
    debtDong: Number(row.debt_dong ?? 0),
    lastActivityAt: row.last_activity_at,
  };
}

export function mapHistory(row: HistoryJson): CustomerHistoryItem {
  const totalDong = Number(row.total_dong ?? 0);
  const paidDong = Number(row.paid_dong ?? 0);
  const remainingDong = Number(row.remaining_dong ?? Math.max(0, totalDong - paidDong));
  const activityKind = row.activity_kind === "BUY" ? "BUY" : "SALE";
  const docNo = row.doc_no ?? row.invoice_no ?? row.sale_no ?? "—";
  return {
    activityId: row.activity_id ?? row.invoice_id ?? docNo,
    activityKind,
    docNo,
    invoiceId: row.invoice_id ?? null,
    invoiceNo: docNo,
    saleNo: row.sale_no ?? docNo,
    issuedAt: row.issued_at,
    totalDong,
    paidDong,
    remainingDong,
    paymentStatus: row.payment_status ?? (remainingDong > 0 ? "PARTIALLY_PAID" : "PAID"),
    transactionType: row.transaction_type ?? activityKind,
    fulfillmentStatus: row.fulfillment_status ?? (activityKind === "BUY" ? "RECEIVED" : "DELIVERED"),
    status: row.status,
    paymentMethod: row.payment_method,
  };
}

export function mapCustomerList(payload: {
  items: CustomerJson[] | null;
  total: number;
  limit: number;
  offset: number;
}): CustomerListPage {
  return {
    items: (payload.items ?? []).map(mapCustomer),
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? 8),
    offset: Number(payload.offset ?? 0),
  };
}

export function mapCustomerDetail(payload: {
  customer: CustomerJson;
  history: HistoryJson[] | null;
}): CustomerDetail {
  return {
    customer: mapCustomer(payload.customer),
    history: (payload.history ?? []).map(mapHistory),
  };
}

type CustomerStatsJson = {
  total_customers: number;
  new_customers_30d: number;
  total_spending_dong: number;
  total_orders: number;
  avg_order_dong: number;
};

export function mapCustomerDirectoryStats(
  payload: CustomerStatsJson,
): import("./types").CustomerDirectoryStats {
  return {
    totalCustomers: Number(payload.total_customers ?? 0),
    newCustomers30d: Number(payload.new_customers_30d ?? 0),
    totalSpendingDong: Number(payload.total_spending_dong ?? 0),
    totalOrders: Number(payload.total_orders ?? 0),
    avgOrderDong: Number(payload.avg_order_dong ?? 0),
  };
}
