export const CUSTOMER_GROUPS = ["RETAIL", "MEMBER", "LOYAL", "VIP"] as const;
export const CUSTOMER_GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number];
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number];
export type CustomerSort = "newest" | "name" | "total";
export type CustomerActivityFilter = "" | "purchased" | "never";

export type CustomerDirectoryStats = {
  totalCustomers: number;
  newCustomers30d: number;
  totalSpendingDong: number;
  totalOrders: number;
  avgOrderDong: number;
};

export type CustomerRecord = {
  id: string;
  customerNo: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  gender: CustomerGender | null;
  customerGroup: CustomerGroup;
  dateOfBirth: string | null;
  isWalkIn: boolean;
  createdAt: string;
  updatedAt: string;
  totalDong: number;
  saleCount: number;
  debtDong: number;
  lastActivityAt: string;
};

export type CustomerHistoryItem = {
  invoiceId: string;
  invoiceNo: string;
  saleNo: string;
  issuedAt: string;
  totalDong: number;
  status: string;
  paymentMethod: string;
};

export type CustomerListPage = {
  items: CustomerRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type CustomerDetail = {
  customer: CustomerRecord;
  history: CustomerHistoryItem[];
};

export type CustomerInput = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  taxCode?: string | null;
  note?: string | null;
  gender?: CustomerGender | null;
  customerGroup?: CustomerGroup;
  dateOfBirth?: string | null;
};
