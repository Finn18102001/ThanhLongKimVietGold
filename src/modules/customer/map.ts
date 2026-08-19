import type {
  CustomerDetail,
  CustomerGender,
  CustomerGroup,
  CustomerHistoryItem,
  CustomerListPage,
  CustomerRecord,
} from "./types";

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
  created_at: string;
  updated_at: string;
  total_dong: number;
  sale_count: number;
  debt_dong: number;
  last_activity_at: string;
};

type HistoryJson = {
  invoice_id: string;
  invoice_no: string;
  sale_no: string;
  issued_at: string;
  total_dong: number;
  status: string;
  payment_method: string;
};

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalDong: Number(row.total_dong ?? 0),
    saleCount: Number(row.sale_count ?? 0),
    debtDong: Number(row.debt_dong ?? 0),
    lastActivityAt: row.last_activity_at,
  };
}

export function mapHistory(row: HistoryJson): CustomerHistoryItem {
  return {
    invoiceId: row.invoice_id,
    invoiceNo: row.invoice_no,
    saleNo: row.sale_no,
    issuedAt: row.issued_at,
    totalDong: Number(row.total_dong ?? 0),
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
